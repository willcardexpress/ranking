import "server-only";
import { createClient } from "@/lib/supabase/server";
import { demoBusinesses } from "@/lib/demo-data";
import type { Business } from "@/types/database";

/**
 * Toda leitura aqui tenta dados reais primeiro (usuário autenticado +
 * Supabase configurado) e só cai para `lib/demo-data.ts` quando não há
 * sessão real ou o Supabase não está configurado neste ambiente — nunca
 * mistura os dois silenciosamente. `isDemo` no retorno é o que a UI usa
 * para decidir se mostra o selo/banner "DEMO".
 */

export interface BusinessesResult {
  businesses: Business[];
  isDemo: boolean;
}

export async function getBusinessesForCurrentUser(): Promise<BusinessesResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { businesses: demoBusinesses, isDemo: true };
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id) {
      // Usuário real, mas ainda sem organização/empresas — estado vazio
      // real, não modo demo.
      return { businesses: [], isDemo: false };
    }

    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return { businesses: [], isDemo: false };
    }

    return { businesses: data as Business[], isDemo: false };
  } catch {
    // Supabase não configurado neste ambiente (sem envs) — modo demo.
    return { businesses: demoBusinesses, isDemo: true };
  }
}

export interface BusinessResult {
  business: Business | null;
  isDemo: boolean;
}

export async function getBusinessById(id: string): Promise<BusinessResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
      if (!error && data) {
        return { business: data as Business, isDemo: false };
      }
    }
  } catch {
    // Supabase não configurado — cai para o lookup demo abaixo.
  }

  const demo = demoBusinesses.find((b) => b.id === id) ?? null;
  return { business: demo, isDemo: Boolean(demo) };
}
