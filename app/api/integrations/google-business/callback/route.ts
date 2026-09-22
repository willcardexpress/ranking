import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyOAuthState } from "@/lib/integrations/google-business/state";
import { googleBusinessProfileService } from "@/services/google/business-profile";
import { GoogleBusinessProfileError } from "@/services/google/business-profile-errors";
import { saveInitialTokens } from "@/lib/integrations/google-business/tokens";
import { createScopedLogger } from "@/services/google/logger";

const logger = createScopedLogger("google.business_profile.callback");

/**
 * Callback do fluxo OAuth (Fase 4). O Google redireciona o navegador do
 * usuário para cá via GET, com `code` (sucesso) ou `error` (usuário
 * negou/erro), mais o `state` assinado que enviamos ao iniciar o fluxo.
 *
 * Esta é a URL que deve ser cadastrada como "Authorized redirect URI" no
 * Google Cloud Console e usada como valor de GOOGLE_OAUTH_REDIRECT_URI.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const redirectBackTo = (businessId: string | null, status: "connected" | "error", message?: string) => {
    const target = new URL(businessId ? `/empresas/${businessId}` : "/empresas", request.url);
    target.searchParams.set("gbp", status);
    if (message) target.searchParams.set("gbp_message", message);
    return NextResponse.redirect(target);
  };

  if (error) {
    logger.warn("user denied or google returned error", { error });
    return redirectBackTo(null, "error", "Autorização cancelada ou negada.");
  }

  if (!code || !state) {
    return redirectBackTo(null, "error", "Resposta inválida do Google.");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return redirectBackTo(null, "error", "Supabase não configurado neste ambiente.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectBackTo(null, "error", "Sessão expirada. Faça login novamente e tente conectar de novo.");
  }

  const verified = verifyOAuthState(state, user.id);
  if (!verified) {
    logger.error("invalid or expired oauth state");
    return redirectBackTo(null, "error", "Falha de segurança na autorização (state inválido). Tente novamente.");
  }

  const { businessId } = verified;

  // Confirma explicitamente que o usuário ainda tem acesso a esta empresa
  // (organização pode ter mudado entre o início do fluxo e o callback).
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) {
    return redirectBackTo(null, "error", "Empresa não encontrada ou sem permissão de acesso.");
  }

  try {
    const tokens = await googleBusinessProfileService.exchangeCodeForTokens(code);
    await saveInitialTokens(businessId, user.id, tokens);
    return redirectBackTo(businessId, "connected");
  } catch (err) {
    const message =
      err instanceof GoogleBusinessProfileError ? err.message : "Não foi possível concluir a conexão com o Google.";
    logger.error("token exchange/save failed", {
      businessId,
      errorCode: err instanceof GoogleBusinessProfileError ? err.code : "unknown",
    });
    return redirectBackTo(businessId, "error", message);
  }
}
