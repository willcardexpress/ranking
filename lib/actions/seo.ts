"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/business-access";
import { seoCrawlerService } from "@/services/seo/crawler";
import { SeoServiceError } from "@/services/seo/errors";
import { assertHostnameIsPublic } from "@/services/seo/safe-fetch";
import { createScopedLogger } from "@/services/google/logger";
import { runWithTimeout, TimeoutError } from "@/lib/with-timeout";

const logger = createScopedLogger("seo.actions");

function describeError(error: unknown): string {
  if (error instanceof TimeoutError) {
    return "A auditoria demorou demais e foi interrompida. Tente novamente — sites menores costumam ser mais rápidos de auditar.";
  }
  if (error instanceof SeoServiceError) {
    switch (error.code) {
      case "INVALID_URL":
        return "A URL informada não é válida.";
      case "NO_PAGES_CRAWLED":
        return "Não foi possível carregar nenhuma página deste site. Verifique se a URL está correta e acessível.";
      case "RATE_LIMITED":
      case "INTERNAL_RATE_LIMITED":
        return "Limite de auditorias por minuto excedido. Tente novamente em instantes.";
      case "TIMEOUT":
        return "O site demorou demais para responder.";
      case "SSRF_BLOCKED":
        return "Esta URL aponta para um endereço interno/privado e não pode ser auditada por segurança.";
      case "TOO_MANY_REDIRECTS":
        return "O site tem redirecionamentos demais e não pôde ser auditado.";
      default:
        return "Não foi possível concluir a auditoria.";
    }
  }
  return "Ocorreu um erro inesperado ao auditar o site.";
}

// ---------------------------------------------------------------------
// Cadastro do site
// ---------------------------------------------------------------------

const websiteSchema = z.object({
  businessId: z.string().uuid(),
  rootUrl: z.string().trim().min(4, "Informe a URL do site."),
});

export type ActionState = { error?: string; success?: boolean } | null;

export async function saveWebsiteProjectAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = websiteSchema.safeParse({
    businessId: formData.get("businessId"),
    rootUrl: formData.get("rootUrl"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const access = await assertBusinessAccess(parsed.data.businessId);
  if (!access.ok) return { error: access.error };

  let normalizedUrl = parsed.data.rootUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return { error: "A URL informada não é válida." };
  }

  try {
    await assertHostnameIsPublic(parsedUrl.hostname);
  } catch (error) {
    return { error: describeError(error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("website_projects")
    .upsert(
      { business_id: parsed.data.businessId, root_url: normalizedUrl },
      { onConflict: "business_id" }
    );

  if (error) {
    return { error: "Não foi possível salvar o site." };
  }

  revalidatePath("/empresas/[id]", "page");
  return { success: true };
}

// ---------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------

export type RunAuditResult = { ok: true; auditId: string } | { ok: false; error: string };

/** Tempo máximo interno de uma auditoria antes de desistirmos e marcarmos como falha. */
const AUDIT_TIMEOUT_MS = 45_000;
/** Depois disso, uma auditoria "running" é considerada travada (função provavelmente foi encerrada à força). */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export async function runSeoAuditAction(businessId: string): Promise<RunAuditResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Você precisa estar logado." };

  const { data: project } = await supabase
    .from("website_projects")
    .select("id, root_url")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!project) {
    return { ok: false, error: "Cadastre a URL do site antes de rodar uma auditoria." };
  }

  // Auto-recuperação de auditorias travadas: se a última auditoria "running"
  // para este site já passou do tempo máximo plausível (provavelmente a
  // função foi encerrada à força pela plataforma antes de conseguir marcar
  // o próprio fim), marca como falha agora para liberar espaço para uma
  // nova tentativa. Sem isso, o índice único abaixo bloquearia novas
  // auditorias para sempre depois de uma execução interrompida.
  const { data: runningAudit } = await supabase
    .from("seo_audits")
    .select("id, started_at")
    .eq("website_project_id", project.id)
    .eq("status", "running")
    .maybeSingle();

  if (runningAudit) {
    const startedAt = runningAudit.started_at ? new Date(runningAudit.started_at).getTime() : 0;
    if (Date.now() - startedAt > STALE_THRESHOLD_MS) {
      await supabase
        .from("seo_audits")
        .update({ status: "failed", error_message: "Expirou: o processo foi interrompido antes de concluir.", completed_at: new Date().toISOString() })
        .eq("id", runningAudit.id);
    } else {
      return { ok: false, error: "Já existe uma auditoria em andamento para este site. Aguarde ela terminar." };
    }
  }

  const { data: audit, error: auditInsertError } = await supabase
    .from("seo_audits")
    .insert({ website_project_id: project.id, status: "running", requested_by: user.id, started_at: new Date().toISOString() })
    .select("id")
    .single();

  if (auditInsertError || !audit) {
    // 23505 = violação de unicidade — outra requisição venceu a corrida e
    // já está rodando uma auditoria para este mesmo site.
    if (auditInsertError && (auditInsertError as { code?: string }).code === "23505") {
      return { ok: false, error: "Já existe uma auditoria em andamento para este site. Aguarde ela terminar." };
    }
    return { ok: false, error: "Não foi possível iniciar a auditoria." };
  }

  try {
    const result = await runWithTimeout(
      seoCrawlerService.auditWebsite(project.root_url),
      AUDIT_TIMEOUT_MS,
      "A auditoria excedeu o tempo máximo interno."
    );

    await supabase
      .from("seo_audits")
      .update({
        status: "completed",
        pages_crawled: result.pages.length,
        seo_score: result.seoScore,
        has_robots_txt: result.hasRobotsTxt,
        has_sitemap: result.hasSitemap,
        completed_at: new Date().toISOString(),
      })
      .eq("id", audit.id);

    if (result.issues.length > 0) {
      // Precisamos mapear page_url -> website_page_id depois de garantir
      // que cada página crawleada tem uma linha em website_pages.
      const pageIdByUrl = new Map<string, string>();
      for (const page of result.pages) {
        const { data: pageRow } = await supabase
          .from("website_pages")
          .upsert(
            {
              website_project_id: project.id,
              url: page.url,
              last_status_code: page.statusCode,
              last_crawled_at: new Date().toISOString(),
            },
            { onConflict: "website_project_id,url" }
          )
          .select("id, url")
          .single();
        if (pageRow) pageIdByUrl.set(pageRow.url, pageRow.id);
      }

      await supabase.from("seo_issues").insert(
        result.issues.map((issue) => ({
          audit_id: audit.id,
          website_page_id: issue.pageUrl ? pageIdByUrl.get(issue.pageUrl) ?? null : null,
          page_url: issue.pageUrl,
          issue_type: issue.type,
          severity: issue.severity,
          message: issue.message,
        }))
      );
    }

    revalidatePath("/empresas/[id]", "page");
    return { ok: true, auditId: audit.id };
  } catch (error) {
    const message = describeError(error);
    logger.error("audit failed", { businessId, errorName: error instanceof Error ? error.name : "unknown" });
    await supabase
      .from("seo_audits")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", audit.id);
    return { ok: false, error: message };
  }
}
