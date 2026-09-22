import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import type { RankingTrend } from "@/services/ranking/metrics";

const TREND_LABEL: Record<RankingTrend, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  melhorou: { label: "Melhorou", variant: "success" },
  piorou: { label: "Piorou", variant: "destructive" },
  estavel: { label: "Estável", variant: "secondary" },
  indisponivel: { label: "Sem histórico suficiente", variant: "secondary" },
};

interface MetricsPanelProps {
  averagePosition: number | null;
  bestPosition: number | null;
  worstPosition: number | null;
  top3Rate: number;
  top10Rate: number;
  trend: RankingTrend;
  rankLocalIndex: number;
}

export function MetricsPanel(props: MetricsPanelProps) {
  const trend = TREND_LABEL[props.trend];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard title="Índice RankLocal" value={`${props.rankLocalIndex}/100`} accentClassName="text-brand-blue" />
      <MetricCard title="Posição média" value={props.averagePosition?.toFixed(1) ?? "—"} />
      <MetricCard title="Melhor posição" value={props.bestPosition?.toString() ?? "—"} accentClassName="text-brand-emerald" />
      <MetricCard title="Pior posição" value={props.worstPosition?.toString() ?? "—"} accentClassName="text-brand-red" />
      <MetricCard title="Top 3" value={`${props.top3Rate.toFixed(0)}%`} />
      <MetricCard title="Top 10" value={`${props.top10Rate.toFixed(0)}%`} />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-6">
        <span className="text-xs text-slate-400">Tendência (vs. scan anterior):</span>
        <Badge variant={trend.variant}>{trend.label}</Badge>
      </div>
    </div>
  );
}
