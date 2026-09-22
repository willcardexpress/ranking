import type { Business, DashboardSnapshot } from "@/types/database";

/**
 * DADOS DEMO — usados apenas na Fase 1 para visualizar a interface
 * antes da integração real com Google Places, ranking e AI Visibility.
 * Todo registro carrega is_demo: true e deve ser exibido com indicação clara.
 */

export const demoBusinesses: Business[] = [
  {
    id: "demo-business-1",
    organization_id: "demo-org-1",
    name: "Auto Baterias Taguatinga",
    website: "https://autobateriastaguatinga.com.br",
    phone: "(61) 99999-0000",
    category: "Loja de baterias automotivas",
    keywords: ["troca de bateria", "bateria de carro", "socorro de bateria"],
    service_area: "Taguatinga, DF",
    google_place_id: null,
    is_demo: true,
    created_at: "2026-01-10T12:00:00Z",
    updated_at: "2026-01-10T12:00:00Z",
  },
  {
    id: "demo-business-2",
    organization_id: "demo-org-1",
    name: "Clínica Odonto Brasília",
    website: "https://odontobrasilia.com.br",
    phone: "(61) 98888-1111",
    category: "Clínica odontológica",
    keywords: ["dentista em brasília", "clareamento dental", "implante dentário"],
    service_area: "Brasília, DF",
    google_place_id: null,
    is_demo: true,
    created_at: "2026-02-02T12:00:00Z",
    updated_at: "2026-02-02T12:00:00Z",
  },
];

export const demoDashboardSnapshot: DashboardSnapshot = {
  business_id: "demo-business-1",
  is_demo: true,
  rank_local_index: 68,
  average_observed_position: 4.2,
  ai_visibility_score: 41,
  seo_score: 57,
  reputation_score: 82,
  monitored_keywords: 12,
  generated_at: "2026-09-15T09:00:00Z",
};

export const demoOpportunities = [
  {
    id: "opp-1",
    title: "Completar categorias no perfil do Google Business",
    reason: "Perfil com categorias incompletas reduz correspondência com buscas locais.",
    priority: "alta" as const,
  },
  {
    id: "opp-2",
    title: "Criar página local para 'troca de bateria em Taguatinga'",
    reason: "Consulta observada com alta intenção comercial e sem página dedicada.",
    priority: "média" as const,
  },
  {
    id: "opp-3",
    title: "Responder avaliações recentes",
    reason: "Avaliações sem resposta podem impactar a percepção de reputação.",
    priority: "média" as const,
  },
];

// --- Ranking Local (Fase 3) — DEMO ---
// Grid 3x3 ilustrativo. Fora do modo demo, estes dados vêm de scans reais
// (keywords, keyword_locations, ranking_scans/grid_points/results).

import type { Keyword, KeywordLocation, ScanSummary, CompetitorFrequency } from "@/types/ranking";

export const demoKeyword: Keyword = {
  id: "demo-keyword-1",
  business_id: "demo-business-1",
  term: "troca de bateria",
  is_active: true,
  created_at: "2026-08-01T12:00:00Z",
  updated_at: "2026-08-01T12:00:00Z",
};

export const demoKeywordLocation: KeywordLocation = {
  id: "demo-keyword-location-1",
  keyword_id: "demo-keyword-1",
  label: "Sede — Taguatinga",
  latitude: -15.8267,
  longitude: -48.0685,
  created_at: "2026-08-01T12:00:00Z",
};

const demoPositions = [4, 3, 5, 6, 2, 7, 9, 8, 6]; // 3x3, ilustrativo

export const demoScanSummary: ScanSummary = {
  scan: {
    id: "demo-scan-1",
    keyword_location_id: "demo-keyword-location-1",
    grid_size: "3x3",
    spacing_meters: 1000,
    search_radius_meters: 500,
    max_result_count: 20,
    status: "completed",
    error_message: null,
    requested_by: null,
    started_at: "2026-09-15T09:00:00Z",
    completed_at: "2026-09-15T09:02:00Z",
    created_at: "2026-09-15T09:00:00Z",
  },
  keyword: demoKeyword,
  keywordLocation: demoKeywordLocation,
  points: demoPositions.map((position, i) => ({
    rowIndex: Math.floor(i / 3),
    colIndex: i % 3,
    latitude: demoKeywordLocation.latitude + (Math.floor(i / 3) - 1) * 0.009,
    longitude: demoKeywordLocation.longitude + ((i % 3) - 1) * 0.009,
    observedPosition: position,
    found: true,
    fetchedAt: "2026-09-15T09:02:00Z",
    businessName: "Auto Baterias Taguatinga",
  })),
  metrics: {
    totalPoints: 9,
    foundPoints: 9,
    averagePosition: 5.6,
    bestPosition: 2,
    worstPosition: 9,
    top3Rate: 22.2,
    top10Rate: 100,
  },
  trend: "melhorou",
  rankLocalIndex: 58,
};

export const demoCompetitors: CompetitorFrequency[] = [
  { placeId: "demo-place-a", displayName: "Baterias Express DF", appearances: 7, averagePosition: 2.1 },
  { placeId: "demo-place-b", displayName: "Auto Elétrica Central", appearances: 5, averagePosition: 3.4 },
  { placeId: "demo-place-c", displayName: "Bateria Fácil Taguatinga", appearances: 4, averagePosition: 4.8 },
];

// --- SEO (Fase 5) — DEMO ---
import type { WebsiteProject, SeoAuditSummary } from "@/types/seo";

export const demoWebsiteProject: WebsiteProject = {
  id: "demo-website-project-1",
  business_id: "demo-business-1",
  root_url: "https://autobateriastaguatinga.com.br",
  created_at: "2026-08-01T12:00:00Z",
  updated_at: "2026-09-15T09:00:00Z",
};

export const demoSeoAuditSummary: SeoAuditSummary = {
  project: demoWebsiteProject,
  audit: {
    id: "demo-seo-audit-1",
    website_project_id: "demo-website-project-1",
    status: "completed",
    pages_crawled: 6,
    seo_score: 68,
    has_robots_txt: true,
    has_sitemap: true,
    error_message: null,
    started_at: "2026-09-15T09:00:00Z",
    completed_at: "2026-09-15T09:01:30Z",
    created_at: "2026-09-15T09:00:00Z",
  },
  issues: [
    {
      id: "demo-issue-1",
      audit_id: "demo-seo-audit-1",
      page_url: null,
      issue_type: "missing_sitemap",
      severity: "warning",
      message: "Não foi encontrado um sitemap.xml (nem declarado no robots.txt).",
    },
    {
      id: "demo-issue-2",
      audit_id: "demo-seo-audit-1",
      page_url: "https://autobateriastaguatinga.com.br/",
      issue_type: "missing_meta_description",
      severity: "warning",
      message: "A página não tem meta description.",
    },
    {
      id: "demo-issue-3",
      audit_id: "demo-seo-audit-1",
      page_url: "https://autobateriastaguatinga.com.br/servicos",
      issue_type: "images_without_alt",
      severity: "warning",
      message: "3 de 5 imagens não têm atributo ALT.",
    },
    {
      id: "demo-issue-4",
      audit_id: "demo-seo-audit-1",
      page_url: "https://autobateriastaguatinga.com.br/",
      issue_type: "missing_schema",
      severity: "info",
      message: "A página não tem dados estruturados (JSON-LD).",
    },
  ],
  issueCountsBySeverity: { critical: 0, warning: 3, info: 1 },
};
