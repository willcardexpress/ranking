-- RankLocal — Migration Fase 3 (Ranking Local)
-- Aplicar depois de database/schema.sql e migrations/0002_google_places.sql.
--
-- Decisão de retenção de dados (obrigatória — ver docs/ranking-methodology.md
-- e a Política de Cache/Attribution da Google Maps Platform, verificada em
-- set/2026): place_id pode ser armazenado indefinidamente, mas os demais
-- campos de "conteúdo Google" (nome, endereço, avaliação...) só podem ficar
-- em cache por até 30 dias corridos, depois disso precisam ser atualizados
-- ou apagados. Por isso:
--   - ranking_grid_points guarda só coordenadas geradas por NÓS (não são
--     "conteúdo Google") — podem ficar indefinidamente.
--   - ranking_results guarda apenas place_id (permitido indefinidamente) e
--     a posição observada (métrica nossa) — nunca nome/endereço/avaliação
--     em texto bruto. Para exibir "empresa encontrada", a UI sempre resolve
--     o nome via a tabela `places` (cache com refresh), nunca a partir de um
--     valor congelado no histórico.

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  term text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, term)
);

create index if not exists idx_keywords_business on keywords(business_id);

create table if not exists keyword_locations (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references keywords(id) on delete cascade,
  label text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_keyword_locations_keyword on keyword_locations(keyword_id);

create table if not exists ranking_scans (
  id uuid primary key default gen_random_uuid(),
  keyword_location_id uuid not null references keyword_locations(id) on delete cascade,
  grid_size text not null check (grid_size in ('3x3', '5x5', '7x7')),
  spacing_meters integer not null check (spacing_meters > 0),
  search_radius_meters integer not null check (search_radius_meters > 0),
  max_result_count integer not null default 20 check (max_result_count between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error_message text,
  requested_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ranking_scans_keyword_location on ranking_scans(keyword_location_id);
create index if not exists idx_ranking_scans_created_at on ranking_scans(created_at);

create table if not exists ranking_grid_points (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references ranking_scans(id) on delete cascade,
  row_index integer not null,
  col_index integer not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  unique (scan_id, row_index, col_index)
);

create index if not exists idx_ranking_grid_points_scan on ranking_grid_points(scan_id);

create table if not exists ranking_results (
  id uuid primary key default gen_random_uuid(),
  grid_point_id uuid not null references ranking_grid_points(id) on delete cascade unique,
  observed_position integer,
  found boolean not null default false,
  -- Lista ordenada de place_id encontrados no ponto (posição = índice + 1).
  -- Nunca nome/avaliação em texto — resolvidos sempre via `places`.
  top_place_ids jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_ranking_results_grid_point on ranking_results(grid_point_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- Cadeia: ranking_results -> ranking_grid_points -> ranking_scans ->
--         keyword_locations -> keywords -> businesses -> is_org_member()
-- =========================================================
alter table keywords enable row level security;
alter table keyword_locations enable row level security;
alter table ranking_scans enable row level security;
alter table ranking_grid_points enable row level security;
alter table ranking_results enable row level security;

create policy "members can read keywords of their businesses"
  on keywords for select
  using (exists (select 1 from businesses b where b.id = keywords.business_id and is_org_member(b.organization_id)));

create policy "members can insert keywords for their businesses"
  on keywords for insert
  with check (exists (select 1 from businesses b where b.id = keywords.business_id and is_org_member(b.organization_id)));

create policy "members can update keywords of their businesses"
  on keywords for update
  using (exists (select 1 from businesses b where b.id = keywords.business_id and is_org_member(b.organization_id)));

create policy "members can read keyword_locations of their keywords"
  on keyword_locations for select
  using (exists (
    select 1 from keywords k
    join businesses b on b.id = k.business_id
    where k.id = keyword_locations.keyword_id and is_org_member(b.organization_id)
  ));

create policy "members can insert keyword_locations for their keywords"
  on keyword_locations for insert
  with check (exists (
    select 1 from keywords k
    join businesses b on b.id = k.business_id
    where k.id = keyword_locations.keyword_id and is_org_member(b.organization_id)
  ));

create policy "members can read ranking_scans of their keyword_locations"
  on ranking_scans for select
  using (exists (
    select 1 from keyword_locations kl
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where kl.id = ranking_scans.keyword_location_id and is_org_member(b.organization_id)
  ));

create policy "members can insert ranking_scans for their keyword_locations"
  on ranking_scans for insert
  with check (exists (
    select 1 from keyword_locations kl
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where kl.id = ranking_scans.keyword_location_id and is_org_member(b.organization_id)
  ));

create policy "members can update ranking_scans of their keyword_locations"
  on ranking_scans for update
  using (exists (
    select 1 from keyword_locations kl
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where kl.id = ranking_scans.keyword_location_id and is_org_member(b.organization_id)
  ));

create policy "members can read ranking_grid_points of their scans"
  on ranking_grid_points for select
  using (exists (
    select 1 from ranking_scans rs
    join keyword_locations kl on kl.id = rs.keyword_location_id
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where rs.id = ranking_grid_points.scan_id and is_org_member(b.organization_id)
  ));

create policy "members can insert ranking_grid_points for their scans"
  on ranking_grid_points for insert
  with check (exists (
    select 1 from ranking_scans rs
    join keyword_locations kl on kl.id = rs.keyword_location_id
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where rs.id = ranking_grid_points.scan_id and is_org_member(b.organization_id)
  ));

create policy "members can read ranking_results of their scans"
  on ranking_results for select
  using (exists (
    select 1 from ranking_grid_points gp
    join ranking_scans rs on rs.id = gp.scan_id
    join keyword_locations kl on kl.id = rs.keyword_location_id
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where gp.id = ranking_results.grid_point_id and is_org_member(b.organization_id)
  ));

create policy "members can insert ranking_results for their scans"
  on ranking_results for insert
  with check (exists (
    select 1 from ranking_grid_points gp
    join ranking_scans rs on rs.id = gp.scan_id
    join keyword_locations kl on kl.id = rs.keyword_location_id
    join keywords k on k.id = kl.keyword_id
    join businesses b on b.id = k.business_id
    where gp.id = ranking_results.grid_point_id and is_org_member(b.organization_id)
  ));

create trigger trg_keywords_updated_at
  before update on keywords
  for each row execute function set_updated_at();
