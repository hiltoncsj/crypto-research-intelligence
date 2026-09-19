import { prisma } from "@crypto-research/database";
import type { GrowthResult } from "@crypto-research/shared";

import { computeFundingAggregates } from "./funding-repository";
import { logHistoryEvent } from "./logger";
import { calculateGrowthForWindow, getCurrentValue, type TimeSeriesEntry } from "./metrics";
import { loadSeries } from "./snapshot-repository";

// Sprint 9 — Research History (ver RESEARCH_HISTORY_SPEC.md). Agrega dados JÁ PERSISTIDOS
// (snapshots + scores) em janelas de tempo — nenhuma nova fonte de dado, nenhuma chamada
// externa nova (seção 3/39: "não criar uma nova fonte de dados", "não realizar novas chamadas
// DefiLlama ao gerar o relatório/histórico").

export const HISTORY_WINDOW_DAYS = { "7d": 7, "30d": 30, "90d": 90, "180d": 180 } as const;
export type HistoryWindowKey = keyof typeof HISTORY_WINDOW_DAYS;

export interface MetricSeriesPoint {
  observedAt: string;
  value: number;
}

export interface WindowMetricGrowth {
  /** Pontos percentuais (convenção de `calculateGrowth`): 35 = +35%. "N/A" quando não há dado
   * de referência suficiente para a janela — nunca 0 (seção 8: "não assumir 0 quando o valor é
   * desconhecido"). */
  changePct: GrowthResult;
}

export interface HistoryWindowView {
  tvl: WindowMetricGrowth;
  revenue: WindowMetricGrowth;
  fees: WindowMetricGrowth;
  /** `null` quando não há Score de referência naquela janela (projeto novo, ou Score não
   * calculado há tempo suficiente) — nunca 0. */
  fundamentalScoreChange: number | null;
  tokenomicsScoreChange: number | null;
  capitalScoreChange: number | null;
}

export interface ScoreCurrentView {
  totalScore: number;
  maxScore: number;
  confidence: number;
  scoreModelVersion: string;
  researchRunId: string;
  createdAt: string;
}

export interface ProjectHistory {
  project: { slug: string; name: string };
  generatedAt: string;
  current: {
    tvl: { value: number | null; asOf: string | null };
    revenue: { value: number | null; asOf: string | null };
    fees: { value: number | null; asOf: string | null };
    marketCapUsd: number | null;
    fundamentalScore: ScoreCurrentView | null;
    tokenomicsScore: ScoreCurrentView | null;
    capitalScore: ScoreCurrentView | null;
    capital: {
      totalKnownCapitalUsd: number | null;
      distinctInvestorCount: number;
      daysSinceLastRaise: number | null;
      roundCount: number;
    };
  };
  windows: Record<HistoryWindowKey, HistoryWindowView>;
  series: {
    tvl: MetricSeriesPoint[];
    revenue: MetricSeriesPoint[];
    fees: MetricSeriesPoint[];
    fundamentalScore: Array<{ observedAt: string; value: number; researchRunId: string }>;
  };
}

function toSeries(points: { sourceTimestamp: Date; valueUsd: number }[]): MetricSeriesPoint[] {
  return points.map((p) => ({ observedAt: p.sourceTimestamp.toISOString(), value: p.valueUsd }));
}

function toTimeSeriesEntry(
  points: { sourceTimestamp: Date; valueUsd: number }[],
): TimeSeriesEntry[] {
  return points.map((p) => ({ sourceTimestamp: p.sourceTimestamp, valueUsd: p.valueUsd }));
}

function latestObservedAt(series: TimeSeriesEntry[]): string | null {
  if (series.length === 0) return null;
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  return sorted[sorted.length - 1]!.sourceTimestamp.toISOString();
}

/** Acha, dentro de um histórico de score ordenado por `createdAt` DESC, a linha mais próxima
 * (mas não posterior) a `targetDate` — mesmo princípio de `findValueAt` em metrics.ts, aplicado
 * a scores em vez de snapshots. */
function findScoreAt<T extends { createdAt: Date; totalScore: unknown }>(
  historyDesc: T[],
  targetDate: Date,
): T | null {
  for (const row of historyDesc) {
    if (row.createdAt.getTime() <= targetDate.getTime()) return row;
  }
  return null;
}

function scoreDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 100) / 100;
}

