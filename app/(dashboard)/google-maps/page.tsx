import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { KeywordForm } from "@/components/ranking/keyword-form";
import { LocationForm } from "@/components/ranking/location-form";
import { ScanControls } from "@/components/ranking/scan-controls";
import { GridHeatmap } from "@/components/ranking/grid-heatmap";
import { MetricsPanel } from "@/components/ranking/metrics-panel";
import { ScanHistoryTable } from "@/components/ranking/scan-history-table";
import { CompetitorsTable } from "@/components/ranking/competitors-table";
import { getBusinessesForCurrentUser, getBusinessById } from "@/lib/businesses-data";
import {
  getKeywordsForBusiness,
  getKeywordLocations,
  getLatestScanSummary,
  getScanHistory,
  getCompetitorFrequency,
} from "@/lib/ranking-data";
import { checkGooglePlacesConfigured } from "@/lib/actions/places";

function buildHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/google-maps${query ? `?${query}` : ""}`;
}

export default async function GoogleMapsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; keyword?: string; location?: string }>;
}) {
  const params = await searchParams;
  const placesConfigured = await checkGooglePlacesConfigured();
  const { businesses, isDemo: businessesDemo } = await getBusinessesForCurrentUser();

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-slate-900">Google Maps · Ranking Local</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-slate-500">Cadastre uma empresa antes de monitorar o ranking local.</p>
            <Link href="/empresas/nova">
              <Button size="sm">Adicionar empresa</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedBusinessId = params.business ?? businesses[0].id;
  const { business } = await getBusinessById(selectedBusinessId);
  const currentBusiness = business ?? businesses[0];

  const { keywords, isDemo: keywordsDemo } = await getKeywordsForBusiness(currentBusiness.id);
  const selectedKeywordId = params.keyword ?? keywords[0]?.id;
  const selectedKeyword = keywords.find((k) => k.id === selectedKeywordId) ?? keywords[0] ?? null;

  const { locations } = selectedKeyword
    ? await getKeywordLocations(selectedKeyword.id)
    : { locations: [] };
  const selectedLocationId = params.location ?? locations[0]?.id;
  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? locations[0] ?? null;

  const isDemo = businessesDemo || keywordsDemo;

  const [{ summary }, history, { competitors }] = selectedLocation
    ? await Promise.all([
        getLatestScanSummary(selectedLocation.id),
        getScanHistory(selectedLocation.id),
        getCompetitorFrequency(selectedLocation.id),
      ])
    : [{ summary: null }, [], { competitors: [] }];

  return (
    <div className="flex flex-col gap-6">
      {isDemo && <DemoBanner />}

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Google Maps · Ranking Local</h1>
        <p className="text-sm text-slate-500">
          Monitoramento de presença local por grid — posição observada, nunca ranking oficial do Google.
        </p>
      </div>

      {businesses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {businesses.map((b) => (
            <Link key={b.id} href={buildHref({ business: b.id })}>
              <Badge variant={b.id === currentBusiness.id ? "default" : "secondary"}>{b.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Palavras-chave monitoradas — {currentBusiness.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <KeywordForm businessId={currentBusiness.id} />

          {keywords.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma palavra-chave cadastrada ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <Link key={k.id} href={buildHref({ business: currentBusiness.id, keyword: k.id })}>
                  <Badge variant={k.id === selectedKeyword?.id ? "default" : "secondary"}>{k.term}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedKeyword && (
        <Card>
          <CardHeader>
            <CardTitle>Pontos de referência — &quot;{selectedKeyword.term}&quot;</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <LocationForm keywordId={selectedKeyword.id} />

            {locations.length === 0 ? (
              <p className="text-sm text-slate-500">
                Cadastre um ponto de referência (centro do grid) para começar a monitorar.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => (
                  <Link
                    key={l.id}
                    href={buildHref({ business: currentBusiness.id, keyword: selectedKeyword.id, location: l.id })}
                  >
                    <Badge variant={l.id === selectedLocation?.id ? "default" : "secondary"}>{l.label}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedLocation && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Rodar scan de grid</CardTitle>
            </CardHeader>
            <CardContent>
              <ScanControls
                keywordLocationId={selectedLocation.id}
                placesConfigured={placesConfigured}
                hasTargetPlaceId={Boolean(currentBusiness.google_place_id)}
              />
            </CardContent>
          </Card>

          {summary ? (
            <>
              <MetricsPanel
                averagePosition={summary.metrics.averagePosition}
                bestPosition={summary.metrics.bestPosition}
                worstPosition={summary.metrics.worstPosition}
                top3Rate={summary.metrics.top3Rate}
                top10Rate={summary.metrics.top10Rate}
                trend={summary.trend}
                rankLocalIndex={summary.rankLocalIndex}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Mapa de grid — última observação</CardTitle>
                </CardHeader>
                <CardContent>
                  <GridHeatmap points={summary.points} keywordTerm={summary.keyword.term} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ScanHistoryTable entries={history} />
                <CompetitorsTable competitors={competitors} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Nenhum scan concluído para este ponto de referência ainda. Rode o primeiro scan acima.
            </p>
          )}
        </>
      )}
    </div>
  );
}
