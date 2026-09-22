import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * A Google Maps Platform permite armazenar place_id indefinidamente, mas
 * outros campos de "conteúdo Google" (nome, endereço, avaliação) só podem
 * ficar em cache por até 30 dias corridos. Por isso o histórico de ranking
 * nunca guarda nome em texto — ele resolve o nome aqui, a partir do cache
 * `places`, e trata qualquer registro mais antigo que 30 dias como
 * indisponível (a UI mostra o Place ID em vez de um nome potencialmente
 * desatualizado).
 */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function resolvePlaceNames(placeIds: string[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(placeIds.filter(Boolean)));
  const result = new Map<string, string | null>();
  if (unique.length === 0) return result;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("places")
      .select("place_id, display_name, fetched_at")
      .in("place_id", unique);

    const now = Date.now();
    for (const row of data ?? []) {
      const isFresh = now - new Date(row.fetched_at as string).getTime() < CACHE_MAX_AGE_MS;
      result.set(row.place_id as string, isFresh ? (row.display_name as string) : null);
    }
  } catch {
    // Supabase não configurado — todos os nomes ficam indisponíveis (fallback abaixo).
  }

  for (const id of unique) {
    if (!result.has(id)) result.set(id, null);
  }
  return result;
}
