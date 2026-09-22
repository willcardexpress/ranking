import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Garante que o usuário autenticado tenha uma organização e retorna seu id.
 *
 * Em produção, o ideal é um trigger no Postgres (on auth.users insert) que
 * cria a organização automaticamente no cadastro — deixado como nota em
 * docs/database.md. Enquanto esse trigger não existe, este helper faz o
 * mesmo trabalho de forma idempotente a partir do servidor, usando a
 * service role (organizations/organization_members não têm policy de
 * INSERT para o cliente — só o backend pode criar um tenant).
 */
export async function ensureOrganizationForUser(
  userClient: SupabaseClient,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<string | null> {
  // 1. Já existe uma organização? (leitura via RLS normal, com o cliente do usuário)
  const { data: membership } = await userClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.organization_id) {
    return membership.organization_id as string;
  }

  // 2. Não existe: cria com a service role (operação administrativa de bootstrap).
  const admin = createServiceRoleClient();

  const orgName =
    (user.user_metadata?.organization_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "Minha Organização";

  const slug = slugify(orgName) + "-" + user.id.slice(0, 8);

  const { data: organization, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName, slug })
    .select("id")
    .single();

  if (orgError || !organization) {
    return null;
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organization.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    return null;
  }

  return organization.id as string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
