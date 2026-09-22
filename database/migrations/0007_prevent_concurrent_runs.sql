-- RankLocal — Migration de correção (auditoria pós-Fase 5): impedir
-- scans de ranking e auditorias de SEO simultâneos para o mesmo alvo.
--
-- Sem fila/job em background, a proteção mais simples e correta é um
-- índice único PARCIAL (só considera linhas com status = 'running') —
-- o Postgres rejeita o segundo INSERT concorrente para o mesmo
-- website_project_id/keyword_location_id com uma violação de unicidade
-- (código 23505), que as Server Actions tratam como "já existe uma
-- execução em andamento" em vez de deixar acumular linhas 'running'
-- órfãs ou permitir duas execuções pisando uma na outra.

create unique index if not exists idx_seo_audits_one_running_per_project
  on seo_audits (website_project_id)
  where status = 'running';

create unique index if not exists idx_ranking_scans_one_running_per_location
  on ranking_scans (keyword_location_id)
  where status = 'running';
