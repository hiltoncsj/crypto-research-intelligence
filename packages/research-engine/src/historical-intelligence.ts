import { prisma } from "@crypto-research/database";
import {
  classifyAcceleration,
  classifyFundamentalPriceDivergence,
  classifyFundamentalRegime,
  compareGrowth,
  computeCorrelation,
  computeFundamentalMomentum,
  computeValuationRatio,
  detectLeadLag,
  FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION,
  type AccelerationResult,
  type CorrelationResult,
  type FundamentalMomentumResult,
  type FundamentalPriceDivergenceResult,
  type FundamentalRegime,
  type GrowthComparisonResult,
  type LeadLagResult,
} from "@crypto-research/scoring-engine";
import type { GrowthResult } from "@crypto-research/shared";

import { logHistoricalIntelligenceEvent } from "./logger";
import { loadMarketDataSeries, type MarketDataSeriesPoint } from "./market-data-repository";
import {
  calculateGrowthForWindow,
  calculateGrowthWindowPair,
  type TimeSeriesEntry,
} from "./metrics";
import { loadSeries, type PersistedPoint } from "./snapshot-repository";

// Sprint 14 — Historical Fundamental Intelligence (ver SPRINT_14_IMPLEMENTATION_REPORT.md).
// Transforma os snapshots já persistidos (TVL/Revenue/Fees desde o Sprint 3, Price/MarketCap/
// Volume desde o Sprint 12) em análises temporais — NENHUMA chamada externa nova, NENHUM dado
// inventado. Camada puramente de LEITURA e cálculo: nenhuma função aqui escreve no banco.
//
// DECISÃO ARQUITETURAL (seção 15 do Sprint 14 — "verificar se pode ser calculado on-demand"):
// tudo aqui é calculado SOB DEMANDA a partir dos snapshots existentes, sem nenhuma tabela nova.
// Justificativa: (a) o volume de pontos por projeto é pequeno (até 365 snapshots diários por
// série, Sprint 12), a matemática é O(n) ou O(n·lag) para lead-lag — barato o suficiente para
// computar a cada chamada, mesmo padrão já usado por `history.ts`/`report.ts` (Sprint 9); (b)
// persistir um "HistoricalFundamentalSnapshot" duplicaria dado que já existe nos snapshots
// brutos, sem nenhum benefício de consulta que o cálculo on-demand não ofereça hoje; (c) manter
// tudo derivado (nunca armazenado) garante que uma correção na fórmula se reflita
// imediatamente em toda consulta futura, sem precisar de um backfill.

export const HISTORICAL_INTELLIGENCE_MODEL_VERSION = FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION;

// ------------------------------------------------------------------------------------------
// Parte 2 — Inventário real de cobertura histórica.
// ------------------------------------------------------------------------------------------

export interface SeriesCoverage {
  snapshots: number;
  oldest: string | null;
  newest: string | null;
}

export interface DataCoverageReport {
  tvl: SeriesCoverage;
  revenue: SeriesCoverage;
  fees: SeriesCoverage;
  marketData: SeriesCoverage; // price/marketCap/volume vêm da MESMA tabela (MarketDataSnapshot)
}

function coverageFromSnapshotSeries(points: PersistedPoint[]): SeriesCoverage {
  if (points.length === 0) return { snapshots: 0, oldest: null, newest: null };
  const sorted = [...points].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  return {
    snapshots: points.length,
    oldest: sorted[0]!.sourceTimestamp.toISOString(),
    newest: sorted[sorted.length - 1]!.sourceTimestamp.toISOString(),
  };
}

function coverageFromMarketDataSeries(points: MarketDataSeriesPoint[]): SeriesCoverage {
  if (points.length === 0) return { snapshots: 0, oldest: null, newest: null };
  return {
    snapshots: points.length,
    oldest: points[0]!.sourceTimestamp.toISOString(),
    newest: points[points.length - 1]!.sourceTimestamp.toISOString(),
  };
}

