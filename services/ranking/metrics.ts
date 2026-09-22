/**
 * Métricas calculadas a partir dos resultados observados de um scan de
 * grid. Tudo aqui é derivado (cálculo nosso) — nunca afirmamos que
 * representa o algoritmo oficial de ranking do Google. Ver
 * docs/ranking-methodology.md.
 */

export interface GridObservation {
  /** Posição observada da empresa monitorada neste ponto (1-based), ou null se não encontrada. */
  position: number | null;
}

export interface RankingMetrics {
  totalPoints: number;
  foundPoints: number;
  /** Média das posições observadas, só entre os pontos onde a empresa foi encontrada. */
  averagePosition: number | null;
  bestPosition: number | null;
  worstPosition: number | null;
  /** % de pontos do grid em que a empresa apareceu entre as 3 primeiras posições. */
  top3Rate: number;
  /** % de pontos do grid em que a empresa apareceu entre as 10 primeiras posições. */
  top10Rate: number;
}

export function computeRankingMetrics(observations: GridObservation[]): RankingMetrics {
  const totalPoints = observations.length;
  const found = observations.filter((o) => o.position !== null) as { position: number }[];
  const foundPoints = found.length;

  const positions = found.map((f) => f.position);
  const averagePosition =
    foundPoints > 0
      ? roundToOneDecimal(positions.reduce((sum, p) => sum + p, 0) / foundPoints)
      : null;
  const bestPosition = foundPoints > 0 ? Math.min(...positions) : null;
  const worstPosition = foundPoints > 0 ? Math.max(...positions) : null;

  const top3Count = positions.filter((p) => p <= 3).length;
  const top10Count = positions.filter((p) => p <= 10).length;

  return {
    totalPoints,
    foundPoints,
    averagePosition,
    bestPosition,
    worstPosition,
    top3Rate: totalPoints > 0 ? roundToOneDecimal((top3Count / totalPoints) * 100) : 0,
    top10Rate: totalPoints > 0 ? roundToOneDecimal((top10Count / totalPoints) * 100) : 0,
  };
}

export type RankingTrend = "melhorou" | "piorou" | "estavel" | "indisponivel";

/**
 * Compara a posição média do scan atual com a do scan anterior.
 * Posição menor = melhor (posição 1 é a melhor observada).
 */
export function computeTrend(
  currentAveragePosition: number | null,
  previousAveragePosition: number | null,
  epsilon = 0.2
): RankingTrend {
  if (currentAveragePosition === null || previousAveragePosition === null) {
    return "indisponivel";
  }

  const diff = currentAveragePosition - previousAveragePosition;
  if (diff < -epsilon) return "melhorou";
  if (diff > epsilon) return "piorou";
  return "estavel";
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
