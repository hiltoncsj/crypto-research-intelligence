import { createHash } from "node:crypto";
import {
  prisma,
  ResearchEventConfidence,
  ResearchEventImpactDimension,
  ResearchEventKind,
  ResearchEventStatus,
  type ResearchEventCategory,
} from "@crypto-research/database";
import type {
  NormalizedGithubRelease,
  NormalizedMarketTicker,
  NormalizedSecurityIncident,
  NormalizedSnapshotProposal,
  NormalizedTokenUnlockEvent,
} from "@crypto-research/defi-data";

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
// Catalyst — GitHub Releases (Sprint 19). Só chamado quando `Project.githubRepo` foi curado
// manualmente (ver EXTERNAL_IDENTITY_ARCHITECTURE.md) — nunca inferido por nome.
//
// Categoria SEMPRE `OTHER`: um release não permite, por si só, inferir com confiança se é
// PROTOCOL_UPGRADE/MAINNET/TESTNET/PRODUCT_LAUNCH (regra explícita da spec — "não classificar
// automaticamente qualquer release como MAINNET/PROTOCOL_UPGRADE... nunca inventar significado
// sem evidência"). `confidence` é `MEDIUM` para releases publicadas (fonte primária oficial,
// mas classificação semântica ambígua) e `LOW` para drafts (o evento pode nem representar uma
// mudança real ainda — só um rascunho).
// ------------------------------------------------------------------------------------------

export async function persistGithubReleaseCatalysts(
  projectId: string,
  releases: NormalizedGithubRelease[],
): Promise<EventsPersistResult> {
  let created = 0;
  let updated = 0;

  for (const r of releases) {
    const sourceId = String(r.releaseId);
    const data = {
      kind: ResearchEventKind.CATALYST,
      category: "OTHER" as ResearchEventCategory,
      title: r.title,
      description: null,
      eventDate: new Date(r.eventDate),
      publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
      source: "GITHUB",
      sourceUrl: r.url,
      impact: ResearchEventImpactDimension.ECOSYSTEM,
      status: r.draft ? ResearchEventStatus.UNKNOWN : ResearchEventStatus.COMPLETED,
      confidence: r.draft ? ResearchEventConfidence.LOW : ResearchEventConfidence.MEDIUM,
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

  return { created, updated, skipped: 0 };
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
