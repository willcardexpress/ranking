import { PlacesServiceError } from "./errors";
import { checkDbRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

/**
 * Rate limiting interno da aplicação (independente do 429 que a própria
 * Google pode retornar). Protege contra consumo/custo excessivo causado
 * por uso abusivo ou bug no nosso próprio código — ex.: um usuário
 * disparando buscas em loop.
 *
 * Duas camadas (ver lib/rate-limit.ts para o porquê):
 * 1. Janela fixa em memória, por processo — instantânea, primeira linha
 *    de defesa, já suficiente dentro de uma mesma instância.
 * 2. Contador compartilhado no Postgres (`rate_limit_counters`) — limite
 *    real, agregado entre todas as instâncias serverless. Falha aberta
 *    se o banco estiver indisponível.
 */

interface Window {
  startedAt: number;
  count: number;
}

const WINDOW_MS = 60_000;

const LIMITS: Record<string, number> = {
  search: 30, // buscas por texto por minuto
  details: 60, // detalhes de estabelecimento por minuto
  grid: 60, // buscas por ponto de grid (scan de ranking) por minuto
  gbp_oauth: 20, // trocas/refresh de token OAuth do GBP por minuto
  gbp_accounts: 20, // listagens de contas GBP por minuto
  gbp_locations: 30, // listagens/sincronizações de locais GBP por minuto
};

const windows = new Map<string, Window>();

export async function checkRateLimit(operation: keyof typeof LIMITS): Promise<void> {
  const limit = LIMITS[operation];
  const now = Date.now();
  const current = windows.get(operation);

  if (!current || now - current.startedAt > WINDOW_MS) {
    windows.set(operation, { startedAt: now, count: 1 });
  } else {
    current.count += 1;

    if (current.count > limit) {
      throw new PlacesServiceError(
        "INTERNAL_RATE_LIMITED",
        `Limite interno de ${limit} requisições/minuto para "${operation}" foi excedido. Aguarde um instante.`
      );
    }
  }

  try {
    await checkDbRateLimit(`google:${operation}`, limit, WINDOW_MS);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw new PlacesServiceError(
        "INTERNAL_RATE_LIMITED",
        `Limite de ${limit} requisições/minuto para "${operation}" foi excedido (entre todas as instâncias). Aguarde um instante.`
      );
    }
    throw error;
  }
}

export function resetRateLimits(): void {
  windows.clear();
}
