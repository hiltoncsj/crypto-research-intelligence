import { prisma } from "@crypto-research/database";
import { getProtocols } from "@crypto-research/defi-data";

import { ensureSectorForCategory } from "./pipeline";
import { recordProjectDiscovered } from "./kanban-repository";
import { logDiscoveryEvent } from "./logger";

// Sprint 8 — Project Discovery (ver PROJECT_DISCOVERY_SPEC.md). Reconecta `getProtocols()`
// (já existia no client DefiLlama, mas só era usado pelo health-check) ao pipeline: varre o
// universo completo de protocolos e cria `Project` para os que ainda não são conhecidos,
// aplicando um critério de elegibilidade explícito e versionado — nunca todo o universo entra
// sem filtro (seção 8 do Sprint 8).
//
// Discovery é DELIBERADAMENTE separado da pesquisa detalhada (runPipelineForProject): aqui só
// criamos o registro do projeto + card Kanban em DISCOVERY, sem buscar TVL/Fees/Revenue/Funding
// — isso é uma chamada HTTP única (`GET /protocols`), independentemente de quantos projetos já
// existem no banco (seção 30: "evitar múltiplas chamadas ao mesmo endpoint sem necessidade").

export const DISCOVERY_FILTER_VERSION = "discovery-v1";
export const DISCOVERY_SOURCE = "defillama";

/** discovery-v1: só TVL mínimo por enquanto — deliberadamente simples (seção 8: "não criar um
 * sistema excessivamente complexo"). Documentado e versionado para que uma mudança futura no
 * critério (ex.: categoria elegível, chains elegíveis) vire discovery-v2, nunca uma alteração
 * silenciosa do mesmo nome. $10M (não $1M) para manter o universo elegível administrável na
 * primeira versão — a DefiLlama lista milhares de protocolos, boa parte com TVL residual
 * (seção 30: "não transformar cada Research Run numa operação desnecessariamente cara"). */
export const DISCOVERY_MIN_TVL_USD = 10_000_000;

/** Prisma `P2002` = "Unique constraint failed" — sem depender de `@prisma/client/runtime`
 * (não exportado publicamente), checa a forma mínima e estável do erro. */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

export interface DiscoverySummary {
  scanned: number;
  eligible: number;
  alreadyKnown: number;
  created: number;
  skippedSlugCollision: number;
  filterVersion: string;
  error?: string;
}

/**
 * Varre `GET /protocols` (via `getProtocols()`, já existente em `@crypto-research/defi-data`),
 * filtra por TVL mínimo (discovery-v1), e cria um `Project` para cada protocolo elegível que
 * ainda não existe (por `defillamaId`). Idempotente: projetos já conhecidos são só contados em
 * `alreadyKnown`, nunca atualizados por aqui — Discovery nunca sobrescreve um projeto existente
 * (seção 7: "não alterar descoberta manual"; o mesmo vale para descoberta automática anterior).
 */
