import {
  prisma,
  ResearchEventKind,
  ResearchEventStatus,
  ResearchRunStatus,
} from "@crypto-research/database";

import {
  aggregateEventImpactsByCategory,
  getEventImpactsForProject,
  type EventCategoryAggregation,
  type EventImpactSummary,
} from "./event-impact-engine";
import {
  computeFundamentalHistoricalIntelligence,
  type FundamentalHistoricalIntelligence,
} from "./historical-intelligence";

// Sprint 14 (Parte 18-21) — Dashboard Home real. Agrega dados JÁ PERSISTIDOS em visões prontas
// para a Home — nenhuma nova fonte externa, nenhum dado inventado.
//
// DECISÃO DE PERFORMANCE (Parte 23: "não otimizar prematuramente, primeiro medir"): as seções
// de Fundamental Movement/Divergences escalam sobre o conjunto de projetos JÁ PESQUISADOS
// (distinct projectId em FundamentalScore) — não o universo inteiro descoberto pela Discovery
// (centenas/milhares de Projects, ver Sprint 8). Isso é o limite natural e correto: só projetos
// que passaram por uma Research Run têm métricas fundamentais para mostrar. Sem Redis/cache
// nesta primeira versão — se o volume de projetos pesquisados crescer o suficiente para isso
// pesar, cachear é a próxima otimização óbvia (não implementada agora, por não haver evidência
// de que seja necessária ainda).

// ------------------------------------------------------------------------------------------
// Parte 18 — Research / Pipeline overview.
// ------------------------------------------------------------------------------------------

export interface ResearchOverview {
  projectsResearched: number;
  researchRunsTotal: number;
  lastResearchRun: {
    id: string;
    status: ResearchRunStatus;
    mode: string;
    startedAt: string | null;
    finishedAt: string | null;
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
  } | null;
}

