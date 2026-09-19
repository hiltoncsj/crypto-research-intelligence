import { prisma } from "@crypto-research/database";
import {
  computeGenericConfidence,
  computeMcToFdvRatio,
  computeTokenomicsScore,
  MIN_PEER_SAMPLE_SIZE,
  percentileRank,
  TOKENOMICS_GROUP_WEIGHTS,
  TOKENOMICS_SCORE_MODEL_VERSION,
} from "@crypto-research/scoring-engine";

import { logScoringEvent } from "./logger";

// Sprint 6 (Parte 7): liga a matemática pura de computeTokenomicsScore ao banco. Segue
// EXATAMENTE o padrão de score-repository.ts (Sprint 5): não recoleta nada da DefiLlama, só
// consome o que já foi persistido por funding-repository.ts / pipeline.ts nesta Research Run.
//
// ESTADO REAL HOJE: `unlockPressure`, `distribution` e `valueCapture` são SEMPRE null — não
// existe fonte gratuita para unlock schedule, concentração de holders, ou mecanismos de value
// capture (staking/buyback/burn). `supplyDilution` usa MC/FDV como proxy e ESTE grupo TEM dado
// real desde a integração CoinGecko (Sprint 11, ver funding-repository.ts): `fdvUsd` é
// preenchido sempre que o projeto tem `coinGeckoId` conhecido — confirmado com dados reais em
// produção (ex.: AAVE/UNI com FDV populado, percentis de Supply Dilution calculados
// normalmente). Só fica `null` quando o projeto não tem `coinGeckoId` (DefiLlama não conhece o
// `gecko_id` daquele protocolo) ou a chamada à CoinGecko falhou nesta run — nunca por falta de
// fonte. Os outros 3 grupos continuam sem fonte real; a matemática deles é testada com fixtures
// sintéticas (packages/scoring-engine/tests/tokenomics-score.test) para quando uma fonte de
// unlocks/holders/value-capture for integrada no futuro.

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface TokenomicsScoreInput {
  researchRunId: string;
  projectId: string;
  sectorId: string;
  asOf?: Date;
}

export interface TokenomicsScoreRecordResult {
  id: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  scoreModelVersion: string;
}

export async function computeAndPersistTokenomicsScore(
  input: TokenomicsScoreInput,
): Promise<TokenomicsScoreRecordResult> {
  logScoringEvent("scoring.tokenomics_started", {
    researchRunId: input.researchRunId,
    projectId: input.projectId,
  });

  try {
    const [ownToken, peerProjects] = await Promise.all([
      prisma.token.findUnique({ where: { projectId: input.projectId } }),
      prisma.project.findMany({ where: { sectorId: input.sectorId }, select: { id: true } }),
    ]);

    const peerTokens = await prisma.token.findMany({
      where: { projectId: { in: peerProjects.map((p) => p.id) } },
    });

    const ownMcToFdv = ownToken
      ? computeMcToFdvRatio(toNumberOrNull(ownToken.marketCapUsd), toNumberOrNull(ownToken.fdvUsd))
      : null;
    const peerMcToFdvValues = peerTokens
      .map((t) => computeMcToFdvRatio(toNumberOrNull(t.marketCapUsd), toNumberOrNull(t.fdvUsd)))
      .filter((v): v is number => v !== null);

    const supplyDilutionPercentile =
      ownMcToFdv === null ? null : percentileRank(ownMcToFdv, [...peerMcToFdvValues, ownMcToFdv]);

    // Sem fonte real hoje (ver comentário do módulo) — nunca fabricado.
    const unlockPressurePercentile: number | null = null;
    const distributionPercentile: number | null = null;
    const valueCapturePercentile: number | null = null;

    const scoreResult = computeTokenomicsScore({
      supplyDilution: supplyDilutionPercentile,
      unlockPressure: unlockPressurePercentile,
      distribution: distributionPercentile,
      valueCapture: valueCapturePercentile,
    });

    const groupsAvailable = [
      supplyDilutionPercentile !== null,
      unlockPressurePercentile !== null,
      distributionPercentile !== null,
      valueCapturePercentile !== null,
    ];
    const confidence = computeGenericConfidence(groupsAvailable);

    const breakdown = {
      scoreModelVersion: TOKENOMICS_SCORE_MODEL_VERSION,
      asOf: (input.asOf ?? new Date()).toISOString(),
      groups: {
        supplyDilution: {
          maxWeight: TOKENOMICS_GROUP_WEIGHTS.SUPPLY_DILUTION,
          score: scoreResult.groups.supplyDilution.score,
          percentile: supplyDilutionPercentile,
          note:
            supplyDilutionPercentile === null
              ? ownToken
                ? "FDV indisponível (supply não é exposto por fonte gratuita) — MC/FDV não calculável"
                : "Nenhum dado de token coletado para este projeto"
              : null,
        },
        unlockPressure: {
          maxWeight: TOKENOMICS_GROUP_WEIGHTS.UNLOCK_PRESSURE,
          score: scoreResult.groups.unlockPressure.score,
          percentile: unlockPressurePercentile,
          note: "Sem fonte gratuita para cronograma de unlocks nesta sprint (api.llama.fi/emissions requer plano pago)",
        },
        distribution: {
          maxWeight: TOKENOMICS_GROUP_WEIGHTS.DISTRIBUTION,
          score: scoreResult.groups.distribution.score,
          percentile: distributionPercentile,
          note: "Sem fonte gratuita para concentração de holders nesta sprint",
        },
        valueCapture: {
          maxWeight: TOKENOMICS_GROUP_WEIGHTS.VALUE_CAPTURE,
          score: scoreResult.groups.valueCapture.score,
          percentile: valueCapturePercentile,
          note: "Sem fonte gratuita para staking/buyback/burn/revenue share nesta sprint",
        },
      },
      missingGroups: scoreResult.missingGroups,
      minPeerSampleSize: MIN_PEER_SAMPLE_SIZE,
    };

    const record = await prisma.tokenomicsScore.create({
      data: {
        researchRunId: input.researchRunId,
        projectId: input.projectId,
        scoreModelVersion: TOKENOMICS_SCORE_MODEL_VERSION,
        totalScore: scoreResult.totalScore,
        maxScore: scoreResult.maxScore,
        confidence,
        partial: scoreResult.partial,
        breakdown: JSON.parse(JSON.stringify(breakdown)),
      },
    });

    logScoringEvent("scoring.tokenomics_completed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      modelVersion: TOKENOMICS_SCORE_MODEL_VERSION,
      totalScore: scoreResult.totalScore,
      confidence,
    });

    return {
      id: record.id,
      totalScore: scoreResult.totalScore,
      maxScore: scoreResult.maxScore,
      confidence,
      partial: scoreResult.partial,
      scoreModelVersion: TOKENOMICS_SCORE_MODEL_VERSION,
    };
  } catch (err) {
    logScoringEvent("scoring.tokenomics_failed", {
      researchRunId: input.researchRunId,
      projectId: input.projectId,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
    throw err;
  }
}

export async function getLatestTokenomicsScore(projectId: string) {
  return prisma.tokenomicsScore.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
}
