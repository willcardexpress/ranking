-- RankLocal — Schema Fase 1 (Fundação)
-- Tabelas de fases futuras (ranking, seo, ai_visibility, content, reputation,
-- reports, notifications, subscriptions etc.) serão adicionadas em migrations
-- próprias a partir da Fase 3 em diante, conforme docs/database.md.

create extension if not exists "pgcrypto";

-- =========================================================
-- ORGANIZATIONS (tenants)
-- =========================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type organization_role as enum ('owner', 'admin', 'member');

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role organization_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_members_org on organization_members(organization_id);
create index if not exists idx_org_members_user on organization_members(user_id);

-- =========================================================
-- BUSINESSES (empresas monitoradas)
-- =========================================================
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  website text,
  phone text,
  category text,
  keywords text[] not null default '{}',
  service_area text,
  google_place_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_org on businesses(organization_id);
create index if not exists idx_businesses_place_id on businesses(google_place_id);

create table if not exists business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  address text not null,
  city text not null,
  state text not null,
  country text not null default 'Brasil',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_locations_business on business_locations(business_id);

-- =========================================================
-- FUNÇÃO AUXILIAR: pertence à organização?
-- =========================================================
create or replace function is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id
    and user_id = auth.uid()
  );
$$;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table businesses enable row level security;
alter table business_locations enable row level security;

create policy "members can read their organizations"
  on organizations for select
  using (is_org_member(id));

create policy "members can read their membership rows"
  on organization_members for select
  using (is_org_member(organization_id));

create policy "members can read businesses of their organizations"
  on businesses for select
  using (is_org_member(organization_id));

create policy "admins/owners can insert businesses"
  on businesses for insert
  with check (is_org_member(organization_id));

create policy "admins/owners can update businesses"
  on businesses for update
  using (is_org_member(organization_id));

create policy "members can read business_locations of their businesses"
  on business_locations for select
  using (
    exists (
      select 1 from businesses b
      where b.id = business_locations.business_id
      and is_org_member(b.organization_id)
    )
  );

create policy "members can manage business_locations of their businesses"
  on business_locations for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = business_locations.business_id
      and is_org_member(b.organization_id)
    )
  );

-- =========================================================
-- updated_at automático
-- =========================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

create trigger trg_business_locations_updated_at
  before update on business_locations
  for each row execute function set_updated_at();
