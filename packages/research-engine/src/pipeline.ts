import { prisma } from "@crypto-research/database";
import {
  getCoinMarketData,
  getGithubReleases,
  getHacks,
  getProtocolFeesOrRevenue,
  getProtocolTvlHistory,
  getSnapshotProposals,
  getTokenUnlocks,
  normalizeCoinGeckoProfile,
  normalizeCoinGeckoTickers,
  normalizeFundingRounds,
  normalizeProtocol,
  normalizeTokenSummary,
  type NormalizedSecurityIncident,
} from "@crypto-research/defi-data";
import { decrypt, KanbanCardStatus, KanbanColumnKey } from "@crypto-research/shared";

import {
  computeAndPersistCapitalScore,
  type CapitalScoreRecordResult,
} from "./capital-score-repository";
import {
  collectFundingCatalysts,
  collectGithubReleaseCatalysts,
  collectSecurityIncidentRisks,
  collectSnapshotGovernanceCatalysts,
  collectTokenMarketListingCatalysts,
  collectTokenUnlockRisks,
} from "./events-repository";
import {
  persistFundingRounds,
  persistTokenSummary,
  persistTokenSupply,
} from "./funding-repository";
import { advanceProjectCard, recordProjectDiscovered, setCardBlocked } from "./kanban-repository";
import { logEventsEvent, logPipelineEvent } from "./logger";
import { collectMarketDataForProject } from "./market-data-repository";
import { calculateWindowMetrics, type WindowMetrics } from "./metrics";
import {
  collectProjectProfile,
  collectTokenMarkets,
  getCurrentTokenMarketKeys,
} from "./profile-repository";
import {
  computeAndPersistFundamentalScore,
  type FundamentalScoreRecordResult,
} from "./score-repository";
import { loadSeries, persistSnapshotSeries } from "./snapshot-repository";
import {
  computeAndPersistTokenomicsScore,
  type TokenomicsScoreRecordResult,
} from "./tokenomics-score-repository";

// Sprint 3 (Fase 10/21): pipeline manual — Collector → Normalizer → Validator → Persist →
// Metrics — para uma lista fixa de projetos de desenvolvimento. Roda sincronamente (sem
// fila/BullMQ, que é do Sprint 4), disparado por uma rota HTTP protegida.

const UNCATEGORIZED_SECTOR_NAME = "Uncategorized";

/**
 * Sprint 3 (Fase 10): projetos fixos de desenvolvimento, escolhidos por serem protocolos
 * DeFi grandes e estáveis (baixa chance de o slug mudar ou o protocolo sumir do DefiLlama).
 * Confirmados manualmente contra a API real: GET /protocol/aave, /protocol/uniswap,
 * /protocol/lido retornam 200 com série histórica de TVL.
 *
 * Sprint 8: deixou de ser o DEFAULT de `runManualResearchPipeline`/`createResearchRun` — a
 * seleção de quais projetos pesquisar agora é dinâmica (Project Discovery + Top 10 Selection,
 * ver TOP10_SELECTION_SPEC.md). Esta constante continua existindo só como conveniência
 * explícita para chamadas manuais/scripts de desenvolvimento que queiram uma lista pequena e
 * estável sem depender do universo completo — nunca mais usada implicitamente.
 */
export const FIXED_DEV_PROJECT_SLUGS = ["aave", "uniswap", "lido"] as const;

