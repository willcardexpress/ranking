# Google Places — RankLocal

**Status: implementado na Fase 2.**

## Endpoints usados (confirmados na documentação oficial em set/2026)

- **Text Search (New)** — `POST https://places.googleapis.com/v1/places:searchText`
  https://developers.google.com/maps/documentation/places/web-service/text-search
- **Place Details (New)** — `GET https://places.googleapis.com/v1/places/{PLACE_ID}`
  https://developers.google.com/maps/documentation/places/web-service/place-details

## Autenticação

Header `X-Goog-Api-Key` com a chave em `GOOGLE_PLACES_API_KEY` (server-only,
nunca em `NEXT_PUBLIC_*`). Ambos os endpoints exigem `X-Goog-FieldMask`
explícito — sem ele a API responde com erro. Os field masks usados estão em
`services/google/places.ts` (`SEARCH_FIELD_MASK` e `DETAILS_FIELD_MASK`).

## Implementação

- `services/google/config.ts` — `isGooglePlacesConfigured()`, checagem
  central usada tanto pelo serviço (recusa chamadas sem chave) quanto pela
  UI (mostra "Google Places não conectado" em vez de tentar buscar).
- `services/google/errors.ts` — `PlacesServiceError`, com código
  (`MISSING_API_KEY`, `TIMEOUT`, `RATE_LIMITED`, `INTERNAL_RATE_LIMITED`,
  `UPSTREAM_ERROR`, `INVALID_REQUEST`) para tratamento de erro sem vazar
  detalhe técnico ao usuário final.
- `services/google/http.ts` — fetch com timeout (8s) e retry (2 tentativas,
  backoff, apenas em 429/5xx/timeout).
- `services/google/rate-limiter.ts` — rate limiting **interno** da
  aplicação (independente do 429 que a própria Google pode retornar):
  janela fixa de 60s, 30 buscas/min e 60 detalhes/min por processo. Protege
  contra custo/consumo excessivo por bug ou abuso no nosso próprio código.
- `services/google/logger.ts` — logging estruturado (JSON) com redação
  automática de qualquer campo cujo nome combine com
  `key|token|secret|authorization|password` — a chave de API nunca é
  passada para o logger, e mesmo que fosse, seria redigida.
- `services/google/cache.ts` — cache em memória por processo (5 min para
  busca, 1h para detalhes). Cache persistente entre execuções é a tabela
  `places` (`database/migrations/0002_google_places.sql`), escrita somente
  pelo backend.
- `services/google/places.ts` — classe `GooglePlacesService`
  (`searchText`, `getDetails`, `searchNearbyCompetitors`,
  `isConfigured()`), instanciada uma única vez (`googlePlacesService`).
  Normaliza a resposta da Google em `NormalizedPlace` (`types/places.ts`) e
  nunca expõe o payload bruto aos componentes.
- `lib/actions/places.ts` — Server Actions que expõem o serviço à UI, mais
  `checkGooglePlacesConfigured()` para os Server Components decidirem o
  que renderizar.
- `lib/places-persistence.ts` — grava (upsert) o Place ID confirmado em
  `places`/`place_snapshots` via service role; se a service role key não
  estiver configurada, pula a persistência sem quebrar o cadastro.
- `lib/organizations.ts` — garante que o usuário tenha uma organização
  antes de salvar a primeira empresa (ver docs/database.md).
- `lib/actions/businesses.ts` — `createBusinessAction`: valida o
  formulário, garante a organização, refaz a consulta ao Google
  server-side (nunca confia cegamente no Place ID vindo do client),
  persiste o cache e salva a empresa.
- `lib/businesses-data.ts` — leitura de empresas com fallback explícito
  para `lib/demo-data.ts` quando não há sessão real ou o Supabase não está
  configurado.

## UI: fluxo completo de cadastro

`components/empresas/new-business-form.tsx` implementa:

**Adicionar empresa → pesquisar no Google → selecionar → salvar Place ID → visualizar dados**

1. Se `GOOGLE_PLACES_API_KEY` não está configurada, a busca fica oculta e
   um aviso "Google Places não conectado" é mostrado — nunca finge uma
   busca ou inventa resultados.
2. Buscar mostra a lista completa de candidatos; o usuário precisa clicar
   em um resultado para confirmar — nunca há seleção automática, mesmo com
   um único candidato.
3. Ao confirmar, os campos do formulário são preenchidos com os dados
   reais (nome, site, telefone, endereço, categoria).
4. Ao salvar, `createBusinessAction` persiste a empresa em `businesses`
   (Supabase) com o Place ID vinculado, e redireciona para
   `/empresas/[id]`, que mostra os dados salvos reais.
5. Se o Supabase não estiver configurado, o cadastro real falha com uma
   mensagem clara — o modo DEMO (dados de `lib/demo-data.ts`) é usado
   apenas na listagem/leitura quando não há sessão real, nunca misturado
   com o fluxo de escrita.

## Concorrentes (parcial nesta fase)

`searchNearbyCompetitors` faz uma busca por categoria + área de atuação e
retorna uma lista de candidatos prováveis (`components/empresas/competitors-panel.tsx`,
na página de detalhe da empresa). É uma sugestão inicial e observável — a
curadoria completa (marcar/ignorar/concorrente principal, snapshots
históricos) é o módulo de Concorrentes (Fase 3/16), com sua própria tabela
`competitors`.

## Se a variável `GOOGLE_PLACES_API_KEY` não estiver configurada

O serviço lança `PlacesServiceError` com código `MISSING_API_KEY`, e a UI
mostra a mensagem "A integração com o Google Places ainda não foi
configurada neste ambiente." — nunca finge uma busca ou inventa resultados.

