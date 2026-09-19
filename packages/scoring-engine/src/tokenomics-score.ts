import {
  computeSingleValueGroupScore,
  summarizeGroupedScore,
  type GroupedScoreSummary,
} from "./generic-group-score";
import { TOKENOMICS_GROUP_WEIGHTS, TOKENOMICS_MAX_SCORE } from "./weights";

// Sprint 6 (Parte 7): Tokenomics Score = 20 pontos, `tokenomics-v1`. Cada grupo recebe um
// percentile já calculado por quem chama (research-engine/tokenomics-repository.ts, que
// conhece o setor/pares) — esta função é pura, sem acesso a banco (mesma separação de camadas
// do Fundamental Score).
//
// HOJE (Sprint 6), nenhum dos 4 grupos tem fonte de dado real (ver Token/TokenUnlock no
// schema — supply/unlocks/value capture não são expostos pelos endpoints gratuitos da
// DefiLlama), então em produção este score sempre retorna `totalScore: 0`, os 4 grupos em
// `missingGroups`, `partial: true`. A matemática abaixo é real e testada com fixtures
// sintéticas para provar que funciona quando/se uma fonte de dado for integrada no futuro —
// isso não é enganoso: o breakdown deixa exatamente essa ausência explícita, nunca fabrica
// um "20/20" ou qualquer valor não sustentado por evidência.

export interface TokenomicsScoreGroups {
  supplyDilution: number | null;
  unlockPressure: number | null;
  distribution: number | null;
  valueCapture: number | null;
}

export interface TokenomicsScoreResult extends GroupedScoreSummary {
  groups: {
    supplyDilution: ReturnType<typeof computeSingleValueGroupScore>;
    unlockPressure: ReturnType<typeof computeSingleValueGroupScore>;
    distribution: ReturnType<typeof computeSingleValueGroupScore>;
    valueCapture: ReturnType<typeof computeSingleValueGroupScore>;
  };
}

export function computeTokenomicsScore(percentiles: TokenomicsScoreGroups): TokenomicsScoreResult {
  const supplyDilution = computeSingleValueGroupScore(
    TOKENOMICS_GROUP_WEIGHTS.SUPPLY_DILUTION,
    percentiles.supplyDilution,
  );
  const unlockPressure = computeSingleValueGroupScore(
    TOKENOMICS_GROUP_WEIGHTS.UNLOCK_PRESSURE,
    percentiles.unlockPressure,
  );
  const distribution = computeSingleValueGroupScore(
    TOKENOMICS_GROUP_WEIGHTS.DISTRIBUTION,
    percentiles.distribution,
  );
  const valueCapture = computeSingleValueGroupScore(
    TOKENOMICS_GROUP_WEIGHTS.VALUE_CAPTURE,
    percentiles.valueCapture,
  );

  const summary = summarizeGroupedScore(TOKENOMICS_MAX_SCORE, [
    ["SUPPLY_DILUTION", supplyDilution],
    ["UNLOCK_PRESSURE", unlockPressure],
    ["DISTRIBUTION", distribution],
    ["VALUE_CAPTURE", valueCapture],
  ]);

  return { ...summary, groups: { supplyDilution, unlockPressure, distribution, valueCapture } };
}

/** Sprint 6 (Parte 5): unlock pressure = próximos 30d de unlock / circulating supply. Nunca
 * NaN/Infinity — supply ausente ou zero vira null, não "infinito de pressão". */
export function computeUnlockPressureRatio(
  next30dUnlockAmount: number | null,
  circulatingSupply: number | null,
): number | null {
  if (next30dUnlockAmount === null || circulatingSupply === null) return null;
  if (circulatingSupply <= 0) return null;
  return next30dUnlockAmount / circulatingSupply;
}

/** Sprint 6 (Parte 3): MC/FDV — só quando ambos > 0. */
export function computeMcToFdvRatio(
  marketCapUsd: number | null,
  fdvUsd: number | null,
): number | null {
  if (marketCapUsd === null || fdvUsd === null) return null;
  if (marketCapUsd <= 0 || fdvUsd <= 0) return null;
  return marketCapUsd / fdvUsd;
}
