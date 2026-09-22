import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorFrequency } from "@/types/ranking";

export function CompetitorsTable({ competitors }: { competitors: CompetitorFrequency[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Concorrentes observados no grid</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-slate-400">
          Empresas encontradas repetidamente nos pontos do scan mais recente, por frequência de aparição.
        </p>
        {competitors.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum concorrente identificado ainda.</p>
        ) : (
          competitors.map((c) => (
            <div key={c.placeId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {c.displayName ?? `Place ID: ${c.placeId.slice(0, 12)}…`}
                </p>
                <p className="text-xs text-slate-500">Posição média: {c.averagePosition.toFixed(1)}</p>
              </div>
              <Badge variant="secondary">{c.appearances}× no grid</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
