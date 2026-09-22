/**
 * Cache simples em memória (por instância do processo) para reduzir
 * chamadas repetidas à Places API dentro de uma mesma janela de tempo.
 *
 * Limitação conhecida: em ambientes serverless (Vercel), cada instância
 * tem seu próprio cache e ele não persiste entre deploys/cold starts.
 * O cache durável entre execuções é a tabela `place_snapshots` no banco
 * (ver database/migrations/0002_google_places.sql), não este módulo.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCache(): void {
  store.clear();
}
