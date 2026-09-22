import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { getBusinessesForCurrentUser } from "@/lib/businesses-data";
import { getKeywordsForBusiness, getKeywordLocations, getLatestScanSummary } from "@/lib/ranking-data";
import { getLatestSeoAudit } from "@/lib/seo-data";
import { getGoogleBusinessConnectionAction } from "@/lib/actions/google-business";
import { demoBusinesses, demoDashboardSnapshot, demoOpportunities } from "@/lib/demo-data";

/**
 * Dashboard real (Fase 1-5, corrigido após auditoria).
 *
 * Antes, esta página mostrava incondicionalmente `demoBusinesses[0]` e
 * `demoDashboardSnapshot` para qualquer visitante, logado ou não. Agora:
 * - Sem sessão real (ou Supabase não configurado neste ambiente): modo
 *   DEMO, claramente separado e sinalizado (mesma regra de
 *   `lib/businesses-data.ts`, usada em todo o resto do app).
 * - Com sessão real e nenhuma empresa cadastrada: estado vazio real, com
 *   CTA para cadastrar a primeira empresa — nunca mostra "Auto Baterias
 *   Taguatinga" para quem não tem essa empresa.
 * - Com sessão real e empresa(s) cadastrada(s): métricas reais quando
 *   disponíveis (Índice RankLocal e posição média do scan de ranking mais
 *   recente, SEO Score da auditoria mais recente, status do Google
 *   Business Profile), e "ainda não calculado"/"—" quando o dado
 *   simplesmente ainda não existe — nunca um número inventado. AI
 *   Visibility e Reputação ainda não têm nenhum módulo implementado
 *   (Fases 6+), então aparecem como "não disponível ainda", nunca com um
 *   valor fictício.
 * - Erros inesperados na busca dos dados caem num estado de erro
 *   explícito, em vez de deixar a página quebrar.
 *
 * O estado de "loading" desta rota é o `loading.tsx` do App Router
 * (streaming/Suspense do Next.js), não algo tratado aqui dentro.
 */