export interface ProjectPipelineResult {
  slug: string;
  status: "COMPLETED" | "FAILED";
  error?: string;
  projectId?: string;
  tvl?: { created: number; skippedDuplicate: number; rejectedInvalid: number; suspicious: number };
  revenue?: {
    created: number;
    skippedDuplicate: number;
    rejectedInvalid: number;
    suspicious: number;
  };
  fees?: { created: number; skippedDuplicate: number; rejectedInvalid: number; suspicious: number };
  metrics?: {
    tvl: WindowMetrics;
    revenue: WindowMetrics;
    fees: WindowMetrics;
  };
  /** Sprint 5: presente apenas quando `researchRunId` foi passado a `runPipelineForProject` —
   * sem isso não há como associar o Score a uma Research Run (Fase 17), então o cálculo é
   * pulado (não é um erro; ver Fase 31: "não criar um novo sistema de execução paralelo"). */
  score?: FundamentalScoreRecordResult;
  scoreError?: string;
  /** Sprint 6: mesma filosofia do `score`/`scoreError` acima — cada score é independente, uma
   * falha em um não deve descartar os outros já calculados (Parte 14: "se um módulo falhar...
   * a Research Run não deve perder os resultados já persistidos"). */
  tokenomicsScore?: TokenomicsScoreRecordResult;
  tokenomicsScoreError?: string;
  capitalScore?: CapitalScoreRecordResult;
  capitalScoreError?: string;
  funding?: { created: number; skippedDuplicate: number };
}

export interface PipelineRunSummary {
  startedAt: string;
  finishedAt: string;
  results: ProjectPipelineResult[];
}

// Exportado para reuso por discovery.ts (Sprint 8) — mesma sector "Uncategorized" usada pela
// pesquisa manual, sem duplicar a lógica de upsert.
export async function ensureUncategorizedSector(): Promise<string> {
  return ensureSectorForCategory(null);
}

/** Correção (2026-09-17): antes disso, TODO projeto caía em "Uncategorized" — os 3 scores
 * (Fundamental/Tokenomics/Institutional Capital) comparam percentil DENTRO do setor
 * (score-repository.ts/tokenomics-score-repository.ts/capital-score-repository.ts), então
 * comparar contra o universo inteiro em vez de pares reais da mesma categoria (Dexes vs.
 * Lending, por exemplo) distorcia o percentil de todo mundo. Usa a `category` que a própria
 * DefiLlama já devolve (adapter.ts) — nunca inferida por nós — e cai em "Uncategorized" só
 * quando a DefiLlama não informa categoria para aquele protocolo (nunca inventado). */
export async function ensureSectorForCategory(
  category: string | null | undefined,
): Promise<string> {
  const name = category && category.trim().length > 0 ? category.trim() : UNCATEGORIZED_SECTOR_NAME;
  const sector = await prisma.sector.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return sector.id;
}

async function ensureChain(chainName: string): Promise<string> {
  const slug = chainName.toLowerCase().trim();
  const chain = await prisma.chain.upsert({
    where: { defillamaChainSlug: slug },
    update: {},
    create: { name: chainName, defillamaChainSlug: slug },
  });
  return chain.id;
}

async function ensureProjectChains(projectId: string, chainNames: string[]): Promise<void> {
  for (const chainName of chainNames) {
    const chainId = await ensureChain(chainName);
    await prisma.projectChain.upsert({
      where: { projectId_chainId: { projectId, chainId } },
      update: { active: true },
      create: { projectId, chainId },
    });
  }
}

/**
 * Processa um único projeto: coleta TVL/Fees/Revenue da DefiLlama, normaliza, valida,
 * persiste (idempotente) e calcula métricas de janela. Falhas de um projeto não abortam o
 * restante do batch (mesma filosofia do roadmap para Research Runs — seção 8 do plano:
 * "erro em qualquer etapa... nunca interrompe silenciosamente").
 */
