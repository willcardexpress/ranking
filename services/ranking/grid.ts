export type GridSize = "3x3" | "5x5" | "7x7";

export interface GridCenter {
  latitude: number;
  longitude: number;
}

export interface GridPoint {
  rowIndex: number;
  colIndex: number;
  latitude: number;
  longitude: number;
}

const GRID_DIMENSION: Record<GridSize, number> = {
  "3x3": 3,
  "5x5": 5,
  "7x7": 7,
};

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Gera os pontos de um grid NxN centrado em `center`, espaçados por
 * `spacingMeters` entre pontos vizinhos. Aproximação equiretangular —
 * adequada para grids locais (poucos quilômetros), que é o caso de uso do
 * RankLocal. As coordenadas geradas são cálculo nosso, não "conteúdo" da
 * Google, então não estão sujeitas ao limite de cache de 30 dias.
 */
export function generateGridPoints(
  center: GridCenter,
  gridSize: GridSize,
  spacingMeters: number
): GridPoint[] {
  if (spacingMeters <= 0) {
    throw new Error("spacingMeters deve ser maior que zero.");
  }

  const dimension = GRID_DIMENSION[gridSize];
  const half = Math.floor(dimension / 2);
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos((center.latitude * Math.PI) / 180);

  const points: GridPoint[] = [];

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const latOffset = (row * spacingMeters) / METERS_PER_DEGREE_LAT;
      const lngOffset = (col * spacingMeters) / metersPerDegreeLng;

      points.push({
        rowIndex: row + half,
        colIndex: col + half,
        latitude: center.latitude + latOffset,
        longitude: center.longitude + lngOffset,
      });
    }
  }

  return points;
}

export function gridDimension(gridSize: GridSize): number {
  return GRID_DIMENSION[gridSize];
}

/** Raio sugerido (em metros) para o viés de localização de cada ponto de busca. */
export function suggestedSearchRadius(spacingMeters: number): number {
  return Math.max(150, Math.round(spacingMeters / 2));
}
