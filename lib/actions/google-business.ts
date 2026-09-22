"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/business-access";
import { googleBusinessProfileService } from "@/services/google/business-profile";
import { GoogleBusinessProfileError } from "@/services/google/business-profile-errors";
import { isGoogleBusinessProfileConfigured } from "@/services/google/config";
import { createOAuthState } from "@/lib/integrations/google-business/state";
import {
  getConnectionSummary,
  getValidAccessToken,
  saveAccountSelection,
  saveLocationSelection,
  markSynced,
  disconnect as disconnectConnection,
} from "@/lib/integrations/google-business/tokens";
import type { GoogleBusinessAccount, GoogleBusinessLocation } from "@/types/google-business-profile";

function describeError(error: unknown): string {
  if (error instanceof GoogleBusinessProfileError) {
    switch (error.code) {
      case "MISSING_OAUTH_CONFIG":
        return "A integração com o Google Business Profile ainda não foi configurada neste ambiente.";
      case "NOT_CONNECTED":
        return "Esta empresa ainda não está conectada ao Google Business Profile.";
      case "TOKEN_EXPIRED":
        return "O token de acesso expirou. Tente sincronizar novamente ou reconecte.";
      case "TOKEN_REVOKED":
        return "A autorização foi revogada no Google. Reconecte para continuar.";
      case "PERMISSION_DENIED":
        return error.message;
      case "RATE_LIMITED":
      case "INTERNAL_RATE_LIMITED":
        return "Limite de requisições excedido. Tente novamente em instantes.";
      case "INVALID_REQUEST":
        return error.message;
      default:
        return "Não foi possível concluir a operação com o Google Business Profile.";
    }
  }
  return "Ocorreu um erro inesperado.";
}

// ---------------------------------------------------------------------
// Status (para a UI decidir o que renderizar)
// ---------------------------------------------------------------------

export async function checkGoogleBusinessProfileConfigured(): Promise<boolean> {
  return isGoogleBusinessProfileConfigured();
}

export async function getGoogleBusinessConnectionAction(businessId: string) {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return null;
  return getConnectionSummary(businessId);
}

// ---------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------

export type AuthUrlResult = { ok: true; url: string } | { ok: false; error: string };

