import { createHash } from "node:crypto";
import {
  prisma,
  ResearchEventClassificationMethod,
  ResearchEventConfidence,
  ResearchEventImpactDimension,
  ResearchEventKind,
  ResearchEventStatus,
  type ResearchEventCategory,
} from "@crypto-research/database";
import type {
  NormalizedDiscourseTopic,
  NormalizedGithubRelease,
  NormalizedMarketTicker,
  NormalizedSecurityIncident,
  NormalizedSnapshotProposal,
  NormalizedTokenUnlockEvent,
} from "@crypto-research/defi-data";
import { classifyEvent } from "@crypto-research/scoring-engine";

import { logEventsEvent } from "./logger";
import type { TokenMarketKey } from "./profile-repository";

// Sprint 15 (Catalysts + Risks + Fundamental Context) — ver o comentário do model
// `ResearchEvent` em schema.prisma e a seção "Source Investigation" do
// SPRINT_15_IMPLEMENTATION_REPORT.md para a investigação completa. Só 2 fontes reais e
// auto-identificáveis foram encontradas: DefiLlama `/hacks` (Risk, SECURITY_INCIDENT) e os
// `FundingRound` já persistidos (Catalyst, FUNDING, zero coleta nova). Mesma separação de
// camadas dos demais *-repository.ts.

function stableSourceId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// ------------------------------------------------------------------------------------------
// Risk — Security Incidents (DefiLlama /hacks, casado por defillamaId).
// ------------------------------------------------------------------------------------------

export interface EventsPersistResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Persiste incidentes de segurança REAIS para um projeto, a partir de uma lista de hacks JÁ
 * NORMALIZADA E JÁ BUSCADA (uma única vez por Research Run — seção 28: "não fazer N+1 external
 * requests"). Filtra por `defillamaId` exato — nunca por nome (evita atribuição incorreta entre
 * protocolos com nomes parecidos).
 */
