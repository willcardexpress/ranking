import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Confirma só que existe um usuário autenticado — para ações que não são
 * escopadas a uma empresa específica (ex.: busca genérica no Google
 * Places). Quando a ação envolve uma empresa, use `assertBusinessAccess`
 * abaixo em vez desta função.
 */
export async function requireAuthenticatedUser(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Você precisa estar logado." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Supabase não configurado neste ambiente." };
  }
}

/**
 * Confirma que o usuário autenticado atual pertence à organização dona de
 * `businessId`, usando o cliente Supabase normal (RLS aplica
 * is_org_member automaticamente na leitura de `businesses`).
 *
 * Usado antes de qualquer operação que toque `google_business_connections`
 * — a única tabela do projeto sem nenhuma policy de RLS (deny-by-default
 * para chaves de cliente). Como o backend usa a service role para operar
 * nela, essa checagem explícita é a única proteção real contra acesso
 * cross-tenant nesse caso específico.
 */
export async function assertBusinessAccess(businessId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!businessId) {
    return { ok: false, error: "Empresa não informada." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Você precisa estar logado." };
    }

    const { data, error } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();

    if (error || !data) {
      // RLS já garante que isto acontece tanto para "não existe" quanto
      // para "existe mas é de outra organização" — nunca vazamos a
      // diferença entre os dois casos.
      return { ok: false, error: "Empresa não encontrada ou sem permissão de acesso." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Supabase não configurado neste ambiente." };
  }
}
