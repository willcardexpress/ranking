import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { googlePlacesLogger } from "@/services/google/logger";
import type { NormalizedPlace } from "@/types/places";

/**
 * Grava (upsert) o snapshot mais recente de um Place ID confirmado na
 * tabela `places`, e registra um histórico em `place_snapshots`.
 *
 * Só o backend (service role) pode escrever nessas tabelas — ver RLS em
 * database/migrations/0002_google_places.sql. Se a service role key não
 * estiver configurada neste ambiente, a persistência é pulada (best
 * effort): o cadastro da empresa não deve falhar por causa de um cache
 * opcional, mas o Place ID também não é salvo em `businesses` nesse caso,
 * já que a coluna tem uma foreign key para `places.place_id`.
 */
export async function persistConfirmedPlace(place: NormalizedPlace): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    googlePlacesLogger.warn("place persistence skipped: missing service role key", {
      placeId: place.placeId,
    });
    return false;
  }

  try {
    const admin = createServiceRoleClient();

    const { error: upsertError } = await admin.from("places").upsert(
      {
        place_id: place.placeId,
        resource_name: place.resourceName,
        display_name: place.displayName,
        formatted_address: place.formattedAddress,
        phone_number: place.phoneNumber,
        website: place.website,
        primary_type: place.primaryType,
        types: place.types,
        latitude: place.latitude,
        longitude: place.longitude,
        rating: place.rating,
        user_rating_count: place.userRatingCount,
        business_status: place.businessStatus,
        fetched_at: place.fetchedAt,
      },
      { onConflict: "place_id" }
    );

    if (upsertError) {
      googlePlacesLogger.error("place upsert failed", { placeId: place.placeId, dbError: upsertError.message });
      return false;
    }

    await admin.from("place_snapshots").insert({
      place_id: place.placeId,
      display_name: place.displayName,
      formatted_address: place.formattedAddress,
      rating: place.rating,
      user_rating_count: place.userRatingCount,
      business_status: place.businessStatus,
    });

    return true;
  } catch (error) {
    googlePlacesLogger.error("place persistence threw", {
      placeId: place.placeId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}
