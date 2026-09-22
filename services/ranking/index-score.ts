/**
 * Índice RankLocal — métrica proprietária (0-100) do RankLocal.
 *
 * IMPORTANTE: este índice é um cálculo interno, próprio do RankLocal, feito
 * a partir de observações de grid coletadas via Google Places API. Ele
 * NUNCA deve ser apresentado como "pontuação oficial do Google" ou como
 * reprodução do algoritmo de ranking do Google — ver docs/architecture.md
 * §2 e docs/ranking-methodology.md.
 *
 * Fórmula (pesos ajustáveis por configuração futura):
 * - 40% presença no Top 3
 * - 30% presença no Top 10
 * - 30% posição média normalizada (posição 1 = 100, posição no limite do
 *   grid pesquisado = próximo de 0)
 */

export interface RankLocalIndexInput {
  top3Rate: number; // 0-100
  top10Rate: number; // 0-100
  averagePosition: number | null;
  maxResultCount: number; // quantidade máxima de resultados considerada por ponto
}

const WEIGHTS = {
  top3: 0.4,
  top10: 0.3,
  position: 0.3,
} as const;

export function computeRankLocalIndex(input: RankLocalIndexInput): number {
  const normalizedPosition = normalizePosition(input.averagePosition, input.maxResultCount);

  const score =
    input.top3Rate * WEIGHTS.top3 +
    input.top10Rate * WEIGHTS.top10 +
    normalizedPosition * WEIGHTS.position;

  return Math.round(clamp(score, 0, 100));
}

function normalizePosition(averagePosition: number | null, maxResultCount: number): number {
  if (averagePosition === null || maxResultCount <= 1) return 0;
  const ratio = (averagePosition - 1) / (maxResultCount - 1);
  return clamp(100 - ratio * 100, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
