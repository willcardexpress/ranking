# Variáveis de ambiente — RankLocal

Todas as variáveis estão documentadas em `.env.example`. Regra geral:
**nada com valor secreto começa com `NEXT_PUBLIC_`**, porque essas variáveis
são embutidas no bundle enviado ao navegador.

## Fase 1 (obrigatórias para o app funcionar de fato)

| Variável | Escopo | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Chave anônima, usada no browser e respeitando RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Ignora RLS — usar apenas em `services/*` e `jobs/*`, nunca em código acessível pelo cliente |
| `NEXT_PUBLIC_APP_URL` | público | URL base da aplicação (usada em redirects, links de e-mail etc.) |

## Reservadas para fases futuras

| Variável | Escopo | Fase |
|---|---|---|
| `GEMINI_API_KEY` | server-only | 7+ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server-only | 4, 6 |
| `GOOGLE_MAPS_API_KEY` | server-only (proxied) | 3, 13 |
| `GOOGLE_PLACES_API_KEY` | server-only | 2 |
| `GOOGLE_OAUTH_REDIRECT_URI` | server-only | 4, 6 |

## Sem app sem essas variáveis?

O app builda e roda em **modo demo** mesmo sem nenhuma variável configurada
(usa `lib/demo-data.ts`). Login/cadastro reais exigem
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` válidos.