/** Gera a URL de autorização do Google — usada como href de um link simples. */
export async function getGoogleBusinessAuthUrlAction(businessId: string): Promise<AuthUrlResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Você precisa estar logado." };

  try {
    const state = createOAuthState(businessId, user.id);
    const url = googleBusinessProfileService.buildAuthUrl(state);
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// ---------------------------------------------------------------------
// Contas e locais
// ---------------------------------------------------------------------

export type AccountsResult = { ok: true; accounts: GoogleBusinessAccount[] } | { ok: false; error: string };

export async function listGoogleAccountsAction(businessId: string): Promise<AccountsResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const accessToken = await getValidAccessToken(businessId);
    const accounts = await googleBusinessProfileService.listAccounts(accessToken);
    return { ok: true, accounts };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export type LocationsResult = { ok: true; locations: GoogleBusinessLocation[] } | { ok: false; error: string };

export async function listGoogleLocationsAction(
  businessId: string,
  accountResourceName: string,
  accountName: string | null
): Promise<LocationsResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const accessToken = await getValidAccessToken(businessId);
    await saveAccountSelection(businessId, accountResourceName, accountName);
    const locations = await googleBusinessProfileService.listLocations(accessToken, accountResourceName);
    return { ok: true, locations };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export type SelectLocationResult = { ok: true } | { ok: false; error: string };

/** Associa o local escolhido à empresa do RankLocal e já dispara a primeira sincronização. */
export async function selectGoogleLocationAction(
  businessId: string,
  locationResourceName: string
): Promise<SelectLocationResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    await saveLocationSelection(businessId, locationResourceName);
    const result = await syncGoogleBusinessProfileAction(businessId);
    if (!result.ok) return result;
    revalidatePath("/empresas/[id]", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// ---------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------

export type SyncResult = { ok: true } | { ok: false; error: string };

export async function syncGoogleBusinessProfileAction(businessId: string): Promise<SyncResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  const summary = await getConnectionSummary(businessId);
  if (summary.status === "not_connected") {
    return { ok: false, error: "Esta empresa ainda não está conectada ao Google Business Profile." };
  }
  if (!summary.googleAccountResourceName || !summary.selectedLocationResourceName) {
    return { ok: false, error: "Selecione a conta e o perfil do Google antes de sincronizar." };
  }

  try {
    const accessToken = await getValidAccessToken(businessId);
    const location = await googleBusinessProfileService.getLocation(
      accessToken,
      summary.googleAccountResourceName,
      summary.selectedLocationResourceName
    );

    const supabase = await createClient();
    const { error } = await supabase.from("google_business_profile_data").upsert(
      {
        business_id: businessId,
        location_resource_name: location.resourceName,
        title: location.title,
        store_code: location.storeCode,
        primary_category: location.primaryCategory,
        additional_categories: location.additionalCategories,
        phone_numbers: location.phoneNumbers,
        website_uri: location.websiteUri,
        address_lines: location.address?.addressLines ?? [],
        locality: location.address?.locality ?? null,
        administrative_area: location.address?.administrativeArea ?? null,
        postal_code: location.address?.postalCode ?? null,
        region_code: location.address?.regionCode ?? null,
        regular_hours: location.regularHours,
        description: location.description,
        service_items: location.serviceItems,
        maps_uri: location.mapsUri,
        new_review_uri: location.newReviewUri,
        place_id: location.placeId,
        synced_at: location.fetchedAt,
      },
      { onConflict: "business_id" }
    );

    if (error) {
      return { ok: false, error: "Dados obtidos do Google, mas não foi possível salvá-los. Tente novamente." };
    }

    await markSynced(businessId);
    revalidatePath("/empresas/[id]", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// ---------------------------------------------------------------------
// Desconectar
// ---------------------------------------------------------------------

export async function disconnectGoogleBusinessProfileAction(businessId: string): Promise<SyncResult> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return { ok: false, error: access.error };

  await disconnectConnection(businessId);
  revalidatePath("/empresas/[id]", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Leitura dos dados sincronizados (para a página de detalhe)
// ---------------------------------------------------------------------

export interface SyncedProfileData {
  title: string | null;
  storeCode: string | null;
  primaryCategory: string | null;
  additionalCategories: string[];
  phoneNumbers: string[];
  websiteUri: string | null;
  addressLines: string[];
  locality: string | null;
  administrativeArea: string | null;
  postalCode: string | null;
  regionCode: string | null;
  regularHours: { openDay: string; openTime: string; closeDay: string; closeTime: string }[];
  description: string | null;
  serviceItems: string[];
  mapsUri: string | null;
  newReviewUri: string | null;
  placeId: string | null;
  syncedAt: string;
}

export async function getSyncedProfileDataAction(businessId: string): Promise<SyncedProfileData | null> {
  const access = await assertBusinessAccess(businessId);
  if (!access.ok) return null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("google_business_profile_data")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();

    if (!data) return null;

    return {
      title: data.title,
      storeCode: data.store_code,
      primaryCategory: data.primary_category,
      additionalCategories: data.additional_categories ?? [],
      phoneNumbers: data.phone_numbers ?? [],
      websiteUri: data.website_uri,
      addressLines: data.address_lines ?? [],
      locality: data.locality,
      administrativeArea: data.administrative_area,
      postalCode: data.postal_code,
      regionCode: data.region_code,
      regularHours: data.regular_hours ?? [],
      description: data.description,
      serviceItems: data.service_items ?? [],
      mapsUri: data.maps_uri,
      newReviewUri: data.new_review_uri,
      placeId: data.place_id,
      syncedAt: data.synced_at,
    };
  } catch {
    return null;
  }
}
