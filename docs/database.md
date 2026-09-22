# Banco de dados — RankLocal

## Fase 1 (implementado em `database/schema.sql`)

- `organizations` — tenants (agências/empresas donas da conta).
- `organization_members` — vínculo usuário ↔ organização, com `role`
  (`owner` | `admin` | `member`).
- `businesses` — empresas monitoradas, sempre associadas a uma organização.
- `business_locations` — endereços/coordenadas de cada empresa.

Todas as tabelas têm RLS habilitado. A função `is_org_member(org_id)`
centraliza a checagem de pertencimento e é usada em todas as policies.

## Bootstrap de organização (Fase 2)

`organizations` e `organization_members` não têm policy de `INSERT` para o
cliente — de propósito, para que um usuário não possa se auto-vincular a
uma organização arbitrária. A criação da primeira organização de um usuário
é feita por `lib/organizations.ts` (`ensureOrganizationForUser`), que roda
no servidor com a service role, de forma idempotente (só cria se o usuário
ainda não tiver nenhuma organização). Em produção, o caminho recomendado é
substituir esse helper por um trigger no Postgres (`on auth.users insert`),
mantendo o mesmo comportamento sem depender do primeiro cadastro de
empresa para existir.

## Fase 2 (implementado em `database/migrations/0002_google_places.sql`)

- `places` — último snapshot conhecido de cada Place ID (nome, endereço,
  telefone, site, categoria, localização, avaliação, status). RLS: leitura
  liberada para qualquer usuário autenticado (dado público da Google, não é
  segredo de nenhuma organização); escrita somente pelo backend (service
  role), nunca pelo cliente.
- `place_snapshots` — histórico de snapshots por Place ID, usado
  futuramente para detectar mudanças de perfil.
- `businesses.google_place_id` passa a ter foreign key para `places.place_id`.

## Fase 3 (implementado em `database/migrations/0003_ranking.sql`)

- `keywords` — palavras-chave monitoradas por empresa.
- `keyword_locations` — pontos de referência (centro do grid) por keyword.
- `ranking_scans` — cada execução de scan (tamanho do grid, espaçamento,
  raio de busca, status).
- `ranking_grid_points` — coordenadas geradas por nós (não são "conteúdo
  Google", podem ficar indefinidamente).
- `ranking_results` — posição observada e `place_id`s encontrados por
  ponto. **Nunca guarda nome/endereço/avaliação em texto** — ver
  `docs/ranking-methodology.md` para a justificativa (limite de cache de
  30 dias da Google Maps Platform) e `lib/places-lookup.ts` para como o
  nome é resolvido na leitura.

## Fase 4 (implementado em `database/migrations/0004_google_business_profile.sql`)

- `google_business_connections` — tokens OAuth (access/refresh), status da
  conexão, conta/local selecionados. **RLS habilitado, sem nenhuma
  policy** (deny-by-default para chaves de cliente) — só a service role
  acessa, sempre via `lib/integrations/google-business/tokens.ts`, depois
  de `lib/business-access.ts` confirmar que o usuário pertence à
  organização dona da empresa.
- `google_business_profile_data` — snapshot mais recente dos dados
  sincronizados do perfil (nome, endereço, telefone, categorias, horários,
  descrição...). RLS org-scoped padrão (`is_org_member`), igual a
  `businesses`/`keywords`. Nunca contém tokens.

## Fase 5 (implementado em `database/migrations/0005_seo.sql`)

- `website_projects` — URL raiz do site auditado, uma por empresa.
- `website_pages` — última versão conhecida de cada página encontrada
  (status HTTP, quando foi rastreada).
- `seo_audits` — cada execução de auditoria (status, páginas rastreadas,
  SEO Score, se encontrou robots.txt/sitemap).
- `seo_issues` — problemas encontrados por auditoria (nível de página ou
  de site), com severidade (`critical`/`warning`/`info`).

## Tabelas previstas para fases futuras (não criadas ainda)

Conforme a especificação do produto, seção 6:

- **Google**: `google_connections`, `google_business_profiles`, `google_accounts`
- **Places**: `places`, `place_snapshots`
- **Ranking**: `keywords`, `keyword_locations`, `ranking_scans`,
  `ranking_results`, `ranking_grid_points`
- **Concorrentes**: `competitors`, `competitor_snapshots`
- **Reputação**: `reviews_snapshots`
- **Site/SEO**: `website_projects`, `website_pages`, `seo_audits`, `seo_issues`
- **Search Console**: `search_console_connections`, `search_console_queries`,
  `search_console_pages`
- **Analytics**: `analytics_connections`, `analytics_snapshots`
- **AI Visibility**: `ai_visibility_projects`, `ai_queries`, `ai_query_runs`,
  `ai_visibility_results`, `ai_citations`
- **Conteúdo**: `content_projects`, `content_briefs`, `content_articles`,
  `content_publications`
- **Relatórios/ações**: `ai_reports`, `action_plans`, `action_items`
- **Sistema**: `notifications`, `subscriptions`, `usage_events`

Cada uma será adicionada via migration própria, na fase correspondente,
sempre com `created_at`/`updated_at`, índices, foreign keys, constraints e
policies de RLS.
