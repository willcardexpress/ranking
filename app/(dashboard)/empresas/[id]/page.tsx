import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompetitorsPanel } from "@/components/empresas/competitors-panel";
import { GoogleBusinessPanel } from "@/components/empresas/gbp/google-business-panel";
import { SeoPanel } from "@/components/empresas/seo/seo-panel";
import { getBusinessById } from "@/lib/businesses-data";

export default async function EmpresaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gbp?: string; gbp_message?: string }>;
}) {
  const { id } = await params;
  const { gbp, gbp_message } = await searchParams;
  const { business, isDemo } = await getBusinessById(id);

  if (!business) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{business.name}</h1>
        {isDemo && <Badge variant="demo">DEMO</Badge>}
        {!isDemo && business.google_place_id && <Badge variant="success">Google vinculado</Badge>}
      </div>

      {gbp === "connected" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Conta Google autorizada com sucesso. Selecione a conta e o perfil abaixo para concluir.
        </div>
      )}
      {gbp === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Não foi possível conectar ao Google Business Profile{gbp_message ? `: ${gbp_message}` : "."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-slate-600">
            <p><span className="text-slate-400">Site:</span> {business.website ?? "—"}</p>
            <p><span className="text-slate-400">Telefone:</span> {business.phone ?? "—"}</p>
            <p><span className="text-slate-400">Categoria:</span> {business.category ?? "—"}</p>
            <p><span className="text-slate-400">Área de atuação:</span> {business.service_area ?? "—"}</p>
            <p>
              <span className="text-slate-400">Place ID:</span>{" "}
              {business.google_place_id ?? "não vinculado"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Concorrentes (Google Places)</CardTitle>
          </CardHeader>
          <CardContent>
            <CompetitorsPanel
              category={business.category}
              serviceArea={business.service_area}
              excludePlaceId={business.google_place_id}
            />
          </CardContent>
        </Card>
      </div>

      {isDemo ? (
        <Card>
          <CardHeader>
            <CardTitle>Google Business Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              A conexão com o Google Business Profile está disponível para empresas reais. Cadastre uma
              empresa para conectar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <GoogleBusinessPanel businessId={business.id} />
      )}

      <SeoPanel businessId={business.id} />

      <Card>
        <CardHeader>
          <CardTitle>Search Console e AI Visibility</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Estes módulos serão habilitados nas próximas fases (6 e 7), após a integração com o Search
            Console e o módulo de AI Visibility.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
