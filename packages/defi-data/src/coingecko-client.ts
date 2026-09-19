import { normalizeCoinGeckoMarketChart, normalizeCoinGeckoMarketData } from "./adapter";
import { fetchJsonWithRetry, type RawCollectorResponse } from "./http-client";
import type { NormalizedMarketDataPoint, NormalizedTokenSupply } from "./types";

// Sprint 11: Collector CoinGecko isolado, mesmo padrão de client.ts (DefiLlama) — host
// allowlist anti-SSRF, nunca construímos URL a partir de input de usuário livre (só
// `coinGeckoId`, que vem do `gecko_id` já validado pela DefiLlama, nunca de input do usuário
// final). Endpoint público (`api.coingecko.com`) funciona sem key; com uma key configurada na
// tela de Conexões, usamos `pro-api.coingecko.com` + header `x-cg-pro-api-key` para rate limit
// maior — nunca logamos a key.
const COINGECKO_FREE_BASE_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";
const ALLOWED_HOSTS = ["api.coingecko.com", "pro-api.coingecko.com"];
const PROVIDER = "COINGECKO";

export interface CoinGeckoCollectorResult<T> {
  raw: RawCollectorResponse<unknown>;
  normalized: T | null;
}

/**
 * GET /coins/{id} — usado para enriquecer FDV/circulatingSupply/totalSupply/maxSupply de um
 * projeto cujo `coinGeckoId` já é conhecido (vindo do `gecko_id` da DefiLlama). `apiKey` é
 * opcional (Pro tier); sem ela, usa o endpoint público gratuito (rate-limited, mas suficiente
 * para o volume do Top 10 por Research Run).
 *
 * Sprint 13 (Parte B — Perfil + Mercados): `tickers=true` (antes `false`) — o MESMO payload
 * desta chamada já traz descrição/categorias/blockchains (`normalizeCoinGeckoProfile`) e
 * mercados reais onde o token é negociado (`normalizeCoinGeckoTickers`), confirmado por chamada
 * real (GET /coins/aave?tickers=true devolveu 100 tickers). Ligar `tickers=true` evita uma
 * segunda chamada HTTP inteira só para mercados — o chamador (pipeline.ts) extrai os três
 * normalizadores do MESMO `raw.payload`. Timeout maior que o padrão (15s vs 10s) porque o
 * payload com tickers é bem maior que o de supply sozinho.
 */
export async function getCoinMarketData(
  coinGeckoId: string,
  apiKey?: string | null,
): Promise<CoinGeckoCollectorResult<NormalizedTokenSupply>> {
  const baseUrl = apiKey ? COINGECKO_PRO_BASE_URL : COINGECKO_FREE_BASE_URL;
  const endpoint = `/coins/${encodeURIComponent(coinGeckoId)}`;
  const query =
    "?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false";

  const raw = await fetchJsonWithRetry(`${baseUrl}${endpoint}${query}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
    headers: apiKey ? { "x-cg-pro-api-key": apiKey } : undefined,
    timeoutMs: 15_000,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return {
    raw,
    normalized: normalizeCoinGeckoMarketData(raw.payload, coinGeckoId, raw.fetchedAt),
  };
}

// Sprint 12 (Historical Market Data): a granularidade retornada por /market_chart é automática
// (não configurável sem plano Enterprise pago): 1 dia -> 5min, 2-90 dias -> horária, >90 dias ->
// diária. Pedimos sempre um `days` acima desse limiar para garantir granularidade diária estável
// — nunca dado hora-a-hora silenciosamente mais granular do que o resto do sistema (TVL/Revenue/
// Fees são todos diários). `MARKET_DATA_HISTORY_DAYS` cobre a janela de backfill inicial (~1 ano,
// dentro do limite de histórico gratuito atual da CoinGecko); usar o MESMO valor em toda run
// (full ou incremental) é uma escolha deliberada de simplicidade (ver
// SPRINT_12_IMPLEMENTATION_REPORT.md, "Full vs Incremental") — a idempotência da persistência
// (dedupe por projectId+source+sourceTimestamp) garante que refazer a mesma janela nunca duplica
// nem reescreve histórico, só é um pouco mais caro em chamadas de API do que um `since` real.
export const MARKET_DATA_HISTORY_DAYS = 365;

/**
 * GET /coins/{id}/market_chart — série histórica de preço/market cap/volume, granularidade
 * diária (ver `MARKET_DATA_HISTORY_DAYS`). Mesmo contrato anti-mock dos outros collectors: nunca
 * lança, falhas vêm em `raw.error`/`normalized: []`.
 */
export async function getCoinMarketChart(
  coinGeckoId: string,
  apiKey?: string | null,
  days: number = MARKET_DATA_HISTORY_DAYS,
): Promise<CoinGeckoCollectorResult<NormalizedMarketDataPoint[]>> {
  const baseUrl = apiKey ? COINGECKO_PRO_BASE_URL : COINGECKO_FREE_BASE_URL;
  const endpoint = `/coins/${encodeURIComponent(coinGeckoId)}/market_chart`;
  const query = `?vs_currency=usd&days=${days}`;

  const raw = await fetchJsonWithRetry(`${baseUrl}${endpoint}${query}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
    headers: apiKey ? { "x-cg-pro-api-key": apiKey } : undefined,
    timeoutMs: 25_000, // payload de 365 dias é maior que o de /coins/{id} — mesmo motivo do
    // timeout estendido de getProtocolTvlHistory em client.ts (DefiLlama).
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return {
    raw,
    normalized: normalizeCoinGeckoMarketChart(raw.payload, coinGeckoId, raw.fetchedAt),
  };
}

/**
 * Usado pelo "Test Connection" (mesmo padrão de `pingDefiLlama`) — GET /ping é o endpoint mais
 * barato da CoinGecko só para confirmar que o provider está alcançável (com ou sem key).
 */
export async function pingCoinGecko(
  apiKey?: string | null,
): Promise<RawCollectorResponse<unknown>> {
  const baseUrl = apiKey ? COINGECKO_PRO_BASE_URL : COINGECKO_FREE_BASE_URL;
  const endpoint = "/ping";
  return fetchJsonWithRetry(`${baseUrl}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
    headers: apiKey ? { "x-cg-pro-api-key": apiKey } : undefined,
  });
}
