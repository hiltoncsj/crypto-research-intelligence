import { FundingRoundType, prisma } from "@crypto-research/database";
import {
  classifyRoundType,
  type NormalizedFundingRound,
  type NormalizedTokenSummary,
  type NormalizedTokenSupply,
} from "@crypto-research/defi-data";

// Sprint 6 (Parte 2/9/10): persistência dos dados brutos de Token e Funding — a única camada
// que fala com Prisma para essas entidades (mesma separação de camadas de snapshot-repository).
// Nunca inventa dado: `summary`/`rounds` vêm do adapter (packages/defi-data), que só extrai o
// que a DefiLlama de fato retornou.

function toRoundType(label: string | null): FundingRoundType {
  return classifyRoundType(label) as FundingRoundType;
}

/** Upsert 1:1 por projeto — Token é um resumo "estado atual", não uma série histórica. */
export async function persistTokenSummary(
  projectId: string,
  summary: NormalizedTokenSummary | null,
): Promise<void> {
  if (!summary) return;

  await prisma.token.upsert({
    where: { projectId },
    update: {
      symbol: summary.symbol,
      contractAddress: summary.contractAddress,
      marketCapUsd: summary.marketCapUsd,
      retrievedAt: new Date(summary.retrievedAt),
    },
    create: {
      projectId,
      symbol: summary.symbol,
      contractAddress: summary.contractAddress,
      marketCapUsd: summary.marketCapUsd,
      retrievedAt: new Date(summary.retrievedAt),
    },
  });
}

/**
 * Sprint 11 (integração CoinGecko): atualiza SÓ os campos que a DefiLlama não expõe
 * (fdvUsd/circulatingSupply/totalSupply/maxSupply/marketCapRank) + `coinGeckoRetrievedAt` — nunca toca em
 * `marketCapUsd`/`symbol`/`contractAddress`/`retrievedAt` (esses continuam exclusivamente da
 * DefiLlama, via `persistTokenSummary`). Requer que a linha de `Token` já exista (criada por
 * `persistTokenSummary` antes desta chamada no pipeline) — se `supply` for `null` (sem
 * `coinGeckoId` ou chamada falhou), não faz nada: nunca grava `0`/inventa valor.
 */
export async function persistTokenSupply(
  projectId: string,
  supply: NormalizedTokenSupply | null,
): Promise<void> {
  if (!supply) return;

  await prisma.token.updateMany({
    where: { projectId },
    data: {
      fdvUsd: supply.fdvUsd,
      circulatingSupply: supply.circulatingSupply,
      totalSupply: supply.totalSupply,
      maxSupply: supply.maxSupply,
      marketCapRank: supply.marketCapRank,
      coinGeckoRetrievedAt: new Date(supply.retrievedAt),
    },
  });
}

async function ensureInvestor(name: string): Promise<string> {
  const investor = await prisma.investor.upsert({ where: { name }, update: {}, create: { name } });
  return investor.id;
}

export interface FundingPersistResult {
  created: number;
  skippedDuplicate: number;
}

/** Idempotente: dedupe por (projectId, sourceTimestamp, roundLabel) — a DefiLlama não fornece
 * um id estável por round, então rodar o pipeline duas vezes não deve duplicar rounds. */
