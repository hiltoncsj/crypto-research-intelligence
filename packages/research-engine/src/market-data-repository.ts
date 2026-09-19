import {
  DataQuality as PrismaDataQuality,
  prisma,
  SnapshotSource as PrismaSnapshotSource,
} from "@crypto-research/database";
import { getCoinMarketChart, type NormalizedMarketDataPoint } from "@crypto-research/defi-data";

import { logMarketDataEvent } from "./logger";
import { validateMarketDataPoint } from "./validator";

// Sprint 12 (Historical Market Data) — fundação de dados para Trading Intelligence/Backtesting
// futuros (ver PROJECT_GAP_ANALYSIS.md). Mesma separação de camadas de snapshot-repository.ts:
// esta é a única camada que fala com o Prisma para MarketDataSnapshot. Nunca inventa dado — só
// persiste o que `getCoinMarketChart` (packages/defi-data) de fato normalizou da CoinGecko.

export interface MarketDataPersistResult {
  created: number;
  skippedDuplicate: number;
  rejectedInvalid: number;
  suspicious: number;
}

async function findExisting(projectId: string, sourceTimestamp: Date) {
  return prisma.marketDataSnapshot.findUnique({
    where: {
      market_data_snapshot_dedupe: {
        projectId,
        source: PrismaSnapshotSource.COINGECKO,
        sourceTimestamp,
      },
    },
  });
}

/**
 * Persiste uma série inteira de pontos de mercado, ponto a ponto — idempotente (dedupe por
 * projectId+source+sourceTimestamp, mesmo padrão de persistSnapshotSeries) e INSERT-only: uma
 * segunda chamada com os MESMOS pontos não duplica nem sobrescreve nenhuma linha já persistida
 * (seção 12/13 do Sprint 12: "histórico não deve ser destruído").
 */
export async function persistMarketDataSeries(
  projectId: string,
  points: NormalizedMarketDataPoint[],
): Promise<MarketDataPersistResult> {
  let created = 0;
  let skippedDuplicate = 0;
  let rejectedInvalid = 0;
  let suspicious = 0;
  let previousPriceUsd: number | null = null;

  for (const point of points) {
    const validation = validateMarketDataPoint(point, previousPriceUsd);

    if (validation.status === "MISSING") {
      continue;
    }
    if (validation.status === "INVALID") {
      rejectedInvalid += 1;
      continue;
    }

    const sourceTimestamp = new Date(point.sourceTimestamp);
    const existing = await findExisting(projectId, sourceTimestamp);
    if (existing) {
      skippedDuplicate += 1;
      // Ponto já persistido não atualiza `previousPriceUsd` a partir do payload novo — a
      // detecção de anomalia da série compara sempre ao ponto ANTERIOR DA PRÓPRIA RESPOSTA
      // (mesma regra de persistSnapshotSeries), não ao que já está no banco.
      if (point.priceUsd !== null) previousPriceUsd = point.priceUsd;
      continue;
    }

    const quality =
      validation.status === "VALID" ? PrismaDataQuality.VALID : PrismaDataQuality.SUSPICIOUS;
    const qualityReason = validation.status === "SUSPICIOUS" ? validation.reason : null;

    await prisma.marketDataSnapshot.create({
      data: {
        projectId,
        priceUsd: point.priceUsd,
        marketCapUsd: point.marketCapUsd,
        volumeUsd: point.volumeUsd,
        source: PrismaSnapshotSource.COINGECKO,
        sourceTimestamp,
        retrievedAt: new Date(point.retrievedAt),
        quality,
        qualityReason,
      },
    });
    created += 1;
    if (validation.status === "SUSPICIOUS") suspicious += 1;
    if (point.priceUsd !== null) previousPriceUsd = point.priceUsd;
  }

  return { created, skippedDuplicate, rejectedInvalid, suspicious };
}

export type MarketDataCollectionOutcome =
  | { status: "SKIPPED_NO_COINGECKO_ID" }
  | { status: "FAILED"; error: string }
  | ({ status: "COLLECTED" } & MarketDataPersistResult);

/**
 * Coleta e persiste a série histórica de mercado de UM projeto. Nunca lança — isolamento total
 * por projeto (seção 17 do Sprint 12: "um projeto que falha não deve derrubar todo o Research
 * Run"), mesmo contrato de runPipelineForProject/getCoinMarketData: falha vira um resultado
 * `FAILED` explícito, nunca uma exceção não tratada.
 */
export async function collectMarketDataForProject(
  projectId: string,
  slug: string,
  coinGeckoId: string | null,
  apiKey?: string | null,
): Promise<MarketDataCollectionOutcome> {
  if (!coinGeckoId) {
    logMarketDataEvent("market_data.skipped_no_coingecko_id", { slug, projectId });
    return { status: "SKIPPED_NO_COINGECKO_ID" };
  }

  const startedAt = Date.now();
  try {
    const result = await getCoinMarketChart(coinGeckoId, apiKey);

    if (result.raw.error || result.normalized === null) {
      logMarketDataEvent("market_data.failed", {
        slug,
        projectId,
        coinGeckoId,
        error: result.raw.error ?? "Resposta vazia/malformada",
        durationMs: Date.now() - startedAt,
      });
      return { status: "FAILED", error: result.raw.error ?? "Resposta vazia/malformada" };
    }

    const persistResult = await persistMarketDataSeries(projectId, result.normalized);
    logMarketDataEvent("market_data.collected", {
      slug,
      projectId,
      coinGeckoId,
      recordsReceived: result.normalized.length,
      ...persistResult,
      durationMs: Date.now() - startedAt,
    });
    return { status: "COLLECTED", ...persistResult };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro desconhecido";
    logMarketDataEvent("market_data.failed", {
      slug,
      projectId,
      coinGeckoId,
      error,
      durationMs: Date.now() - startedAt,
    });
    return { status: "FAILED", error };
  }
}

/** "Quando esse projeto teve seu último dado de mercado coletado?" (seção 21 do Sprint 12) —
 * usado futuramente por freshness/observabilidade, sem exigir UI nesta sprint. */
export async function getLastMarketDataAt(projectId: string): Promise<Date | null> {
  const latest = await prisma.marketDataSnapshot.findFirst({
    where: { projectId },
    orderBy: { sourceTimestamp: "desc" },
    select: { sourceTimestamp: true },
  });
  return latest?.sourceTimestamp ?? null;
}

export interface MarketDataSeriesPoint {
  sourceTimestamp: Date;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volumeUsd: number | null;
}

// Sprint 14 (Historical Fundamental Intelligence): série completa de preço/market cap/volume de
// um projeto, ordenada por data — usada por historical-intelligence-repository.ts para growth/
// acceleration/correlation/leading-lagging. Mesmo padrão de `loadSeries` em
// snapshot-repository.ts (TVL/Revenue/Fees), mas devolvendo os 3 valores juntos (já que
// `MarketDataSnapshot` os persiste numa linha só — ver decisão arquitetural no schema.prisma).
export async function loadMarketDataSeries(projectId: string): Promise<MarketDataSeriesPoint[]> {
  const rows = await prisma.marketDataSnapshot.findMany({
    where: { projectId },
    orderBy: { sourceTimestamp: "asc" },
  });
  return rows.map((r) => ({
    sourceTimestamp: r.sourceTimestamp,
    priceUsd: r.priceUsd === null ? null : Number(r.priceUsd),
    marketCapUsd: r.marketCapUsd === null ? null : Number(r.marketCapUsd),
    volumeUsd: r.volumeUsd === null ? null : Number(r.volumeUsd),
  }));
}
