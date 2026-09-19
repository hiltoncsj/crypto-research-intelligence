// Sprint 6: matemática compartilhada por Tokenomics Score e Institutional Capital Score —
// ambos são compostos por grupos de "valor único" (um percentile por grupo, sem sub-janelas
// 7d/30d/90d como o Fundamental Score tem), então a fórmula de agregação é mais simples:
// score do grupo = maxWeight * (percentile / 100), ou null se o percentile não pôde ser
// calculado (dado ausente ou amostra de pares insuficiente — mesma regra do Fundamental:
// nunca 0 silencioso, sempre listado em `missingGroups`).

export interface SingleValueGroupScoreResult {
  score: number | null;
  maxWeight: number;
}

export function computeSingleValueGroupScore(
  maxWeight: number,
  percentile: number | null,
): SingleValueGroupScoreResult {
  if (percentile === null) return { score: null, maxWeight };
  return { score: maxWeight * (percentile / 100), maxWeight };
}

export interface GroupedScoreSummary {
  totalScore: number;
  maxScore: number;
  partial: boolean;
  missingGroups: string[];
}

/** Soma os grupos de um score composto (Tokenomics ou Capital), tratando `score: null` como
 * "grupo ausente" (contribui 0 ao total, mas listado explicitamente — nunca fabricado). */
export function summarizeGroupedScore(
  maxScore: number,
  entries: ReadonlyArray<readonly [string, SingleValueGroupScoreResult]>,
): GroupedScoreSummary {
  const missingGroups = entries.filter(([, g]) => g.score === null).map(([name]) => name);
  const totalScore = entries.reduce((sum, [, g]) => sum + (g.score ?? 0), 0);
  return { totalScore, maxScore, partial: missingGroups.length > 0, missingGroups };
}

/**
 * Sprint 6: Confidence simplificada (v1) para Tokenomics/Capital — completude apenas (fração
 * de grupos com dado disponível). Deliberadamente mais simples que a Confidence do Fundamental
 * Score (4 fatores: completude/amostra/qualidade/recência) porque os inputs de Tokenomics e
 * Capital ainda não têm o conceito de SUSPICIOUS/INVALID por campo — não inventamos precisão
 * que os dados de origem não sustentam (mesma filosofia da Fase 10 do Sprint 5).
 */
export function computeGenericConfidence(groupAvailableFlags: readonly boolean[]): number {
  if (groupAvailableFlags.length === 0) return 0;
  const completeness = groupAvailableFlags.filter(Boolean).length / groupAvailableFlags.length;
  return Math.min(100, Math.max(0, 100 * completeness));
}