export async function persistSecurityIncidentRisks(
  projectId: string,
  defillamaId: string | null,
  allHacks: NormalizedSecurityIncident[],
): Promise<EventsPersistResult> {
  if (!defillamaId) return { created: 0, updated: 0, skipped: 0 };

  const matching = allHacks.filter((h) => h.defillamaId === defillamaId);
  let created = 0;
  let updated = 0;

  for (const incident of matching) {
    const sourceId = stableSourceId(defillamaId, incident.eventDate, incident.name);
    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "DEFILLAMA", sourceId } },
    });

    const descriptionParts = [incident.classification, incident.technique].filter(
      (v): v is string => v !== null,
    );

    const data = {
      kind: ResearchEventKind.RISK,
      category: "SECURITY_INCIDENT" as ResearchEventCategory,
      // Sprint 20: fonte estruturada (DefiLlama /hacks) — nunca passa pela rule engine.
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: incident.name,
      description: descriptionParts.length > 0 ? descriptionParts.join(" — ") : null,
      eventDate: new Date(incident.eventDate),
      publishedAt: null,
      source: "DEFILLAMA",
      sourceUrl: incident.sourceUrl,
      impact: ResearchEventImpactDimension.SECURITY,
      status: ResearchEventStatus.COMPLETED, // incidente já ocorreu — fato histórico, nunca previsão
      confidence: ResearchEventConfidence.HIGH, // fonte primária estruturada (DefiLlama /hacks)
      retrievedAt: new Date(incident.retrievedAt),
    };

    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectSecurityIncidentRisks(
  projectId: string,
  slug: string,
  defillamaId: string | null,
  allHacks: NormalizedSecurityIncident[],
): Promise<void> {
  try {
    const result = await persistSecurityIncidentRisks(projectId, defillamaId, allHacks);
    logEventsEvent("events.security_incidents_collected", { slug, projectId, ...result });
  } catch (err) {
    logEventsEvent("events.security_incidents_failed", {
      slug,
      projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Catalyst — Funding rounds (reclassificação de FundingRound já persistido, zero coleta nova).
// ------------------------------------------------------------------------------------------

/**
 * Reclassifica os `FundingRound` já persistidos (Sprint 6) como Catalyst FUNDING — nenhuma
 * chamada HTTP nova, nenhum dado novo coletado. `sourceId` = `FundingRound.id`, já estável.
 */
export async function persistFundingCatalysts(projectId: string): Promise<EventsPersistResult> {
  const rounds = await prisma.fundingRound.findMany({ where: { projectId } });
  let created = 0;
  let updated = 0;

  for (const round of rounds) {
    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "DEFILLAMA", sourceId: round.id } },
    });

    const amountLabel =
      round.amountUsd !== null
        ? `US$ ${Number(round.amountUsd).toLocaleString("en-US")}`
        : "valor não divulgado";
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "FUNDING" as ResearchEventCategory,
      // Sprint 20: fonte estruturada (FundingRound) — nunca passa pela rule engine.
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: `${round.roundLabel ?? round.roundType} — ${amountLabel}`,
      description: null,
      eventDate: round.raisedAt,
      publishedAt: null,
      source: "DEFILLAMA",
      sourceUrl: null,
      impact: ResearchEventImpactDimension.ECOSYSTEM,
      status: ResearchEventStatus.COMPLETED, // rodada já captada — fato histórico
      confidence: ResearchEventConfidence.HIGH,
      retrievedAt: round.retrievedAt,
    };

    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId: round.id } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectFundingCatalysts(projectId: string, slug: string): Promise<void> {
  try {
    const result = await persistFundingCatalysts(projectId);
    logEventsEvent("events.funding_catalysts_collected", { slug, projectId, ...result });
  } catch (err) {
    logEventsEvent("events.funding_catalysts_failed", {
      slug,
      projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Catalyst — Listing/Delisting (derivado do diff de TokenMarket entre Research Runs, zero
// chamada HTTP nova — Sprint 17). Ver CATALYSTS_RISKS_SOURCE_AUDIT.md seção 7, item 1.
//
// `eventDate` reflete o momento em que a MUDANÇA FOI PERCEBIDA (retrievedAt da coleta atual),
// não a data real do anúncio da exchange — a granularidade é o intervalo entre Research Runs.
// `confidence` é MEDIUM (não HIGH) exatamente por essa imprecisão de data, mesmo a fonte
// (CoinGecko tickers, já usada desde o Sprint 13) sendo primária/estruturada.
//
// Na PRIMEIRA coleta de um projeto (nenhum TokenMarket anterior persistido), `previousMarkets`
// vem vazio — nesse caso NENHUM evento é emitido: listar todos os mercados encontrados como
// "LISTING" seria fabricar histórico que não presenciamos, não uma mudança real detectada.
// ------------------------------------------------------------------------------------------

function tokenMarketKeyId(k: {
  exchangeId: string;
  baseSymbol: string;
  targetSymbol: string;
}): string {
  return `${k.exchangeId}|${k.baseSymbol}|${k.targetSymbol}`;
}

export async function persistTokenMarketListingCatalysts(
  projectId: string,
  previousMarkets: TokenMarketKey[],
  tickers: NormalizedMarketTicker[],
): Promise<EventsPersistResult> {
  if (previousMarkets.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const previousByKey = new Map(previousMarkets.map((m) => [tokenMarketKeyId(m), m]));
  const currentByKey = new Map(tickers.map((t) => [tokenMarketKeyId(t), t]));

  const added = [...currentByKey.entries()].filter(([key]) => !previousByKey.has(key));
  const removed = [...previousByKey.entries()].filter(([key]) => !currentByKey.has(key));

  let created = 0;
  let updated = 0;

  for (const [key, t] of added) {
    const detectedAt = new Date(t.retrievedAt);
    const detectedDay = detectedAt.toISOString().slice(0, 10);
    const sourceId = stableSourceId("LISTING", key, detectedDay);
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "LISTING" as ResearchEventCategory,
      // Sprint 20: derivado por diff estruturado (TokenMarket) — nunca passa pela rule engine.
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: `Listado em ${t.exchangeName} (${t.baseSymbol}/${t.targetSymbol})`,
      description: null,
      eventDate: detectedAt,
      publishedAt: null,
      source: "COINGECKO",
      sourceUrl: t.tradeUrl,
      impact: ResearchEventImpactDimension.MARKET,
      status: ResearchEventStatus.COMPLETED,
      confidence: ResearchEventConfidence.MEDIUM,
      retrievedAt: detectedAt,
    };
    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "COINGECKO", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  for (const [key, m] of removed) {
    const detectedAt = new Date();
    const detectedDay = detectedAt.toISOString().slice(0, 10);
    const sourceId = stableSourceId("DELISTING", key, detectedDay);
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "DELISTING" as ResearchEventCategory,
      // Sprint 20: derivado por diff estruturado (TokenMarket) — nunca passa pela rule engine.
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: `Removido de ${m.exchangeName} (${m.baseSymbol}/${m.targetSymbol})`,
      description: null,
      eventDate: detectedAt,
      publishedAt: null,
      source: "COINGECKO",
      sourceUrl: null,
      impact: ResearchEventImpactDimension.MARKET,
      status: ResearchEventStatus.COMPLETED,
      confidence: ResearchEventConfidence.MEDIUM,
      retrievedAt: detectedAt,
    };
    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "COINGECKO", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectTokenMarketListingCatalysts(
  projectId: string,
  slug: string,
  previousMarkets: TokenMarketKey[],
  tickers: NormalizedMarketTicker[],
): Promise<void> {
  try {
    const result = await persistTokenMarketListingCatalysts(projectId, previousMarkets, tickers);
    logEventsEvent("events.listing_catalysts_collected", { slug, projectId, ...result });
  } catch (err) {
    logEventsEvent("events.listing_catalysts_failed", {
      slug,
      projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Risk — Token Unlocks (Sprint 18). PRONTO, MAS NÃO ATIVADO por padrão: só produz eventos
// quando uma API key real da DefiLlama Pro é configurada em Settings (provider
// `DEFILLAMA_PRO`, ver `resolveDefiLlamaProApiKey` em pipeline.ts) — sem key, o pipeline nunca
// chama `getTokenUnlocks`, então esta função nunca é invocada. Confidence é sempre MEDIUM, nunca
// HIGH: a estrutura da fonte (DefiLlama Pro emissions) foi construída a partir de documentação
// pública, nunca validada contra um payload real (ver comentário de `RawDefiLlamaEmissions` em
// types.ts) — marcar HIGH seria reivindicar uma confiança que ainda não foi verificada.
// ------------------------------------------------------------------------------------------

export async function persistTokenUnlockRisks(
  projectId: string,
  defillamaId: string | null,
  unlocks: NormalizedTokenUnlockEvent[],
): Promise<EventsPersistResult> {
  if (!defillamaId) return { created: 0, updated: 0, skipped: 0 };

  let created = 0;
  let updated = 0;

  for (const unlock of unlocks) {
    const sourceId = stableSourceId(defillamaId, unlock.eventDate, unlock.category ?? "");
    const amountLabel =
      unlock.tokenAmount !== null ? `${unlock.tokenAmount.toLocaleString("en-US")} tokens` : null;
    const data = {
      kind: ResearchEventKind.RISK,
      category: "TOKEN_UNLOCK" as ResearchEventCategory,
      // Sprint 20: fonte estruturada (DefiLlama Pro emissions) — nunca passa pela rule engine.
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: unlock.category ? `Unlock — ${unlock.category}` : "Token Unlock",
      description:
        [unlock.description, amountLabel].filter((v): v is string => v !== null).join(" — ") ||
        null,
      eventDate: new Date(unlock.eventDate),
      publishedAt: null,
      source: "DEFILLAMA_PRO",
      sourceUrl: null,
      impact: ResearchEventImpactDimension.TOKENOMICS,
      status: ResearchEventStatus.SCHEDULED, // agenda de unlock é conhecida com antecedência
      confidence: ResearchEventConfidence.MEDIUM, // fonte nunca validada ao vivo — ver comentário acima
      retrievedAt: new Date(unlock.retrievedAt),
    };

    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "DEFILLAMA_PRO", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectTokenUnlockRisks(
  projectId: string,
  slug: string,
  defillamaId: string | null,
  unlocks: NormalizedTokenUnlockEvent[],
): Promise<void> {
  try {
    const result = await persistTokenUnlockRisks(projectId, defillamaId, unlocks);
    logEventsEvent("events.token_unlocks_collected", { slug, projectId, ...result });
  } catch (err) {
    logEventsEvent("events.token_unlocks_failed", {
      slug,
      projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Catalyst — GitHub Releases (Sprint 19, classificação real desde o Sprint 20). Só chamado
// quando `Project.githubRepo` foi curado manualmente (ver EXTERNAL_IDENTITY_ARCHITECTURE.md).
//
// A categoria é decidida pela Auditable Event Classification Engine
// (`packages/scoring-engine/src/event-classification.ts`, `classifyEvent`) — regras
// determinísticas sobre título+corpo do release, NUNCA um LLM, NUNCA "opinião do modelo" (ver
// EVENT_CLASSIFICATION_ARCHITECTURE.md). Quando nenhuma regra tem evidência suficiente, a
// engine já retorna `OTHER`/`LOW` — comportamento OBRIGATÓRIO (é melhor `OTHER` com baixa
// confiança do que uma categoria errada com falsa precisão).
//
// Releases em DRAFT sempre recebem `confidence: LOW` e `status: UNKNOWN` independente do que a
// engine classificou — um rascunho pode nem representar uma mudança real ainda; a categoria em
// si (o QUE o texto parece descrever) ainda é útil para auditoria, só a CONFIANÇA de que o
// evento de fato ocorreu é rebaixada.
// ------------------------------------------------------------------------------------------

export interface GithubReleaseClassificationSummary {
  otherCount: number;
  ruleUsage: Record<string, number>;
}

export async function persistGithubReleaseCatalysts(
  projectId: string,
  releases: NormalizedGithubRelease[],
): Promise<EventsPersistResult & { classification: GithubReleaseClassificationSummary }> {
  let created = 0;
  let updated = 0;
  let otherCount = 0;
  const ruleUsage: Record<string, number> = {};

  for (const r of releases) {
    const sourceId = String(r.releaseId);
    const classification = classifyEvent({ title: r.title, description: r.body });

    if (classification.ruleId) {
      ruleUsage[classification.ruleId] = (ruleUsage[classification.ruleId] ?? 0) + 1;
    }
    if (classification.category === "OTHER") otherCount += 1;

    const data = {
      kind: ResearchEventKind.CATALYST,
      category: classification.category as ResearchEventCategory,
      classificationMethod: ResearchEventClassificationMethod.RULE,
      classificationRuleId: classification.ruleId,
      classificationEvidence: classification.evidence,
      title: r.title,
      description: null, // corpo do release NUNCA persistido cru — só usado para classificar
      eventDate: new Date(r.eventDate),
      publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
      source: "GITHUB",
      sourceUrl: r.url,
      impact: ResearchEventImpactDimension.ECOSYSTEM,
      status: r.draft ? ResearchEventStatus.UNKNOWN : ResearchEventStatus.COMPLETED,
      confidence: r.draft
        ? ResearchEventConfidence.LOW
        : ResearchEventConfidence[classification.confidence],
      retrievedAt: new Date(r.retrievedAt),
    };

    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "GITHUB", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0, classification: { otherCount, ruleUsage } };
}

export async function collectGithubReleaseCatalysts(
  projectId: string,
  slug: string,
  githubRepo: string | null,
  releases: NormalizedGithubRelease[] | null,
): Promise<void> {
  if (!githubRepo) {
    logEventsEvent("events.github_releases_skipped_no_mapping", { slug, projectId });
    return;
  }
  try {
    const result = await persistGithubReleaseCatalysts(projectId, releases ?? []);
    logEventsEvent("events.github_releases_collected", { slug, projectId, githubRepo, ...result });
  } catch (err) {
    logEventsEvent("events.github_releases_failed", {
      slug,
      projectId,
      githubRepo,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Catalyst — Snapshot Governance (Sprint 19). Só chamado quando `Project.snapshotSpace` foi
// curado manualmente. `status` mapeado do `state` cru da fonte ("pending"/"active"/"closed") —
// qualquer valor não reconhecido vira `UNKNOWN`, nunca uma suposição (regra explícita: "não
// transformar automaticamente uma proposta em COMPLETED apenas porque existe").
// ------------------------------------------------------------------------------------------

function mapSnapshotState(
  state: string,
): (typeof ResearchEventStatus)[keyof typeof ResearchEventStatus] {
  switch (state) {
    case "pending":
      return ResearchEventStatus.SCHEDULED;
    case "active":
      return ResearchEventStatus.ONGOING;
    case "closed":
      return ResearchEventStatus.COMPLETED;
    default:
      return ResearchEventStatus.UNKNOWN;
  }
}

export async function persistSnapshotGovernanceCatalysts(
  projectId: string,
  proposals: NormalizedSnapshotProposal[],
): Promise<EventsPersistResult> {
  let created = 0;
  let updated = 0;

  for (const p of proposals) {
    const sourceId = p.proposalId;
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "GOVERNANCE" as ResearchEventCategory,
      // Sprint 20 (Fase 12 do documento de especificação): Snapshot é fonte estruturada de
      // AUTORIDADE SUPERIOR — a engine de classificação NUNCA é chamada para este evento, nem
      // mesmo quando o título/corpo da proposta contém palavras como "mainnet" (a engine nem
      // tem a oportunidade de reclassificar, por construção — não é uma regra de prioridade
      // dentro da engine, é a arquitetura em si).
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: p.title,
      description: null,
      eventDate: new Date(p.eventDate),
      publishedAt: new Date(p.startAt),
      source: "SNAPSHOT",
      sourceUrl: p.url,
      impact: ResearchEventImpactDimension.GOVERNANCE,
      status: mapSnapshotState(p.state),
      // Fonte primária oficial (GraphQL do próprio Snapshot) e status mapeado diretamente do
      // campo `state` da fonte, sem interpretação — mesmo padrão de confidence HIGH usado para
      // SECURITY_INCIDENT/FUNDING (fontes estruturadas primárias já validadas ao vivo).
      confidence: ResearchEventConfidence.HIGH,
      retrievedAt: new Date(p.retrievedAt),
    };

    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "SNAPSHOT", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectSnapshotGovernanceCatalysts(
  projectId: string,
  slug: string,
  snapshotSpace: string | null,
  proposals: NormalizedSnapshotProposal[] | null,
): Promise<void> {
  if (!snapshotSpace) {
    logEventsEvent("events.snapshot_proposals_skipped_no_mapping", { slug, projectId });
    return;
  }
  try {
    const result = await persistSnapshotGovernanceCatalysts(projectId, proposals ?? []);
    logEventsEvent("events.snapshot_proposals_collected", {
      slug,
      projectId,
      snapshotSpace,
      ...result,
    });
  } catch (err) {
    logEventsEvent("events.snapshot_proposals_failed", {
      slug,
      projectId,
      snapshotSpace,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Reclassificação de eventos GitHub existentes (Sprint 20, Fase 10). Nunca toca eventos de
// fontes ESTRUTURADAS (Snapshot/FundingRound/SecurityIncident/Listing-Delisting/TokenUnlock) —
// filtro `source: "GITHUB"` explícito, essas fontes já são a autoridade e não são reavaliadas
// silenciosamente pela engine (regra explícita da Fase 10: "não reclassificar silenciosamente
// eventos estruturados já classificados por fonte confiável").
//
// LIMITAÇÃO CONHECIDA (documentada, não escondida): o corpo (`body`) do release NUNCA é
// persistido em `ResearchEvent.description` (ver comentário em `persistGithubReleaseCatalysts`)
// — reclassificar um evento já existente só tem o `title` disponível, não o corpo completo que
// alimentou a classificação original. Um evento cuja categoria dependia de uma frase presente só
// no corpo pode não ser corretamente reclassificado aqui. Isso é aceitável porque a
// reclassificação serve para aplicar CORREÇÕES/EVOLUÇÕES de regras sobre o título (o campo mais
// estável e sempre disponível), não para reprocessar o payload original — se a fonte precisar
// ser reprocessada de verdade, a próxima Research Run já faz isso naturalmente
// (`persistGithubReleaseCatalysts` roda de novo com o body real).
//
// Nunca altera `sourceId`/`eventDate`/`publishedAt`/`retrievedAt` — só `category`/
// `classificationMethod`/`classificationRuleId`/`classificationEvidence`/`confidence`.
// Idempotente: mesma entrada (mesmo título) sempre produz a mesma classificação (função pura,
// determinística) — rodar duas vezes não duplica nem oscila.
// ------------------------------------------------------------------------------------------

export interface ReclassificationSummary {
  scanned: number;
  reclassified: number;
  unchanged: number;
}

export async function reclassifyExistingGithubEvents(
  projectId?: string,
): Promise<ReclassificationSummary> {
  const events = await prisma.researchEvent.findMany({
    where: { source: "GITHUB", ...(projectId ? { projectId } : {}) },
  });

  let reclassified = 0;
  let unchanged = 0;

  for (const e of events) {
    const classification = classifyEvent({ title: e.title, description: null });
    const isDraftLike = e.status === ResearchEventStatus.UNKNOWN;
    const nextConfidence = isDraftLike
      ? ResearchEventConfidence.LOW
      : ResearchEventConfidence[classification.confidence];

    if (
      classification.category === e.category &&
      classification.ruleId === e.classificationRuleId &&
      nextConfidence === e.confidence
    ) {
      unchanged += 1;
      continue;
    }

    await prisma.researchEvent.update({
      where: { id: e.id },
      data: {
        category: classification.category as ResearchEventCategory,
        classificationMethod: ResearchEventClassificationMethod.RULE,
        classificationRuleId: classification.ruleId,
        classificationEvidence: classification.evidence,
        confidence: nextConfidence,
      },
    });
    reclassified += 1;
  }

  return { scanned: events.length, reclassified, unchanged };
}

// ------------------------------------------------------------------------------------------
// Catalyst — Discourse Governance Topics (Sprint 23). Só chamado quando
// `Project.discourseForumUrl` foi curado manualmente (ver DISCOURSE_SOURCE_ARCHITECTURE.md).
//
// Mesmo padrão do Snapshot (Sprint 20): fonte de GOVERNANÇA — a engine de classificação NUNCA é
// chamada. Auditoria real (Sprint 23, 240 tópicos de 6 fóruns): as regras da engine, calibradas
// para changelogs do GitHub, geraram ~50% de falsos positivos sobre os 32 tópicos que casaram
// (ex.: "Delegate Platform" → NEW_CHAIN por frase incidental no boilerplate; proposta de deploy
// → MAINNET). Um tópico de fórum é discussão/proposta, não um fato consumado — por isso
// `status` UNKNOWN e `confidence` MEDIUM (existência do tópico é certa; o desfecho não).
// ------------------------------------------------------------------------------------------

export async function persistDiscourseTopicCatalysts(
  projectId: string,
  topics: NormalizedDiscourseTopic[],
): Promise<EventsPersistResult> {
  let created = 0;
  let updated = 0;

  for (const t of topics) {
    const sourceId = String(t.topicId);
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "GOVERNANCE" as ResearchEventCategory,
      classificationMethod: ResearchEventClassificationMethod.STRUCTURED_SOURCE,
      classificationRuleId: null,
      classificationEvidence: null,
      title: t.title,
      description: null, // corpo do tópico NUNCA persistido cru
      eventDate: new Date(t.eventDate),
      publishedAt: null,
      source: "DISCOURSE",
      sourceUrl: t.url,
      impact: ResearchEventImpactDimension.GOVERNANCE,
      status: ResearchEventStatus.UNKNOWN, // um tópico de discussão nunca é COMPLETED por si só
      confidence: ResearchEventConfidence.MEDIUM,
      retrievedAt: new Date(t.retrievedAt),
    };

    const existing = await prisma.researchEvent.findUnique({
      where: { research_event_dedupe: { projectId, source: "DISCOURSE", sourceId } },
    });
    if (existing) {
      await prisma.researchEvent.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.researchEvent.create({ data: { ...data, projectId, sourceId } });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

export async function collectDiscourseTopicCatalysts(
  projectId: string,
  slug: string,
  discourseForumUrl: string | null,
  topics: NormalizedDiscourseTopic[] | null,
): Promise<void> {
  if (!discourseForumUrl) {
    logEventsEvent("events.discourse_skipped_no_mapping", { slug, projectId });
    return;
  }
  try {
    const result = await persistDiscourseTopicCatalysts(projectId, topics ?? []);
    logEventsEvent("events.discourse_collected", {
      slug,
      projectId,
      discourseForumUrl,
      ...result,
    });
  } catch (err) {
    logEventsEvent("events.discourse_failed", {
      slug,
      projectId,
      discourseForumUrl,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ------------------------------------------------------------------------------------------
// Leitura.
// ------------------------------------------------------------------------------------------

export interface ResearchEventView {
  id: string;
  projectId: string;
  kind: "CATALYST" | "RISK";
  category: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  publishedAt: string | null;
  source: string;
  sourceUrl: string | null;
  impact: string;
  status: string;
  confidence: string;
  retrievedAt: string;
  // Sprint 20 (Auditable Event Classification Engine) — disponível para auditoria (Fase 14 do
  // documento de especificação: "a informação deve estar disponível para auditoria", mesmo
  // quando a UI não a exibe diretamente). `null` para eventos anteriores a esta sprint.
  classificationMethod: string | null;
  classificationRuleId: string | null;
  classificationEvidence: string | null;
}

function toView(e: {
  id: string;
  projectId: string;
  kind: string;
  category: string;
  title: string;
  description: string | null;
  eventDate: Date | null;
  publishedAt: Date | null;
  source: string;
  sourceUrl: string | null;
  impact: string;
  status: string;
  confidence: string;
  retrievedAt: Date;
  classificationMethod: string | null;
  classificationRuleId: string | null;
  classificationEvidence: string | null;
}): ResearchEventView {
  return {
    id: e.id,
    projectId: e.projectId,
    kind: e.kind as "CATALYST" | "RISK",
    category: e.category,
    title: e.title,
    description: e.description,
    eventDate: e.eventDate?.toISOString() ?? null,
    publishedAt: e.publishedAt?.toISOString() ?? null,
    source: e.source,
    sourceUrl: e.sourceUrl,
    impact: e.impact,
    status: e.status,
    confidence: e.confidence,
    retrievedAt: e.retrievedAt.toISOString(),
    classificationMethod: e.classificationMethod,
    classificationRuleId: e.classificationRuleId,
    classificationEvidence: e.classificationEvidence,
  };
}

export async function getCatalysts(projectId: string): Promise<ResearchEventView[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { projectId, kind: ResearchEventKind.CATALYST },
    orderBy: { eventDate: "desc" },
  });
  return rows.map(toView);
}

export async function getRisks(projectId: string): Promise<ResearchEventView[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { projectId, kind: ResearchEventKind.RISK },
    orderBy: { eventDate: "desc" },
  });
  return rows.map(toView);
}

// Sprint 16 (Event Impact Analysis) — todos os eventos (Catalyst + Risk) de um projeto, usados
// pelo Event Impact Engine para: (a) carregar o evento sendo analisado; (b) detectar overlap
// com outros eventos do mesmo projeto (seção 15).
export async function getAllEvents(projectId: string): Promise<ResearchEventView[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { projectId },
    orderBy: { eventDate: "desc" },
  });
  return rows.map(toView);
}

export async function getEventById(eventId: string): Promise<ResearchEventView | null> {
  const row = await prisma.researchEvent.findUnique({ where: { id: eventId } });
  return row ? toView(row) : null;
}
