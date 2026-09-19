import { prisma } from "@crypto-research/database";
import {
  computeConfidence,
  computeEfficiencyRatio,
  computeFundamentalScore,
  computeTraceEntryPoints,
  FUNDAMENTAL_GROUP_WEIGHTS,
  FUNDAMENTAL_SCORE_MODEL_VERSION,
  MIN_PEER_SAMPLE_SIZE,
  percentileRank,
  WINDOW_WEIGHTS,
  type FundamentalScoreGroups,
  type GrowthWindow,
  type MetricDataQuality,
  type MetricQualityFlag,
  type TraceEntry,
} from "@crypto-research/scoring-engine";

import { logScoringEvent } from "./logger";
import { calculateWindowMetrics } from "./metrics";
import type { WindowMetrics } from "./metrics";
import { loadSeries, loadSeriesForProjects, type PersistedPoint } from "./snapshot-repository";

// Sprint 5 (Fase 1/13/14/31): esta é a ÚNICA camada que liga o Fundamental Score (matemática
// pura de packages/scoring-engine) a `ResearchRun`/Prisma — não duplica coleta/validação
// (isso é do pipeline.ts, Sprint 3/4), só consome métricas e séries já persistidas.
//
// NOTA SOBRE INVALID vs MISSING (documentada também no README de scoring-engine): pontos
// INVALID nunca chegam a virar linha no banco — a única forma de saber que houve rejeição
// INVALID nesta execução é o contador efêmero `rejectedInvalid` que persistSnapshotSeries já
// calcula em memória (Sprint 3), antes de descartar o ponto. Por isso `computeAndScoreProject`
// exige que o CALLER (pipeline.ts, na mesma execução) passe esses contadores explicitamente —
// decisão (a) do brief: acoplar o Scoring ao mesmo Research Run que processou os dados, nunca
// tentar recalcular isso a partir do estado do banco depois do fato (o banco não distingue
// INVALID de MISSING). Se o Scoring rodasse desacoplado (ex: um recomputo em lote de scores
// antigos sem reprocessar o pipeline), `invalidRejected` sempre seria `false` — essa é uma
// limitação real e documentada, não um bug.

export interface MetricQualityInput {
  suspicious: boolean;
  invalidRejected: boolean;
}

export interface ScoreProjectInput {
  researchRunId: string;
  projectId: string;
  sectorId: string;
  metrics: { tvl: WindowMetrics; revenue: WindowMetrics; fees: WindowMetrics };
  series: { tvl: PersistedPoint[]; revenue: PersistedPoint[]; fees: PersistedPoint[] };
  quality: { tvl: MetricQualityInput; revenue: MetricQualityInput; fees: MetricQualityInput };
  asOf?: Date;
}

export interface FundamentalScoreRecordResult {
  id: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  scoreModelVersion: string;
}

function lastTimestamp(series: PersistedPoint[]): Date | null {
  const first = series[0];
  if (!first) return null;
  return series.reduce(
    (latest, p) => (p.sourceTimestamp > latest ? p.sourceTimestamp : latest),
    first.sourceTimestamp,
  );
}

function growthToNumberOrNull(value: number | "N/A"): number | null {
  return value === "N/A" ? null : value;
}

/** Fase 6/28: métricas de janela de todos os peers de um setor, computadas em lote (uma
 * query por tipo de snapshot em vez de N) e usando o MESMO `asOf` do projeto avaliado, para
 * que a comparação entre pares seja apples-to-apples. */
async function loadSectorPeerMetrics(
  sectorId: string,
  asOf: Date,
): Promise<Map<string, { tvl: WindowMetrics; revenue: WindowMetrics; fees: WindowMetrics }>> {
  const peers = await prisma.project.findMany({ where: { sectorId }, select: { id: true } });
  const peerIds = peers.map((p) => p.id);

  const [tvlByProject, revenueByProject, feesByProject] = await Promise.all([
    loadSeriesForProjects("TVL", peerIds),
    loadSeriesForProjects("REVENUE", peerIds),
    loadSeriesForProjects("FEES", peerIds),
  ]);

  const result = new Map<
    string,
    { tvl: WindowMetrics; revenue: WindowMetrics; fees: WindowMetrics }
  >();
  for (const id of peerIds) {
    result.set(id, {
      tvl: calculateWindowMetrics(tvlByProject.get(id) ?? [], asOf),
      revenue: calculateWindowMetrics(revenueByProject.get(id) ?? [], asOf),
      fees: calculateWindowMetrics(feesByProject.get(id) ?? [], asOf),
    });
  }
  return result;
}

