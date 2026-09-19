import { prisma, SnapshotSource as PrismaSnapshotSource } from "@crypto-research/database";
import {
  translateToPortuguese,
  type NormalizedMarketTicker,
  type NormalizedProjectProfile,
} from "@crypto-research/defi-data";

import { logProfileEvent, logTokenMarketEvent } from "./logger";

// Sprint 13 (Parte B — Perfil do Projeto + Onde o Token é Negociado). Mesma separação de
// camadas dos demais *-repository.ts: única camada que fala com Prisma para estes 2 models.
// Nunca inventa dado — só persiste o que os normalizadores de packages/defi-data extraíram do
// MESMO payload de GET /coins/{id} já buscado para FDV/supplies (Sprint 11), sem chamada HTTP
// extra.

// ---------------------------------------------------------------------------------------------
// Perfil — ProjectProfileSnapshot (INSERT-only com dedupe por CONTEÚDO, não por timestamp — ver
// comentário do model no schema.prisma: `last_updated` da CoinGecko muda a cada run mesmo sem
// nenhuma alteração real de descrição/categoria/blockchain).
// ---------------------------------------------------------------------------------------------

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function profileContentEquals(
  a: {
    descriptionEn: string | null;
    categories: string[];
    platforms: string[];
    homepageUrl: string | null;
  },
  b: {
    descriptionEn: string | null;
    categories: string[];
    platforms: string[];
    homepageUrl: string | null;
  },
): boolean {
  return (
    a.descriptionEn === b.descriptionEn &&
    a.homepageUrl === b.homepageUrl &&
    sameStringArray(a.categories, b.categories) &&
    sameStringArray(a.platforms, b.platforms)
  );
}

export type ProfilePersistOutcome = "created_first" | "updated" | "unchanged" | "skipped_empty";

/**
 * Persiste um novo snapshot de perfil SÓ quando o conteúdo normalizado difere do último
 * registrado para este projeto (ou quando é o primeiro). Idempotente por design: rodar a
 * pipeline de novo com o MESMO perfil nunca cria uma linha nova (seção 20 do Sprint 13:
 * "atualizar a informação atual e preservar o histórico" — histórico aqui só cresce quando algo
 * de fato mudou).
 */
export async function persistProjectProfile(
  projectId: string,
  profile: NormalizedProjectProfile | null,
): Promise<ProfilePersistOutcome> {
  if (
    !profile ||
    (profile.descriptionEn === null &&
      profile.categories.length === 0 &&
      profile.platforms.length === 0 &&
      profile.homepageUrl === null)
  ) {
    return "skipped_empty";
  }

  const latest = await prisma.projectProfileSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  if (latest && profileContentEquals(latest, profile)) {
    return "unchanged";
  }

  // Traduzida só quando o conteúdo muda (mesmo gate de dedupe acima) — nunca a cada leitura, para
  // não estourar o limite gratuito da MyMemory. Falha de tradução nunca bloqueia a persistência do
  // perfil em si: `descriptionPt` fica `null` e a UI cai de volta para `descriptionEn`.
  const descriptionPt = await translateToPortuguese(profile.descriptionEn);

  await prisma.projectProfileSnapshot.create({
    data: {
      projectId,
      descriptionEn: profile.descriptionEn,
      descriptionPt,
      categories: profile.categories,
      platforms: profile.platforms,
      homepageUrl: profile.homepageUrl,
      source: PrismaSnapshotSource.COINGECKO,
      sourceTimestamp: new Date(profile.retrievedAt),
      retrievedAt: new Date(profile.retrievedAt),
    },
  });

  return latest ? "updated" : "created_first";
}

