# RankLocal

SaaS de SEO Local, inteligência competitiva, Google Business Profile, SEO de
sites e AI Search Visibility.

> "Descubra como sua empresa aparece no Google, compare seus concorrentes e
> descubra o que precisa melhorar para aumentar sua presença local e sua
> visibilidade nas buscas com IA."

## Status atual

**Fase 1 — Fundação**, **Fase 2 — Google Places**, **Fase 3 — Ranking
Local**, **Fase 4 — Google Business Profile** e **Fase 5 — SEO**,
concluídas:

- Estrutura Next.js, autenticação, modelo multi-tenant
  (organizations/businesses) com Row Level Security, design system e
  dashboard com dados demonstrativos.
- Integração real com a Places API (New): configuração isolada
  (`services/google/config.ts`), `GooglePlacesService` com busca, detalhes,
  cache, retry/timeout, rate limiting interno e logging seguro (sem
  segredos), confirmação manual obrigatória do usuário, Place ID salvo de
  fato no Supabase, sugestão inicial de concorrentes, e fallback claro
  "Google Places não conectado" quando a chave não está configurada.
- Monitoramento de presença local por grid (`/google-maps`): keywords,
  pontos de referência, scans 3x3/5x5/7x7 via Text Search (New) com viés de
  localização, mapa de grid visual (heatmap próprio), métricas (posição
  média, melhor, pior, tendência, Top 3, Top 10), Índice RankLocal
  proprietário e concorrentes observados repetidamente no grid — tudo
  respeitando o limite de cache de 30 dias da Google Maps Platform (ver
  `docs/ranking-methodology.md`).
- Conexão real com o Google Business Profile (`Empresa → Google Business
  Profile`): OAuth 2.0 completo, listagem de contas/locais, seleção
  manual do perfil, sincronização dos dados reais, status de conexão
  (conectado/expirado/revogado/erro), renovação automática de token,
  desconexão, e tokens protegidos por uma tabela sem nenhuma policy de RLS
  (só a service role acessa). A Business Profile API exige aprovação
  manual da Google ("Basic API Access") — isso está documentado e
  refletido na própria interface (ver `docs/google-business-profile.md`).
- Auditoria de SEO (`Empresa → Auditoria de SEO`): crawler próprio
  (respeita robots.txt, User-Agent identificado, timeouts, rate limiting),
  analisa HTTPS, title, meta description, H1/H2, canonical, schema, Open
  Graph, imagens sem ALT, viewport, thin content e links internos
  quebrados; gera SEO Score proprietário e lista de problemas por
  severidade — com limitações declaradas (sem crawl recursivo, sem
  medição real de performance/mobile) em `docs/seo-audit.md`.

As fases seguintes (Search Console, AI Visibility, Content Studio,
Automações, Produção) estão descritas em `docs/architecture.md` e serão
implementadas incrementalmente.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS + design system próprio (ver `components/ui`)
- Supabase (Postgres + Auth), com Row Level Security
- Reservado para fases futuras: Gemini API, Google Places/Business
  Profile/Search Console/Analytics, Google Cloud

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis do Supabase para usar auth real
npm run dev
```

Sem as variáveis do Supabase preenchidas, o app builda e roda normalmente em
**modo demo** (dashboard e listagem de empresas usam `lib/demo-data.ts`,
sempre marcados com o selo "DEMO"). Login e cadastro reais exigem um projeto
Supabase configurado (ver `docs/environment.md` e `database/schema.sql`).

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run test` | Testes (Vitest) |

## Estrutura de pastas

```
app/            rotas (App Router): (auth) e (dashboard)
components/     ui (design system), layout, auth, dashboard, empresas
lib/            supabase (client/server/middleware/actions), utils, demo-data
services/       isolamento de integrações externas (placeholders na Fase 1)
types/          tipos de domínio compartilhados
database/       schema.sql — fonte de verdade do banco
docs/           arquitetura, banco, segurança, deployment, variáveis de
                ambiente e documentação específica de cada integração
tests/          testes unitários (Vitest + Testing Library)
```

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — visão geral da arquitetura
- [`docs/database.md`](docs/database.md) — schema atual e tabelas futuras
- [`docs/security.md`](docs/security.md) — práticas de segurança
- [`docs/deployment.md`](docs/deployment.md) — Vercel + Supabase
- [`docs/environment.md`](docs/environment.md) — variáveis de ambiente
- [`docs/ranking-methodology.md`](docs/ranking-methodology.md),
  [`docs/ai-visibility.md`](docs/ai-visibility.md),
  [`docs/google-places.md`](docs/google-places.md),
  [`docs/google-business-profile.md`](docs/google-business-profile.md),
  [`docs/search-console.md`](docs/search-console.md),
  [`docs/analytics.md`](docs/analytics.md) — regras e escopo de cada módulo

## Regras de produto que não podem ser violadas

- Nunca afirmar "ranking oficial do Google" ou "ranking oficial do ChatGPT".
  Usar sempre: posição observada, índice proprietário RankLocal,
  visibilidade observada.
- Nenhum componente React chama uma API externa diretamente — tudo passa por
  `services/*`.
- IA (Gemini) nunca inventa dados, concorrentes, avaliações ou ranking. O
  fluxo é sempre `dados → normalização → métricas → Gemini → recomendação`.
- Isolamento multi-tenant garantido por Row Level Security, nunca apenas por
  filtro de aplicação.
