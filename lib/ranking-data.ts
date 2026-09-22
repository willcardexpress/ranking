import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolvePlaceNames } from "@/lib/places-lookup";
import { computeRankingMetrics, computeTrend } from "@/services/ranking/metrics";
import { computeRankLocalIndex } from "@/services/ranking/index-score";
import {
  demoKeyword,
  demoKeywordLocation,
  demoScanSummary,
  demoCompetitors,
} from "@/lib/demo-data";
import type { Keyword, KeywordLocation, ScanSummary, CompetitorFrequency } from "@/types/ranking";

async function hasRealSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export interface KeywordsResult {
  keywords: Keyword[];
  isDemo: boolean;
}

export async function getKeywordsForBusiness(businessId: string): Promise<KeywordsResult> {
  if (businessId === demoKeyword.business_id || !(await hasRealSession())) {
    return { keywords: [demoKeyword], isDemo: true };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keywords")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error || !data) return { keywords: [], isDemo: false };
    return { keywords: data as Keyword[], isDemo: false };
  } catch {
    return { keywords: [demoKeyword], isDemo: true };
  }
}

export interface KeywordLocationsResult {
  locations: KeywordLocation[];
  isDemo: boolean;
}

export async function getKeywordLocations(keywordId: string): Promise<KeywordLocationsResult> {
  if (keywordId === demoKeyword.id || !(await hasRealSession())) {
    return { locations: [demoKeywordLocation], isDemo: true };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_locations")
      .select("*")
      .eq("keyword_id", keywordId)
      .order("created_at", { ascending: false });

    if (error || !data) return { locations: [], isDemo: false };
    return { locations: data as KeywordLocation[], isDemo: false };
  } catch {
    return { locations: [demoKeywordLocation], isDemo: true };
  }
}

export interface ScanSummaryResult {
  summary: ScanSummary | null;
  isDemo: boolean;
}

/**
 * Busca o scan mais recente concluído para um ponto de referência, resolve
 * os pontos do grid com o nome (via cache `places`, respeitando o limite
 * de 30 dias), calcula métricas, tendência (vs. scan anterior) e o Índice
 * RankLocal.
 */
