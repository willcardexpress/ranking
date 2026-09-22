"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureOrganizationForUser } from "@/lib/organizations";
import { persistConfirmedPlace } from "@/lib/places-persistence";
import { googlePlacesService } from "@/services/google/places";

const businessSchema = z.object({
  name: z.string().min(2, "Informe o nome da empresa."),
  website: z.string().trim().url("URL inválida.").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(2, "Informe a cidade."),
  state: z.string().min(2, "Informe o estado."),
  country: z.string().optional(),
  category: z.string().optional(),
  keywords: z.string().optional(),
  serviceArea: z.string().optional(),
  googlePlaceId: z.string().optional(),
});

export type CreateBusinessState = { error?: string } | null;

/**
 * Fluxo completo: Adicionar empresa → pesquisar no Google → selecionar →
 * salvar Place ID → visualizar dados.
 *
 * Se o Place ID confirmado não puder ser persistido no cache (`places`,
 * ver lib/places-persistence.ts — ex.: SUPABASE_SERVICE_ROLE_KEY ausente),
 * a empresa ainda é salva, só que sem o vínculo, para nunca bloquear o
 * cadastro por causa de uma etapa auxiliar.
 */
export async function createBusinessAction(
  _prevState: CreateBusinessState,
  formData: FormData
): Promise<CreateBusinessState> {
  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    country: formData.get("country"),
    category: formData.get("category"),
    keywords: formData.get("keywords"),
    serviceArea: formData.get("serviceArea"),
    googlePlaceId: formData.get("googlePlaceId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Você precisa estar logado para cadastrar uma empresa." };
  }

  const organizationId = await ensureOrganizationForUser(supabase, user);
  if (!organizationId) {
    return { error: "Não foi possível localizar ou criar sua organização. Tente novamente." };
  }

  let googlePlaceId: string | null = null;
  const submittedPlaceId = parsed.data.googlePlaceId?.trim();
  if (submittedPlaceId) {
    // Nunca confia cegamente no Place ID vindo do formulário: refaz a
    // consulta ao Google server-side antes de persistir, e só vincula a
    // empresa a um Place ID que realmente foi gravado no cache.
    try {
      const place = await googlePlacesService.getDetails(submittedPlaceId);
      const persisted = await persistConfirmedPlace(place);
      if (persisted) {
        googlePlaceId = place.placeId;
      }
    } catch {
      // Segue sem o vínculo — o cadastro manual continua válido.
      googlePlaceId = null;
    }
  }

  const keywords = parsed.data.keywords
    ? parsed.data.keywords.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  const { data: business, error: insertError } = await supabase
    .from("businesses")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      website: parsed.data.website || null,
      phone: parsed.data.phone || null,
      category: parsed.data.category || null,
      keywords,
      service_area: parsed.data.serviceArea || null,
      google_place_id: googlePlaceId,
      is_demo: false,
    })
    .select("id")
    .single();

  if (insertError || !business) {
    return { error: "Não foi possível salvar a empresa. Verifique a configuração do Supabase e tente novamente." };
  }

  if (parsed.data.address || parsed.data.city) {
    await supabase.from("business_locations").insert({
      business_id: business.id,
      address: parsed.data.address || "",
      city: parsed.data.city,
      state: parsed.data.state,
      country: parsed.data.country || "Brasil",
    });
  }

  redirect(`/empresas/${business.id}`);
}
