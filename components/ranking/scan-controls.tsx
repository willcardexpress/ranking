"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, PlugZap } from "lucide-react";
import { runRankingScanAction } from "@/lib/actions/ranking";
import type { GridSize } from "@/services/ranking/grid";

const GRID_OPTIONS: { value: GridSize; label: string; points: number }[] = [
  { value: "3x3", label: "3x3", points: 9 },
  { value: "5x5", label: "5x5", points: 25 },
  { value: "7x7", label: "7x7", points: 49 },
];

export function ScanControls({
  keywordLocationId,
  placesConfigured,
  hasTargetPlaceId,
}: {
  keywordLocationId: string;
  placesConfigured: boolean;
  hasTargetPlaceId: boolean;
}) {
  const router = useRouter();
  const [gridSize, setGridSize] = useState<GridSize>("3x3");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await runRankingScanAction(keywordLocationId, gridSize);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!placesConfigured) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
        <p className="text-sm text-amber-800">
          Google Places não conectado. Configure <code>GOOGLE_PLACES_API_KEY</code> para rodar scans de ranking.
        </p>
      </div>
    );
  }

  if (!hasTargetPlaceId) {
    return (
      <p className="text-sm text-slate-500">
        Vincule o Place ID desta empresa (cadastro/confirmação no Google) antes de rodar um scan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {GRID_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setGridSize(opt.value)}
            disabled={isPending}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              gridSize === opt.value
                ? "border-brand-blue bg-blue-50 text-brand-blue"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Grid {opt.label} · {opt.points} pontos
          </button>
        ))}
        <Button size="sm" onClick={handleStart} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rodar scan"}
        </Button>
      </div>
      {isPending && (
        <p className="text-xs text-slate-400">
          Consultando o Google ponto a ponto — grids maiores podem levar mais tempo.
        </p>
      )}
      {error && <p className="text-sm text-brand-red" role="alert">{error}</p>}
    </div>
  );
}
