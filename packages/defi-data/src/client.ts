import {
  normalizeFeesSummary,
  normalizeProtocol,
  normalizeProtocolList,
  normalizeSecurityIncidents,
  normalizeTokenUnlocks,
  normalizeTvlHistory,
} from "./adapter";
import { fetchJsonWithRetry, type RawCollectorResponse } from "./http-client";
import type {
  NormalizedProtocolMetricHistory,
  NormalizedProtocolSummary,
  NormalizedProtocolTvlHistory,
  NormalizedSecurityIncident,
  NormalizedTokenUnlockEvent,
} from "./types";

// Sprint 2 (Fase 9): Collector DefiLlama isolado. Único domínio permitido — allowlist
// anti-SSRF (seção 10 do plano de implementação): nunca construímos URL a partir de input
// de usuário, e mesmo assim travamos o domínio aqui.
const DEFILLAMA_BASE_URL = "https://api.llama.fi";
const ALLOWED_HOSTS = ["api.llama.fi"];
const PROVIDER = "DEFILLAMA";

// Sprint 18: DefiLlama Pro — domínio separado, SÓ usado quando uma API key é configurada em
// Settings (provider "DEFILLAMA_PRO"). Nunca chamado sem key (ver `getTokenUnlocks`/
// `pingDefiLlamaPro` abaixo — ambos recebem a key como parâmetro obrigatório, não opcional).
const DEFILLAMA_PRO_BASE_URL = "https://pro-api.llama.fi";
const DEFILLAMA_PRO_ALLOWED_HOSTS = ["pro-api.llama.fi"];
const PRO_PROVIDER = "DEFILLAMA_PRO";

export interface DefiLlamaCollectorResult<T> {
  raw: RawCollectorResponse<unknown>;
  normalized: T | null;
}

export async function getProtocols(): Promise<
  DefiLlamaCollectorResult<NormalizedProtocolSummary[]>