interface PercentileOutcome {
  percentile: number | null;
  /** true se o percentile foi de fato tentado (o próprio projeto tinha um valor numérico
   * nesta janela/ratio) — usado só para popular `percentileSampleOutcomes` da Confidence. */
  attempted: boolean;
  /** true se, tendo sido tentado, havia pares suficientes (Fase 8). */
  hadEnoughPeers: boolean;
}

function computePercentileOutcome(ownValue: number | null, peers: number[]): PercentileOutcome {
  if (ownValue === null) return { percentile: null, attempted: false, hadEnoughPeers: false };
  const finitePeerCount = peers.filter((p) => Number.isFinite(p)).length;
  const percentile = percentileRank(ownValue, peers);
  return { percentile, attempted: true, hadEnoughPeers: finitePeerCount >= MIN_PEER_SAMPLE_SIZE };
}

function metricDataQuality(
  available: boolean,
  invalidRejected: boolean,
  suspicious: boolean,
): MetricDataQuality {
  if (!available) return "MISSING";
  if (invalidRejected) return "INVALID_REJECTED";
  if (suspicious) return "SUSPICIOUS";
  return "VALID";
}

/**
 * Fase 1/13/17/31: calcula o Fundamental Score de UM projeto dentro de UMA Research Run já em
 * andamento, e persiste um novo registro (nunca UPDATE — Fase 18) associado a `researchRunId`.
 * Deve ser chamado depois que o pipeline (Sprint 3/4) já calculou `metrics` e persistiu os
 * snapshots — não recoleta nada da DefiLlama (Fase 1: "o Scoring Engine não deve consultar
 * diretamente a API da DefiLlama").
 */
