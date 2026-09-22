import "server-only";
import { fetchWithRetry } from "./http";
import { checkRateLimit } from "./rate-limiter";
import { createScopedLogger } from "./logger";
import { isGoogleBusinessProfileConfigured } from "./config";
import { GoogleBusinessProfileError } from "./business-profile-errors";
import { PlacesServiceError } from "./errors";
import type {
  GoogleBusinessAccount,
  GoogleBusinessLocation,
  GoogleBusinessTokens,
} from "@/types/google-business-profile";

/**
 * GoogleBusinessProfileService - integracao oficial com as Business
 * Profile APIs da Google.
 *
 * Documentacao confirmada (verificada em set/2026, antes da implementacao):
 * - OAuth 2.0 (fluxo padrao de servidor web, Google Identity Platform):
 *   autorizacao em https://accounts.google.com/o/oauth2/v2/auth, troca e
 *   renovacao de token em https://oauth2.googleapis.com/token.
 *   https://developers.google.com/my-business/content/implement-oauth
 * - Escopo necessario: https://www.googleapis.com/auth/business.manage
 *   (o escopo "plus.business.manage" esta descontinuado).
 * - Contas: GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
 * - Locais: GET https://mybusinessbusinessinformation.googleapis.com/v1/{parent=accounts/*}/locations
 *   (readMask obrigatorio)
 *   https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list
 *
 * RESTRICAO IMPORTANTE (verificada, nao e suposicao): as Business Profile
 * APIs nao sao abertas por padrao - e preciso passar por uma aprovacao
 * manual da Google ("Basic API Access"; formulario vinculado na propria
 * documentacao de "Basic setup"). Ate essa aprovacao, a cota do projeto e
 * 0 requisicoes/minuto e toda chamada falha com erro de permissao. Nao
 * existe ambiente sandbox. Por isso este servico nunca assume sucesso: o
 * erro real da Google e sempre propagado e exibido, nunca mascarado com
 * dado simulado.
 *
 * Regras obrigatorias (mesmas do modulo Places, ver services/google/places.ts):
 * - Nunca inventar dados: campo ausente na resposta vira `null`.
 * - client_secret e tokens somente no servidor (`server-only`), nunca no
 *   frontend nem em NEXT_PUBLIC_*.
 * - Rate limiting interno e logging seguro (sem secrets) em toda chamada.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNT_MANAGEMENT_BASE_URL = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFORMATION_BASE_URL = "https://mybusinessbusinessinformation.googleapis.com/v1";

const OAUTH_SCOPE = "https://www.googleapis.com/auth/business.manage";

const LOCATION_READ_MASK = [
  "name",
  "languageCode",
  "storeCode",
  "title",
  "phoneNumbers",
  "categories",
  "storefrontAddress",
  "websiteUri",
  "regularHours",
  "profile",
  "metadata",
  "serviceItems",
].join(",");

const gbpLogger = createScopedLogger("google.business_profile");

interface GoogleAccountRaw {
  name?: string;
  accountName?: string;
  type?: string;
}

interface GoogleCategoryRaw {
  displayName?: string;
}

interface GoogleLocationRaw {
  name?: string;
  storeCode?: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  categories?: { primaryCategory?: GoogleCategoryRaw; additionalCategories?: GoogleCategoryRaw[] };
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  websiteUri?: string;
  regularHours?: {
    periods?: { openDay?: string; openTime?: { hours?: number; minutes?: number }; closeDay?: string; closeTime?: { hours?: number; minutes?: number } }[];
  };
  profile?: { description?: string };
  serviceItems?: { structuredServiceItem?: { serviceTypeId?: string } }[];
  metadata?: { mapsUri?: string; newReviewUri?: string; placeId?: string };
}

function normalizeAccount(raw: GoogleAccountRaw): GoogleBusinessAccount {
  return {
    resourceName: raw.name ?? "",
    accountName: raw.accountName ?? null,
    type: raw.type ?? null,
  };
}

function formatTime(t?: { hours?: number; minutes?: number }): string {
  if (!t) return "";
  const hh = String(t.hours ?? 0).padStart(2, "0");
  const mm = String(t.minutes ?? 0).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeLocation(raw: GoogleLocationRaw): GoogleBusinessLocation {
  return {
    resourceName: raw.name ?? "",
    title: raw.title ?? null,
    storeCode: raw.storeCode ?? null,
    primaryCategory: raw.categories?.primaryCategory?.displayName ?? null,
    additionalCategories: (raw.categories?.additionalCategories ?? [])
      .map((c) => c.displayName)
      .filter((c): c is string => Boolean(c)),
    phoneNumbers: [
      ...(raw.phoneNumbers?.primaryPhone ? [raw.phoneNumbers.primaryPhone] : []),
      ...(raw.phoneNumbers?.additionalPhones ?? []),
    ],
    websiteUri: raw.websiteUri ?? null,
    address: raw.storefrontAddress
      ? {
          addressLines: raw.storefrontAddress.addressLines ?? [],
          locality: raw.storefrontAddress.locality ?? null,
          administrativeArea: raw.storefrontAddress.administrativeArea ?? null,
          postalCode: raw.storefrontAddress.postalCode ?? null,
          regionCode: raw.storefrontAddress.regionCode ?? null,
        }
      : null,
    regularHours: (raw.regularHours?.periods ?? []).map((p) => ({
      openDay: p.openDay ?? "",
      openTime: formatTime(p.openTime),
      closeDay: p.closeDay ?? "",
      closeTime: formatTime(p.closeTime),
    })),
    description: raw.profile?.description ?? null,
    serviceItems: (raw.serviceItems ?? [])
      .map((s) => s.structuredServiceItem?.serviceTypeId)
      .filter((s): s is string => Boolean(s)),
    mapsUri: raw.metadata?.mapsUri ?? null,
    newReviewUri: raw.metadata?.newReviewUri ?? null,
    placeId: raw.metadata?.placeId ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export class GoogleBusinessProfileService {
  isConfigured(): boolean {
    return isGoogleBusinessProfileConfigured();
  }

  private getOAuthConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new GoogleBusinessProfileError(
        "MISSING_OAUTH_CONFIG",
        "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_OAUTH_REDIRECT_URI precisam estar configurados."
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  /** Monta a URL de autorizacao do Google para iniciar o fluxo OAuth. */
  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = this.getOAuthConfig();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAUTH_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Troca o codigo de autorizacao por tokens de acesso/refresh. */
  async exchangeCodeForTokens(code: string): Promise<GoogleBusinessTokens> {
    const { clientId, clientSecret, redirectUri } = this.getOAuthConfig();
    await this.checkLimit("gbp_oauth");

    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!response.ok) {
      gbpLogger.error("token exchange failed", { status: response.status });
      throw new GoogleBusinessProfileError(
        "TOKEN_EXCHANGE_FAILED",
        "Nao foi possivel concluir a autorizacao com o Google. Tente conectar novamente."
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    gbpLogger.info("token exchange succeeded", { hasRefreshToken: Boolean(data.refresh_token) });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      scope: data.scope,
    };
  }

  /** Renova o access token a partir do refresh token salvo. */
  async refreshAccessToken(refreshToken: string): Promise<GoogleBusinessTokens> {
    const { clientId, clientSecret } = this.getOAuthConfig();
    await this.checkLimit("gbp_oauth");

    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (response.status === 400 || response.status === 401) {
      gbpLogger.warn("refresh token rejected - provavelmente revogado", { status: response.status });
      throw new GoogleBusinessProfileError(
        "TOKEN_REVOKED",
        "A autorizacao foi revogada no Google. E necessario reconectar."
      );
    }
    if (!response.ok) {
      throw new GoogleBusinessProfileError("UPSTREAM_ERROR", `Falha ao renovar o token (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number; scope: string };

    gbpLogger.info("token refreshed");

    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      scope: data.scope,
    };
  }

  /** Lista as contas do Google Business Profile acessiveis ao usuario autenticado. */
  async listAccounts(accessToken: string): Promise<GoogleBusinessAccount[]> {
    await this.checkLimit("gbp_accounts");

    const response = await this.authorizedRequest(`${ACCOUNT_MANAGEMENT_BASE_URL}/accounts`, accessToken);
    const data = (await response.json()) as { accounts?: GoogleAccountRaw[] };
    return (data.accounts ?? []).map(normalizeAccount);
  }

  /** Lista os locais (perfis) de uma conta GBP. */
  async listLocations(accessToken: string, accountResourceName: string): Promise<GoogleBusinessLocation[]> {
    await this.checkLimit("gbp_locations");

    const url = `${BUSINESS_INFORMATION_BASE_URL}/${accountResourceName}/locations?readMask=${encodeURIComponent(LOCATION_READ_MASK)}&pageSize=100`;
    const response = await this.authorizedRequest(url, accessToken);
    const data = (await response.json()) as { locations?: GoogleLocationRaw[] };
    return (data.locations ?? []).map(normalizeLocation);
  }

  /** Busca (via listagem) os dados atuais de um unico local ja selecionado, para sincronizar. */
  async getLocation(accessToken: string, accountResourceName: string, locationResourceName: string): Promise<GoogleBusinessLocation> {
    const locations = await this.listLocations(accessToken, accountResourceName);
    const match = locations.find((l) => l.resourceName === locationResourceName);
    if (!match) {
      throw new GoogleBusinessProfileError(
        "INVALID_REQUEST",
        "O local selecionado nao foi encontrado nesta conta Google (pode ter sido removido ou o acesso revogado)."
      );
    }
    return match;
  }

  private async checkLimit(operation: "gbp_oauth" | "gbp_accounts" | "gbp_locations") {
    try {
      await checkRateLimit(operation);
    } catch (error) {
      if (error instanceof PlacesServiceError) {
        throw new GoogleBusinessProfileError("INTERNAL_RATE_LIMITED", error.message);
      }
      throw error;
    }
  }

  private async authorizedRequest(url: string, accessToken: string): Promise<Response> {
    const response = await this.request(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      throw new GoogleBusinessProfileError("TOKEN_EXPIRED", "O token de acesso expirou. E necessario renovar.");
    }
    if (response.status === 403) {
      gbpLogger.error("permission denied", { status: 403, url: url.split("?")[0] });
      throw new GoogleBusinessProfileError(
        "PERMISSION_DENIED",
        "A Google negou acesso a Business Profile API. O motivo mais comum e o projeto ainda nao ter a aprovacao de 'Basic API Access' da Google para estas APIs - ver docs/google-business-profile.md."
      );
    }
    if (response.status === 429) {
      throw new GoogleBusinessProfileError("RATE_LIMITED", "Limite de requisicoes a Google excedido. Tente novamente em instantes.");
    }
    if (!response.ok) {
      throw new GoogleBusinessProfileError("UPSTREAM_ERROR", `A Business Profile API retornou um erro (HTTP ${response.status}).`);
    }

    return response;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchWithRetry(url, { ...init, timeoutMs: 10000, retries: 2 });
    } catch (error) {
      gbpLogger.error("request failed", { errorName: error instanceof Error ? error.name : "unknown" });
      throw new GoogleBusinessProfileError(
        "UPSTREAM_ERROR",
        error instanceof Error ? error.message : "Falha ao chamar a Google."
      );
    }
  }
}

export const googleBusinessProfileService = new GoogleBusinessProfileService();
export { GoogleBusinessProfileError } from "./business-profile-errors";