// ------------------------------------------------------------------------------------------
// Séries auxiliares — conversão de MarketDataSnapshot (3 valores por ponto) para 3 séries
// TimeSeriesEntry independentes (price/marketCap/volume), reaproveitando exatamente a mesma
// matemática de metrics.ts já usada para TVL/Revenue/Fees. Pontos com o valor específico ausente
// (null) são simplesmente omitidos daquela série — nunca convertidos para 0.
// ------------------------------------------------------------------------------------------

// Exportadas (Sprint 16): event-impact-engine.ts reaproveita exatamente estas mesmas conversões
// em vez de duplicar a lógica de "MarketDataSnapshot -> 3 séries independentes".
export function toPriceSeries(points: MarketDataSeriesPoint[]): TimeSeriesEntry[] {
  return points
    .filter((p): p is MarketDataSeriesPoint & { priceUsd: number } => p.priceUsd !== null)
    .map((p) => ({ sourceTimestamp: p.sourceTimestamp, valueUsd: p.priceUsd }));
}

export function toMarketCapSeries(points: MarketDataSeriesPoint[]): TimeSeriesEntry[] {
  return points
    .filter((p): p is MarketDataSeriesPoint & { marketCapUsd: number } => p.marketCapUsd !== null)
    .map((p) => ({ sourceTimestamp: p.sourceTimestamp, valueUsd: p.marketCapUsd }));
}

export function toVolumeSeries(points: MarketDataSeriesPoint[]): TimeSeriesEntry[] {
  return points
    .filter((p): p is MarketDataSeriesPoint & { volumeUsd: number } => p.volumeUsd !== null)
    .map((p) => ({ sourceTimestamp: p.sourceTimestamp, valueUsd: p.volumeUsd }));
}

/** Alinha duas séries por DIA (UTC, truncado) — só os dias presentes nas DUAS séries entram no
 * resultado. Usado por correlação/leading-lagging, que exigem observações pareadas no tempo
 * (seção 12/13 do Sprint 14). Nunca interpola/inventa um dia ausente numa das séries. */
function alignDailySeries(
  a: TimeSeriesEntry[],
  b: TimeSeriesEntry[],
): { alignedA: number[]; alignedB: number[]; days: string[] } {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const mapA = new Map<string, number>();
  for (const p of a) mapA.set(dayKey(p.sourceTimestamp), p.valueUsd);
  const mapB = new Map<string, number>();
  for (const p of b) mapB.set(dayKey(p.sourceTimestamp), p.valueUsd);

  const commonDays = [...mapA.keys()].filter((d) => mapB.has(d)).sort();
  return {
    alignedA: commonDays.map((d) => mapA.get(d)!),
    alignedB: commonDays.map((d) => mapB.get(d)!),
    days: commonDays,
  };
}

// ------------------------------------------------------------------------------------------
// Resultado principal.
// ------------------------------------------------------------------------------------------

export interface GrowthWindowsResult {
  "7d": GrowthResult;
  "30d": GrowthResult;
  "90d": GrowthResult;
  "180d": GrowthResult;
  "365d": GrowthResult;
}

export interface FundamentalHistoricalIntelligence {
  modelVersion: string;
  generatedAt: string;
  coverage: DataCoverageReport;
  growth: {
    tvl: GrowthWindowsResult;
    revenue: GrowthWindowsResult;
    fees: GrowthWindowsResult;
    price: GrowthWindowsResult;
    marketCap: GrowthWindowsResult;
    volume: GrowthWindowsResult;
  };
  acceleration: { tvl: AccelerationResult; revenue: AccelerationResult };
  fundamentalMomentum: FundamentalMomentumResult;
  marketVsFundamentals: {
    marketCapVsTvl: GrowthComparisonResult;
    marketCapVsRevenue: GrowthComparisonResult;
  };
  revenueVsTvl: GrowthComparisonResult;
  fundamentalPriceDivergence: FundamentalPriceDivergenceResult;
  valuationRatios: {
    marketCapToTvl: number | null;
    marketCapToRevenue: number | null;
    fdvToRevenue: number | null;
    marketCapToFees: number | null;
  };
  correlation: {
    marketCapVsTvl: CorrelationResult;
    marketCapVsRevenue: CorrelationResult;
    priceVsTvl: CorrelationResult;
    volumeVsTvl: CorrelationResult;
  };
  leadLag: {
    tvlVsMarketCap: LeadLagResult;
  };
  regime: FundamentalRegime;
}

