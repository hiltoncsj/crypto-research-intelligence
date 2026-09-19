import {
  computeSingleValueGroupScore,
  summarizeGroupedScore,
  type GroupedScoreSummary,
} from "./generic-group-score";
import { INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS, INSTITUTIONAL_CAPITAL_MAX_SCORE } from "./weights";

// Sprint 6 (Parte 12): Institutional Capital Score = 15 pontos, `institutional-capital-v1`.
// Ao contrário do Tokenomics, este TEM dado real disponível (funding rounds embutidos em
// /protocol/{name}.raises — endpoint gratuito, ver packages/defi-data). Os 4 grupos são
// sinais OBJETIVOS e contáveis (Parte 11/13 da spec: "não criar um score de qualidade do VC
// arbitrário") — nunca uma avaliação subjetiva de "VC bom/ruim":
//
// - CAPITAL_RAISED: percentile do total de capital conhecido (soma de amountUsd) vs pares.
// - INSTITUTIONAL_DEPTH: percentile do número de investidores DISTINTOS conhecidos vs pares.
// - FUNDING_RECENCY: percentile de "quão recente foi o último round" vs pares (mais recente
//   = percentile mais alto — usamos -diasDesdeUltimoRound como o valor a ranquear).
// - CONVICTION_SIGNALS: percentile do número de rounds distintos conhecidos vs pares (mais
//   rounds = mais sinais de conjunto de apoio sustentado ao longo do tempo).

export interface CapitalScoreGroups {
  capitalRaised: number | null;
  institutionalDepth: number | null;
  fundingRecency: number | null;
  convictionSignals: number | null;
}

export interface CapitalScoreResult extends GroupedScoreSummary {
  groups: {
    capitalRaised: ReturnType<typeof computeSingleValueGroupScore>;
    institutionalDepth: ReturnType<typeof computeSingleValueGroupScore>;
    fundingRecency: ReturnType<typeof computeSingleValueGroupScore>;
    convictionSignals: ReturnType<typeof computeSingleValueGroupScore>;
  };
}

export function computeCapitalScore(percentiles: CapitalScoreGroups): CapitalScoreResult {
  const capitalRaised = computeSingleValueGroupScore(
    INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.CAPITAL_RAISED,
    percentiles.capitalRaised,
  );
  const institutionalDepth = computeSingleValueGroupScore(
    INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.INSTITUTIONAL_DEPTH,
    percentiles.institutionalDepth,
  );
  const fundingRecency = computeSingleValueGroupScore(
    INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.FUNDING_RECENCY,
    percentiles.fundingRecency,
  );
  const convictionSignals = computeSingleValueGroupScore(
    INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS.CONVICTION_SIGNALS,
    percentiles.convictionSignals,
  );

  const summary = summarizeGroupedScore(INSTITUTIONAL_CAPITAL_MAX_SCORE, [
    ["CAPITAL_RAISED", capitalRaised],
    ["INSTITUTIONAL_DEPTH", institutionalDepth],
    ["FUNDING_RECENCY", fundingRecency],
    ["CONVICTION_SIGNALS", convictionSignals],
  ]);

  return {
    ...summary,
    groups: { capitalRaised, institutionalDepth, fundingRecency, convictionSignals },
  };
}
