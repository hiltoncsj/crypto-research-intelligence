import type {
  NormalizedFundingRound,
  NormalizedMarketDataPoint,
  NormalizedMarketTicker,
  NormalizedProjectProfile,
  NormalizedProtocolMetricHistory,
  NormalizedProtocolSummary,
  NormalizedProtocolTvlHistory,
  NormalizedSecurityIncident,
  NormalizedTimeSeriesPoint,
  NormalizedTokenSummary,
  NormalizedTokenSupply,
  RawCoinGeckoMarketChart,
  RawCoinGeckoMarketData,
  RawDefiLlamaFeesSummary,
  RawDefiLlamaHack,
  RawDefiLlamaProtocol,
} from "./types";

// Sprint 2 (Fase 12): Adapter — External Response → Normalized Model. Não grava no banco
// (isso é responsabilidade de packages/research-engine a partir do Sprint 3); apenas
// traduz o formato específico do DefiLlama para um modelo estável e previsível.

function isRawProtocol(value: unknown): value is RawDefiLlamaProtocol {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).name === "string"
  );
}

export function normalizeProtocol(
  raw: unknown,
  retrievedAt: string,
): NormalizedProtocolSummary | null {
  if (!isRawProtocol(raw)) {
    return null;
  }

  return {
    source: "DEFILLAMA",
    retrievedAt,
    defillamaId: raw.id,
    name: raw.name,
    slug: raw.slug ?? raw.name.toLowerCase().replace(/\s+/g, "-"),
    symbol: raw.symbol ?? null,
    category: raw.category ?? null,
    chains: Array.isArray(raw.chains) ? raw.chains : [],
    tvlUsd: extractCurrentTvl(raw.tvl),
    coinGeckoId: raw.gecko_id ?? null,
  };
}

/**
 * `tvl` em /protocol/{name} pode vir como número (formato antigo/simplificado) ou como
 * série histórica `Array<{date, totalLiquidityUSD}>` — nesse caso, o valor "atual" é o
 * último ponto da série.
 */
function extractCurrentTvl(tvl: RawDefiLlamaProtocol["tvl"]): number | null {
  if (typeof tvl === "number") return tvl;
  if (Array.isArray(tvl) && tvl.length > 0) {
    const last = tvl[tvl.length - 1];
    return typeof last?.totalLiquidityUSD === "number" ? last.totalLiquidityUSD : null;
  }
  return null;
}

function unixSecondsToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Sprint 3 (Fase 4/12): extrai a série histórica de TVL de /protocol/{name}. Retorna null
 * quando a resposta não tem uma série utilizável (ex: `tvl` é só um número, ou está ausente) —
 * o chamador decide como tratar isso (não inventamos histórico).
 */
export function normalizeTvlHistory(
  raw: unknown,
  slug: string,
  retrievedAt: string,
): NormalizedProtocolTvlHistory | null {
  if (!isRawProtocol(raw) || !Array.isArray(raw.tvl)) {
    return null;
  }

  const points: NormalizedTimeSeriesPoint[] = raw.tvl
    .filter(
      (point): point is { date: number; totalLiquidityUSD: number } =>
        typeof point?.date === "number" && typeof point?.totalLiquidityUSD === "number",
    )
    .map((point) => ({
      sourceTimestamp: unixSecondsToIso(point.date),
      valueUsd: point.totalLiquidityUSD,
    }));

  return {
    source: "DEFILLAMA",
    retrievedAt,
    defillamaId: raw.id,
    slug,
    points,
  };
}

/**
 * Sprint 3 (Fase 4/12): extrai a série histórica de Fees ou Revenue de
 * /summary/fees/{protocol}[?dataType=dailyRevenue]. `totalDataChart` é um array de tuplas
 * `[unixSeconds, valueUsd]` — formato diferente do `tvl` de /protocol/{name} (que usa objetos).
 */
