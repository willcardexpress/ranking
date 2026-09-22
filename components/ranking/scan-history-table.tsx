import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanHistoryEntry } from "@/lib/ranking-data";

export function ScanHistoryTable({ entries }: { entries: ScanHistoryEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de scans</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum scan concluído ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Grid</th>
                  <th className="py-2 pr-4">Posição média</th>
                  <th className="py-2 pr-4">Top 3</th>
                  <th className="py-2 pr-4">Top 10</th>
                  <th className="py-2 pr-4">Índice RankLocal</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.scanId} className="border-b border-slate-50 text-slate-700">
                    <td className="py-2 pr-4">
                      {entry.completedAt ? new Date(entry.completedAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="py-2 pr-4">{entry.gridSize}</td>
                    <td className="py-2 pr-4">{entry.averagePosition?.toFixed(1) ?? "—"}</td>
                    <td className="py-2 pr-4">{entry.top3Rate.toFixed(0)}%</td>
                    <td className="py-2 pr-4">{entry.top10Rate.toFixed(0)}%</td>
                    <td className="py-2 pr-4 font-medium">{entry.rankLocalIndex}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
