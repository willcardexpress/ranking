import "server-only";
import { createClient } from "@/lib/supabase/server";
import { demoWebsiteProject, demoSeoAuditSummary } from "@/lib/demo-data";
import type { WebsiteProject, SeoAuditSummary, SeoIssueSeverity } from "@/types/seo";

async function hasRealSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export interface WebsiteProjectResult {
  project: WebsiteProject | null;
  isDemo: boolean;
}

export async function getWebsiteProject(businessId: string): Promise<WebsiteProjectResult> {
  if (businessId === demoWebsiteProject.business_id || !(await hasRealSession())) {
    return { project: demoWebsiteProject, isDemo: true };
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.from("website_projects").select("*").eq("business_id", businessId).maybeSingle();
    return { project: (data as WebsiteProject) ?? null, isDemo: false };
  } catch {
    return { project: null, isDemo: false };
  }
}

export interface SeoAuditSummaryResult {
  summary: SeoAuditSummary | null;
  isDemo: boolean;
}

export async function getLatestSeoAudit(businessId: string): Promise<SeoAuditSummaryResult> {
  if (businessId === demoWebsiteProject.business_id || !(await hasRealSession())) {
    return { summary: demoSeoAuditSummary, isDemo: true };
  }

  try {
    const supabase = await createClient();

    const { data: project } = await supabase
      .from("website_projects")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();

    if (!project) return { summary: null, isDemo: false };

    const { data: audit } = await supabase
      .from("seo_audits")
      .select("*")
      .eq("website_project_id", project.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!audit) return { summary: null, isDemo: false };

    const { data: issues } = await supabase
      .from("seo_issues")
      .select("id, audit_id, page_url, issue_type, severity, message")
      .eq("audit_id", audit.id);

    // A ordenação por severidade real (critical > warning > info) não dá
    // para expressar num .order() simples do supabase-js (ele só ordena
    // alfabeticamente, o que colocaria "info" antes de "warning") — então
    // ordenamos aqui, em memória, pelo rank real.
    const severityRank: Record<SeoIssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const sortedIssues = [...(issues ?? [])].sort(
      (a, b) => severityRank[a.severity as SeoIssueSeverity] - severityRank[b.severity as SeoIssueSeverity]
    );

    const issueCountsBySeverity: Record<SeoIssueSeverity, number> = { critical: 0, warning: 0, info: 0 };
    for (const issue of sortedIssues) {
      issueCountsBySeverity[issue.severity as SeoIssueSeverity]++;
    }

    return {
      isDemo: false,
      summary: {
        project: project as WebsiteProject,
        audit,
        issues: sortedIssues,
        issueCountsBySeverity,
      },
    };
  } catch {
    return { summary: null, isDemo: false };
  }
}
