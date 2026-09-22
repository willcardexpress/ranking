import { Badge } from "@/components/ui/badge";

export function DemoBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
      <Badge variant="demo">DEMO</Badge>
      <p className="text-sm text-violet-700">
        Estes dados são ilustrativos, usados apenas para visualizar a interface
        na Fase 1. As integrações reais com Google e IA serão ativadas nas
        próximas fases.
      </p>
    </div>
  );
}