export async function getLatestProjectProfile(projectId: string) {
  return prisma.projectProfileSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Coleta+persiste o perfil de UM projeto a partir de um payload JÁ BUSCADO (mesma chamada de
 * `getCoinMarketData`, seção 15/22 do Sprint 13: "não duplicar coleta"). Nunca lança — isolamento
 * por projeto, mesmo contrato do resto do pipeline.
 */
export async function collectProjectProfile(
  projectId: string,
  slug: string,
  coinGeckoId: string | null,
  normalizedProfile: NormalizedProjectProfile | null,
): Promise<void> {
  if (!coinGeckoId) {
    logProfileEvent("profile.skipped_no_coingecko_id", { slug, projectId });
    return;
  }
  try {
    const outcome = await persistProjectProfile(projectId, normalizedProfile);
    if (outcome === "unchanged" || outcome === "skipped_empty") {
      logProfileEvent("profile.unchanged", { slug, projectId, coinGeckoId, outcome });
    } else {
      logProfileEvent("profile.updated", { slug, projectId, coinGeckoId, outcome });
    }
  } catch (err) {
    logProfileEvent("profile.failed", {
      slug,
      projectId,
      coinGeckoId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Mercados — TokenMarket (UPSERT "estado atual", mesma filosofia de `Token` — ver comentário do
// model no schema.prisma).
// ---------------------------------------------------------------------------------------------

export interface TokenMarketsPersistResult {
  upserted: number;
  rejectedInvalid: number;
}

/**
 * Upsert de cada mercado observado na coleta. `volumeUsd`/`lastPriceUsd` negativos ou NaN são
 * rejeitados (não persistidos) sem derrubar os demais mercados do mesmo projeto — mesmo padrão
 * de validação ponto-a-ponto do resto do sistema.
 */
export async function persistTokenMarkets(
  projectId: string,
  tickers: NormalizedMarketTicker[],
): Promise<TokenMarketsPersistResult> {
  let upserted = 0;
  let rejectedInvalid = 0;

  for (const t of tickers) {
    if (t.volumeUsd !== null && (!Number.isFinite(t.volumeUsd) || t.volumeUsd < 0)) {
      rejectedInvalid += 1;
      continue;
    }
    if (t.lastPriceUsd !== null && (!Number.isFinite(t.lastPriceUsd) || t.lastPriceUsd < 0)) {
      rejectedInvalid += 1;
      continue;
    }

    await prisma.tokenMarket.upsert({
      where: {
        token_market_dedupe: {
          projectId,
          exchangeId: t.exchangeId,
          baseSymbol: t.baseSymbol,
          targetSymbol: t.targetSymbol,
        },
      },
      update: {
        exchangeName: t.exchangeName,
        marketType: t.marketType,
        tradeUrl: t.tradeUrl,
        volumeUsd: t.volumeUsd,
        lastPriceUsd: t.lastPriceUsd,
        source: PrismaSnapshotSource.COINGECKO,
        sourceTimestamp: new Date(t.sourceTimestamp),
        retrievedAt: new Date(t.retrievedAt),
      },
      create: {
        projectId,
        exchangeId: t.exchangeId,
        exchangeName: t.exchangeName,
        baseSymbol: t.baseSymbol,
        targetSymbol: t.targetSymbol,
        marketType: t.marketType,
        tradeUrl: t.tradeUrl,
        volumeUsd: t.volumeUsd,
        lastPriceUsd: t.lastPriceUsd,
        source: PrismaSnapshotSource.COINGECKO,
        sourceTimestamp: new Date(t.sourceTimestamp),
        retrievedAt: new Date(t.retrievedAt),
      },
    });
    upserted += 1;
  }

  return { upserted, rejectedInvalid };
}

export interface TokenMarketKey {
  exchangeId: string;
  exchangeName: string;
  baseSymbol: string;
  targetSymbol: string;
}

/**
 * Estado ATUAL de `TokenMarket` (antes do upsert da coleta corrente) — usado pelo Sprint 17
 * (Catalyst LISTING/DELISTING) para diffar contra os tickers recém-buscados. Precisa ser
 * chamado ANTES de `persistTokenMarkets`/`collectTokenMarkets`, senão o "antes" já seria igual
 * ao "depois". Nenhuma chamada HTTP — só leitura do que já está persistido.
 */
export async function getCurrentTokenMarketKeys(projectId: string): Promise<TokenMarketKey[]> {
  const rows = await prisma.tokenMarket.findMany({
    where: { projectId },
    select: { exchangeId: true, exchangeName: true, baseSymbol: true, targetSymbol: true },
  });
  return rows;
}

export interface TokenMarketView {
  exchangeName: string;
  baseSymbol: string;
  targetSymbol: string;
  marketType: string;
  tradeUrl: string | null;
  volumeUsd: number | null;
  retrievedAt: Date;
}

/** Mercados observados na última coleta — ordenados por volume desc (maior volume primeiro),
 * sem nenhum julgamento de qualidade (seção 17 do Sprint 13: nunca ranquear "melhor exchange"). */
export async function getTokenMarkets(projectId: string): Promise<TokenMarketView[]> {
  const rows = await prisma.tokenMarket.findMany({
    where: { projectId },
    orderBy: [{ volumeUsd: "desc" }, { exchangeName: "asc" }],
  });
  return rows.map((r) => ({
    exchangeName: r.exchangeName,
    baseSymbol: r.baseSymbol,
    targetSymbol: r.targetSymbol,
    marketType: r.marketType,
    tradeUrl: r.tradeUrl,
    volumeUsd: r.volumeUsd === null ? null : Number(r.volumeUsd),
    retrievedAt: r.retrievedAt,
  }));
}

/**
 * Coleta+persiste mercados de UM projeto a partir de um payload JÁ BUSCADO. Nunca lança.
 */
export async function collectTokenMarkets(
  projectId: string,
  slug: string,
  coinGeckoId: string | null,
  normalizedTickers: NormalizedMarketTicker[] | null,
): Promise<void> {
  if (!coinGeckoId) {
    logTokenMarketEvent("token_markets.skipped_no_coingecko_id", { slug, projectId });
    return;
  }
  try {
    const result = await persistTokenMarkets(projectId, normalizedTickers ?? []);
    logTokenMarketEvent("token_markets.collected", {
      slug,
      projectId,
      coinGeckoId,
      recordsReceived: normalizedTickers?.length ?? 0,
      ...result,
    });
  } catch (err) {
    logTokenMarketEvent("token_markets.failed", {
      slug,
      projectId,
      coinGeckoId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}
