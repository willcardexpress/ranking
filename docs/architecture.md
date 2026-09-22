# Arquitetura — RankLocal

## Visão geral

RankLocal é um SaaS multiempresa (multi-tenant) de SEO Local, inteligência
competitiva, Google Business Profile, SEO de sites e AI Search Visibility.

```
Client (Next.js/React) → Server Actions/API Routes → services/*
   ├─ Supabase (Postgres/Auth/Storage)
   ├─ Google APIs (Places, GBP, Search Console, Analytics)
   └─ Gemini API
```

## Princípios

1. **Isolamento de integrações**: nenhum componente React chama uma API
   externa diretamente. Toda chamada passa por `services/<domínio>`.
2. **Multi-tenant estrito**: todo dado pertence a uma `organization`. Row
   Level Security no Supabase garante que nenhum usuário acesse dados de
   outra organização.
3. **Sem dado inventado**: rankings, avaliações, concorrentes e conteúdo
   nunca são "inventados" pela IA. O fluxo é sempre
   `dados → normalização → métricas → Gemini → explicação/recomendação`.
4. **Terminologia cuidadosa**: nunca afirmar "ranking oficial do Google" ou
   "ranking oficial do ChatGPT". Usar "posição observada", "índice
   proprietário RankLocal", "visibilidade observada".
5. **Construção incremental**: cada fase é implementada, testada (lint +
   build + testes) e só então a próxima começa.

## Módulos (services/)

| Pasta | Responsabilidade | Fase prevista |
|---|---|---|
| `services/google` | Places, Business Profile, Search Console, Analytics | 2, 4, 6 |
| `services/ranking` | Monitoramento de presença local (grid) | 3 |
| `services/seo` | Crawler e SEO Score | 5 |
| `services/ai` | GeminiService, AI Visibility, Entity Optimization | 7 |
| `services/content` | Content Studio (briefs, artigos, páginas locais) | 8 |
| `services/reputation` | Avaliações e análise de temas | 4 |

## Estrutura de pastas

Ver `README.md` para a árvore completa. Resumo da Fase 1:

```
app/            rotas (App Router), agrupadas por (auth) e (dashboard)
components/     UI (ui/ = design system, layout/, dashboard/, auth/, empresas/)
lib/            supabase (client/server/middleware/actions), utils, demo-data
services/       isolamento de integrações externas (placeholders na Fase 1)
types/          tipos de domínio compartilhados
database/       schema.sql (fonte de verdade do banco)
docs/           esta documentação
```

## Autenticação e multi-tenant

- Supabase Auth cuida de login/cadastro.
- Cada usuário pertence a uma ou mais `organizations` via
  `organization_members` (papel: owner/admin/member).
- Toda tabela de negócio (`businesses`, e futuramente `keywords`,
  `ranking_scans` etc.) referencia `organization_id` e tem policy de RLS
  baseada em `is_org_member(organization_id)`.

## Fluxo de dados de IA (regra permanente)

```
coleta (services/google, services/seo, services/ranking)
   → normalização
   → cálculo de métricas (Índice RankLocal, SEO Score, AI Visibility Score, Entity Score)
   → GeminiService (explicação, recomendação, plano de ação)
```

Gemini nunca determina ranking nem inventa dado bruto. Conteúdo externo
(páginas rastreadas, resultados de busca, respostas de IA) é sempre tratado
como dado, nunca como instrução — proteção contra prompt injection.
