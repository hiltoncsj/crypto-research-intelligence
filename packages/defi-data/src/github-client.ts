import { normalizeGithubReleases } from "./adapter";
import { isValidGithubRepo } from "./external-identity";
import { fetchJsonWithRetry, type RawCollectorResponse } from "./http-client";
import type { NormalizedGithubRelease } from "./types";

// Sprint 19 (External Identity Mapping & Governance Intelligence): GitHub Releases API oficial,
// keyless (60 req/hr por IP sem auth — confirmado suficiente para o volume de projetos com
// `githubRepo` curado, tipicamente um subconjunto pequeno do Top 10). Nunca scraping, nunca
// endpoint não oficial.
const GITHUB_BASE_URL = "https://api.github.com";
const ALLOWED_HOSTS = ["api.github.com"];
const PROVIDER = "GITHUB";

// Limite de segurança (Parte 11 do documento de especificação: "não baixar histórico ilimitado
// desnecessariamente" / Parte 13: "limite máximo de páginas") — 5 páginas x 100 = até 500
// releases por repositório por Research Run, mais que suficiente para qualquer projeto real
// (a maioria tem dezenas, não centenas, de releases) sem risco de loop/rajada.
const MAX_PAGES = 5;
const PER_PAGE = 100;

export interface GithubCollectorResult {
  raw: RawCollectorResponse<unknown>;
  normalized: NormalizedGithubRelease[] | null;
}

/**
 * Busca TODAS as releases de um repositório (paginado, com limite de segurança). `githubRepo`
 * é revalidado aqui (defesa em profundidade — ver `external-identity.ts`) mesmo já tendo sido
 * validado na camada de curadoria antes de persistir; nunca monta uma URL a partir de um valor
 * não conferido.
 */
export async function getGithubReleases(githubRepo: string): Promise<GithubCollectorResult> {
  if (!isValidGithubRepo(githubRepo)) {
    return {
      raw: {
        provider: PROVIDER,
        endpoint: "",
        fetchedAt: new Date().toISOString(),
        httpStatus: null,
        payload: null,
        error: `githubRepo inválido (formato esperado "owner/repo"): ${githubRepo}`,
      },
      normalized: null,
    };
  }

  const allReleases: unknown[] = [];
  let lastRaw: RawCollectorResponse<unknown> | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const endpoint = `/repos/${githubRepo}/releases`;
    const raw = await fetchJsonWithRetry(
      `${GITHUB_BASE_URL}${endpoint}?per_page=${PER_PAGE}&page=${page}`,
      {
        provider: PROVIDER,
        endpoint,
        allowlist: ALLOWED_HOSTS,
        // GitHub rejeita requisições sem User-Agent com 403 — Accept fixa o formato de resposta
        // JSON estável documentado (não loga nenhum header de autenticação, pois não há key).
        headers: {
          "User-Agent": "crypto-research-intelligence",
          Accept: "application/vnd.github+json",
        },
      },
    );
    lastRaw = raw;

    // HTTP 403/429 (rate limit) já chega aqui como `raw.error` preenchido — fetchJsonWithRetry
    // já tentou retry com backoff internamente para 429; um 403/429 persistente para a
    // paginação inteira (isolamento de falha, nunca lança) em vez de continuar tentando páginas
    // seguintes contra uma fonte que já sinalizou limite.
    if (raw.error || raw.payload === null) break;
    if (!Array.isArray(raw.payload) || raw.payload.length === 0) break;

    allReleases.push(...raw.payload);
    if (raw.payload.length < PER_PAGE) break; // última página
  }

  if (!lastRaw) {
    // MAX_PAGES <= 0 nunca acontece na prática (constante fixa), mas mantém o tipo seguro.
    lastRaw = {
      provider: PROVIDER,
      endpoint: `/repos/${githubRepo}/releases`,
      fetchedAt: new Date().toISOString(),
      httpStatus: null,
      payload: null,
      error: null,
    };
  }

  // Erro só na primeira página = falha real (nada coletado). Erro em página >1 depois de já
  // termos releases = coleta parcial, não é tratado como falha total (dado real já obtido não é
  // descartado).
  if (lastRaw.error && allReleases.length === 0) {
    return { raw: lastRaw, normalized: null };
  }

  return {
    raw: { ...lastRaw, error: null, payload: allReleases },
    normalized: normalizeGithubReleases(allReleases, githubRepo, lastRaw.fetchedAt),
  };
}
