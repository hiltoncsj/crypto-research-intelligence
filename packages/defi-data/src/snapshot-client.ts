import { normalizeSnapshotProposals } from "./adapter";
import { isValidSnapshotSpace } from "./external-identity";
import type { RawCollectorResponse } from "./http-client";
import type { NormalizedSnapshotProposal } from "./types";

// Sprint 19: Snapshot GraphQL oficial (hub.snapshot.org), keyless, confirmado ao vivo
// (2026-09-19, space "ens.eth"). Nunca scraping, nunca endpoint não oficial.
const SNAPSHOT_GRAPHQL_URL = "https://hub.snapshot.org/graphql";
const ALLOWED_HOSTS = ["hub.snapshot.org"];
const PROVIDER = "SNAPSHOT";

// Mesma disciplina de limite de segurança do GitHub client (Parte 13: "limite máximo de páginas"
// / "limite máximo de propostas processadas por run") — 5 páginas x 100 = até 500 propostas por
// space por Research Run.
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

const PROPOSALS_QUERY = `
  query Proposals($space: String!, $first: Int!, $skip: Int!) {
    proposals(
      first: $first
      skip: $skip
      where: { space_in: [$space] }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      state
      start
      end
      created
      author
      link
      space { id name }
    }
  }
`;

export interface SnapshotCollectorResult {
  raw: RawCollectorResponse<unknown>;
  normalized: NormalizedSnapshotProposal[] | null;
}

/**
 * Busca TODAS as propostas de um space (paginado via `skip`, com limite de segurança).
 * `snapshotSpace` é revalidado aqui (defesa em profundidade), nunca usado para montar a query
 * sem checagem prévia — passado como variável GraphQL (`$space`), nunca interpolado em string
 * de query (evita qualquer risco de GraphQL injection além do já coberto pela validação de
 * formato).
 */
export async function getSnapshotProposals(
  snapshotSpace: string,
): Promise<SnapshotCollectorResult> {
  if (!isValidSnapshotSpace(snapshotSpace)) {
    return {
      raw: {
        provider: PROVIDER,
        endpoint: "",
        fetchedAt: new Date().toISOString(),
        httpStatus: null,
        payload: null,
        error: `snapshotSpace inválido: ${snapshotSpace}`,
      },
      normalized: null,
    };
  }

  const allProposals: unknown[] = [];
  let lastRaw: RawCollectorResponse<unknown> | null = null;

  // fetchJsonWithRetry (packages/defi-data/src/http-client.ts) só suporta GET — Snapshot exige
  // POST com corpo GraphQL. Em vez de estender o cliente genérico (usado por DefiLlama/
  // CoinGecko/GitHub, todos GET) só para este único caso, implementamos aqui um `fetch` direto
  // com a MESMA disciplina (timeout, allowlist, sem log de secret — não há secret aqui) em vez
  // de introduzir uma abstração nova prematuramente.
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const skip = page * PAGE_SIZE;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let httpStatus: number | null = null;
    try {
      assertSnapshotHost(SNAPSHOT_GRAPHQL_URL);
      const response = await fetch(SNAPSHOT_GRAPHQL_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PROPOSALS_QUERY,
          variables: { space: snapshotSpace, first: PAGE_SIZE, skip },
        }),
      });
      httpStatus = response.status;
      if (!response.ok) {
        lastRaw = {
          provider: PROVIDER,
          endpoint: "/graphql",
          fetchedAt: new Date().toISOString(),
          httpStatus,
          payload: null,
          error: `HTTP ${response.status} em /graphql`,
        };
        break;
      }

      const json = (await response.json()) as {
        data?: { proposals?: unknown[] };
        errors?: unknown[];
      };
      lastRaw = {
        provider: PROVIDER,
        endpoint: "/graphql",
        fetchedAt: new Date().toISOString(),
        httpStatus,
        payload: json,
        error: null,
      };

      if (Array.isArray(json.errors) && json.errors.length > 0) {
        lastRaw = { ...lastRaw, error: "Erro GraphQL retornado pelo Snapshot" };
        break;
      }

      const proposals = json.data?.proposals ?? [];
      if (!Array.isArray(proposals) || proposals.length === 0) break;

      allProposals.push(...proposals);
      if (proposals.length < PAGE_SIZE) break; // última página
    } catch (err) {
      lastRaw = {
        provider: PROVIDER,
        endpoint: "/graphql",
        fetchedAt: new Date().toISOString(),
        httpStatus,
        payload: null,
        error:
          err instanceof Error && err.name === "AbortError"
            ? "Timeout após 15000ms em /graphql"
            : err instanceof Error
              ? err.message
              : "Erro desconhecido",
      };
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!lastRaw) {
    lastRaw = {
      provider: PROVIDER,
      endpoint: "/graphql",
      fetchedAt: new Date().toISOString(),
      httpStatus: null,
      payload: null,
      error: null,
    };
  }

  if (lastRaw.error && allProposals.length === 0) {
    return { raw: lastRaw, normalized: null };
  }

  return {
    raw: { ...lastRaw, error: null, payload: allProposals },
    normalized: normalizeSnapshotProposals(allProposals, snapshotSpace, lastRaw.fetchedAt),
  };
}

function assertSnapshotHost(url: string): void {
  const { hostname } = new URL(url);
  if (!ALLOWED_HOSTS.includes(hostname)) {
    throw new Error(`Domínio não permitido: ${hostname}`);
  }
}