export function normalizeFeesSummary(
  raw: unknown,
  slug: string,
  metric: "FEES" | "REVENUE",
  retrievedAt: string,
): NormalizedProtocolMetricHistory | null {
  const payload = raw as RawDefiLlamaFeesSummary | null;
  if (!payload || !Array.isArray(payload.totalDataChart)) {
    return null;
  }

  const points: NormalizedTimeSeriesPoint[] = payload.totalDataChart
    .filter(
      (tuple): tuple is [number, number] =>
        Array.isArray(tuple) && typeof tuple[0] === "number" && typeof tuple[1] === "number",
    )
    .map(([unixSeconds, valueUsd]) => ({
      sourceTimestamp: unixSecondsToIso(unixSeconds),
      valueUsd,
    }));

  return { source: "DEFILLAMA", retrievedAt, slug, metric, points };
}

/**
 * Sprint 6 (Parte 2/3): extrai o resumo de token do MESMO payload de /protocol/{name} usado
 * por normalizeTvlHistory — nenhuma chamada HTTP adicional. `marketCapUsd` nunca é NaN/Infinity
 * (Parte 3): se `mcap` não for um número finito, vira null.
 */
export function normalizeTokenSummary(
  raw: unknown,
  slug: string,
  retrievedAt: string,
): NormalizedTokenSummary | null {
  if (!isRawProtocol(raw)) return null;

  return {
    source: "DEFILLAMA",
    retrievedAt,
    defillamaId: raw.id,
    slug,
    symbol: raw.symbol ?? null,
    contractAddress: raw.address ?? null,
    marketCapUsd: typeof raw.mcap === "number" && Number.isFinite(raw.mcap) ? raw.mcap : null,
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Sprint 11 (integração CoinGecko): extrai FDV/supplies de GET /coins/{id}. Cada campo vira
 * `null` individualmente quando ausente/não-finito — nunca 0, nunca um valor inventado, mesmo
 * que outros campos do mesmo payload estejam presentes.
 */
export function normalizeCoinGeckoMarketData(
  raw: unknown,
  coinGeckoId: string,
  retrievedAt: string,
): NormalizedTokenSupply | null {
  const payload = raw as RawCoinGeckoMarketData | null;
  if (!payload || typeof payload.id !== "string") return null;

  const marketData = payload.market_data ?? null;
  return {
    source: "COINGECKO",
    retrievedAt,
    coinGeckoId,
    fdvUsd: finiteOrNull(marketData?.fully_diluted_valuation?.usd),
    circulatingSupply: finiteOrNull(marketData?.circulating_supply),
    totalSupply: finiteOrNull(marketData?.total_supply),
    maxSupply: finiteOrNull(marketData?.max_supply),
    marketCapRank: finiteOrNull(payload.market_cap_rank),
  };
}

function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Sprint 13 (Perfil do Projeto): extrai descrição/categorias/blockchains/homepage do MESMO
 * payload de GET /coins/{id} usado por `normalizeCoinGeckoMarketData` — nenhuma chamada HTTP
 * extra. Preserva o texto da fonte tal como veio (nunca reescreve/resume com heurística própria
 * — isso seria "inventar", mesmo que pareça inofensivo); trunca só por tamanho de exibição, não
 * por reescrita de conteúdo. `platforms` preserva TODAS as chains onde o token existe
 * (multi-chain, seção 19 do Sprint 13) — a chave "" (contrato nativo sem endereço EVM) é
 * descartada por não ser uma blockchain.
 */
export function normalizeCoinGeckoProfile(
  raw: unknown,
  coinGeckoId: string,
  retrievedAt: string,
): NormalizedProjectProfile | null {
  const payload = raw as RawCoinGeckoMarketData | null;
  if (!payload || typeof payload.id !== "string") return null;

  const descriptionEn = nonEmptyString(payload.description?.en ?? null);
  const categories = (payload.categories ?? [])
    .map((c) => nonEmptyString(c))
    .filter((c): c is string => c !== null);
  const platforms = Object.keys(payload.platforms ?? {}).filter((chain) => chain.trim().length > 0);
  const homepageUrl = nonEmptyString(
    payload.links?.homepage?.find((u) => nonEmptyString(u)) ?? null,
  );

  return {
    source: "COINGECKO",
    retrievedAt,
    coinGeckoId,
    descriptionEn,
    categories,
    platforms,
    homepageUrl,
  };
}

/**
 * Sprint 13 (Onde o Token é Negociado): extrai os mercados reais do MESMO payload (com
 * `tickers=true` na query do client) — nenhuma chamada HTTP extra além da já feita. Descarta
 * silenciosamente tickers sem `base`/`target`/`market.identifier` (dado estruturalmente
 * inútil para identificar o mercado), mas nunca inventa esses campos quando ausentes.
 */
export function normalizeCoinGeckoTickers(
  raw: unknown,
  coinGeckoId: string,
  retrievedAt: string,
): NormalizedMarketTicker[] {
  const payload = raw as RawCoinGeckoMarketData | null;
  if (!payload || !Array.isArray(payload.tickers)) return [];

  return payload.tickers
    .map((t): NormalizedMarketTicker | null => {
      const base = nonEmptyString(t.base);
      const target = nonEmptyString(t.target);
      const exchangeId = nonEmptyString(t.market?.identifier ?? null);
      const exchangeName = nonEmptyString(t.market?.name ?? null);
      if (!base || !target || !exchangeId || !exchangeName) return null;

      return {
        source: "COINGECKO",
        retrievedAt,
        coinGeckoId,
        exchangeId,
        exchangeName,
        baseSymbol: base,
        targetSymbol: target,
        marketType: "SPOT",
        tradeUrl: nonEmptyString(t.trade_url),
        volumeUsd: finiteOrNull(t.converted_volume?.usd),
        lastPriceUsd: finiteOrNull(t.converted_last?.usd),
        sourceTimestamp: nonEmptyString(t.timestamp) ?? retrievedAt,
      };
    })
    .filter((t): t is NormalizedMarketTicker => t !== null);
}

/** Trunca um timestamp em ms para meia-noite UTC do mesmo dia — mesma convenção de granularidade
 * diária usada por TVL/Revenue/Fees (packages/database/prisma/schema.prisma, `sourceTimestamp`). */
function truncateToUtcDay(unixMs: number): string {
  const d = new Date(unixMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * Sprint 12 (Historical Market Data): extrai preço/market cap/volume de
 * GET /coins/{id}/market_chart. Os três arrays da CoinGecko (`prices`, `market_caps`,
 * `total_volumes`) vêm com os MESMOS timestamps, alinhados por índice — mas nunca assumimos
 * isso silenciosamente: cada array é indexado por seu próprio timestamp truncado ao dia, e o
 * merge é feito por chave (dia), não por posição. Um dia presente em `prices` mas ausente em
 * `market_caps` gera um ponto com `marketCapUsd: null`, nunca `0`. Não há OHLC nesta função —
 * `market_chart` devolve um preço por ponto, não um candle completo (ver comentário em types.ts).
 */
export function normalizeCoinGeckoMarketChart(
  raw: unknown,
  coinGeckoId: string,
  retrievedAt: string,
): NormalizedMarketDataPoint[] {
  const payload = raw as RawCoinGeckoMarketChart | null;
  if (!payload || typeof payload !== "object") return [];

  const byDay = new Map<
    string,
    { priceUsd: number | null; marketCapUsd: number | null; volumeUsd: number | null }
  >();

  function ensureDay(day: string) {
    let entry = byDay.get(day);
    if (!entry) {
      entry = { priceUsd: null, marketCapUsd: null, volumeUsd: null };
      byDay.set(day, entry);
    }
    return entry;
  }

  for (const [ts, value] of payload.prices ?? []) {
    if (typeof ts !== "number" || !Number.isFinite(value)) continue;
    ensureDay(truncateToUtcDay(ts)).priceUsd = value;
  }
  for (const [ts, value] of payload.market_caps ?? []) {
    if (typeof ts !== "number" || !Number.isFinite(value)) continue;
    ensureDay(truncateToUtcDay(ts)).marketCapUsd = value;
  }
  for (const [ts, value] of payload.total_volumes ?? []) {
    if (typeof ts !== "number" || !Number.isFinite(value)) continue;
    ensureDay(truncateToUtcDay(ts)).volumeUsd = value;
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceTimestamp, values]) => ({
      source: "COINGECKO" as const,
      retrievedAt,
      coinGeckoId,
      sourceTimestamp,
      ...values,
    }));
}

const ROUND_LABEL_TO_TYPE: Record<string, string> = {
  "pre-seed": "PRE_SEED",
  seed: "SEED",
  "series a": "SERIES_A",
  "series b": "SERIES_B",
  "series c": "SERIES_C",
  strategic: "STRATEGIC",
  "private token sale": "PRIVATE",
  private: "PRIVATE",
  public: "PUBLIC",
  ico: "ICO",
};

/** Sprint 6 (Parte 9): melhor esforço para classificar o texto livre da DefiLlama num enum
 * conhecido — nunca inventa uma categoria; cai em OTHER quando não reconhece. */
export function classifyRoundType(roundLabel: string | null): string {
  if (!roundLabel) return "OTHER";
  return ROUND_LABEL_TO_TYPE[roundLabel.trim().toLowerCase()] ?? "OTHER";
}

/**
 * Sprint 6 (Parte 9): extrai os rounds de captação do MESMO payload de /protocol/{name}.
 * `amount` da DefiLlama vem em milhões de USD (confirmado com dados reais) — convertido aqui
 * para USD absoluto. Nunca inventa investidores/valuation ausentes (Parte 17: "não inventar").
 */
export function normalizeFundingRounds(
  raw: unknown,
  slug: string,
  retrievedAt: string,
): NormalizedFundingRound[] {
  if (!isRawProtocol(raw) || !Array.isArray(raw.raises)) return [];

  return raw.raises
    .filter((r): r is NonNullable<typeof r> => typeof r?.date === "number")
    .map((r) => ({
      source: "DEFILLAMA" as const,
      retrievedAt,
      slug,
      date: unixSecondsToIso(r.date),
      roundLabel: r.round ?? null,
      amountUsd:
        typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount * 1_000_000 : null,
      leadInvestors: Array.isArray(r.leadInvestors) ? r.leadInvestors : [],
      otherInvestors: Array.isArray(r.otherInvestors) ? r.otherInvestors : [],
      valuationUsd:
        typeof r.valuation === "number" && Number.isFinite(r.valuation) ? r.valuation : null,
    }));
}

export function normalizeProtocolList(
  raw: unknown,
  retrievedAt: string,
): NormalizedProtocolSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeProtocol(item, retrievedAt))
    .filter((item): item is NormalizedProtocolSummary => item !== null);
}

