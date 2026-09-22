import "server-only";
import { fetchWithRetry } from "./http";
import { getCached, setCached } from "./cache";
import { checkRateLimit } from "./rate-limiter";
import { googlePlacesLogger } from "./logger";
import { isGooglePlacesConfigured } from "./config";
import { PlacesServiceError } from "./errors";
import type { NormalizedPlace, PlacesSearchResult } from "@/types/places";

/**
 * GooglePlacesService — integração oficial com a Places API (New).
 *
 * Documentação confirmada (verificada em set/2026, antes da implementação):
 * - Text Search (New): POST https://places.googleapis.com/v1/places:searchText
 *   https://developers.google.com/maps/documentation/places/web-service/text-search
 * - Place Details (New): GET https://places.googleapis.com/v1/places/{PLACE_ID}
 *   https://developers.google.com/maps/documentation/places/web-service/place-details
 * - Autenticação: header X-Goog-Api-Key (chave de API server-side).
 * - Campos: obrigatório enviar X-Goog-FieldMask (a API rejeita a
 *   requisição sem ele); não há lista padrão de campos retornados.
 *
 * Regras obrigatórias:
 * - FieldMask sempre explícito, restrito aos campos realmente usados.
 * - Nunca inventar dados: campo ausente na resposta vira `null` no tipo
 *   normalizado, nunca um valor inventado.
 * - Nunca selecionar automaticamente um estabelecimento — a confirmação é
 *   sempre do usuário (ver lib/actions/places.ts e o formulário de
 *   cadastro de empresa).
 * - Chave de API somente no servidor (`server-only`), nunca em NEXT_PUBLIC_*.
 * - Cache, retry, timeout, rate limiting interno e logging seguro (sem
 *   secrets) em toda chamada.
 */

const PLACES_BASE_URL = "https://places.googleapis.com/v1/places";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.name",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.primaryType",
  "places.types",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "name",
  "displayName",
  "formattedAddress",
  "internationalPhoneNumber",
  "websiteUri",
  "primaryType",
  "types",
  "location",
  "rating",
  "userRatingCount",
  "businessStatus",
].join(",");

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const DETAILS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

