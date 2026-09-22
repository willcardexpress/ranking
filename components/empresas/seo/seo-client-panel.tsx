"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { saveWebsiteProjectAction, runSeoAuditAction, type ActionState } from "@/lib/actions/seo";
import type { WebsiteProject, SeoAuditSummary, SeoIssueSeverity } from "@/types/seo";

const SEVERITY_LABEL: Record<SeoIssueSeverity, { label: string; variant: "destructive" | "warning" | "secondary" }> = {
  critical: { label: "Crítico", variant: "destructive" },
  warning: { label: "Aviso", variant: "warning" },
  info: { label: "Informativo", variant: "secondary" },
};

const initialState: ActionState = null;

interface SeoClientPanelProps {
  businessId: string;
  project: WebsiteProject | null;
  summary: SeoAuditSummary | null;
}

export function SeoClientPanel({ businessId, project, summary }: SeoClientPanelProps) {
  const router = useRouter();
  const [formState, formAction, isSavingUrl] = useActionState(saveWebsiteProjectAction, initialState);
  const [isAuditing, startTransition] = useTransition();
  const [auditError, setAuditError] = useState<string | null>(null);

  function handleRunAudit() {
    setAuditError(null);
    startTransition(async () => {
      const result = await runSeoAuditAction(businessId);
      if (!result.ok) {
        setAuditError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!project) {
    return (
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="flex-1">
          <Input name="rootUrl" placeholder="https://seusite.com.br" required />
          {formState?.error && <p className="mt-1 text-xs text-brand-red">{formState.error}</p>}
        </div>
        <Button type="submit" size="sm" disabled={isSavingUrl}>
          {isSavingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar site"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Site: <span className="font-medium text-slate-800">{project.root_url}</span>
        </p>
        <Button size="sm" variant="outline" onClick={handleRunAudit} disabled={isAuditing}>
          {isAuditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Rodar auditoria
        </Button>
      </div>

      {isAuditing && (
        <p className="text-xs text-slate-400">
          Rastreando páginas e verificando robots.txt, sitemap, títulos, metas, imagens e links...
        </p>
      )}
      {auditError && <p className="text-sm text-brand-red" role="alert">{auditError}</p>}

      {!summary ? (
        <p className="text-sm text-slate-500">Nenhuma auditoria concluída ainda. Clique em &quot;Rodar auditoria&quot;.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="SEO Score" value={`${summary.audit.seo_score ?? "—"}/100`} accent="text-brand-blue" />
            <MiniStat label="Páginas auditadas" value={String(summary.audit.pages_crawled)} />
            <MiniStat label="robots.txt" value={summary.audit.has_robots_txt ? "Encontrado" : "Não encontrado"} />
            <MiniStat label="Sitemap" value={summary.audit.has_sitemap ? "Encontrado" : "Não encontrado"} />
          </div>

          <p className="text-xs text-slate-400">
            Auditoria de {new Date(summary.audit.completed_at ?? summary.audit.created_at).toLocaleString("pt-BR")} ·{" "}
            {summary.issueCountsBySeverity.critical} crítico(s), {summary.issueCountsBySeverity.warning} aviso(s),{" "}
            {summary.issueCountsBySeverity.info} informativo(s)
          </p>

          {summary.issues.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum problema encontrado nesta auditoria.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.issues.map((issue) => {
                const severity = SEVERITY_LABEL[issue.severity];
                return (
                  <div key={issue.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                    <div>
                      <p className="text-sm text-slate-700">{issue.message}</p>
                      {issue.page_url && <p className="mt-0.5 text-xs text-slate-400">{issue.page_url}</p>}
                    </div>
                    <Badge variant={severity.variant}>{severity.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${accent ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}
