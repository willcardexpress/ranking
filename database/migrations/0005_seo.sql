-- RankLocal — Migration Fase 5 (SEO)
-- Aplicar depois de schema.sql e migrations/0002, 0003, 0004.

create table if not exists website_projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade unique,
  root_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists website_pages (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  url text not null,
  last_status_code integer,
  first_seen_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  unique (website_project_id, url)
);

create index if not exists idx_website_pages_project on website_pages(website_project_id);

create table if not exists seo_audits (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  pages_crawled integer not null default 0,
  seo_score integer,
  has_robots_txt boolean,
  has_sitemap boolean,
  error_message text,
  requested_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_audits_project on seo_audits(website_project_id);
create index if not exists idx_seo_audits_created_at on seo_audits(created_at);

create table if not exists seo_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references seo_audits(id) on delete cascade,
  -- null = problema de site (ex.: sitemap ausente), não de uma página específica.
  website_page_id uuid references website_pages(id) on delete cascade,
  page_url text,
  issue_type text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_issues_audit on seo_issues(audit_id);
create index if not exists idx_seo_issues_severity on seo_issues(severity);

-- =========================================================
-- ROW LEVEL SECURITY
-- Cadeia: seo_issues -> seo_audits -> website_projects -> businesses -> is_org_member()
-- =========================================================
alter table website_projects enable row level security;
alter table website_pages enable row level security;
alter table seo_audits enable row level security;
alter table seo_issues enable row level security;

create policy "members can read website_projects of their businesses"
  on website_projects for select
  using (exists (select 1 from businesses b where b.id = website_projects.business_id and is_org_member(b.organization_id)));

create policy "members can insert website_projects for their businesses"
  on website_projects for insert
  with check (exists (select 1 from businesses b where b.id = website_projects.business_id and is_org_member(b.organization_id)));

create policy "members can update website_projects of their businesses"
  on website_projects for update
  using (exists (select 1 from businesses b where b.id = website_projects.business_id and is_org_member(b.organization_id)));

create policy "members can read website_pages of their projects"
  on website_pages for select
  using (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = website_pages.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can insert website_pages for their projects"
  on website_pages for insert
  with check (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = website_pages.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can update website_pages of their projects"
  on website_pages for update
  using (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = website_pages.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can read seo_audits of their projects"
  on seo_audits for select
  using (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = seo_audits.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can insert seo_audits for their projects"
  on seo_audits for insert
  with check (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = seo_audits.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can update seo_audits of their projects"
  on seo_audits for update
  using (exists (
    select 1 from website_projects wp
    join businesses b on b.id = wp.business_id
    where wp.id = seo_audits.website_project_id and is_org_member(b.organization_id)
  ));

create policy "members can read seo_issues of their audits"
  on seo_issues for select
  using (exists (
    select 1 from seo_audits sa
    join website_projects wp on wp.id = sa.website_project_id
    join businesses b on b.id = wp.business_id
    where sa.id = seo_issues.audit_id and is_org_member(b.organization_id)
  ));

create policy "members can insert seo_issues for their audits"
  on seo_issues for insert
  with check (exists (
    select 1 from seo_audits sa
    join website_projects wp on wp.id = sa.website_project_id
    join businesses b on b.id = wp.business_id
    where sa.id = seo_issues.audit_id and is_org_member(b.organization_id)
  ));

create trigger trg_website_projects_updated_at
  before update on website_projects
  for each row execute function set_updated_at();