> {
  const endpoint = "/protocols";
  const raw = await fetchJsonWithRetry(`${DEFILLAMA_BASE_URL}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return { raw, normalized: normalizeProtocolList(raw.payload, raw.fetchedAt) };
}

export async function getProtocol(
  slugOrName: string,
): Promise<DefiLlamaCollectorResult<NormalizedProtocolSummary>> {
  const endpoint = `/protocol/${encodeURIComponent(slugOrName)}`;
  const raw = await fetchJsonWithRetry(`${DEFILLAMA_BASE_URL}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return { raw, normalized: normalizeProtocol(raw.payload, raw.fetchedAt) };
}

/**
 * Usado pelo "Test Connection" (Fase 16) — uma chamada leve e barata só para confirmar que
 * o provider está alcançável, sem baixar a lista inteira de protocolos.
 */
export async function pingDefiLlama(): Promise<RawCollectorResponse<unknown>> {
  return getProtocols().then((result) => result.raw);
}

/**
 * Sprint 3 (Fase 4): série histórica diária de TVL para um protocolo, extraída da mesma
 * chamada de GET /protocol/{name} (a API já retorna o histórico completo, não precisamos de
 * um endpoint separado nem de polling diário).
 */
export async function getProtocolTvlHistory(
  slugOrName: string,
): Promise<DefiLlamaCollectorResult<NormalizedProtocolTvlHistory>> {
  const endpoint = `/protocol/${encodeURIComponent(slugOrName)}`;
  const raw = await fetchJsonWithRetry(`${DEFILLAMA_BASE_URL}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
    // Protocolos grandes (ex: Uniswap) retornam um payload de vários MB (histórico diário +
    // breakdown por chain) — o timeout default de 10s (adequado para /protocols e
    // /summary/fees) não é suficiente aqui. Descoberto rodando o pipeline de verdade contra
    // a API real (Sprint 3): /protocol/uniswap estourava o timeout default.
    timeoutMs: 25_000,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return {
    raw,
    normalized: normalizeTvlHistory(raw.payload, slugOrName, raw.fetchedAt),
  };
}

/**
 * Sprint 3 (Fase 9 do plano de implementação): GET /summary/fees/{protocol}, com
 * `dataType=dailyRevenue` para Revenue — mesmo endpoint, parâmetro diferente. Nunca confundir
 * os dois (Fees != Revenue), por isso o retorno já vem com `metric` marcado.
 */
export async function getProtocolFeesOrRevenue(
  slugOrName: string,
  metric: "FEES" | "REVENUE",
): Promise<DefiLlamaCollectorResult<NormalizedProtocolMetricHistory>> {
  const query = metric === "REVENUE" ? "?dataType=dailyRevenue" : "";
  const endpoint = `/summary/fees/${encodeURIComponent(slugOrName)}${query}`;
  const raw = await fetchJsonWithRetry(`${DEFILLAMA_BASE_URL}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return {
    raw,
    normalized: normalizeFeesSummary(raw.payload, slugOrName, metric, raw.fetchedAt),
  };
}

/**
 * Sprint 15 (Catalysts + Risks): GET /hacks — lista TODOS os incidentes de segurança conhecidos
 * pela DefiLlama, cross-protocolo. Endpoint confirmado real/gratuito/sem auth por chamada ao
 * vivo (1273 incidentes). Chamado UMA VEZ por Research Run (nunca por projeto — seção 28 do
 * Sprint 15: "não fazer N+1 external requests"), filtrado em memória por `defillamaId` depois.
 */
export async function getHacks(): Promise<DefiLlamaCollectorResult<NormalizedSecurityIncident[]>> {
  const endpoint = "/hacks";
  const raw = await fetchJsonWithRetry(`${DEFILLAMA_BASE_URL}${endpoint}`, {
    provider: PROVIDER,
    endpoint,
    allowlist: ALLOWED_HOSTS,
  });

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return { raw, normalized: normalizeSecurityIncidents(raw.payload, raw.fetchedAt) };
}

/**
 * Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): `GET /{API_KEY}/api/emissions/{protocol}` da
 * DefiLlama Pro, estrutura documentada publicamente (nunca chamada ao vivo neste repositório —
 * exige uma API key paga que não foi adquirida). `apiKey` é obrigatório (não opcional) de
 * propósito: este client NUNCA deve ser chamado sem uma key real — a camada de
 * research-engine (`resolveDefiLlamaProApiKey`) já garante isso, retornando cedo quando não há
 * `ApiConnection` configurada para o provider `DEFILLAMA_PRO`.
 */
export async function getTokenUnlocks(
  defillamaId: string,
  apiKey: string,
): Promise<DefiLlamaCollectorResult<NormalizedTokenUnlockEvent[]>> {
  const endpoint = `/api/emissions/${encodeURIComponent(defillamaId)}`;
  const raw = await fetchJsonWithRetry(
    `${DEFILLAMA_PRO_BASE_URL}/${encodeURIComponent(apiKey)}${endpoint}`,
    {
      provider: PRO_PROVIDER,
      endpoint,
      allowlist: DEFILLAMA_PRO_ALLOWED_HOSTS,
    },
  );

  if (raw.error || raw.payload === null) {
    return { raw, normalized: null };
  }

  return {
    raw,
    normalized: normalizeTokenUnlocks(raw.payload, defillamaId, raw.fetchedAt),
  };
}

/**
 * "Test Connection" para o provider DEFILLAMA_PRO (Settings) — mesma chamada leve usada pelo
 * resto do sistema para validar uma key sem processar dado de verdade. Usa um `defillamaId`
 * qualquer só para confirmar que a key autentica (200) vs. rejeita (401/403) — não fica preso a
 * nenhum projeto específico.
 */
export async function pingDefiLlamaPro(apiKey: string): Promise<RawCollectorResponse<unknown>> {
  return getTokenUnlocks("1", apiKey).then((result) => result.raw);
}
