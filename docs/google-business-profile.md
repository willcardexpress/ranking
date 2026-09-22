# Google Business Profile — RankLocal

**Status: implementado na Fase 4.**

## O que foi verificado antes de implementar (set/2026)

1. **OAuth 2.0 padrão** (Google Identity Platform, fluxo de servidor web):
   - Autorização: `https://accounts.google.com/o/oauth2/v2/auth`
   - Troca/renovação de token: `https://oauth2.googleapis.com/token`
   - Escopo necessário: `https://www.googleapis.com/auth/business.manage`
     (o escopo antigo `plus.business.manage` está descontinuado, mantido
     só por compatibilidade — não usado aqui).
   https://developers.google.com/my-business/content/implement-oauth

2. **Contas**: `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts`
   (My Business Account Management API).
   https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list

3. **Locais**: `GET https://mybusinessbusinessinformation.googleapis.com/v1/{parent=accounts/*}/locations`
   (My Business Business Information API) — **`readMask` é obrigatório**;
   sem ele a API rejeita a requisição. Os campos usados estão em
   `LOCATION_READ_MASK` (`services/google/business-profile.ts`): `title`,
   `phoneNumbers`, `categories`, `storefrontAddress`, `websiteUri`,
   `regularHours`, `profile` (descrição), `metadata` (mapsUri, placeId,
   newReviewUri), `serviceItems`, `storeCode`, `languageCode`.
   https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list

4. **RESTRIÇÃO CRÍTICA, verificada e não assumida**: as Business Profile
   APIs **não são abertas por padrão**. Mesmo com projeto criado, OAuth
   configurado e as APIs habilitadas no Google Cloud Console, é preciso
   passar por uma **aprovação manual da Google** ("Basic API Access" —
   formulário vinculado na documentação oficial de "Basic setup"). Até
   essa aprovação, a cota do projeto fica em **0 requisições por minuto**
   e toda chamada retorna erro de permissão. **Não existe ambiente
   sandbox** para testar antes da aprovação.
   https://developers.google.com/my-business/content/basic-setup

5. **Avaliações/reviews individuais não fazem parte desta API.** A Business
   Information API não expõe reviews — por isso este módulo não promete
   nem tenta trazer avaliações; isso fica fora do escopo até uma fonte
   oficial ser identificada e confirmada (não inventamos um endpoint para
   preencher a interface).

## Consequência prática para você (configuração manual necessária)

Mesmo com o código 100% pronto, a integração só funciona de verdade depois
que você:

1. Criar um projeto no Google Cloud Console.
2. Habilitar a **My Business Account Management API** e a **My Business
   Business Information API**.
3. Configurar a tela de consentimento OAuth (OAuth consent screen).
4. Criar credenciais OAuth 2.0 (tipo "Web application") e cadastrar como
   "Authorized redirect URI" exatamente:
   `https://SEU_DOMINIO/api/integrations/google-business/callback`
5. Preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
   `GOOGLE_OAUTH_REDIRECT_URI` no `.env.local` (ou nas variáveis de
   ambiente da Vercel).
6. **Submeter o formulário de "Basic API Access"** vinculado na
   documentação oficial e aguardar a aprovação da Google (pode levar dias
   a semanas). Sem isso, toda tentativa de listar contas/locais retorna
   `PERMISSION_DENIED` — o RankLocal mostra esse erro real, nunca finge
   sucesso.

Enquanto isso não estiver pronto, a interface mostra claramente **"Google
Business Profile não conectado"** (se as variáveis de ambiente faltarem)
ou o **erro real retornado pela Google** (se as variáveis existirem mas a
aprovação ainda não tiver saído) — nunca dado simulado.

## Arquitetura implementada

