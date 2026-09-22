"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/business-access";
import { googlePlacesService } from "@/services/google/places";
import { isGooglePlacesConfigured } from "@/services/google/config";
import { persistConfirmedPlace } from "@/lib/places-persistence";
import {
  generateGridPoints,
  suggestedSearchRadius,
  type GridSize,
} from "@/services/ranking/grid";
import { googlePlacesLogger } from "@/services/google/logger";
import { runWithTimeout, TimeoutError } from "@/lib/with-timeout";
import type { NormalizedPlace } from "@/types/places";

const MAX_RESULT_COUNT = 20;
/** Tempo máximo interno de um scan antes de desistirmos e marcarmos como falha. */
const SCAN_TIMEOUT_MS = 45_000;
/** Depois disso, um scan "running" é considerado travado (função provavelmente foi encerrada à força). */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------

const keywordSchema = z.object({
  businessId: z.string().uuid(),
  term: z.string().trim().min(3, "A palavra-chave precisa ter ao menos 3 caracteres."),
});

export type ActionState = { error?: string; success?: boolean } | null;

export async function createKeywordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = keywordSchema.safeParse({
    businessId: formData.get("businessId"),
    term: formData.get("term"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const access = await assertBusinessAccess(parsed.data.businessId);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.from("keywords").insert({
    business_id: parsed.data.businessId,
    term: parsed.data.term,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Essa palavra-chave já está cadastrada para esta empresa." };
    }
    return { error: "Não foi possível salvar a palavra-chave." };
  }

  revalidatePath("/google-maps");
  return { success: true };
}

// ---------------------------------------------------------------------
// Localização de referência (centro do grid)
// ---------------------------------------------------------------------

const keywordLocationSchema = z.object({
  keywordId: z.string().uuid(),
  label: z.string().trim().min(2, "Informe um nome para este ponto de referência."),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export async function createKeywordLocationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = keywordLocationSchema.safeParse({
    keywordId: formData.get("keywordId"),
    label: formData.get("label"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  // A ação só recebe keywordId, não businessId — resolve a empresa dona
  // da keyword antes de validar o acesso (a leitura abaixo já é
  // protegida por RLS, mas assertBusinessAccess dá uma mensagem de erro
  // clara e consistente com o resto do app em vez de um erro genérico de
  // banco quando o usuário não tem acesso).
  const { data: keywordRow } = await supabase
    .from("keywords")
    .select("business_id")
    .eq("id", parsed.data.keywordId)
    .maybeSingle();

  if (!keywordRow) {
    return { error: "Palavra-chave não encontrada ou sem permissão de acesso." };
  }

  const access = await assertBusinessAccess(keywordRow.business_id);
  if (!access.ok) return { error: access.error };

  const { error } = await supabase.from("keyword_locations").insert({
    keyword_id: parsed.data.keywordId,
    label: parsed.data.label,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
  });

  if (error) {
    return { error: "Não foi possível salvar o ponto de referência." };
  }

  revalidatePath("/google-maps");
  return { success: true };
}

// ---------------------------------------------------------------------
// Scan de grid
// ---------------------------------------------------------------------

const SPACING_BY_GRID: Record<GridSize, number> = {
  "3x3": 1000,
  "5x5": 800,
  "7x7": 600,
};

export type RunScanResult = { ok: true; scanId: string } | { ok: false; error: string };

/**
 * Executa um scan de grid completo: gera os pontos, consulta a Places API
 * (New) ponto a ponto com viés de localização, identifica a posição
 * observada da empresa e persiste tudo.
 *
 * Nunca afirma reproduzir o algoritmo oficial do Google — apenas registra
 * observações via API pública, respeitando os limites de uso (rate
 * limiting interno, cache, e a política de retenção de 30 dias para
 * conteúdo que não seja place_id). Ver docs/ranking-methodology.md.
 */
export async function runRankingScanAction(
  keywordLocationId: string,
  gridSize: GridSize
): Promise<RunScanResult> {
  if (!isGooglePlacesConfigured()) {
    return { ok: false, error: "Google Places não conectado. Configure GOOGLE_PLACES_API_KEY para rodar um scan." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  const { data: location, error: locationError } = await supabase
    .from("keyword_locations")
    .select("id, latitude, longitude, keyword_id, keywords(id, term, business_id, businesses(id, google_place_id))")
    .eq("id", keywordLocationId)
    .maybeSingle();

  if (locationError || !location) {
    return { ok: false, error: "Ponto de referência não encontrado." };
  }

  // O select acima retorna relações aninhadas; normalizamos com cuidado
  // porque o cliente Supabase tipa isso como array em alguns casos.
  const keywordRel = Array.isArray(location.keywords) ? location.keywords[0] : location.keywords;
  const businessRel = keywordRel
    ? Array.isArray(keywordRel.businesses)
      ? keywordRel.businesses[0]
      : keywordRel.businesses
    : null;

  if (!keywordRel || !businessRel) {
    return { ok: false, error: "Não foi possível localizar a empresa associada a esta palavra-chave." };
  }

  const targetPlaceId: string | null = businessRel.google_place_id;
  if (!targetPlaceId) {
    return {
      ok: false,
      error: "Esta empresa ainda não tem um Place ID vinculado. Confirme o estabelecimento no Google antes de rodar um scan.",
    };
  }

  const spacingMeters = SPACING_BY_GRID[gridSize];
  const searchRadiusMeters = suggestedSearchRadius(spacingMeters);
  const gridPoints = generateGridPoints(
    { latitude: location.latitude, longitude: location.longitude },
    gridSize,
    spacingMeters
  );

  // Auto-recuperação de scans travados: mesmo desenho de
  // lib/actions/seo.ts (runSeoAuditAction) — se o último scan "running"
  // para este ponto de referência já passou do tempo máximo plausível,
  // marca como falha agora para liberar espaço para uma nova tentativa.
  const { data: runningScan } = await supabase
    .from("ranking_scans")
    .select("id, started_at")
    .eq("keyword_location_id", keywordLocationId)
    .eq("status", "running")
    .maybeSingle();

  if (runningScan) {
    const startedAt = runningScan.started_at ? new Date(runningScan.started_at).getTime() : 0;
    if (Date.now() - startedAt > STALE_THRESHOLD_MS) {
      await supabase
        .from("ranking_scans")
        .update({ status: "failed", error_message: "Expirou: o processo foi interrompido antes de concluir." })
        .eq("id", runningScan.id);
    } else {
      return { ok: false, error: "Já existe um scan em andamento para este ponto de referência. Aguarde ele terminar." };
    }
  }

  const { data: scan, error: scanError } = await supabase
    .from("ranking_scans")
    .insert({
      keyword_location_id: keywordLocationId,
      grid_size: gridSize,
      spacing_meters: spacingMeters,
      search_radius_meters: searchRadiusMeters,
      max_result_count: MAX_RESULT_COUNT,
      status: "running",
      requested_by: user.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    // 23505 = violação de unicidade — outra requisição venceu a corrida e
    // já está rodando um scan para este mesmo ponto de referência.
    if (scanError && (scanError as { code?: string }).code === "23505") {
      return { ok: false, error: "Já existe um scan em andamento para este ponto de referência. Aguarde ele terminar." };
    }
    return { ok: false, error: "Não foi possível criar o scan." };
  }

  const scanId = scan.id;

  const { data: insertedPoints, error: pointsError } = await supabase
    .from("ranking_grid_points")
    .insert(
      gridPoints.map((p) => ({
        scan_id: scanId,
        row_index: p.rowIndex,
        col_index: p.colIndex,
        latitude: p.latitude,
        longitude: p.longitude,
      }))
    )
    .select("id, row_index, col_index, latitude, longitude");

  if (pointsError || !insertedPoints) {
    await supabase.from("ranking_scans").update({ status: "failed", error_message: "Falha ao criar pontos do grid." }).eq("id", scanId);
    return { ok: false, error: "Não foi possível criar os pontos do grid." };
  }

  const seenPlaces = new Map<string, NormalizedPlace>();
  let hadFailure = false;

  async function scanAllPoints() {
    for (const point of insertedPoints!) {
      try {
        const { places } = await googlePlacesService.searchTextAtLocation(
          keywordRel.term,
          { latitude: point.latitude, longitude: point.longitude, radiusMeters: searchRadiusMeters },
          MAX_RESULT_COUNT
        );

        for (const place of places) {
          if (place.placeId) seenPlaces.set(place.placeId, place);
        }

        const observedIndex = places.findIndex((p) => p.placeId === targetPlaceId);
        const observedPosition = observedIndex === -1 ? null : observedIndex + 1;

        await supabase.from("ranking_results").insert({
          grid_point_id: point.id,
          observed_position: observedPosition,
          found: observedIndex !== -1,
          top_place_ids: places.map((p) => p.placeId),
        });
      } catch (error) {
        hadFailure = true;
        googlePlacesLogger.error("grid point scan failed", {
          scanId,
          rowIndex: point.row_index,
          colIndex: point.col_index,
          errorName: error instanceof Error ? error.name : "unknown",
        });
        // Ponto sem resultado é registrado como "não encontrado" em vez de
        // travar o scan inteiro por causa de uma falha pontual.
        await supabase.from("ranking_results").insert({
          grid_point_id: point.id,
          observed_position: null,
          found: false,
          top_place_ids: [],
        });
      }
    }
  }

  // Timeout interno: se o grid inteiro (potencialmente até 49 pontos no
  // 7x7) demorar demais, desistimos e marcamos o scan como falha em vez
  // de deixá-lo "running" para sempre. Limitação conhecida: isto não
  // aborta de fato as chamadas de rede já em voo (JS não cancela promises
  // de verdade) — só garante que a Server Action retorna ao usuário e o
  // registro no banco reflete a falha dentro de um tempo previsível. Ver
  // lib/with-timeout.ts.
  try {
    await runWithTimeout(scanAllPoints(), SCAN_TIMEOUT_MS, "O scan excedeu o tempo máximo interno.");
  } catch (error) {
    if (error instanceof TimeoutError) {
      await supabase
        .from("ranking_scans")
        .update({
          status: "failed",
          error_message: "O scan excedeu o tempo máximo e foi interrompido. Tente um grid menor (3x3 ou 5x5).",
          completed_at: new Date().toISOString(),
        })
        .eq("id", scanId);
      return { ok: false, error: "O scan excedeu o tempo máximo e foi interrompido. Tente um grid menor (3x3 ou 5x5)." };
    }
    throw error;
  }

  // Mantém o cache `places` atualizado com o que foi observado (upsert,
  // respeitando o refresh de 30 dias — ver lib/places-persistence.ts).
  for (const place of seenPlaces.values()) {
    await persistConfirmedPlace(place);
  }

  await supabase
    .from("ranking_scans")
    .update({
      status: hadFailure ? "completed" : "completed",
      completed_at: new Date().toISOString(),
      error_message: hadFailure ? "Alguns pontos do grid falharam e foram registrados como não encontrados." : null,
    })
    .eq("id", scanId);

  revalidatePath("/google-maps");
  return { ok: true, scanId };
}
