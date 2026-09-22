"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { GridPointWithResult } from "@/types/ranking";

interface GridHeatmapProps {
  points: GridPointWithResult[];
  keywordTerm: string;
}

function cellTone(position: number | null): { bg: string; text: string } {
  if (position === null) return { bg: "bg-slate-200", text: "text-slate-500" };
  if (position <= 3) return { bg: "bg-emerald-500", text: "text-white" };
  if (position <= 7) return { bg: "bg-blue-400", text: "text-white" };
  if (position <= 15) return { bg: "bg-amber-400", text: "text-white" };
  return { bg: "bg-red-400", text: "text-white" };
}

export function GridHeatmap({ points, keywordTerm }: GridHeatmapProps) {
  const dimension = useMemo(() => {
    const maxRow = Math.max(...points.map((p) => p.rowIndex), 0);
    return maxRow + 1;
  }, [points]);

  const [selected, setSelected] = useState<GridPointWithResult | null>(points[0] ?? null);

  const byPosition = useMemo(() => {
    const map = new Map<string, GridPointWithResult>();
    points.forEach((p) => map.set(`${p.rowIndex}-${p.colIndex}`, p));
    return map;
  }, [points]);

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">Ainda não há um scan concluído para este ponto de referência.</p>;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${dimension}, minmax(0, 1fr))`, maxWidth: dimension * 56 }}
      >
        {Array.from({ length: dimension }).map((_, row) =>
          Array.from({ length: dimension }).map((_, col) => {
            const point = byPosition.get(`${row}-${col}`);
            const tone = cellTone(point?.observedPosition ?? null);
            const isSelected = selected?.rowIndex === row && selected?.colIndex === col;

            return (
              <button
                key={`${row}-${col}`}
                type="button"
                onClick={() => point && setSelected(point)}
                className={`flex h-12 w-12 items-center justify-center rounded-md text-sm font-semibold transition-transform hover:scale-105 ${tone.bg} ${tone.text} ${
                  isSelected ? "ring-2 ring-offset-2 ring-slate-900" : ""
                }`}
                title={point ? `Posição ${point.observedPosition ?? "não encontrada"}` : "Sem dado"}
              >
                {point?.observedPosition ?? "—"}
              </button>
            );
          })
        )}
      </div>

      <div className="flex min-w-[220px] flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Ponto selecionado</p>
        {selected ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={selected.observedPosition && selected.observedPosition <= 3 ? "success" : "secondary"}>
                {selected.observedPosition ? `Posição ${selected.observedPosition}` : "Não encontrada"}
              </Badge>
            </div>
            <p className="text-sm text-slate-700">
              <span className="text-slate-400">Palavra-chave:</span> {keywordTerm}
            </p>
            <p className="text-sm text-slate-700">
              <span className="text-slate-400">Empresa encontrada:</span>{" "}
              {selected.businessName ?? (selected.found ? "nome indisponível (cache expirado)" : "não encontrada neste ponto")}
            </p>
            <p className="text-sm text-slate-700">
              <span className="text-slate-400">Data:</span> {new Date(selected.fetchedAt).toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-slate-400">
              {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">Clique em uma célula do grid para ver os detalhes.</p>
        )}
      </div>
    </div>
  );
}
