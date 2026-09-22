"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { searchCompetitorsAction } from "@/lib/actions/places";
import type { NormalizedPlace } from "@/types/places";

interface CompetitorsPanelProps {
  category: string | null;
  serviceArea: string | null;
  excludePlaceId: string | null;
}

export function CompetitorsPanel({ category, serviceArea, excludePlaceId }: CompetitorsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [competitors, setCompetitors] = useState<NormalizedPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSearch = Boolean(category && serviceArea);

  function handleSearch() {
    if (!category || !serviceArea) return;
    setError(null);
    startTransition(async () => {
      const result = await searchCompetitorsAction(category, serviceArea, excludePlaceId ?? undefined);
      if (!result.ok) {
        setError(result.error);
        setCompetitors(null);
        return;
      }
      setCompetitors(result.competitors);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Sugestão inicial de concorrentes prováveis, com base na categoria e área
          de atuação. A curadoria completa (marcar, ignorar, concorrente
          principal e histórico) chega na Fase 3/16.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSearch}
          disabled={!canSearch || isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar concorrentes"}
        </Button>
      </div>

      {!canSearch && (
        <p className="text-xs text-slate-400">
          Cadastre categoria e área de atuação para buscar concorrentes.
        </p>
      )}

      {error && <p className="text-sm text-brand-red" role="alert">{error}</p>}

      {competitors && competitors.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum concorrente encontrado para esta busca.</p>
      )}

      {competitors && competitors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {competitors.map((c) => (
            <li
              key={c.placeId}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{c.displayName}</p>
                <p className="text-xs text-slate-500">{c.formattedAddress ?? "—"}</p>
              </div>
              {typeof c.rating === "number" && (
                <Badge variant="secondary">
                  {c.rating.toFixed(1)}★ ({c.userRatingCount ?? 0})
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