export async function getResearchOverview(): Promise<ResearchOverview> {
  const [projectsResearched, researchRunsTotal, lastRun] = await Promise.all([
    prisma.fundamentalScore
      .findMany({ distinct: ["projectId"], select: { projectId: true } })
      .then((rows) => rows.length),
    prisma.researchRun.count(),
    prisma.researchRun.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return {
    projectsResearched,
    researchRunsTotal,
    lastResearchRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          mode: lastRun.mode,
          startedAt: lastRun.startedAt?.toISOString() ?? null,
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          totalProjects: lastRun.totalProjects,
          successfulProjects: lastRun.successfulProjects,
          failedProjects: lastRun.failedProjects,
        }
      : null,
  };
}

// ------------------------------------------------------------------------------------------
// Conjunto base — projetos já pesquisados (ver decisão de performance acima).
// ------------------------------------------------------------------------------------------

interface ResearchedProject {
  id: string;
  slug: string;
  name: string;
}

async function getResearchedProjects(): Promise<ResearchedProject[]> {
  const distinctProjectIds = await prisma.fundamentalScore.findMany({
    distinct: ["projectId"],
    select: { projectId: true },
  });
  if (distinctProjectIds.length === 0) return [];

  return prisma.project.findMany({
    where: { id: { in: distinctProjectIds.map((p) => p.projectId) } },
    select: { id: true, slug: true, name: true },
  });
}

// ------------------------------------------------------------------------------------------
// Parte 21 — Data Quality / Data Health.
// ------------------------------------------------------------------------------------------

export interface DataHealthOverview {
  projectsResearched: number;
  tvlCoverage: { count: number; percentage: number };
  marketDataCoverage: { count: number; percentage: number };
  revenueCoverage: { count: number; percentage: number };
  feesCoverage: { count: number; percentage: number };
  lastSuccessfulCollection: string | null;
  lastFailedCollection: string | null;
}

export async function getDataHealthOverview(): Promise<DataHealthOverview> {
  const researched = await getResearchedProjects();
  const projectIds = researched.map((p) => p.id);

  const [
    tvlProjects,
    marketDataProjects,
    revenueProjects,
    feesProjects,
    lastSuccessfulRun,
    lastFailedRun,
  ] = await Promise.all([
    projectIds.length === 0
      ? []
      : prisma.tvlSnapshot.findMany({
          where: { projectId: { in: projectIds } },
          distinct: ["projectId"],
          select: { projectId: true },
        }),
    projectIds.length === 0
      ? []
      : prisma.marketDataSnapshot.findMany({
          where: { projectId: { in: projectIds } },
          distinct: ["projectId"],
          select: { projectId: true },
        }),
    projectIds.length === 0
      ? []
      : prisma.revenueSnapshot.findMany({
          where: { projectId: { in: projectIds } },
          distinct: ["projectId"],
          select: { projectId: true },
        }),
    projectIds.length === 0
      ? []
      : prisma.feeSnapshot.findMany({
          where: { projectId: { in: projectIds } },
          distinct: ["projectId"],
          select: { projectId: true },
        }),
    prisma.researchRun.findFirst({
      where: { status: ResearchRunStatus.COMPLETED },
      orderBy: { createdAt: "desc" },
    }),
    prisma.researchRun.findFirst({
      where: { status: { in: [ResearchRunStatus.FAILED, ResearchRunStatus.PARTIAL] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const total = researched.length;
  const pct = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 10000) / 100);

  return {
    projectsResearched: total,
    tvlCoverage: { count: tvlProjects.length, percentage: pct(tvlProjects.length) },
    marketDataCoverage: {
      count: marketDataProjects.length,
      percentage: pct(marketDataProjects.length),
    },
    revenueCoverage: { count: revenueProjects.length, percentage: pct(revenueProjects.length) },
    feesCoverage: { count: feesProjects.length, percentage: pct(feesProjects.length) },
    lastSuccessfulCollection: lastSuccessfulRun?.finishedAt?.toISOString() ?? null,
    lastFailedCollection:
      lastFailedRun?.finishedAt?.toISOString() ?? lastFailedRun?.createdAt.toISOString() ?? null,
  };
}

// ------------------------------------------------------------------------------------------
// Parte 19 — Fundamental Movement. NUNCA "Top Buys"/"Best Coins"/"Winners"/"Opportunities"
// (regra explícita da seção 19) — só dados e movimentos observados.
// ------------------------------------------------------------------------------------------

export interface FundamentalMovementEntry {
  slug: string;
  name: string;
  fundamentalMomentum: number | null;
  tvlGrowth30d: number | "N/A";
  revenueGrowth30d: number | "N/A";
  marketCapGrowth30d: number | "N/A";
  divergence: FundamentalHistoricalIntelligence["fundamentalPriceDivergence"]["classification"];
}

export async function getFundamentalMovementOverview(
  limit = 10,
): Promise<FundamentalMovementEntry[]> {
  const researched = await getResearchedProjects();
  const results = await Promise.all(
    researched.map(async (p) => {
      const hi = await computeFundamentalHistoricalIntelligence(p.id, p.slug);
      return {
        slug: p.slug,
        name: p.name,
        fundamentalMomentum: hi.fundamentalMomentum.score,
        tvlGrowth30d: hi.growth.tvl["30d"],
        revenueGrowth30d: hi.growth.revenue["30d"],
        marketCapGrowth30d: hi.growth.marketCap["30d"],
        divergence: hi.fundamentalPriceDivergence.classification,
      };
    }),
  );

  return results
    .filter((r) => r.fundamentalMomentum !== null)
    .sort((a, b) => (b.fundamentalMomentum ?? 0) - (a.fundamentalMomentum ?? 0))
    .slice(0, limit);
}

// ------------------------------------------------------------------------------------------
// Parte 20 — Divergências Fundamentos × Mercado.
// ------------------------------------------------------------------------------------------

export interface DivergenceOverviewEntry {
  slug: string;
  name: string;
  classification: FundamentalHistoricalIntelligence["fundamentalPriceDivergence"]["classification"];
  tvlGrowth90d: number | "N/A";
  marketCapGrowth90d: number | "N/A";
}

export interface DivergenceOverview {
  entries: DivergenceOverviewEntry[];
  counts: Record<string, number>;
}

export async function getDivergenceOverview(): Promise<DivergenceOverview> {
  const researched = await getResearchedProjects();
  const results = await Promise.all(
    researched.map(async (p) => {
      const hi = await computeFundamentalHistoricalIntelligence(p.id, p.slug);
      return {
        slug: p.slug,
        name: p.name,
        classification: hi.fundamentalPriceDivergence.classification,
        tvlGrowth90d: hi.growth.tvl["90d"],
        marketCapGrowth90d: hi.growth.marketCap["90d"],
      };
    }),
  );

  const counts: Record<string, number> = {
    POSITIVE_FUNDAMENTAL_DIVERGENCE: 0,
    NEGATIVE_FUNDAMENTAL_DIVERGENCE: 0,
    ALIGNED: 0,
    INSUFFICIENT_DATA: 0,
  };
  for (const r of results) counts[r.classification] = (counts[r.classification] ?? 0) + 1;

  return { entries: results, counts };
}

// ------------------------------------------------------------------------------------------
// Sprint 15 (Parte 20/37) — Catalysts/Risks overview para a Home. Consulta direta
// `research_events` (não recalcula nada — os eventos já foram persistidos pelo pipeline).
// ------------------------------------------------------------------------------------------

export interface CatalystsOverview {
  upcoming: number; // SCHEDULED
  recent: number; // ANNOUNCED/ONGOING/COMPLETED nos últimos 30 dias
  completed: number;
}

export interface RisksOverview {
  identified: number;
  withHistoricalEvidence: number; // status COMPLETED (evento já ocorreu, com data)
}

export async function getCatalystsOverview(): Promise<CatalystsOverview> {
  const researched = await getResearchedProjects();
  const projectIds = researched.map((p) => p.id);
  if (projectIds.length === 0) return { upcoming: 0, recent: 0, completed: 0 };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [upcoming, recent, completed] = await Promise.all([
    prisma.researchEvent.count({
      where: {
        projectId: { in: projectIds },
        kind: ResearchEventKind.CATALYST,
        status: ResearchEventStatus.SCHEDULED,
      },
    }),
    prisma.researchEvent.count({
      where: {
        projectId: { in: projectIds },
        kind: ResearchEventKind.CATALYST,
        eventDate: { gte: thirtyDaysAgo },
      },
    }),
    prisma.researchEvent.count({
      where: {
        projectId: { in: projectIds },
        kind: ResearchEventKind.CATALYST,
        status: ResearchEventStatus.COMPLETED,
      },
    }),
  ]);

  return { upcoming, recent, completed };
}

export async function getRisksOverview(): Promise<RisksOverview> {
  const researched = await getResearchedProjects();
  const projectIds = researched.map((p) => p.id);
  if (projectIds.length === 0) return { identified: 0, withHistoricalEvidence: 0 };

  const [identified, withHistoricalEvidence] = await Promise.all([
    prisma.researchEvent.count({
      where: { projectId: { in: projectIds }, kind: ResearchEventKind.RISK },
    }),
    prisma.researchEvent.count({
      where: {
        projectId: { in: projectIds },
        kind: ResearchEventKind.RISK,
        status: ResearchEventStatus.COMPLETED,
        eventDate: { not: null },
      },
    }),
  ]);

  return { identified, withHistoricalEvidence };
}

// ------------------------------------------------------------------------------------------
// Sprint 16 (Parte 22/26) — Event Intelligence overview para a Home: eventos recentes com seu
// Event Impact já calculado, contagem de analisados/insuficientes, e agregação cross-event por
// categoria (FUNDING/SECURITY_INCIDENT). Escopado aos projetos JÁ pesquisados (mesma decisão de
// performance das demais seções deste arquivo).
// ------------------------------------------------------------------------------------------

export interface RecentEventEntry {
  slug: string;
  name: string;
  eventType: string;
  eventKind: "CATALYST" | "RISK";
  eventDate: string | null;
  classification: string;
  fundamentalChange30d: number | "N/D";
  marketChange30d: number | "N/D";
  coveragePercent: number;
}

export interface EventIntelligenceOverview {
  recentEvents: RecentEventEntry[];
  analyzedCount: number;
  insufficientDataCount: number;
  aggregations: EventCategoryAggregation[];
}

const RECENT_EVENTS_WINDOW_DAYS = 30;
// Sprint 17: LISTING/DELISTING adicionados (Catalyst derivado do diff de TokenMarket, ver
// CATALYSTS_RISKS_SOURCE_AUDIT.md seção 7, item 1).
const KNOWN_EVENT_CATEGORIES = ["FUNDING", "SECURITY_INCIDENT", "LISTING", "DELISTING"] as const;

export async function getEventIntelligenceOverview(): Promise<EventIntelligenceOverview> {
  const researched = await getResearchedProjects();

  // Batch por projeto (não por evento — evita N+1: cada projeto tem no máximo alguns eventos
  // hoje, seção 29: "preferir batch queries... reutilização de serviços históricos").
  const perProjectImpacts = await Promise.all(
    researched.map(async (p) => ({
      project: p,
      impacts: await getEventImpactsForProject(p.id),
    })),
  );

  const allImpacts: EventImpactSummary[] = [];
  const recentEvents: RecentEventEntry[] = [];
  const cutoff = Date.now() - RECENT_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const { project, impacts } of perProjectImpacts) {
    for (const impact of impacts) {
      allImpacts.push(impact);
      if (impact.eventDate && new Date(impact.eventDate).getTime() >= cutoff) {
        recentEvents.push({
          slug: project.slug,
          name: project.name,
          eventType: impact.eventType,
          eventKind: impact.eventKind,
          eventDate: impact.eventDate,
          classification: impact.classification,
          fundamentalChange30d: impact.metrics.tvl["30d"].changePercent ?? "N/D",
          marketChange30d: impact.metrics.marketCap["30d"].changePercent ?? "N/D",
          coveragePercent: impact.coverage.coveragePercent,
        });
      }
    }
  }

  recentEvents.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  const analyzedCount = allImpacts.filter((i) => i.analysisStatus === "OK").length;
  const insufficientDataCount = allImpacts.filter((i) => i.analysisStatus !== "OK").length;

  const aggregations = KNOWN_EVENT_CATEGORIES.map((category) =>
    aggregateEventImpactsByCategory(category, allImpacts),
  );

  return { recentEvents, analyzedCount, insufficientDataCount, aggregations };
}
