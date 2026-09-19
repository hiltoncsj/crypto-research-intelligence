import { prisma } from "@crypto-research/database";
import {
  computeCapitalScore,
  computeGenericConfidence,
  INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS,
  INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION,
  MIN_PEER_SAMPLE_SIZE,
  percentileRank,
} from "@crypto-research/scoring-engine";

import { computeFundingAggregates, type FundingAggregates } from "./funding-repository";
import { logScoringEvent } from "./logger";

// Sprint 6 (Parte 12): Institutional Capital Score — AO CONTRÁRIO do Tokenomics, este tem
// dado real (funding rounds de /protocol/{name}.raises, endpoint gratuito). 4 sinais objetivos
// e contáveis (Parte 11/13: nunca uma avaliação de "qualidade do VC"):
// - Capital Raised: percentile do total de capital conhecido vs pares do setor.
// - Institutional Depth: percentile do nº de investidores distintos conhecidos vs pares.
// - Funding Recency: percentile de "-diasDesdeUltimoRound" vs pares (mais recente = melhor).
// - Conviction Signals: percentile do nº de rounds distintos conhecidos vs pares.

export interface CapitalScoreInput {
  researchRunId: string;
  projectId: string;
  sectorId: string;
  asOf?: Date;
}

export interface CapitalScoreRecordResult {
  id: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  scoreModelVersion: string;
}

async function loadSectorFundingAggregates(
  sectorId: string,
  asOf: Date,
): Promise<Map<string, FundingAggregates>> {
  const peers = await prisma.project.findMany({ where: { sectorId }, select: { id: true } });
  const result = new Map<string, FundingAggregates>();
  for (const peer of peers) {
    result.set(peer.id, await computeFundingAggregates(peer.id, asOf));
  }
  return result;
}

export async function computeAndPersistCapitalScore(
  input: CapitalScoreInput,
): Promise<CapitalScoreRecordResult> {
  const asOf = input.asOf ?? new Date();
  logScoringEvent("scoring.capital_started", {
    researchRunId: input.researchRunId,
    projectId: input.projectId,
  });

  try {
    const peerAggregates = await loadSectorFundingAggregates(input.sectorId, asOf);
    const ownAggregates = await computeFundingAggregates(input.projectId, asOf);
    peerAggregates.set(input.projectId, ownAggregates);

    const capitalValues = [...peerAggregates.values()]
      .map((a) => a.totalKnownCapitalUsd)
      .filter((v): v is number => v !== null);
    const depthValues = [...peerAggregates.values()].map((a) => a.distinctInvestorCount);
    // Recência: rankeamos -dias (mais recente = valor maior = percentile maior). Projetos sem
    // nenhum round conhecido são excluídos da amostra de pares (não têm o que comparar), não
    // tratados como "0 dias" (isso inflaria artificialmente o percentile de quem tem dado).
    const recencyValues = [...peerAggregates.values()]
      .map((a) => (a.daysSinceLastRaise === null ? null : -a.daysSinceLastRaise))
      .filter((v): v is number => v !== null);
    const roundCountValues = [...peerAggregates.values()]
      .map((a) => a.roundCount)
      .filter((v) => v > 0);

    const capitalRaisedPercentile =
      ownAggregates.totalKnownCapitalUsd === null
        ? null
        : percentileRank(ownAggregates.totalKnownCapitalUsd, capitalValues);
    const institutionalDepthPercentile =
      ownAggregates.distinctInvestorCount === 0
        ? null
        : percentileRank(
            ownAggregates.distinctInvestorCount,
            depthValues.filter((v) => v > 0),
          );
    const ownRecency =
      ownAggregates.daysSinceLastRaise === null ? null : -ownAggregates.daysSinceLastRaise;
    const fundingRecencyPercentile =
      ownRecency === null ? null : percentileRank(ownRecency, recencyValues);
    const convictionSignalsPercentile =
      ownAggregates.roundCount === 0
        ? null
        : percentileRank(ownAggregates.roundCount, roundCountValues);

    const scoreResult = computeCapitalScore({
      capitalRaised: capitalRaisedPercentile,
      institutionalDepth: institutionalDepthPercentile,
      fundingRecency: fundingRecencyPercentile,
      convictionSignals: convictionSignalsPercentile,
    });

    const groupsAvailable = [
      capitalRaisedPercentile !== null,
      institutionalDepthPercentile !== null,
      fundingRecencyPercentile !== null,
      convictionSignalsPercentile !== null,
    ];
    const confidence = computeGenericConfidence(groupsAvailable);

    const breakdown = {
      scoreModelVersion: INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION,
      asOf: asOf.toISOString(),
      knownFunding: {
        totalKnownCapitalUsd: ownAggregates.totalKnownCapitalUsd,
        distinctInvestorCount: ownAggregates.distinctInvestorCount,
        roundCount: ownAggregates.roundCount,
        daysSinceLastRaise: ownAggregates.daysSinceLastRaise,
      },
      groups: {
        capitalRaised: {
          maxWeight: INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.CAPITAL_RAISED,
          score: scoreResult.groups.capitalRaised.score,
          percentile: capitalRaisedPercentile,
          note:
            ownAggregates.totalKnownCapitalUsd === null
              ? "Nenhum round com valor de captação conhecido"
              : null,
        },
        institutionalDepth: {
          maxWeight: INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.INSTITUTIONAL_DEPTH,
          score: scoreResult.groups.institutionalDepth.score,
          percentile: institutionalDepthPercentile,
          note: ownAggregates.distinctInvestorCount === 0 ? "Nenhum investidor conhecido" : null,
        },
        fundingRecency: {
          maxWeight: INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.FUNDING_RECENCY,
          score: scoreResult.groups.fundingRecency.score,
          percentile: fundingRecencyPercentile,
          note: ownAggregates.daysSinceLastRaise === null ? "Nenhum round conhecido" : null,
        },
        convictionSignals: {
          maxWeight: INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.CONVICTION_SIGNALS,
          score: scoreResult.groups.convictionSignals.score,
          percentile: convictionSignalsPercentile,
          note: ownAggregates.roundCount === 0 ? "Nenhum round conhecido" : null,
        },
      },
      missingGroups: scoreResult.missingGroups,
      minPeerSampleSize: MIN_PEER_SAMPLE_SIZE,
    };

    const record = await prisma.institutionalCapitalScore.create({
      data: {
        researchRunId: input.researchRunId,
        projectId: input.projectId,
        scoreModelVersion: INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION,
        totalScore: scoreResult.totalScore,
        maxScore: scoreResult.maxScore,
        confidence,
        partial: scoreResult.partial,
        breakdown: JSON.parse(JSON.stringify(breakdown)),
      },
    });

    logScoringEvent("scoring.capital_completed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      modelVersion: INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION,
      totalScore: scoreResult.totalScore,
      confidence,
    });

    return {
      id: record.id,
      totalScore: scoreResult.totalScore,
      maxScore: scoreResult.maxScore,
      confidence,
      partial: scoreResult.partial,
      scoreModelVersion: INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION,
    };
  } catch (err) {
    logScoringEvent("scoring.capital_failed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
    throw err;
  }
}

export async function getLatestCapitalScore(projectId: string) {
  return prisma.institutionalCapitalScore.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}
