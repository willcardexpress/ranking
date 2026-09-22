-- RankLocal — Migration de correção (auditoria pós-Fase 5): rate limiting
-- compartilhado entre instâncias.
--
-- Antes: services/google/rate-limiter.ts e services/seo/rate-limiter.ts
-- guardavam contadores só em memória, por processo — inútil entre
-- instâncias serverless (cada cold start zera o contador). Esta migration
-- adiciona uma segunda camada, autoritativa e compartilhada, sem
-- introduzir infraestrutura nova além do Postgres que o projeto já usa.
--
-- Desenho: contador de janela fixa (`key` + `window_start`), incrementado
-- atomicamente via a função `increment_rate_limit_counter` — o
-- INSERT ... ON CONFLICT DO UPDATE dentro de uma única instrução SQL evita
-- race condition entre requisições concorrentes (o Postgres serializa o
-- conflito na própria constraint de chave primária, sem precisar de lock
-- explícito no código da aplicação).

create table if not exists rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Permite limpar/consultar contadores antigos com eficiência (não há job
-- de limpeza automática nesta fase — linhas antigas são inofensivas e
-- pequenas; um job de expurgo periódico é candidato para a Fase 9).
create index if not exists idx_rate_limit_counters_window on rate_limit_counters(window_start);

create or replace function increment_rate_limit_counter(p_key text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into rate_limit_counters (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limit_counters.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- RLS: nenhuma policy — bloqueia qualquer acesso via chave de cliente
-- (mesmo padrão de google_business_connections). Só a service role
-- (lib/rate-limit.ts) lê/escreve aqui.
alter table rate_limit_counters enable row level security;

-- A função roda com SECURITY DEFINER (dono = quem criou, normalmente o
-- superusuário/role de migration), então por padrão qualquer role com
-- EXECUTE poderia chamá-la mesmo sem acesso direto à tabela. Restringe
-- explicitamente: só a service role pode executar.
revoke execute on function increment_rate_limit_counter(text, timestamptz) from public;
revoke execute on function increment_rate_limit_counter(text, timestamptz) from anon;
revoke execute on function increment_rate_limit_counter(text, timestamptz) from authenticated;
grant execute on function increment_rate_limit_counter(text, timestamptz) to service_role;