- `services/google/config.ts` — `isGoogleBusinessProfileConfigured()`.
- `services/google/business-profile-errors.ts` — `GoogleBusinessProfileError`,
  com código (`MISSING_OAUTH_CONFIG`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`,
  `PERMISSION_DENIED`, `RATE_LIMITED`, `INTERNAL_RATE_LIMITED`,
  `UPSTREAM_ERROR`, `INVALID_REQUEST`, `TOKEN_EXCHANGE_FAILED`,
  `INVALID_STATE`, `NOT_CONNECTED`).
- `services/google/business-profile.ts` — `GoogleBusinessProfileService`:
  `buildAuthUrl`, `exchangeCodeForTokens`, `refreshAccessToken`,
  `listAccounts`, `listLocations`, `getLocation`. Reaproveita
  `services/google/http.ts` (retry/timeout) e o rate limiter/logger
  genéricos já existentes (categorias `gbp_oauth`, `gbp_accounts`,
  `gbp_locations`).
- `lib/integrations/google-business/state.ts` — assina o parâmetro `state`
  do OAuth (HMAC, sem tabela dedicada) para proteção CSRF.
- `lib/integrations/google-business/tokens.ts` — única porta de
  entrada/saída da tabela `google_business_connections` (sempre via
  service role); expõe só um resumo seguro (`GoogleBusinessConnectionSummary`,
  sem tokens) para o resto do app, e `getValidAccessToken()` que renova o
  token automaticamente quando necessário.
- `lib/business-access.ts` — `assertBusinessAccess()`, checagem explícita
  de que o usuário pertence à organização dona do `business_id`, usada
  antes de qualquer ação do GBP (obrigatório porque a tabela de tokens não
  tem RLS — ver abaixo).
- `lib/actions/google-business.ts` — Server Actions que orquestram todo o
  fluxo (auth URL, listar contas/locais, selecionar, sincronizar,
  desconectar, ler dados sincronizados).
- `app/api/integrations/google-business/callback/route.ts` — Route
  Handler do callback OAuth (precisa responder a um GET de redirect do
  Google; não dá para ser uma Server Action).
- UI: `components/empresas/gbp/google-business-panel.tsx` (busca dados no
  servidor) + `gbp-status-panel.tsx` e `account-location-picker.tsx`
  (interação: conectar → listar contas → listar locais → selecionar →
  sincronizar), integrados na página `Empresa → Google Business Profile`
  (`app/(dashboard)/empresas/[id]/page.tsx`).

## Segurança dos tokens (por quê a tabela não tem RLS)

`google_business_connections` guarda `access_token`/`refresh_token`. Em
vez de tentar RLS por linha (que ainda exporia os tokens em texto puro
para quem tem permissão de leitura), a tabela tem RLS **habilitado sem
nenhuma policy** — isso nega todo acesso via chave anônima/autenticada por
padrão no Postgres. Só a service role (que ignora RLS) toca essa tabela,
e sempre depois de `assertBusinessAccess()` confirmar que o usuário
pertence à organização dona da empresa. A UI nunca recebe um token — só o
resumo de status (`GoogleBusinessConnectionSummary`).

## Diferenciação de dados (obrigatória)

- **Dado obtido da API**: campos preenchidos em `google_business_profile_data`
  após uma sincronização bem-sucedida.
- **Dado não disponível**: campo `null` — a API não retornou esse valor
  para este local (ex.: perfil sem descrição preenchida no Google). A UI
  mostra "não disponível", nunca inventa um valor.
- **Dado ainda não sincronizado**: nenhuma linha em
  `google_business_profile_data` para a empresa — a UI mostra "Ainda não
  sincronizado" e o botão "Sincronizar agora".
- Reviews/avaliações: **fora do escopo desta API** (ver acima) — não
  aparecem na interface do GBP; o módulo de Reputação (fases futuras) usa
  outra fonte.

## Integração com outras áreas (nesta fase)

Os dados sincronizados ficam disponíveis via `getSyncedProfileDataAction()`
e a tabela `google_business_profile_data`, prontos para alimentar
Dashboard, Índice RankLocal, Reputação, Concorrentes, Ranking Local, Plano
de Ação, AI Visibility, Consultor IA e Relatórios — mas **nenhum desses
módulos foi ligado a esse dado ainda** nesta fase. Conectar cada consumidor
é trabalho das fases correspondentes (5 em diante), para não criar
cálculo/afirmação prematura baseada em dado que pode não existir.
