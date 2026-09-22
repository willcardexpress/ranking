-- RankLocal — Migration Fase 2 (Google Places)
-- Aplicar depois de database/schema.sql (Fase 1).
--
-- `places` guarda o último snapshot conhecido de um Place ID (cache
-- persistente, complementar ao cache em memória de services/google/cache.ts).
-- `place_snapshots` guarda o histórico de mudanças, usado futuramente para
-- detectar alterações de perfil (Fase 4/16).
--
-- Dados de `places` vêm diretamente da Google e não são segredo de nenhuma
-- organização específica — várias empresas de organizações diferentes podem
-- referenciar o mesmo Place ID (ex.: uma franquia). Por isso a leitura é
-- liberada para qualquer usuário autenticado, mas a escrita é restrita ao
-- backend (service role), nunca ao cliente.

create table if not exists places (
  place_id text primary key,
  resource_name text,
  display_name text not null,
  formatted_address text,
  phone_number text,
  website text,
  primary_type text,
  types text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  rating numeric(2,1),
  user_rating_count integer,
  business_status text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists place_snapshots (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references places(place_id) on delete cascade,
  display_name text not null,
  formatted_address text,
  rating numeric(2,1),
  user_rating_count integer,
  business_status text,
  captured_at timestamptz not null default now()
);

create index if not exists idx_place_snapshots_place on place_snapshots(place_id);
create index if not exists idx_place_snapshots_captured_at on place_snapshots(captured_at);

-- =========================================================
-- Vínculo de businesses ao Place ID confirmado (Fase 2)
-- (a coluna businesses.google_place_id já existe desde a Fase 1;
-- aqui apenas garantimos a integridade referencial e um índice)
-- =========================================================
alter table businesses
  add constraint fk_businesses_place
  foreign key (google_place_id) references places(place_id)
  on delete set null;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table places enable row level security;
alter table place_snapshots enable row level security;

create policy "authenticated users can read places"
  on places for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can read place_snapshots"
  on place_snapshots for select
  using (auth.role() = 'authenticated');

-- Nenhuma policy de insert/update/delete é criada para o cliente:
-- escrita em `places`/`place_snapshots` acontece somente via
-- services/google/places.ts usando a service role key no servidor.

create trigger trg_places_updated_at
  before update on places
  for each row execute function set_updated_at();