export async function getLatestScanSummary(keywordLocationId: string): Promise<ScanSummaryResult> {
  if (keywordLocationId === demoKeywordLocation.id || !(await hasRealSession())) {
    return { summary: demoScanSummary, isDemo: true };
  }

  try {
    const supabase = await createClient();

    const { data: scans } = await supabase
      .from("ranking_scans")
      .select("*")
      .eq("keyword_location_id", keywordLocationId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(2);

    if (!scans || scans.length === 0) {
      return { summary: null, isDemo: false };
    }

    const [latestScan, previousScan] = scans;

    const { data: location } = await supabase
      .from("keyword_locations")
      .select("*, keywords(*)")
      .eq("id", keywordLocationId)
      .maybeSingle();

    const keywordRel = location?.keywords
      ? Array.isArray(location.keywords)
        ? location.keywords[0]
        : location.keywords
      : null;

    if (!location || !keywordRel) {
      return { summary: null, isDemo: false };
    }

    const { data: points } = await supabase
      .from("ranking_grid_points")
      .select("id, row_index, col_index, latitude, longitude, ranking_results(observed_position, found, top_place_ids, fetched_at)")
      .eq("scan_id", latestScan.id)
      .order("row_index", { ascending: true })
      .order("col_index", { ascending: true });

    const rows = points ?? [];
    const targetPlaceIds = new Set<string>();
    for (const row of rows) {
      const result = Array.isArray(row.ranking_results) ? row.ranking_results[0] : row.ranking_results;
      const topIds = (result?.top_place_ids as string[] | undefined) ?? [];
      const foundPosition = result?.observed_position as number | null | undefined;
      if (foundPosition != null && topIds[foundPosition - 1]) {
        targetPlaceIds.add(topIds[foundPosition - 1]);
      }
    }

    const nameByPlaceId = await resolvePlaceNames(Array.from(targetPlaceIds));

    const gridPoints = rows.map((row) => {
      const result = Array.isArray(row.ranking_results) ? row.ranking_results[0] : row.ranking_results;
      const observedPosition = (result?.observed_position as number | null | undefined) ?? null;
      const topIds = (result?.top_place_ids as string[] | undefined) ?? [];
      const placeId = observedPosition != null ? topIds[observedPosition - 1] : undefined;

      return {
        rowIndex: row.row_index as number,
        colIndex: row.col_index as number,
        latitude: row.latitude as number,
        longitude: row.longitude as number,
        observedPosition,
        found: Boolean(result?.found),
        fetchedAt: (result?.fetched_at as string | undefined) ?? latestScan.completed_at,
        businessName: placeId ? nameByPlaceId.get(placeId) ?? null : null,
      };
    });

    const metrics = computeRankingMetrics(gridPoints.map((p) => ({ position: p.observedPosition })));

    let previousAverage: number | null = null;
    if (previousScan) {
      const { data: previousPoints } = await supabase
        .from("ranking_grid_points")
        .select("ranking_results(observed_position)")
        .eq("scan_id", previousScan.id);

      const previousObservations = (previousPoints ?? []).map((row) => {
        const result = Array.isArray(row.ranking_results) ? row.ranking_results[0] : row.ranking_results;
        return { position: (result?.observed_position as number | null | undefined) ?? null };
      });
      previousAverage = computeRankingMetrics(previousObservations).averagePosition;
    }

    const trend = computeTrend(metrics.averagePosition, previousAverage);
    const rankLocalIndex = computeRankLocalIndex({
      top3Rate: metrics.top3Rate,
      top10Rate: metrics.top10Rate,
      averagePosition: metrics.averagePosition,
      maxResultCount: latestScan.max_result_count,
    });

    return {
      isDemo: false,
      summary: {
        scan: latestScan,
        keyword: keywordRel,
        keywordLocation: location,
        points: gridPoints,
        metrics,
        trend,
        rankLocalIndex,
      },
    };
  } catch {
    return { summary: demoScanSummary, isDemo: true };
  }
}

export interface ScanHistoryEntry {
  scanId: string;
  completedAt: string | null;
  gridSize: string;
  averagePosition: number | null;
  top3Rate: number;
  top10Rate: number;
  rankLocalIndex: number;
}

export async function getScanHistory(keywordLocationId: string, limit = 10): Promise<ScanHistoryEntry[]> {
  if (keywordLocationId === demoKeywordLocation.id || !(await hasRealSession())) {
    return [
      {
        scanId: demoScanSummary.scan.id,
        completedAt: demoScanSummary.scan.completed_at,
        gridSize: demoScanSummary.scan.grid_size,
        averagePosition: demoScanSummary.metrics.averagePosition,
        top3Rate: demoScanSummary.metrics.top3Rate,
        top10Rate: demoScanSummary.metrics.top10Rate,
        rankLocalIndex: demoScanSummary.rankLocalIndex,
      },
    ];
  }

  try {
    const supabase = await createClient();
    const { data: scans } = await supabase
      .from("ranking_scans")
      .select("id, grid_size, max_result_count, completed_at")
      .eq("keyword_location_id", keywordLocationId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(limit);

    if (!scans) return [];

    const entries: ScanHistoryEntry[] = [];
    for (const scan of scans) {
      const { data: points } = await supabase
        .from("ranking_grid_points")
        .select("ranking_results(observed_position)")
        .eq("scan_id", scan.id);

      const observations = (points ?? []).map((row) => {
        const result = Array.isArray(row.ranking_results) ? row.ranking_results[0] : row.ranking_results;
        return { position: (result?.observed_position as number | null | undefined) ?? null };
      });
      const metrics = computeRankingMetrics(observations);

      entries.push({
        scanId: scan.id,
        completedAt: scan.completed_at,
        gridSize: scan.grid_size,
        averagePosition: metrics.averagePosition,
        top3Rate: metrics.top3Rate,
        top10Rate: metrics.top10Rate,
        rankLocalIndex: computeRankLocalIndex({
          top3Rate: metrics.top3Rate,
          top10Rate: metrics.top10Rate,
          averagePosition: metrics.averagePosition,
          maxResultCount: scan.max_result_count,
        }),
      });
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Concorrentes observados repetidamente no scan mais recente — frequência
 * de aparição no grid e posição média. Sempre resolvido via place_id +
 * cache `places` (nunca nome congelado no histórico).
 */
export async function getCompetitorFrequency(keywordLocationId: string): Promise<{
  competitors: CompetitorFrequency[];
  isDemo: boolean;
}> {
  if (keywordLocationId === demoKeywordLocation.id || !(await hasRealSession())) {
    return { competitors: demoCompetitors, isDemo: true };
  }

  try {
    const supabase = await createClient();

    const { data: latestScan } = await supabase
      .from("ranking_scans")
      .select("id")
      .eq("keyword_location_id", keywordLocationId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestScan) return { competitors: [], isDemo: false };

    const { data: points } = await supabase
      .from("ranking_grid_points")
      .select("ranking_results(top_place_ids)")
      .eq("scan_id", latestScan.id);

    const tally = new Map<string, { count: number; positionSum: number }>();
    for (const row of points ?? []) {
      const result = Array.isArray(row.ranking_results) ? row.ranking_results[0] : row.ranking_results;
      const topIds = (result?.top_place_ids as string[] | undefined) ?? [];
      topIds.forEach((placeId, index) => {
        const entry = tally.get(placeId) ?? { count: 0, positionSum: 0 };
        entry.count += 1;
        entry.positionSum += index + 1;
        tally.set(placeId, entry);
      });
    }

    const nameByPlaceId = await resolvePlaceNames(Array.from(tally.keys()));

    const competitors: CompetitorFrequency[] = Array.from(tally.entries())
      .map(([placeId, { count, positionSum }]) => ({
        placeId,
        displayName: nameByPlaceId.get(placeId) ?? null,
        appearances: count,
        averagePosition: Math.round((positionSum / count) * 10) / 10,
      }))
      .sort((a, b) => b.appearances - a.appearances)
      .slice(0, 10);

    return { competitors, isDemo: false };
  } catch {
    return { competitors: demoCompetitors, isDemo: true };
  }
}