export async function discoverProjects(researchRunId?: string): Promise<DiscoverySummary> {
  logDiscoveryEvent("discovery.started", {
    researchRunId,
    filterVersion: DISCOVERY_FILTER_VERSION,
  });
  const { raw, normalized } = await getProtocols();

  if (raw.error || !normalized) {
    logDiscoveryEvent("discovery.failed", { error: raw.error ?? "Sem payload de /protocols" });
    return {
      scanned: 0,
      eligible: 0,
      alreadyKnown: 0,
      created: 0,
      skippedSlugCollision: 0,
      filterVersion: DISCOVERY_FILTER_VERSION,
      error: raw.error ?? "Sem payload de /protocols",
    };
  }

  const eligible = normalized.filter(
    (p) => typeof p.tvlUsd === "number" && p.tvlUsd >= DISCOVERY_MIN_TVL_USD,
  );

  const existing = await prisma.project.findMany({ select: { defillamaId: true, slug: true } });
  const knownIds = new Set(existing.map((p) => p.defillamaId));
  // `slug` também é `@unique` no schema (independente de `defillamaId`) — a DefiLlama pode
  // listar dois protocolos distintos que colidem no mesmo slug gerado (ex.: nomes muito
  // parecidos caindo no mesmo `name.toLowerCase().replace(/\s+/g, "-")` de fallback quando a
  // API não traz `slug` próprio). Sem checar isso também, o segundo `create` quebra a
  // constraint única — corrigido aqui em vez de deixar a exceção derrubar o Discovery inteiro.
  const knownSlugs = new Set(existing.map((p) => p.slug));

  // Cache em memória por categoria (nunca por defillamaId) — evita um upsert de Sector repetido
  // pra cada protocolo da mesma categoria dentro desta run (ex.: 50 Dexes descobertos juntos).
  const sectorIdByCategory = new Map<string, string>();
  async function resolveSectorId(category: string | null): Promise<string> {
    const key = category?.trim() || "";
    const cached = sectorIdByCategory.get(key);
    if (cached) return cached;
    const id = await ensureSectorForCategory(category);
    sectorIdByCategory.set(key, id);
    return id;
  }

  let created = 0;
  let alreadyKnown = 0;
  let skippedSlugCollision = 0;
  const now = new Date();

  for (const protocol of eligible) {
    if (knownIds.has(protocol.defillamaId)) {
      alreadyKnown++;
      continue;
    }
    if (knownSlugs.has(protocol.slug)) {
      skippedSlugCollision++;
      logDiscoveryEvent("discovery.failed", {
        reason: "slug_collision",
        defillamaId: protocol.defillamaId,
        slug: protocol.slug,
      });
      continue;
    }

    let project: Awaited<ReturnType<typeof prisma.project.create>>;
    try {
      const sectorId = await resolveSectorId(protocol.category);
      project = await prisma.project.create({
        data: {
          slug: protocol.slug,
          name: protocol.name,
          defillamaId: protocol.defillamaId,
          // Sprint 11: vínculo autoritativo já devolvido pela DefiLlama — nunca inferido por
          // matching de nome/símbolo.
          coinGeckoId: protocol.coinGeckoId,
          sectorId,
          discoveredAt: now,
          discoverySource: DISCOVERY_SOURCE,
          discoveryFilterVersion: DISCOVERY_FILTER_VERSION,
        },
      });
    } catch (err) {
      // Seção 32 do Sprint 8 ("Concorrência"): duas execuções de Discovery em paralelo (ex.:
      // dois workers, ou — como aconteceu de fato durante os testes deste Sprint — uma chamada
      // anterior ainda terminando de gravar quando uma nova começa) podem colidir no mesmo
      // `slug`/`defillamaId` entre o check em memória (linhas acima) e o `create` real —
      // clássico TOCTOU. Em vez de derrubar o Discovery inteiro, trata a violação de constraint
      // única (P2002) como "outro processo já criou este projeto" — idempotência real, não só
      // otimista. Qualquer outro erro continua sendo propagado.
      if (isUniqueConstraintError(err)) {
        alreadyKnown++;
        continue;
      }
      throw err;
    }
    knownIds.add(protocol.defillamaId); // protege contra duplicata se o mesmo defillamaId aparecer 2x na resposta
    knownSlugs.add(protocol.slug);

    await recordProjectDiscovered(project.id, project.name, researchRunId, "DISCOVERY_AUTO");

    created++;
  }

  logDiscoveryEvent("discovery.completed", {
    scanned: normalized.length,
    eligible: eligible.length,
    alreadyKnown,
    created,
    skippedSlugCollision,
    filterVersion: DISCOVERY_FILTER_VERSION,
  });

  return {
    scanned: normalized.length,
    eligible: eligible.length,
    alreadyKnown,
    created,
    skippedSlugCollision,
    filterVersion: DISCOVERY_FILTER_VERSION,
  };
}
