# Segurança — RankLocal

## Princípios aplicados desde a Fase 1

- **Row Level Security** habilitado em todas as tabelas de negócio, baseado
  em `organization_id`.
- **Secrets somente no backend**: `SUPABASE_SERVICE_ROLE_KEY`,
  `GEMINI_API_KEY` e credenciais Google nunca são expostas em variáveis
  `NEXT_PUBLIC_*` nem em Client Components.
- **Sem tokens em localStorage**: sessão gerenciada via cookies HTTP-only
  pelo `@supabase/ssr`, atualizada pelo `middleware.ts`.
- **Validação de entrada** com `zod` em toda Server Action (ex.:
  `lib/supabase/actions.ts`).
- **Sem logging de segredos**: nenhuma rota ou serviço deve logar
  `access_token`, `refresh_token`, chaves de API ou senhas. Implementado
  concretamente em `services/google/logger.ts`: qualquer campo logado cujo
  nome combine com `key|token|secret|authorization|password` é substituído
  por `[REDACTED]` automaticamente, mesmo que alguém passe o valor por
  engano.
- **Rate limiting interno em duas camadas** (corrigido após auditoria):
  `services/google/rate-limiter.ts` e `services/seo/rate-limiter.ts`
  combinam uma janela em memória por processo (instantânea, primeira
  linha de defesa) com um contador compartilhado no Postgres
  (`rate_limit_counters`, incrementado atomicamente via a função
  `increment_rate_limit_counter`) — o limite real passa a valer entre
  todas as instâncias serverless, não só dentro de uma. Falha aberta se o
  banco estiver indisponível (`lib/rate-limit.ts`): rate limiting é
  proteção de custo, não uma fronteira de segurança, então nunca deve
  derrubar a funcionalidade principal.
- **Tokens OAuth nunca acessíveis por RLS padrão**: `google_business_connections`
  (Fase 4) tem RLS habilitado sem nenhuma policy, o que nega acesso a
  qualquer chave de cliente (anon/authenticated) por padrão no Postgres.
  Só a service role toca essa tabela, sempre depois de
  `lib/business-access.ts` (`assertBusinessAccess`) confirmar
  explicitamente, em código, que o usuário pertence à organização dona da
  empresa — ver `docs/google-business-profile.md`.

## Previsto para fases futuras

- Rate limiting nas rotas que disparam scans de ranking, AI queries e
  crawler de SEO (Fase 3, 5, 7, 9).
- Proteção contra CSRF em endpoints que não sejam Server Actions.
- Circuit breaker para chamadas a APIs externas instáveis.
- Criptografia adicional para tokens OAuth armazenados (Google Business
  Profile, Search Console, Analytics) — Fase 4 e 6.
- Sanitização de conteúdo rastreado por crawler antes de qualquer uso como
  contexto para o Gemini, com tratamento explícito de prompt injection.
