import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { googleBusinessProfileService } from "@/services/google/business-profile";
import { GoogleBusinessProfileError } from "@/services/google/business-profile-errors";
import { createScopedLogger } from "@/services/google/logger";
import type {
  GoogleBusinessConnectionStatus,
  GoogleBusinessConnectionSummary,
  GoogleBusinessTokens,
} from "@/types/google-business-profile";

/**
 * Toda leitura/escrita de `google_business_connections` passa por aqui e
 * usa a service role — a tabela não tem nenhuma policy de RLS para
 * client keys (ver database/migrations/0004_google_business_profile.sql).
 * Cada função pública aqui recebe um `businessId` já validado por
 * `lib/business-access.ts` — nunca confie neste módulo sozinho para
 * isolamento multi-tenant.
 */

const logger = createScopedLogger("google.business_profile.tokens");

interface ConnectionRow {
  status: GoogleBusinessConnectionStatus;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
  scope: string;
  google_account_resource_name: string | null;
  google_account_name: string | null;
  selected_location_resource_name: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

export async function saveInitialTokens(
  businessId: string,
  userId: string,
  tokens: GoogleBusinessTokens
): Promise<void> {
  const admin = createServiceRoleClient();

  const { error } = await admin.from("google_business_connections").upsert(
    {
      business_id: businessId,
      status: "connected",
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.expiresAt,
      scope: tokens.scope,
      connected_by: userId,
      last_error: null,
    },
    { onConflict: "business_id" }
  );

  if (error) {
    logger.error("failed to save initial tokens", { businessId, dbError: error.message });
    throw new GoogleBusinessProfileError("UPSTREAM_ERROR", "Não foi possível salvar a conexão.");
  }

  logger.info("connection created", { businessId });
}

export async function saveAccountSelection(
  businessId: string,
  accountResourceName: string,
  accountName: string | null
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("google_business_connections")
    .update({ google_account_resource_name: accountResourceName, google_account_name: accountName })
    .eq("business_id", businessId);

  if (error) {
    throw new GoogleBusinessProfileError("UPSTREAM_ERROR", "Não foi possível salvar a conta selecionada.");
  }
}

export async function saveLocationSelection(businessId: string, locationResourceName: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("google_business_connections")
    .update({ selected_location_resource_name: locationResourceName })
    .eq("business_id", businessId);

  if (error) {
    throw new GoogleBusinessProfileError("UPSTREAM_ERROR", "Não foi possível salvar o perfil selecionado.");
  }
}

export async function markSynced(businessId: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from("google_business_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "connected", last_error: null })
    .eq("business_id", businessId);
}

export async function markConnectionError(businessId: string, status: GoogleBusinessConnectionStatus, message: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.from("google_business_connections").update({ status, last_error: message }).eq("business_id", businessId);
}

export async function disconnect(businessId: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.from("google_business_connections").delete().eq("business_id", businessId);
  await admin.from("google_business_profile_data").delete().eq("business_id", businessId);
  logger.info("connection removed", { businessId });
}

/** Resumo seguro (sem tokens) para exibir na UI. */
export async function getConnectionSummary(businessId: string): Promise<GoogleBusinessConnectionSummary> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("google_business_connections")
    .select(
      "status, google_account_resource_name, google_account_name, selected_location_resource_name, last_synced_at, last_error"
    )
    .eq("business_id", businessId)
    .maybeSingle();

  if (!data) {
    return {
      status: "not_connected",
      googleAccountName: null,
      googleAccountResourceName: null,
      selectedLocationResourceName: null,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  return {
    status: data.status,
    googleAccountName: data.google_account_name,
    googleAccountResourceName: data.google_account_resource_name,
    selectedLocationResourceName: data.selected_location_resource_name,
    lastSyncedAt: data.last_synced_at,
    lastError: data.last_error,
  };
}

/**
 * Retorna um access token válido para a empresa, renovando via
 * refresh_token automaticamente se estiver expirado. Nunca retorna o
 * token para fora de `lib/integrations/google-business/*` e
 * `lib/actions/google-business.ts` — nunca passe isto para um componente.
 */
export async function getValidAccessToken(businessId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("google_business_connections")
    .select("access_token, refresh_token, token_expires_at, status")
    .eq("business_id", businessId)
    .maybeSingle<ConnectionRow>();

  if (!data) {
    throw new GoogleBusinessProfileError("NOT_CONNECTED", "Nenhuma conexão com o Google Business Profile encontrada.");
  }

  if (data.status === "revoked") {
    throw new GoogleBusinessProfileError("TOKEN_REVOKED", "A conexão foi revogada. Reconecte para continuar.");
  }

  const expiresAt = new Date(data.token_expires_at).getTime();
  const isExpiringSoon = expiresAt - Date.now() < 60_000; // margem de 1 min

  if (!isExpiringSoon) {
    return data.access_token;
  }

  if (!data.refresh_token) {
    await markConnectionError(businessId, "expired", "Token expirado e sem refresh_token para renovar automaticamente.");
    throw new GoogleBusinessProfileError("TOKEN_EXPIRED", "O token expirou e não pode ser renovado automaticamente. Reconecte.");
  }

  try {
    const refreshed = await googleBusinessProfileService.refreshAccessToken(data.refresh_token);
    await admin
      .from("google_business_connections")
      .update({
        access_token: refreshed.accessToken,
        token_expires_at: refreshed.expiresAt,
        status: "connected",
        last_error: null,
      })
      .eq("business_id", businessId);
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof GoogleBusinessProfileError && error.code === "TOKEN_REVOKED") {
      await markConnectionError(businessId, "revoked", error.message);
    } else {
      await markConnectionError(businessId, "error", error instanceof Error ? error.message : "Falha ao renovar token.");
    }
    throw error;
  }
}