function toScoreCurrentView(
  row: {
    researchRunId: string;
    scoreModelVersion: string;
    totalScore: unknown;
    maxScore: unknown;
    confidence: unknown;
    createdAt: Date;
  } | null,
): ScoreCurrentView | null {
  if (!row) return null;
  return {
    totalScore: Number(row.totalScore),
    maxScore: Number(row.maxScore),
    confidence: Number(row.confidence),
    scoreModelVersion: row.scoreModelVersion,
    researchRunId: row.researchRunId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getProjectHistory(slug: string): Promise<ProjectHistory | null> {
  logHistoryEvent("history.requested", { slug });

  const project = await prisma.project.findUnique({ where: { slug }, include: { token: true } });
  if (!project) return null;

  const asOf = new Date();
  const day = 24 * 60 * 60 * 1000;

  const [
    tvlPoints,
    revenuePoints,
    feesPoints,
    fundamentalHistory,
    tokenomicsHistory,
    capitalHistory,
    fundingAggregates,
  ] = await Promise.all([
    loadSeries("TVL", project.id),
    loadSeries("REVENUE", project.id),
    loadSeries("FEES", project.id),
    prisma.fundamentalScore.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tokenomicsScore.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.institutionalCapitalScore.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    }),
    computeFundingAggregates(project.id, asOf),
  ]);

  const tvlSeries = toTimeSeriesEntry(tvlPoints);
  const revenueSeries = toTimeSeriesEntry(revenuePoints);
  const feesSeries = toTimeSeriesEntry(feesPoints);

  const currentFundamental = fundamentalHistory[0] ?? null;
  const currentTokenomics = tokenomicsHistory[0] ?? null;
  const currentCapital = capitalHistory[0] ?? null;

  const windows = Object.fromEntries(
    (Object.entries(HISTORY_WINDOW_DAYS) as Array<[HistoryWindowKey, number]>).map(
      ([key, days]) => {
        const targetDate = new Date(asOf.getTime() - days * day);
        const fundamentalAt = findScoreAt(fundamentalHistory, targetDate);
        const tokenomicsAt = findScoreAt(tokenomicsHistory, targetDate);
        const capitalAt = findScoreAt(capitalHistory, targetDate);

        const view: HistoryWindowView = {
          tvl: { changePct: calculateGrowthForWindow(tvlSeries, days, asOf) },
          revenue: { changePct: calculateGrowthForWindow(revenueSeries, days, asOf) },
          fees: { changePct: calculateGrowthForWindow(feesSeries, days, asOf) },
          fundamentalScoreChange: scoreDelta(
            currentFundamental ? Number(currentFundamental.totalScore) : null,
            fundamentalAt ? Number(fundamentalAt.totalScore) : null,
          ),
          tokenomicsScoreChange: scoreDelta(
            currentTokenomics ? Number(currentTokenomics.totalScore) : null,
            tokenomicsAt ? Number(tokenomicsAt.totalScore) : null,
          ),
          capitalScoreChange: scoreDelta(
            currentCapital ? Number(currentCapital.totalScore) : null,
            capitalAt ? Number(capitalAt.totalScore) : null,
          ),
        };
        return [key, view];
      },
    ),
  ) as Record<HistoryWindowKey, HistoryWindowView>;

  logHistoryEvent("history.completed", {
    slug,
    projectId: project.id,
    researchRunId: currentFundamental?.researchRunId ?? null,
    windows: Object.keys(HISTORY_WINDOW_DAYS),
    pointCount: tvlSeries.length + revenueSeries.length + feesSeries.length,
  });

  return {
    project: { slug: project.slug, name: project.name },
    generatedAt: asOf.toISOString(),
    current: {
      tvl: { value: getCurrentValue(tvlSeries), asOf: latestObservedAt(tvlSeries) },
      revenue: { value: getCurrentValue(revenueSeries), asOf: latestObservedAt(revenueSeries) },
      fees: { value: getCurrentValue(feesSeries), asOf: latestObservedAt(feesSeries) },
      marketCapUsd: project.token?.marketCapUsd ? Number(project.token.marketCapUsd) : null,
      fundamentalScore: toScoreCurrentView(currentFundamental),
      tokenomicsScore: toScoreCurrentView(currentTokenomics),
      capitalScore: toScoreCurrentView(currentCapital),
      capital: fundingAggregates,
    },
    windows,
    series: {
      tvl: toSeries(tvlPoints),
      revenue: toSeries(revenuePoints),
      fees: toSeries(feesPoints),
      fundamentalScore: fundamentalHistory
        .slice()
        .reverse()
        .map((s) => ({
          observedAt: s.createdAt.toISOString(),
          value: Number(s.totalScore),
          researchRunId: s.researchRunId,
        })),
    },
  };
}