/**
 * Calcula a Inteligência Fundamental Histórica de um projeto, inteiramente a partir de
 * snapshots já persistidos. Nunca lança — projeto sem nenhum histórico retorna um resultado
 * com tudo `N/A`/`INSUFFICIENT_DATA`, nunca um erro (mesmo contrato do resto do research-engine:
 * "uma falha em um projeto não interrompe os demais").
 */
export async function computeFundamentalHistoricalIntelligence(
  projectId: string,
  slug: string,
  asOf: Date = new Date(),
): Promise<FundamentalHistoricalIntelligence> {
  logHistoricalIntelligenceEvent("historical_intelligence.requested", { slug, projectId });

  try {
    const [tvlPoints, revenuePoints, feesPoints, marketDataPoints, token] = await Promise.all([
      loadSeries("TVL", projectId),
      loadSeries("REVENUE", projectId),
      loadSeries("FEES", projectId),
      loadMarketDataSeries(projectId),
      prisma.token.findUnique({ where: { projectId } }),
    ]);

    const tvlSeries: TimeSeriesEntry[] = tvlPoints.map((p) => ({
      sourceTimestamp: p.sourceTimestamp,
      valueUsd: p.valueUsd,
    }));
    const revenueSeries: TimeSeriesEntry[] = revenuePoints.map((p) => ({
      sourceTimestamp: p.sourceTimestamp,
      valueUsd: p.valueUsd,
    }));
    const feesSeries: TimeSeriesEntry[] = feesPoints.map((p) => ({
      sourceTimestamp: p.sourceTimestamp,
      valueUsd: p.valueUsd,
    }));
    const priceSeries = toPriceSeries(marketDataPoints);
    const marketCapSeries = toMarketCapSeries(marketDataPoints);
    const volumeSeries = toVolumeSeries(marketDataPoints);

    const windows = (series: TimeSeriesEntry[]): GrowthWindowsResult => ({
      "7d": calculateGrowthForWindow(series, 7, asOf),
      "30d": calculateGrowthForWindow(series, 30, asOf),
      "90d": calculateGrowthForWindow(series, 90, asOf),
      "180d": calculateGrowthForWindow(series, 180, asOf),
      "365d": calculateGrowthForWindow(series, 365, asOf),
    });

    const growth = {
      tvl: windows(tvlSeries),
      revenue: windows(revenueSeries),
      fees: windows(feesSeries),
      price: windows(priceSeries),
      marketCap: windows(marketCapSeries),
      volume: windows(volumeSeries),
    };

    // Aceleração (Parte 5): compara growth30d atual vs growth30d da janela comparável anterior.
    const tvlGrowthPair = calculateGrowthWindowPair(tvlSeries, 30, asOf);
    const revenueGrowthPair = calculateGrowthWindowPair(revenueSeries, 30, asOf);
    const acceleration = {
      tvl: classifyAcceleration(tvlGrowthPair.current, tvlGrowthPair.previousComparable),
      revenue: classifyAcceleration(
        revenueGrowthPair.current,
        revenueGrowthPair.previousComparable,
      ),
    };

    // Fundamental Momentum (Parte 6).
    const fundamentalMomentum = computeFundamentalMomentum({
      tvlGrowth30d: growth.tvl["30d"],
      revenueGrowth30d: growth.revenue["30d"],
      feesGrowth30d: growth.fees["30d"],
      volumeGrowth30d: growth.volume["30d"],
    });

    // Market vs Fundamentals (Parte 7) e Revenue vs TVL (Parte 10) — janela de 90d.
    const marketVsFundamentals = {
      marketCapVsTvl: compareGrowth(growth.marketCap["90d"], growth.tvl["90d"]),
      marketCapVsRevenue: compareGrowth(growth.marketCap["90d"], growth.revenue["90d"]),
    };
    const revenueVsTvl = compareGrowth(growth.revenue["90d"], growth.tvl["90d"]);

    // Fundamental vs Price Divergence (Parte 9).
    const fundamentalPriceDivergence = classifyFundamentalPriceDivergence(
      fundamentalMomentum.score,
      growth.price["30d"],
    );

    // Valuation ratios (Parte 11) — sobre o valor ATUAL de cada série, nunca fabricando FDV
    // histórico (fdvUsd vem só do snapshot atual de Token, Sprint 11/12 — sem série histórica).
    const currentMarketCap =
      marketCapSeries.length > 0 ? marketCapSeries[marketCapSeries.length - 1]!.valueUsd : null;
    const currentTvl = tvlSeries.length > 0 ? tvlSeries[tvlSeries.length - 1]!.valueUsd : null;
    const currentRevenue =
      revenueSeries.length > 0 ? revenueSeries[revenueSeries.length - 1]!.valueUsd : null;
    const currentFees = feesSeries.length > 0 ? feesSeries[feesSeries.length - 1]!.valueUsd : null;
    const currentFdv = token?.fdvUsd ? Number(token.fdvUsd) : null;

    const valuationRatios = {
      marketCapToTvl: computeValuationRatio(currentMarketCap, currentTvl),
      marketCapToRevenue: computeValuationRatio(currentMarketCap, currentRevenue),
      fdvToRevenue: computeValuationRatio(currentFdv, currentRevenue),
      marketCapToFees: computeValuationRatio(currentMarketCap, currentFees),
    };

    // Correlação (Parte 12) — séries alinhadas por dia.
    const mcVsTvlAligned = alignDailySeries(marketCapSeries, tvlSeries);
    const mcVsRevenueAligned = alignDailySeries(marketCapSeries, revenueSeries);
    const priceVsTvlAligned = alignDailySeries(priceSeries, tvlSeries);
    const volumeVsTvlAligned = alignDailySeries(volumeSeries, tvlSeries);

    const correlation = {
      marketCapVsTvl: computeCorrelation(mcVsTvlAligned.alignedA, mcVsTvlAligned.alignedB),
      marketCapVsRevenue: computeCorrelation(
        mcVsRevenueAligned.alignedA,
        mcVsRevenueAligned.alignedB,
      ),
      priceVsTvl: computeCorrelation(priceVsTvlAligned.alignedA, priceVsTvlAligned.alignedB),
      volumeVsTvl: computeCorrelation(volumeVsTvlAligned.alignedA, volumeVsTvlAligned.alignedB),
    };

    // Leading/Lagging (Parte 13) — TVL vs Market Cap, séries alinhadas por dia.
    const leadLag = {
      tvlVsMarketCap: detectLeadLag(mcVsTvlAligned.alignedB, mcVsTvlAligned.alignedA, 30),
    };

    // Fundamental Regime (Parte 14).
    const regime = classifyFundamentalRegime(
      growth.tvl["30d"],
      acceleration.tvl.regime,
      growth.revenue["30d"],
    );

    const result: FundamentalHistoricalIntelligence = {
      modelVersion: HISTORICAL_INTELLIGENCE_MODEL_VERSION,
      generatedAt: asOf.toISOString(),
      coverage: {
        tvl: coverageFromSnapshotSeries(tvlPoints),
        revenue: coverageFromSnapshotSeries(revenuePoints),
        fees: coverageFromSnapshotSeries(feesPoints),
        marketData: coverageFromMarketDataSeries(marketDataPoints),
      },
      growth,
      acceleration,
      fundamentalMomentum,
      marketVsFundamentals,
      revenueVsTvl,
      fundamentalPriceDivergence,
      valuationRatios,
      correlation,
      leadLag,
      regime,
    };

    logHistoricalIntelligenceEvent("historical_intelligence.completed", {
      slug,
      projectId,
      tvlPoints: tvlPoints.length,
      marketDataPoints: marketDataPoints.length,
      regime,
    });

    return result;
  } catch (err) {
    logHistoricalIntelligenceEvent("historical_intelligence.failed", {
      slug,
      projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
    throw err;
  }
}