interface GooglePlaceRaw {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

function normalizePlace(raw: GooglePlaceRaw): NormalizedPlace {
  return {
    placeId: raw.id ?? "",
    resourceName: raw.name ?? "",
    displayName: raw.displayName?.text ?? "",
    formattedAddress: raw.formattedAddress ?? null,
    phoneNumber: raw.internationalPhoneNumber ?? null,
    website: raw.websiteUri ?? null,
    primaryType: raw.primaryType ?? null,
    types: raw.types ?? [],
    latitude: raw.location?.latitude ?? null,
    longitude: raw.location?.longitude ?? null,
    rating: raw.rating ?? null,
    userRatingCount: raw.userRatingCount ?? null,
    businessStatus: raw.businessStatus ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export class GooglePlacesService {
  /** Indica se a integração está configurada (chave de API presente). */
  isConfigured(): boolean {
    return isGooglePlacesConfigured();
  }

  private getApiKey(): string {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new PlacesServiceError(
        "MISSING_API_KEY",
        "GOOGLE_PLACES_API_KEY não está configurada. Adicione a variável no .env.local."
      );
    }
    return apiKey;
  }

  private async callApi(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchWithRetry(url, { ...init, timeoutMs: 8000, retries: 2 });
    } catch (error) {
      googlePlacesLogger.error("upstream request failed", {
        url,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      throw new PlacesServiceError(
        "TIMEOUT",
        error instanceof Error ? error.message : "Falha ao chamar a Places API."
      );
    }
  }

  /**
   * Busca estabelecimentos por texto livre (ex: "clínica odontológica em
   * Brasília"). Retorna a lista completa — a seleção final é sempre do
   * usuário, nunca automática.
   */
  async searchText(query: string): Promise<PlacesSearchResult> {
    const trimmed = query?.trim() ?? "";
    if (trimmed.length < 3) {
      throw new PlacesServiceError("INVALID_REQUEST", "Informe ao menos 3 caracteres para buscar.");
    }

    await checkRateLimit("search");

    const cacheKey = `search:${trimmed.toLowerCase()}`;
    const cached = getCached<NormalizedPlace[]>(cacheKey);
    if (cached) {
      googlePlacesLogger.info("search cache hit", { queryLength: trimmed.length });
      return { places: cached, fromCache: true };
    }

    const apiKey = this.getApiKey();
    googlePlacesLogger.info("search request", { queryLength: trimmed.length });

    const response = await this.callApi(`${PLACES_BASE_URL}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: trimmed, languageCode: "pt-BR" }),
    });

    if (response.status === 429) {
      googlePlacesLogger.warn("upstream rate limited", { status: 429 });
      throw new PlacesServiceError("RATE_LIMITED", "Limite de requisições à Google excedido. Tente novamente em instantes.");
    }
    if (!response.ok) {
      googlePlacesLogger.error("search returned non-ok status", { status: response.status });
      throw new PlacesServiceError("UPSTREAM_ERROR", `A Places API retornou um erro (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as { places?: GooglePlaceRaw[] };
    const places = (data.places ?? []).map(normalizePlace);

    googlePlacesLogger.info("search completed", { queryLength: trimmed.length, resultCount: places.length });
    setCached(cacheKey, places, SEARCH_CACHE_TTL_MS);
    return { places, fromCache: false };
  }

  /**
   * Obtém detalhes completos de um estabelecimento já confirmado pelo
   * usuário, a partir do Place ID.
   */
  async getDetails(placeId: string): Promise<NormalizedPlace> {
    if (!placeId) {
      throw new PlacesServiceError("INVALID_REQUEST", "Place ID não informado.");
    }

    await checkRateLimit("details");

    const cacheKey = `details:${placeId}`;
    const cached = getCached<NormalizedPlace>(cacheKey);
    if (cached) {
      googlePlacesLogger.info("details cache hit", { placeId });
      return cached;
    }

    const apiKey = this.getApiKey();
    googlePlacesLogger.info("details request", { placeId });

    const response = await this.callApi(`${PLACES_BASE_URL}/${encodeURIComponent(placeId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });

    if (response.status === 404) {
      throw new PlacesServiceError("INVALID_REQUEST", "Estabelecimento não encontrado para este Place ID.");
    }
    if (response.status === 429) {
      googlePlacesLogger.warn("upstream rate limited", { status: 429 });
      throw new PlacesServiceError("RATE_LIMITED", "Limite de requisições à Google excedido. Tente novamente em instantes.");
    }
    if (!response.ok) {
      googlePlacesLogger.error("details returned non-ok status", { status: response.status, placeId });
      throw new PlacesServiceError("UPSTREAM_ERROR", `A Places API retornou um erro (HTTP ${response.status}).`);
    }

    const raw = (await response.json()) as GooglePlaceRaw;
    const place = normalizePlace(raw);

    googlePlacesLogger.info("details completed", { placeId });
    setCached(cacheKey, place, DETAILS_CACHE_TTL_MS);
    return place;
  }

  /**
   * Busca por texto com viés de localização (círculo centro+raio) — usado
   * pelo scan de grid do módulo de Ranking Local, um ponto por vez. Usa
   * rankPreference "RELEVANCE" (recomendado pela Google para queries
   * categóricas como "dentista em Brasília"), que é o mais próximo do
   * comportamento de busca local real que a API permite hoje — mesmo
   * assim, isso é uma observação via API, nunca uma reprodução do local
   * pack renderizado na página de busca/mapas. Ver
   * docs/ranking-methodology.md.
   */
  async searchTextAtLocation(
    query: string,
    location: { latitude: number; longitude: number; radiusMeters: number },
    maxResultCount: number
  ): Promise<PlacesSearchResult> {
    const trimmed = query?.trim() ?? "";
    if (trimmed.length < 3) {
      throw new PlacesServiceError("INVALID_REQUEST", "Informe ao menos 3 caracteres para buscar.");
    }

    await checkRateLimit("grid");

    const cacheKey = `grid:${trimmed.toLowerCase()}:${location.latitude.toFixed(5)}:${location.longitude.toFixed(5)}:${location.radiusMeters}:${maxResultCount}`;
    const cached = getCached<NormalizedPlace[]>(cacheKey);
    if (cached) {
      return { places: cached, fromCache: true };
    }

    const apiKey = this.getApiKey();

    const response = await this.callApi(`${PLACES_BASE_URL}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: trimmed,
        languageCode: "pt-BR",
        rankPreference: "RELEVANCE",
        maxResultCount: Math.min(Math.max(maxResultCount, 1), 20),
        locationBias: {
          circle: {
            center: { latitude: location.latitude, longitude: location.longitude },
            radius: location.radiusMeters,
          },
        },
      }),
    });

    if (response.status === 429) {
      googlePlacesLogger.warn("upstream rate limited", { status: 429 });
      throw new PlacesServiceError("RATE_LIMITED", "Limite de requisições à Google excedido. Tente novamente em instantes.");
    }
    if (!response.ok) {
      googlePlacesLogger.error("grid search returned non-ok status", { status: response.status });
      throw new PlacesServiceError("UPSTREAM_ERROR", `A Places API retornou um erro (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as { places?: GooglePlaceRaw[] };
    const places = (data.places ?? []).map(normalizePlace);

    setCached(cacheKey, places, SEARCH_CACHE_TTL_MS);
    return { places, fromCache: false };
  }

  /**
   * Busca estabelecimentos prováveis de serem concorrentes: mesma
   * categoria, na mesma área de atuação. É uma sugestão inicial e
   * observável — a curadoria completa (marcar/ignorar/concorrente
   * principal, snapshots históricos) é o módulo de Concorrentes
   * (Fase 3/16).
   */
  async searchNearbyCompetitors(
    category: string,
    serviceArea: string,
    excludePlaceId?: string
  ): Promise<PlacesSearchResult> {
    const result = await this.searchText(`${category} em ${serviceArea}`);
    return {
      ...result,
      places: excludePlaceId ? result.places.filter((p) => p.placeId !== excludePlaceId) : result.places,
    };
  }
}

/** Instância única do serviço, para uso em Server Actions e outros services. */
export const googlePlacesService = new GooglePlacesService();

// Reexportado para conveniência de quem já importava daqui.
export { PlacesServiceError } from "./errors";