export async function persistFundingRounds(
  projectId: string,
  rounds: NormalizedFundingRound[],
): Promise<FundingPersistResult> {
  let created = 0;
  let skippedDuplicate = 0;

  for (const round of rounds) {
    const sourceTimestamp = new Date(round.date);
    // findFirst (não findUnique) porque o Prisma Client não aceita `null` no input de uma
    // unique composta quando um dos campos é nullable — findFirst com `equals` lida com isso
    // normalmente. A constraint única real ainda existe no banco (ver schema.prisma), então
    // uma corrida entre duas execuções concorrentes falharia no `create` abaixo, não aqui.
    const existing = await prisma.fundingRound.findFirst({
      where: { projectId, sourceTimestamp, roundLabel: round.roundLabel },
    });
    if (existing) {
      skippedDuplicate += 1;
      continue;
    }

    const record = await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: toRoundType(round.roundLabel),
        roundLabel: round.roundLabel,
        amountUsd: round.amountUsd,
        valuationUsd: round.valuationUsd,
        raisedAt: sourceTimestamp,
        sourceTimestamp,
        retrievedAt: new Date(round.retrievedAt),
      },
    });

    const investorNames = [...new Set([...round.leadInvestors, ...round.otherInvestors])];
    for (const name of investorNames) {
      const investorId = await ensureInvestor(name);
      const isLead = round.leadInvestors.includes(name);
      await prisma.fundingRoundInvestor.upsert({
        where: { fundingRoundId_investorId: { fundingRoundId: record.id, investorId } },
        update: { isLead },
        create: { fundingRoundId: record.id, investorId, isLead },
      });
    }
    created += 1;
  }

  return { created, skippedDuplicate };
}

export interface FundingRoundView {
  id: string;
  roundType: FundingRoundType;
  roundLabel: string | null;
  amountUsd: number | null;
  valuationUsd: number | null;
  raisedAt: Date;
  leadInvestors: string[];
  otherInvestors: string[];
}

export async function loadFundingRounds(projectId: string): Promise<FundingRoundView[]> {
  const rounds = await prisma.fundingRound.findMany({
    where: { projectId },
    include: { investors: { include: { investor: true } } },
    orderBy: { raisedAt: "desc" },
  });

  return rounds.map((r) => ({
    id: r.id,
    roundType: r.roundType,
    roundLabel: r.roundLabel,
    amountUsd: r.amountUsd === null ? null : Number(r.amountUsd),
    valuationUsd: r.valuationUsd === null ? null : Number(r.valuationUsd),
    raisedAt: r.raisedAt,
    leadInvestors: r.investors.filter((i) => i.isLead).map((i) => i.investor.name),
    otherInvestors: r.investors.filter((i) => !i.isLead).map((i) => i.investor.name),
  }));
}

/** Agregados objetivos usados pelo Institutional Capital Score (Parte 11: sinais contáveis,
 * nunca uma avaliação de "qualidade do VC"). */
export interface FundingAggregates {
  totalKnownCapitalUsd: number | null;
  distinctInvestorCount: number;
  daysSinceLastRaise: number | null;
  roundCount: number;
}

export async function computeFundingAggregates(
  projectId: string,
  asOf: Date,
): Promise<FundingAggregates> {
  const rounds = await loadFundingRounds(projectId);
  if (rounds.length === 0) {
    return {
      totalKnownCapitalUsd: null,
      distinctInvestorCount: 0,
      daysSinceLastRaise: null,
      roundCount: 0,
    };
  }

  const amounts = rounds.map((r) => r.amountUsd).filter((v): v is number => v !== null);
  const totalKnownCapitalUsd = amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) : null;

  const investors = new Set<string>();
  for (const r of rounds) {
    for (const name of [...r.leadInvestors, ...r.otherInvestors]) investors.add(name);
  }

  const firstRound = rounds[0];
  if (!firstRound) {
    return {
      totalKnownCapitalUsd,
      distinctInvestorCount: investors.size,
      daysSinceLastRaise: null,
      roundCount: 0,
    };
  }
  const mostRecent = rounds.reduce(
    (latest, r) => (r.raisedAt > latest ? r.raisedAt : latest),
    firstRound.raisedAt,
  );
  const daysSinceLastRaise = (asOf.getTime() - mostRecent.getTime()) / (24 * 60 * 60 * 1000);

  return {
    totalKnownCapitalUsd,
    distinctInvestorCount: investors.size,
    daysSinceLastRaise,
    roundCount: rounds.length,
  };
}
