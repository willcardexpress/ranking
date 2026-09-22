# database/

- `schema.sql` — schema da Fase 1 (Fundação): organizations, organization_members,
  businesses, business_locations. É a base sobre a qual as migrations abaixo
  são aplicadas.
- `migrations/0002_google_places.sql` — Fase 2 (Google Places): tabelas
  `places` e `place_snapshots`, e a foreign key de `businesses.google_place_id`.
- `migrations/0003_ranking.sql` — Fase 3 (Ranking Local): `keywords`,
  `keyword_locations`, `ranking_scans`, `ranking_grid_points`,
  `ranking_results`.
- `migrations/0004_google_business_profile.sql` — Fase 4 (Google Business
  Profile): `google_business_connections` (tokens OAuth, sem policy de
  RLS — só service role) e `google_business_profile_data` (snapshot
  sincronizado, org-scoped).
- `migrations/0005_seo.sql` — Fase 5 (SEO): `website_projects`,
  `website_pages`, `seo_audits`, `seo_issues`.
- `migrations/0006_rate_limits.sql` — correção pós-auditoria: rate
  limiting compartilhado entre instâncias (`rate_limit_counters` +
  função `increment_rate_limit_counter`).
- `migrations/0007_prevent_concurrent_runs.sql` — correção pós-auditoria:
  índices únicos parciais impedindo scans/auditorias simultâneos para o
  mesmo alvo.

## Ordem de aplicação

```sql
-- 1. schema.sql
-- 2. migrations/0002_google_places.sql
-- 3. migrations/0003_ranking.sql
-- 4. migrations/0004_google_business_profile.sql
-- 5. migrations/0005_seo.sql
-- 6. migrations/0006_rate_limits.sql
-- 7. migrations/0007_prevent_concurrent_runs.sql
-- (migrations futuras seguem numeração sequencial: 0008_search_console.sql, ...)
```

Cada fase do produto adiciona sua própria migration numerada, nunca edita
migrations já aplicadas em produção.