function buildHref(businessId: string) {
  const search = new URLSearchParams({ business: businessId });
  return `/dashboard?${search.toString()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const { business: businessIdParam } = await searchParams;
  const { businesses, isDemo } = await getBusinessesForCurrentUser();

  if (isDemo) {
    return <DemoDashboard />;
  }

  if (businesses.length === 0) {
    return <EmptyDashboard />;
  }

  const business = businesses.find((b) => b.id === businessIdParam) ?? businesses[0];

  const dashboardData = await loadRealDashboardData(business.id);

  if (!dashboardData) {
    return <ErrorDashboard />;
  }

  return (
    <RealDashboard
      businessName={business.name}
      serviceArea={business.service_area}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      currentBusinessId={business.id}
      rankLocalIndex={dashboardData.rankLocalIndex}
      averagePosition={dashboardData.averagePosition}
      seoScore={dashboardData.seoScore}
      gbpConnected={dashboardData.gbpConnected}
      monitoredKeywords={dashboardData.monitoredKeywords}
    />
  );
}

interface RealDashboardData {
  rankLocalIndex: number | null;
  averagePosition: number | null;
  seoScore: number | null;
  gbpConnected: boolean;
  monitoredKeywords: number;
}

async function loadRealDashboardData(businessId: string): Promise<RealDashboardData | null> {
  try {
    const [{ keywords }, seoResult, gbpSummary] = await Promise.all([
      getKeywordsForBusiness(businessId),
      getLatestSeoAudit(businessId),
      getGoogleBusinessConnectionAction(businessId),
    ]);

    // Índice RankLocal real: pega o scan mais recente do primeiro
    // ponto de referência monitorado (se existir). Sem keyword ou sem
    // ponto de referência cadastrado, não há como calcular — devolvemos
    // null e a UI mostra "ainda não calculado" em vez de inventar um
    // número.
    let rankLocalIndex: number | null = null;
    let averagePosition: number | null = null;
    if (keywords.length > 0) {
      const { locations } = await getKeywordLocations(keywords[0].id);
      if (locations.length > 0) {
        const { summary } = await getLatestScanSummary(locations[0].id);
        if (summary) {
          rankLocalIndex = summary.rankLocalIndex;
          averagePosition = summary.metrics.averagePosition;
        }
      }
    }

    return {
      rankLocalIndex,
      averagePosition,
      seoScore: seoResult.summary?.audit.seo_score ?? null,
      gbpConnected: gbpSummary?.status === "connected",
      monitoredKeywords: keywords.length,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Estado: modo DEMO (sem sessão real / Supabase não configurado)
// ---------------------------------------------------------------------

function DemoDashboard() {
  const business = demoBusinesses[0];
  const snapshot = demoDashboardSnapshot;

  return (
    <div className="flex flex-col gap-6">
      <DemoBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{business.name}</h1>
          <p className="text-sm text-slate-500">{business.service_area}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Integrações: não conectadas</Badge>
          <Link href="/empresas/nova">
            <Button variant="outline" size="sm">Adicionar empresa</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Índice RankLocal"
          value={`${snapshot.rank_local_index}/100`}
          progressValue={snapshot.rank_local_index}
          accentClassName="text-brand-blue"
          helperText="Métrica proprietária RankLocal"
        />
        <MetricCard
          title="Posição observada (média)"
          value={snapshot.average_observed_position?.toFixed(1) ?? "—"}
          helperText="Presença local monitorada, não é ranking oficial do Google"
        />
        <MetricCard
          title="AI Visibility Score"
          value={`${snapshot.ai_visibility_score}/100`}
          progressValue={snapshot.ai_visibility_score}
          accentClassName="text-brand-violet"
          helperText="Visibilidade observada em buscas com IA"
        />
        <MetricCard title="SEO Score" value={`${snapshot.seo_score}/100`} progressValue={snapshot.seo_score} />
        <MetricCard
          title="Reputação"
          value={`${snapshot.reputation_score}/100`}
          progressValue={snapshot.reputation_score}
          accentClassName="text-brand-emerald"
        />
        <MetricCard title="Palavras monitoradas" value={`${snapshot.monitored_keywords}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Principais oportunidades</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {demoOpportunities.map((opp) => (
              <div key={opp.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{opp.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{opp.reason}</p>
                </div>
                <Badge variant={opp.priority === "alta" ? "destructive" : opp.priority === "média" ? "warning" : "secondary"}>
                  {opp.priority}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano de ação IA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              O plano de ação gerado por IA será disponibilizado a partir da Fase 7 (AI Visibility) e Fase 9
              (Automações), quando os dados de ranking, SEO e reputação estiverem sendo coletados de fato.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Estado: sessão real, sem nenhuma empresa cadastrada
// ---------------------------------------------------------------------

function EmptyDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-slate-500">
            Você ainda não tem nenhuma empresa cadastrada. Adicione a primeira para começar a monitorar
            ranking local, SEO e Google Business Profile.
          </p>
          <Link href="/empresas/nova">
            <Button size="sm">Adicionar empresa</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Estado: erro inesperado ao buscar os dados reais
// ---------------------------------------------------------------------

function ErrorDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-brand-red">
            Não foi possível carregar os dados do dashboard agora. Tente novamente em instantes.
          </p>
          <Link href="/dashboard">
            <Button size="sm" variant="outline">Tentar de novo</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Estado: dados reais (com ou sem métricas suficientes ainda)
// ---------------------------------------------------------------------

interface RealDashboardProps {
  businessName: string;
  serviceArea: string | null;
  businesses: { id: string; name: string }[];
  currentBusinessId: string;
  rankLocalIndex: number | null;
  averagePosition: number | null;
  seoScore: number | null;
  gbpConnected: boolean;
  monitoredKeywords: number;
}

function RealDashboard(props: RealDashboardProps) {
  return (
    <div className="flex flex-col gap-6">
      {props.businesses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {props.businesses.map((b) => (
            <Link key={b.id} href={buildHref(b.id)}>
              <Badge variant={b.id === props.currentBusinessId ? "default" : "secondary"}>{b.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{props.businessName}</h1>
          <p className="text-sm text-slate-500">{props.serviceArea ?? "Área de atuação não informada"}</p>
        </div>
        <Badge variant={props.gbpConnected ? "success" : "secondary"}>
          Google Business Profile: {props.gbpConnected ? "conectado" : "não conectado"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Índice RankLocal"
          value={props.rankLocalIndex !== null ? `${props.rankLocalIndex}/100` : "—"}
          progressValue={props.rankLocalIndex ?? undefined}
          accentClassName="text-brand-blue"
          helperText={props.rankLocalIndex !== null ? "Métrica proprietária RankLocal" : "Ainda não calculado — rode um scan em Google Maps"}
        />
        <MetricCard
          title="Posição observada (média)"
          value={props.averagePosition?.toFixed(1) ?? "—"}
          helperText="Presença local monitorada, não é ranking oficial do Google"
        />
        <MetricCard
          title="AI Visibility Score"
          value="—"
          helperText="Não disponível ainda (chega na Fase 7)"
        />
        <MetricCard
          title="SEO Score"
          value={props.seoScore !== null ? `${props.seoScore}/100` : "—"}
          progressValue={props.seoScore ?? undefined}
          helperText={props.seoScore !== null ? undefined : "Ainda não calculado — rode uma auditoria de SEO"}
        />
        <MetricCard title="Reputação" value="—" helperText="Não disponível ainda" />
        <MetricCard title="Palavras monitoradas" value={`${props.monitoredKeywords}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Principais oportunidades</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              A geração automática de oportunidades a partir dos dados reais de ranking, SEO e reputação
              chega nas próximas fases (Consultor IA / Plano de Ação). Por enquanto, explore{" "}
              <Link href="/google-maps" className="text-brand-blue hover:underline">Google Maps</Link> e a
              aba de SEO da empresa para ver os dados coletados.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano de ação IA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              O plano de ação gerado por IA será disponibilizado a partir da Fase 7 (AI Visibility) e Fase 9
              (Automações), quando os dados de ranking, SEO e reputação estiverem sendo coletados de fato.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
