import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createScopedLogger } from "@/services/google/logger";

/**
 * Segunda camada de rate limiting - compartilhada entre instancias via
 * Postgres, complementar aos limitadores em memoria
 * (services/google/rate-limiter.ts, services/seo/rate-limiter.ts).
 *
 * Por que as duas camadas: o limitador em memoria e instantaneo (sem
 * round-trip de rede) e ja barra abuso dentro da mesma instancia -
 * mantido como primeira linha de defesa. Mas cada instancia serverless
 * tem sua propria memoria, entao um limite "30/min" vira, na pratica,
 * "30/min POR INSTANCIA" em producao. Esta camada usa uma tabela no
 * Postgres (rate_limit_counters) com um contador de janela fixa,
 * incrementado atomicamente via a funcao increment_rate_limit_counter
 * (INSERT ... ON CONFLICT DO UPDATE em uma unica instrucao - o Postgres
 * serializa a concorrencia na propria constraint, sem precisar de lock
 * manual no codigo), o que da o limite real, agregado entre todas as
 * instancias.
 *
 * Falha aberta: se o Postgres estiver indisponivel ou mal configurado
 * (ex.: SUPABASE_SERVICE_ROLE_KEY ausente neste ambiente), esta funcao
 * loga um aviso e permite a requisicao em vez de bloquear tudo - rate
 * limiting e protecao de custo/abuso, nao uma fronteira de seguranca;
 * indisponibilidade do rate limiter nunca deve derrubar a funcionalidade
 * principal do produto.
 */

const logger = createScopedLogger("rate-limit.db");

export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export async function checkDbRateLimit(key: string, limit: number, windowMs = 60_000): Promise<void> {
  try {
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
    const admin = createServiceRoleClient();

    const { data, error } = await admin.rpc("increment_rate_limit_counter", {
      p_key: key,
      p_window_start: windowStart,
    });

    if (error) {
      logger.warn("db rate limit check failed - failing open", { key, dbError: error.message });
      return;
    }

    const count = data as number;
    if (count > limit) {
      throw new RateLimitExceededError(`Limite compartilhado de ${limit}/janela excedido para "${key}".`);
    }
  } catch (error) {
    if (error instanceof RateLimitExceededError) throw error;
    logger.warn("db rate limit check threw - failing open", {
      key,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
}