export async function computeAndPersistFundamentalScore(
  input: ScoreProjectInput,
): Promise<FundamentalScoreRecordResult> {
  const asOf = input.asOf ?? new Date();
  logScoringEvent("scoring.project_started", {
    researchRunId: input.researchRunId,
    projectId: input.projectId,
  });

  try {
    const peerMetrics = await loadSectorPeerMetrics(input.sectorId, asOf);
    // Garante que o próprio projeto está representado no conjunto de pares com os MESMOS
    // valores já calculados pelo pipeline (evita recomputar e evita divergência se o pipeline
    // usou um `asOf` ligeiramente diferente do agora).
    peerMetrics.set(input.projectId, input.metrics);

    const percentileSampleOutcomes: boolean[] = [];

    function peerGrowthValues(metric: "tvl" | "revenue" | "fees", window: GrowthWindow): number[] {
      const values: number[] = [];
      for (const m of peerMetrics.values()) {
        const raw = growthToNumberOrNull(
          m[metric][`growth${window}` as "growth7d" | "growth30d" | "growth90d"],
        );
        if (raw !== null) values.push(raw);
      }
      return values;
    }

    function buildGrowthGroupPercentiles(metric: "tvl" | "revenue" | "fees") {
      const percentiles: Partial<Record<GrowthWindow, number | null>> = {};
      const traceEntries: TraceEntry[] = [];
      const groupMaxWeight =
        FUNDAMENTAL_GROUP_WEIGHTS[
          metric === "tvl" ? "TVL_GROWTH" : metric === "revenue" ? "REVENUE_GROWTH" : "FEES_GROWTH"
        ];
      const series = input.series[metric];
      const q = input.quality[metric];
      const available = input.metrics[metric].current !== null;
      const dataQuality = metricDataQuality(available, q.invalidRejected, q.suspicious);
      const sourceTimestamp = lastTimestamp(series);

      for (const window of Object.keys(WINDOW_WEIGHTS) as GrowthWindow[]) {
        const ownValue = growthToNumberOrNull(
          input.metrics[metric][`growth${window}` as "growth7d" | "growth30d" | "growth90d"],
        );
        const peers = peerGrowthValues(metric, window);
        const outcome = computePercentileOutcome(ownValue, peers);
        if (outcome.attempted) percentileSampleOutcomes.push(outcome.hadEnoughPeers);
        percentiles[window] = outcome.percentile;

        traceEntries.push({
          component: `${metric.toUpperCase()}_GROWTH_${window.toUpperCase()}`,
          metricLabel: `${metric === "tvl" ? "TVL" : metric === "revenue" ? "Revenue" : "Fees"} Growth ${window}`,
          value: ownValue ?? "N/A",
          percentile: outcome.percentile,
          relativeWeight: WINDOW_WEIGHTS[window],
          pointsAwarded: computeTraceEntryPoints(
            groupMaxWeight,
            WINDOW_WEIGHTS[window],
            outcome.percentile,
          ),
          source: "DEFILLAMA",
          sourceTimestamp: sourceTimestamp ? sourceTimestamp.toISOString() : null,
          dataQuality,
          note:
            dataQuality !== "VALID"
              ? `${metric} classificado como ${dataQuality} nesta execução`
              : ownValue === null
                ? "Sem histórico suficiente para esta janela"
                : null,
        });
      }

      return { percentiles, traceEntries, dataQuality, sourceTimestamp };
    }

    const tvlGroup = buildGrowthGroupPercentiles("tvl");
    const revenueGroup = buildGrowthGroupPercentiles("revenue");
    const feesGroup = buildGrowthGroupPercentiles("fees");

    // Efficiency: Revenue/TVL e Fees/TVL, percentile calculado sobre o ratio (não sobre o
    // growth) de todos os pares do setor.
    const ownRevenueToTvl = computeEfficiencyRatio(
      input.metrics.revenue.current,
      input.metrics.tvl.current,
    );
    const ownFeesToTvl = computeEfficiencyRatio(
      input.metrics.fees.current,
      input.metrics.tvl.current,
    );

    const revenueToTvlPeers: number[] = [];
    const feesToTvlPeers: number[] = [];
    for (const m of peerMetrics.values()) {
      const r = computeEfficiencyRatio(m.revenue.current, m.tvl.current);
      if (r !== null) revenueToTvlPeers.push(r);
      const f = computeEfficiencyRatio(m.fees.current, m.tvl.current);
      if (f !== null) feesToTvlPeers.push(f);
    }

    const revenueToTvlOutcome = computePercentileOutcome(ownRevenueToTvl, revenueToTvlPeers);
    const feesToTvlOutcome = computePercentileOutcome(ownFeesToTvl, feesToTvlPeers);
    if (revenueToTvlOutcome.attempted)
      percentileSampleOutcomes.push(revenueToTvlOutcome.hadEnoughPeers);
    if (feesToTvlOutcome.attempted) percentileSampleOutcomes.push(feesToTvlOutcome.hadEnoughPeers);

    const efficiencyTrace: TraceEntry[] = [
      {
        component: "EFFICIENCY_REVENUE_TO_TVL",
        metricLabel: "Revenue / TVL",
        value: ownRevenueToTvl ?? "N/A",
        percentile: revenueToTvlOutcome.percentile,
        relativeWeight: 0.5,
        pointsAwarded: computeTraceEntryPoints(
          FUNDAMENTAL_GROUP_WEIGHTS.EFFICIENCY,
          0.5,
          revenueToTvlOutcome.percentile,
        ),
        source: "DEFILLAMA",
        sourceTimestamp: revenueGroup.sourceTimestamp?.toISOString() ?? null,
        dataQuality: revenueGroup.dataQuality,
        note: ownRevenueToTvl === null ? "TVL ou Revenue indisponível para calcular o ratio" : null,
      },
      {
        component: "EFFICIENCY_FEES_TO_TVL",
        metricLabel: "Fees / TVL",
        value: ownFeesToTvl ?? "N/A",
        percentile: feesToTvlOutcome.percentile,
        relativeWeight: 0.5,
        pointsAwarded: computeTraceEntryPoints(
          FUNDAMENTAL_GROUP_WEIGHTS.EFFICIENCY,
          0.5,
          feesToTvlOutcome.percentile,
        ),
        source: "DEFILLAMA",
        sourceTimestamp: feesGroup.sourceTimestamp?.toISOString() ?? null,
        dataQuality: feesGroup.dataQuality,
        note: ownFeesToTvl === null ? "TVL ou Fees indisponível para calcular o ratio" : null,
      },
    ];

    const groups: FundamentalScoreGroups = {
      tvlGrowth: tvlGroup.percentiles,
      revenueGrowth: revenueGroup.percentiles,
      feesGrowth: feesGroup.percentiles,
      efficiency: {
        revenueToTvl: revenueToTvlOutcome.percentile,
        feesToTvl: feesToTvlOutcome.percentile,
      },
    };

    const scoreResult = computeFundamentalScore(groups);

    const metricQuality: Record<"tvl" | "revenue" | "fees", MetricQualityFlag> = {
      tvl: {
        available: input.metrics.tvl.current !== null,
        suspicious: input.quality.tvl.suspicious,
        invalidRejected: input.quality.tvl.invalidRejected,
        lastUpdatedAt: lastTimestamp(input.series.tvl),
      },
      revenue: {
        available: input.metrics.revenue.current !== null,
        suspicious: input.quality.revenue.suspicious,
        invalidRejected: input.quality.revenue.invalidRejected,
        lastUpdatedAt: lastTimestamp(input.series.revenue),
      },
      fees: {
        available: input.metrics.fees.current !== null,
        suspicious: input.quality.fees.suspicious,
        invalidRejected: input.quality.fees.invalidRejected,
        lastUpdatedAt: lastTimestamp(input.series.fees),
      },
    };

    const confidence = computeConfidence({ metricQuality, percentileSampleOutcomes, asOf });

    const breakdown = {
      scoreModelVersion: FUNDAMENTAL_SCORE_MODEL_VERSION,
      asOf: asOf.toISOString(),
      groups: {
        tvlGrowth: {
          maxWeight: FUNDAMENTAL_GROUP_WEIGHTS.TVL_GROWTH,
          score: scoreResult.groups.tvlGrowth.score,
        },
        revenueGrowth: {
          maxWeight: FUNDAMENTAL_GROUP_WEIGHTS.REVENUE_GROWTH,
          score: scoreResult.groups.revenueGrowth.score,
        },
        feesGrowth: {
          maxWeight: FUNDAMENTAL_GROUP_WEIGHTS.FEES_GROWTH,
          score: scoreResult.groups.feesGrowth.score,
        },
        efficiency: {
          maxWeight: FUNDAMENTAL_GROUP_WEIGHTS.EFFICIENCY,
          score: scoreResult.groups.efficiency.score,
        },
      },
      missingGroups: scoreResult.missingGroups,
      trace: [
        ...tvlGroup.traceEntries,
        ...revenueGroup.traceEntries,
        ...feesGroup.traceEntries,
        ...efficiencyTrace,
      ],
    };

    const record = await prisma.fundamentalScore.create({
      data: {
        researchRunId: input.researchRunId,
        projectId: input.projectId,
        scoreModelVersion: FUNDAMENTAL_SCORE_MODEL_VERSION,
        totalScore: scoreResult.totalScore,
        maxScore: scoreResult.maxScore,
        confidence,
        partial: scoreResult.partial,
        // Prisma exige um tipo JSON estrito (sem `undefined`/tipos de classe); o
        // round-trip por JSON garante compatibilidade com `InputJsonValue`.
        breakdown: JSON.parse(JSON.stringify(breakdown)),
      },
    });

    logScoringEvent("scoring.project_completed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      modelVersion: FUNDAMENTAL_SCORE_MODEL_VERSION,
      totalScore: scoreResult.totalScore,
      confidence,
    });

    return {
      id: record.id,
      totalScore: scoreResult.totalScore,
      maxScore: scoreResult.maxScore,
      confidence,
      partial: scoreResult.partial,
      scoreModelVersion: FUNDAMENTAL_SCORE_MODEL_VERSION,
    };
  } catch (err) {
    logScoringEvent("scoring.project_failed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
    throw err;
  }
}

