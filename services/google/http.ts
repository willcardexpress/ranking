/**
 * Wrapper de fetch com timeout e retry exponencial, usado por
 * services/google/*. Não trata erros de negócio — apenas transporte.
 */

interface FetchWithRetryOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class UpstreamTimeoutError extends Error {
  constructor(message = "A requisição excedeu o tempo limite.") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

export async function fetchWithRetry(
  url: string,
  { timeoutMs = 8000, retries = 2, retryDelayMs = 300, ...init }: FetchWithRetryOptions = {}
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      // Erros 5xx e 429 (rate limit) são retentáveis; 4xx (exceto 429) não são.
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          await delay(retryDelayMs * (attempt + 1));
          continue;
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      const isAbort = error instanceof Error && error.name === "AbortError";
      if (attempt < retries) {
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }

      if (isAbort) {
        throw new UpstreamTimeoutError();
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha desconhecida na requisição.");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