/**
 * Sprint 15 (Catalysts + Risks): extrai incidentes de segurança de GET /hacks — SÓ os que têm
 * `defillamaId` real (casável a um `Project.defillamaId` sem inferência/heurística de nome, ver
 * comentário de `NormalizedSecurityIncident` em types.ts). Incidentes sem esse campo são
 * descartados aqui mesmo, nunca chegam à camada de persistência tentando "adivinhar" o projeto.
 */
export function normalizeSecurityIncidents(
  raw: unknown,
  retrievedAt: string,
): NormalizedSecurityIncident[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): NormalizedSecurityIncident | null => {
      const h = item as RawDefiLlamaHack;
      if (typeof h?.date !== "number" || typeof h?.name !== "string") return null;
      const defillamaId = nonEmptyString(h.defillamaId ?? null);
      if (!defillamaId) return null;

      return {
        source: "DEFILLAMA",
        retrievedAt,
        defillamaId,
        name: h.name,
        eventDate: unixSecondsToIso(h.date),
        classification: nonEmptyString(h.classification ?? null),
        technique: nonEmptyString(h.technique ?? null),
        amountUsd: finiteOrNull(h.amount),
        chains: Array.isArray(h.chain)
          ? h.chain.filter((c): c is string => typeof c === "string")
          : [],
        sourceUrl: nonEmptyString(h.source ?? null),
      };
    })
    .filter((item): item is NormalizedSecurityIncident => item !== null);
}