export async function getLatestFundamentalScore(projectId: string) {
  return prisma.fundamentalScore.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFundamentalScoreHistory(projectId: string) {
  return prisma.fundamentalScore.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

/** Fase 20: ranking ordenado pelo Score mais recente de cada projeto. */
export async function getFundamentalRanking(): Promise<
  Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    totalScore: number;
    maxScore: number;
    confidence: number;
    createdAt: Date;
  }>
> {
  const projects = await prisma.project.findMany({
    include: {
      sector: true,
      fundamentalScores: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const withScore: Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    totalScore: number;
    maxScore: number;
    confidence: number;
    createdAt: Date;
  }> = [];

  for (const p of projects) {
    const latest = p.fundamentalScores[0];
    if (!latest) continue;
    withScore.push({
      projectId: p.id,
      slug: p.slug,
      name: p.name,
      sectorName: p.sector.name,
      totalScore: Number(latest.totalScore),
      maxScore: Number(latest.maxScore),
      confidence: Number(latest.confidence),
      createdAt: latest.createdAt,
    });
  }

  return withScore.sort((a, b) => b.totalScore - a.totalScore);
}

/** Capital Ranking: mesmo shape/filosofia de `getFundamentalRanking`, ordenado pelo
 * Institutional Capital Score mais recente de cada projeto (ver TUTORIAL.md seção 16). */
export async function getCapitalRanking(): Promise<
  Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    totalScore: number;
    maxScore: number;
    confidence: number;
    createdAt: Date;
  }>
> {
  const projects = await prisma.project.findMany({
    include: {
      sector: true,
      institutionalCapitalScores: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const withScore: Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    totalScore: number;
    maxScore: number;
    confidence: number;
    createdAt: Date;
  }> = [];

  for (const p of projects) {
    const latest = p.institutionalCapitalScores[0];
    if (!latest) continue;
    withScore.push({
      projectId: p.id,
      slug: p.slug,
      name: p.name,
      sectorName: p.sector.name,
      totalScore: Number(latest.totalScore),
      maxScore: Number(latest.maxScore),
      confidence: Number(latest.confidence),
      createdAt: latest.createdAt,
    });
  }

  return withScore.sort((a, b) => b.totalScore - a.totalScore);
}

/** Growth Ranking: ordenado pelo growth30d de TVL de cada projeto (mesma convenção de
 * `calculateGrowth`: pontos percentuais, não fração). Projetos sem série de TVL suficiente
 * para calcular growth30d (retorno "N/A") são excluídos, nunca tratados como 0 (seção 22/49:
 * "não transformar ausência de dado em zero" — mesma regra de `priority.ts`). */
export async function getGrowthRanking(): Promise<
  Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    growth30d: number;
    createdAt: Date;
  }>
> {
  const projects = await prisma.project.findMany({ include: { sector: true } });

  const withGrowth: Array<{
    projectId: string;
    slug: string;
    name: string;
    sectorName: string;
    growth30d: number;
    createdAt: Date;
  }> = [];

  for (const p of projects) {
    const series = await loadSeries("TVL", p.id);
    if (series.length === 0) continue;
    const metrics = calculateWindowMetrics(series);
    if (metrics.growth30d === "N/A") continue;
    const latestTimestamp = series[series.length - 1]!.sourceTimestamp;
    withGrowth.push({
      projectId: p.id,
      slug: p.slug,
      name: p.name,
      sectorName: p.sector.name,
      growth30d: metrics.growth30d,
      createdAt: latestTimestamp,
    });
  }

  return withGrowth.sort((a, b) => b.growth30d - a.growth30d);
}