export async function runPipelineForProject(
  slug: string,
  researchRunId?: string,
  // Sprint 11 (integração CoinGecko): resolvida uma única vez por batch em
  // `runManualResearchPipeline` (evita reconsultar `ApiConnection` a cada projeto). `undefined`/
  // `null` = sem key configurada, usa o endpoint público gratuito da CoinGecko.
  coinGeckoApiKey?: string | null,
  // Sprint 15 (Catalysts + Risks): buscado UMA VEZ por Research Run em
  // `runManualResearchPipeline` (GET /hacks, cross-protocolo) — nunca refeito por projeto.
  securityIncidents: NormalizedSecurityIncident[] = [],
  // Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): resolvida uma única vez por batch, igual
  // `coinGeckoApiKey`. `undefined`/`null` = sem key configurada em Settings (provider
  // `DEFILLAMA_PRO`) — nesse caso `getTokenUnlocks` NUNCA é chamado para nenhum projeto.
  defillamaProApiKey?: string | null,
): Promise<ProjectPipelineResult> {
  logPipelineEvent("project_processing_started", { slug });
  // Sprint 7: precisa estar acessível no catch — se o projeto já foi upsertado quando uma
  // etapa seguinte falhar, o card deve ser marcado BLOCKED em vez de simplesmente não avançar
  // (seção 17 do Pull System: toda falha exige motivo/registro, nunca falha silenciosa).
  let discoveredProjectId: string | undefined;
  try {
    const tvlResult = await getProtocolTvlHistory(slug);
    if (tvlResult.raw.error || !tvlResult.normalized) {
      logPipelineEvent("validation_failed", {
        slug,
        stage: "tvl_collect",
        error: tvlResult.raw.error ?? "Sem série histórica de TVL na resposta",
      });
      return {
        slug,
        status: "FAILED",
        error: tvlResult.raw.error ?? "Sem série histórica de TVL na resposta",
      };
    }

    const summary = normalizeProtocol(tvlResult.raw.payload, tvlResult.raw.fetchedAt);
    const sectorId = await ensureSectorForCategory(summary?.category);

    const project = await prisma.project.upsert({
      where: { defillamaId: tvlResult.normalized.defillamaId },
      // Sprint 11: `summary?.coinGeckoId ?? undefined` nunca sobrescreve um valor já conhecido
      // com `null` — só atualiza quando este fetch trouxe um `gecko_id` real (ex.: projeto
      // criado manualmente antes da integração CoinGecko existir).
      update: { name: summary?.name ?? slug, coinGeckoId: summary?.coinGeckoId ?? undefined },
      create: {
        slug,
        name: summary?.name ?? slug,
        defillamaId: tvlResult.normalized.defillamaId,
        coinGeckoId: summary?.coinGeckoId ?? null,
        sectorId,
      },
    });

    if (summary && summary.chains.length > 0) {
      await ensureProjectChains(project.id, summary.chains);
    }

    discoveredProjectId = project.id;
    // Sprint 7 (seção 6 do Pull System): card criado/trazido de volta para DISCOVERY assim que
    // o projeto é upsertado — antes de qualquer coleta de snapshot.
    await recordProjectDiscovered(project.id, summary?.name ?? project.name, researchRunId);
    await advanceProjectCard(project.id, KanbanColumnKey.DATA_COLLECTION, {
      researchRunId,
      reason: "DATA_COLLECTION_STARTED",
    });

    // Sprint 6 (Parte 2/9): Token summary (mcap real) e Funding Rounds (raises reais) vêm do
    // MESMO payload de /protocol/{name} já buscado acima por getProtocolTvlHistory — nenhuma
    // chamada HTTP extra (Parte 18: "evitar chamadas externas duplicadas").
    const tokenSummary = normalizeTokenSummary(
      tvlResult.raw.payload,
      slug,
      tvlResult.raw.fetchedAt,
    );
    await persistTokenSummary(project.id, tokenSummary);

    // Sprint 11 (integração CoinGecko): FDV/supplies não vêm da DefiLlama — chamada extra real
    // (não reaproveita o payload acima), só quando `coinGeckoId` é conhecido. Nunca falha o
    // projeto/run inteiro: `getCoinMarketData` nunca lança (mesmo contrato de
    // `fetchJsonWithRetry`), e `persistTokenSupply(null)` é um no-op.
    if (project.coinGeckoId) {
      const supplyResult = await getCoinMarketData(project.coinGeckoId, coinGeckoApiKey);
      await persistTokenSupply(project.id, supplyResult.normalized);
      logPipelineEvent("token_supply_enriched", {
        slug,
        coinGeckoId: project.coinGeckoId,
        success: supplyResult.normalized !== null,
        error: supplyResult.raw.error,
      });

      // Sprint 13 (Parte B — Perfil + Mercados): extrai perfil/mercados do MESMO
      // `supplyResult.raw.payload` já buscado acima — nenhuma chamada HTTP extra (seção 15/22 do
      // Sprint 13: "não duplicar coleta de Market Data"/"evitar 1 request por exchange"). Se a
      // chamada de `getCoinMarketData` falhou, `raw.payload` é `null` e os normalizadores
      // retornam vazio/null com segurança — mesmo contrato do resto do sistema.
      const normalizedProfile = normalizeCoinGeckoProfile(
        supplyResult.raw.payload,
        project.coinGeckoId,
        supplyResult.raw.fetchedAt,
      );
      await collectProjectProfile(project.id, slug, project.coinGeckoId, normalizedProfile);

      const normalizedTickers = normalizeCoinGeckoTickers(
        supplyResult.raw.payload,
        project.coinGeckoId,
        supplyResult.raw.fetchedAt,
      );

      // Sprint 17 (Catalyst LISTING/DELISTING): captura o estado ANTES do upsert desta run —
      // senão o "antes" e o "depois" ficariam idênticos. Zero chamada HTTP nova (só leitura do
      // que já está persistido); ver CATALYSTS_RISKS_SOURCE_AUDIT.md seção 7, item 1.
      const previousTokenMarkets = await getCurrentTokenMarketKeys(project.id);
      await collectTokenMarketListingCatalysts(
        project.id,
        slug,
        previousTokenMarkets,
        normalizedTickers,
      );

      await collectTokenMarkets(project.id, slug, project.coinGeckoId, normalizedTickers);
    }

    // Sprint 12 (Historical Market Data): mesma chamada condicional a `coinGeckoId` acima, mesma
    // garantia de isolamento — nunca falha o projeto/run inteiro. `collectMarketDataForProject`
    // já é um no-op seguro (SKIPPED_NO_COINGECKO_ID) quando o projeto não tem `coinGeckoId`.
    await collectMarketDataForProject(project.id, slug, project.coinGeckoId, coinGeckoApiKey);

    const fundingRounds = normalizeFundingRounds(
      tvlResult.raw.payload,
      slug,
      tvlResult.raw.fetchedAt,
    );
    const fundingPersist = await persistFundingRounds(project.id, fundingRounds);
    logPipelineEvent("snapshot_created", { slug, kind: "FUNDING_ROUNDS", ...fundingPersist });

    // Sprint 15 (Catalysts + Risks): reclassifica os FundingRound recém-persistidos como
    // Catalyst FUNDING (zero coleta nova) e casa incidentes de segurança reais (DefiLlama
    // /hacks, buscado UMA VEZ por Research Run em runManualResearchPipeline, nunca por
    // projeto) por `defillamaId` exato. Isolamento total — nunca falha o projeto/run inteiro.
    await collectFundingCatalysts(project.id, slug);
    await collectSecurityIncidentRisks(project.id, slug, project.defillamaId, securityIncidents);

    // Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): só chama a DefiLlama Pro quando uma key
    // real está configurada em Settings (provider DEFILLAMA_PRO). Sem key, `defillamaProApiKey`
    // é `undefined`/`null` e este bloco inteiro é pulado — nenhuma chamada HTTP, nenhum custo,
    // nenhum evento criado. Isolamento total, igual ao resto do bloco de eventos acima.
    if (defillamaProApiKey && project.defillamaId) {
      try {
        const unlocksResult = await getTokenUnlocks(project.defillamaId, defillamaProApiKey);
        await collectTokenUnlockRisks(
          project.id,
          slug,
          project.defillamaId,
          unlocksResult.normalized ?? [],
        );
      } catch (err) {
        logEventsEvent("events.token_unlocks_failed", {
          slug,
          projectId: project.id,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    } else if (!defillamaProApiKey) {
      logEventsEvent("events.token_unlocks_skipped_no_api_key", { slug, projectId: project.id });
    }

    // Sprint 19 (External Identity Mapping & Governance Intelligence): GitHub Releases e
    // Snapshot Governance só são chamados quando o projeto tem `githubRepo`/`snapshotSpace`
    // curados manualmente (nunca inferidos por nome — ver EXTERNAL_IDENTITY_ARCHITECTURE.md).
    // Cada fonte é isolada (try/catch independente) — uma falhando nunca impede a outra nem o
    // resto do pipeline, mesmo padrão do bloco TOKEN_UNLOCK acima.
    if (project.githubRepo) {
      try {
        const releasesResult = await getGithubReleases(project.githubRepo);
        await collectGithubReleaseCatalysts(
          project.id,
          slug,
          project.githubRepo,
          releasesResult.normalized,
        );
      } catch (err) {
        logEventsEvent("events.github_releases_failed", {
          slug,
          projectId: project.id,
          githubRepo: project.githubRepo,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    } else {
      logEventsEvent("events.github_releases_skipped_no_mapping", { slug, projectId: project.id });
    }

    if (project.snapshotSpace) {
      try {
        const proposalsResult = await getSnapshotProposals(project.snapshotSpace);
        await collectSnapshotGovernanceCatalysts(
          project.id,
          slug,
          project.snapshotSpace,
          proposalsResult.normalized,
        );
      } catch (err) {
        logEventsEvent("events.snapshot_proposals_failed", {
          slug,
          projectId: project.id,
          snapshotSpace: project.snapshotSpace,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    } else {
      logEventsEvent("events.snapshot_proposals_skipped_no_mapping", {
        slug,
        projectId: project.id,
      });
    }

    const tvlPersist = await persistSnapshotSeries(
      "TVL",
      project.id,
      tvlResult.normalized.points,
      tvlResult.raw.fetchedAt,
    );
    logPipelineEvent("snapshot_created", { slug, kind: "TVL", ...tvlPersist });

    const [feesResult, revenueResult] = await Promise.all([
      getProtocolFeesOrRevenue(slug, "FEES"),
      getProtocolFeesOrRevenue(slug, "REVENUE"),
    ]);

    const feesPersist = feesResult.normalized
      ? await persistSnapshotSeries(
          "FEES",
          project.id,
          feesResult.normalized.points,
          feesResult.raw.fetchedAt,
        )
      : { created: 0, skippedDuplicate: 0, rejectedInvalid: 0, suspicious: 0 };

    const revenuePersist = revenueResult.normalized
      ? await persistSnapshotSeries(
          "REVENUE",
          project.id,
          revenueResult.normalized.points,
          revenueResult.raw.fetchedAt,
        )
      : { created: 0, skippedDuplicate: 0, rejectedInvalid: 0, suspicious: 0 };

    const [tvlSeries, revenueSeries, feesSeries] = await Promise.all([
      loadSeries("TVL", project.id),
      loadSeries("REVENUE", project.id),
      loadSeries("FEES", project.id),
    ]);

    const metrics = {
      tvl: calculateWindowMetrics(tvlSeries),
      revenue: calculateWindowMetrics(revenueSeries),
      fees: calculateWindowMetrics(feesSeries),
    };

    const result: ProjectPipelineResult = {
      slug,
      status: "COMPLETED",
      projectId: project.id,
      tvl: tvlPersist,
      fees: feesPersist,
      revenue: revenuePersist,
      metrics,
      funding: fundingPersist,
    };

    // Sprint 7: coleta concluída (TVL/Fees/Revenue já persistidos) — card avança para a etapa
    // de análise fundamentalista, mesmo se o Scoring não rodar nesta chamada (sem
    // `researchRunId` — ver nota abaixo).
    await advanceProjectCard(project.id, KanbanColumnKey.FUNDAMENTAL_ANALYSIS, {
      researchRunId,
      reason: "DATA_COLLECTED",
    });

    // Sprint 5 (Fase 1/17/31): calcula e persiste o Fundamental Score desta execução, na
    // mesma Research Run — só quando `researchRunId` foi passado (o Worker sempre passa;
    // chamadas diretas de teste/dev sem uma Research Run pulam o scoring, documentado acima).
    if (researchRunId) {
      try {
        result.score = await computeAndPersistFundamentalScore({
          researchRunId,
          projectId: project.id,
          sectorId: sectorId,
          metrics,
          series: { tvl: tvlSeries, revenue: revenueSeries, fees: feesSeries },
          quality: {
            tvl: {
              suspicious: tvlPersist.suspicious > 0,
              invalidRejected: tvlPersist.rejectedInvalid > 0,
            },
            revenue: {
              suspicious: revenuePersist.suspicious > 0,
              invalidRejected: revenuePersist.rejectedInvalid > 0,
            },
            fees: {
              suspicious: feesPersist.suspicious > 0,
              invalidRejected: feesPersist.rejectedInvalid > 0,
            },
          },
        });
      } catch (scoreErr) {
        // Fase 18 do Sprint 4 aplicada aqui: falha no Scoring de um projeto não deve derrubar
        // o pipeline inteiro nem descartar os snapshots já persistidos.
        result.scoreError =
          scoreErr instanceof Error ? scoreErr.message : "Erro desconhecido no scoring";
      }

      // Sprint 6 (Parte 14): cada score é calculado e persistido de forma INDEPENDENTE — uma
      // falha em Tokenomics não deve impedir Capital de rodar, nem descartar o Fundamental já
      // persistido acima.
      try {
        result.tokenomicsScore = await computeAndPersistTokenomicsScore({
          researchRunId,
          projectId: project.id,
          sectorId,
        });
      } catch (tokenomicsErr) {
        result.tokenomicsScoreError =
          tokenomicsErr instanceof Error
            ? tokenomicsErr.message
            : "Erro desconhecido no tokenomics score";
      }

      try {
        result.capitalScore = await computeAndPersistCapitalScore({
          researchRunId,
          projectId: project.id,
          sectorId,
        });
      } catch (capitalErr) {
        result.capitalScoreError =
          capitalErr instanceof Error ? capitalErr.message : "Erro desconhecido no capital score";
      }

      // Sprint 7 (seção 14 do plano original / seção 6 do Pull System): "Scoring Engine conclui
      // → card move para SCORING → PUBLISHED quando a run atinge COMPLETED para aquele
      // projeto". Interpretado como "este projeto individual terminou com sucesso" — a Research
      // Run como um todo pode ainda ficar PARTIAL se outro projeto falhar, isso não deve travar
      // o card deste projeto em SCORING.
      await advanceProjectCard(project.id, KanbanColumnKey.SCORING, {
        researchRunId,
        reason: "SCORE_COMPUTED",
      });
      await advanceProjectCard(project.id, KanbanColumnKey.PUBLISHED, {
        researchRunId,
        reason: "PROJECT_COMPLETED",
        status: KanbanCardStatus.DONE,
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (discoveredProjectId) {
      // Sprint 7 (seção 17 do Pull System): falha em qualquer etapa marca o card como BLOCKED
      // na coluna atual — nunca avança, nunca regride, sempre com motivo registrado.
      await setCardBlocked(discoveredProjectId, message).catch(() => {
        // Nunca deixa uma falha ao atualizar o Kanban mascarar o erro real do pipeline.
      });
    }
    return {
      slug,
      status: "FAILED",
      error: message,
    };
  }
}

// Sprint 4 (Fase 22): callback opcional chamado ANTES de cada projeto (exceto o primeiro).
// Retornar `false` interrompe o batch sem processar o próximo projeto — usado pelo Worker
// para honrar cancelamento cooperativo sem duplicar a lógica de coleta/validação aqui.
// `onProjectCompleted` é chamado DEPOIS de cada projeto — usado pelo Worker para persistir
// progresso incremental (Fase 12) sem que este package saiba nada sobre `ResearchRun`/Prisma
// (Fase 13/14: manter research-engine sem acesso a conceitos de fora do seu domínio).
export interface RunPipelineOptions {
  shouldContinue?: () => Promise<boolean> | boolean;
  onProjectCompleted?: (
    result: ProjectPipelineResult,
    index: number,
    total: number,
  ) => Promise<void> | void;
  /** Sprint 5: propagado a cada `runPipelineForProject` para associar o Score calculado a
   * esta Research Run (Fase 17). */
  researchRunId?: string;
}

/**
 * Sprint 11 (integração CoinGecko): resolvida uma única vez por batch, não por projeto — a
 * `ApiConnection` do provider COINGECKO é opcional (endpoint público funciona sem key). Nunca
 * lança: falha ao decriptar (secret corrompido/`MASTER_ENCRYPTION_KEY` divergente) só resulta
 * em `null`, tratado como "sem key" (mesmo padrão de `connections.ts`'s `sanitize`).
 */
async function resolveCoinGeckoApiKey(): Promise<string | null> {
  const connection = await prisma.apiConnection.findUnique({ where: { provider: "COINGECKO" } });
  if (!connection?.encryptedSecret) return null;
  try {
    return decrypt(connection.encryptedSecret);
  } catch {
    return null;
  }
}

/**
 * Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): mesmo padrão de `resolveCoinGeckoApiKey`, mas
 * para o provider `DEFILLAMA_PRO`. Diferente do CoinGecko, ESTE provider não é keyless — sem
 * `ApiConnection` configurada (ou sem secret), `getTokenUnlocks` nunca é chamado em lugar
 * nenhum do pipeline (ver uso abaixo). Configurar a key em Settings é o único gatilho para
 * ativar a coleta — nenhuma flag adicional, nenhum código morto para reativar.
 */
async function resolveDefiLlamaProApiKey(): Promise<string | null> {
  const connection = await prisma.apiConnection.findUnique({
    where: { provider: "DEFILLAMA_PRO" },
  });
  if (!connection?.encryptedSecret) return null;
  try {
    return decrypt(connection.encryptedSecret);
  } catch {
    return null;
  }
}

export async function runManualResearchPipeline(
  // Sprint 8: sem default — todo chamador precisa decidir explicitamente quais slugs
  // processar (o Worker resolve isso via Discovery + Top 10 Selection antes de chamar esta
  // função; ver infrastructure/workers/research-worker.ts).
  slugs: readonly string[],
  options: RunPipelineOptions = {},
): Promise<PipelineRunSummary> {
  const startedAt = new Date().toISOString();
  const results: ProjectPipelineResult[] = [];
  const coinGeckoApiKey = await resolveCoinGeckoApiKey();
  const defillamaProApiKey = await resolveDefiLlamaProApiKey();

  // Sprint 15 (Catalysts + Risks): GET /hacks buscado UMA VEZ para a Research Run inteira
  // (seção 28: "não fazer N+1 external requests") — falha aqui nunca aborta a run, só deixa a
  // lista vazia (nenhum projeto ganha Risk de segurança nesta run, mas o resto do pipeline
  // segue normalmente).
  let securityIncidents: NormalizedSecurityIncident[] = [];
  try {
    const hacksResult = await getHacks();
    securityIncidents = hacksResult.normalized ?? [];
  } catch (err) {
    logEventsEvent("events.hacks_fetch_failed", {
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }

  // Processamento sequencial intencional (Fase 19: evitar rajada de chamadas simultâneas à
  // DefiLlama processando vários projetos em paralelo).
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    if (slug === undefined) continue;

    if (i > 0 && options.shouldContinue) {
      const shouldContinue = await options.shouldContinue();
      if (!shouldContinue) {
        logPipelineEvent("pipeline_completed", {
          reason: "cancelled",
          processed: i,
          total: slugs.length,
        });
        break;
      }
    }

    const result = await runPipelineForProject(
      slug,
      options.researchRunId,
      coinGeckoApiKey,
      securityIncidents,
      defillamaProApiKey,
    );
    results.push(result);

    if (options.onProjectCompleted) {
      await options.onProjectCompleted(result, i, slugs.length);
    }
  }

  return { startedAt, finishedAt: new Date().toISOString(), results };
}
