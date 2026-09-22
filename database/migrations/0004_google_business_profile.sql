-- RankLocal — Migration Fase 4 (Google Business Profile)
-- Aplicar depois de schema.sql e migrations/0002 e 0003.
--
-- Duas tabelas, com níveis de proteção diferentes:
--
-- 1. google_business_connections — guarda os TOKENS OAuth (access/refresh).
--    RLS habilitado, SEM NENHUMA POLICY: isso bloqueia todo acesso via
--    chave anônima/autenticada por padrão no Postgres (deny-by-default).
--    Só a service role (que ignora RLS) pode ler/escrever aqui, e só a
--    partir de código server-side de confiança
--    (lib/integrations/google-business/tokens.ts). Nenhuma rota do
--    cliente, nenhum componente, nenhum valor de token chega ao
--    navegador — a UI só recebe um resumo seguro (ver
--    google_business_connection_status, abaixo).
--
-- 2. google_business_profile_data — o snapshot mais recente dos dados
--    sincronizados do perfil (nome, endereço, telefone, categorias...).
--    Não contém tokens, então segue o mesmo padrão de RLS por organização
--    já usado em keywords/businesses (is_org_member).

create table if not exists google_business_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade unique,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  scope text not null,
  google_account_resource_name text,
  google_account_name text,
  selected_location_resource_name text,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gbp_connections_business on google_business_connections(business_id);

create table if not exists google_business_profile_data (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade unique,
  location_resource_name text not null,
  title text,
  store_code text,
  primary_category text,
  additional_categories text[] not null default '{}',
  phone_numbers text[] not null default '{}',
  website_uri text,
  address_lines text[] not null default '{}',
  locality text,
  administrative_area text,
  postal_code text,
  region_code text,
  regular_hours jsonb not null default '[]'::jsonb,
  description text,
  service_items text[] not null default '{}',
  maps_uri text,
  new_review_uri text,
  place_id text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gbp_data_business on google_business_profile_data(business_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table google_business_connections enable row level security;
-- Propositalmente NENHUMA policy criada para google_business_connections:
-- nega acesso a qualquer client key (anon/authenticated). Só a service
-- role (bypassa RLS) lê/escreve, sempre depois de checar em código que o
-- usuário pertence à organização dona do business_id (ver
-- lib/business-access.ts).

alter table google_business_profile_data enable row level security;

create policy "members can read gbp_data of their businesses"
  on google_business_profile_data for select
  using (exists (
    select 1 from businesses b
    where b.id = google_business_profile_data.business_id
    and is_org_member(b.organization_id)
  ));

create policy "members can insert gbp_data for their businesses"
  on google_business_profile_data for insert
  with check (exists (
    select 1 from businesses b
    where b.id = google_business_profile_data.business_id
    and is_org_member(b.organization_id)
  ));

create policy "members can update gbp_data of their businesses"
  on google_business_profile_data for update
  using (exists (
    select 1 from businesses b
    where b.id = google_business_profile_data.business_id
    and is_org_member(b.organization_id)
  ));

create policy "members can delete gbp_data of their businesses"
  on google_business_profile_data for delete
  using (exists (
    select 1 from businesses b
    where b.id = google_business_profile_data.business_id
    and is_org_member(b.organization_id)
  ));

create trigger trg_gbp_connections_updated_at
  before update on google_business_connections
  for each row execute function set_updated_at();

create trigger trg_gbp_data_updated_at
  before update on google_business_profile_data
  for each row execute function set_updated_at();
