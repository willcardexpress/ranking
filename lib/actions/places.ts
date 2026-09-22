"use server";

import { googlePlacesService } from "@/services/google/places";
import { PlacesServiceError } from "@/services/google/errors";
import { isGooglePlacesConfigured } from "@/services/google/config";
import { requireAuthenticatedUser } from "@/lib/business-access";
import type { NormalizedPlace } from "@/types/places";

export type PlacesSearchState = {
  results?: NormalizedPlace[];
  query?: string;
  error?: string;
} | null;

/** Exposto para Server Components decidirem o que mostrar na UI. */
export async function checkGooglePlacesConfigured(): Promise<boolean> {
  return isGooglePlacesConfigured();
}

/**
 * Busca estabelecimentos no Google a partir de um texto livre.
 * Retorna a lista completa — a seleção final é sempre feita pelo usuário
 * na interface (components/empresas/new-business-form.tsx).
 */
export async function searchPlacesAction(
  _prevState: PlacesSearchState,
  formData: FormData
): Promise<PlacesSearchState> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { error: auth.error };

  const query = String(formData.get("query") ?? "").trim();

  if (!isGooglePlacesConfigured()) {
    return { error: "Google Places não conectado. Configure GOOGLE_PLACES_API_KEY para habilitar a busca.", query };
  }

  if (query.length < 3) {
    return { error: "Digite ao menos 3 caracteres para buscar.", query };
  }

  try {
    const { places } = await googlePlacesService.searchText(query);
    if (places.length === 0) {
      return { results: [], query, error: "Nenhum estabelecimento encontrado para esta busca." };
    }
    return { results: places, query };
  } catch (error) {
    return { error: describePlacesError(error), query };
  }
}

export type PlaceDetailsResult =
  | { ok: true; place: NormalizedPlace }
  | { ok: false; error: string };

/**
 * Busca os detalhes completos de um estabelecimento já confirmado pelo
 * usuário (a partir do placeId escolhido na lista de resultados).
 */
export async function confirmPlaceAction(placeId: string): Promise<PlaceDetailsResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isGooglePlacesConfigured()) {
    return { ok: false, error: "Google Places não conectado." };
  }

  try {
    const place = await googlePlacesService.getDetails(placeId);
    return { ok: true, place };
  } catch (error) {
    return { ok: false, error: describePlacesError(error) };
  }
}

export type CompetitorsResult =
  | { ok: true; competitors: NormalizedPlace[] }
  | { ok: false; error: string };

/**
 * Sugestão inicial de concorrentes prováveis (mesma categoria/área).
 * Curadoria completa (marcar/ignorar/principal, histórico) fica para o
 * módulo de Concorrentes.
 */
export async function searchCompetitorsAction(
  category: string,
  serviceArea: string,
  excludePlaceId?: string
): Promise<CompetitorsResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isGooglePlacesConfigured()) {
    return { ok: false, error: "Google Places não conectado." };
  }

  if (!category || !serviceArea) {
    return { ok: false, error: "Categoria e área de atuação são necessárias para buscar concorrentes." };
  }

  try {
    const { places } = await googlePlacesService.searchNearbyCompetitors(category, serviceArea, excludePlaceId);
    return { ok: true, competitors: places };
  } catch (error) {
    return { ok: false, error: describePlacesError(error) };
  }
}

function describePlacesError(error: unknown): string {
  if (error instanceof PlacesServiceError) {
    switch (error.code) {
      case "MISSING_API_KEY":
        return "A integração com o Google Places ainda não foi configurada neste ambiente.";
      case "RATE_LIMITED":
        return "Limite de requisições à Google excedido. Tente novamente em instantes.";
      case "INTERNAL_RATE_LIMITED":
        return error.message;
      case "TIMEOUT":
        return "A busca demorou demais para responder. Tente novamente.";
      case "INVALID_REQUEST":
        return error.message;
      case "UPSTREAM_ERROR":
      default:
        return "Não foi possível consultar o Google agora. Tente novamente em instantes.";
    }
  }
  return "Ocorreu um erro inesperado ao consultar o Google.";
}
