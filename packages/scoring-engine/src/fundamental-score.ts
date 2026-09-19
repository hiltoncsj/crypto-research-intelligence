import {
  EFFICIENCY_SUB_WEIGHTS,
  FUNDAMENTAL_GROUP_WEIGHTS,
  FUNDAMENTAL_MAX_SCORE,
  WINDOW_WEIGHTS,
  type GrowthWindow,
} from "./weights";

// Sprint 5 (Fase 3/4/9/24): matemática pura do Fundamental Score. Não sabe nada sobre banco,
// setores, ou como os percentiles foram calculados — recebe percentiles já resolvidos (0-100
// ou null quando a janela/ratio não pôde ser avaliada) e devolve a pontuação.
//
// REGRA CENTRAL (resposta às Fases 9/24 — "dados insuficientes" / "missing não vira zero"):
// dentro de um grupo (ex: TVL Growth), cada janela (7d/30d/90d) tem um peso relativo
// (WINDOW_WEIGHTS). Se uma janela está ausente (não há dado ou amostra de pares insuficiente
// → percentile null), ela é EXCLUÍDA e o peso das janelas restantes é RENORMALIZADO para que
// ainda somem o peso total do grupo — ou seja, o grupo usa 100% do seu peso máximo baseado
// apenas nas janelas realmente disponíveis, em vez de perder pontos por causa de uma janela
// ausente (isso seria penalizar o projeto duplamente: uma vez na Confidence, outra vez no
// Score). Se NENHUMA janela do grupo está disponível, o grupo inteiro fica `null` (não vira 0
// silenciosamente) e contribui 0 ao total, mas aparece explicitamente marcado como ausente no
// breakdown (`partial: true` + `missingGroups`) — nunca fabricamos um valor.

export interface GroupScoreResult {
  /** Pontuação do grupo, já na escala 0..maxWeight. `null` se nenhuma janela/ratio disponível. */
  score: number | null;
  maxWeight: number;
  /** Soma dos pesos relativos das janelas/ratios efetivamente usadas (para debug/trace). */
  usedWeightFraction: number;
}

function computeWeightedGroupScore(
  maxWeight: number,
  entries: ReadonlyArray<{ key: string; weight: number; percentile: number | null }>,
): GroupScoreResult {
  const usable = entries.filter((e) => e.percentile !== null);
  const usedWeightFraction = usable.reduce((sum, e) => sum + e.weight, 0);

  if (usedWeightFraction === 0) {
    return { score: null, maxWeight, usedWeightFraction: 0 };
  }

  const weightedFractionSum = usable.reduce(
    (sum, e) => sum + e.weight * ((e.percentile as number) / 100),
    0,
  );
  const score = maxWeight * (weightedFractionSum / usedWeightFraction);

  return { score, maxWeight, usedWeightFraction };
}

/** Fase 9: percentiles das 3 janelas de crescimento para um grupo (TVL/Revenue/Fees Growth). */
export type GrowthWindowPercentiles = Partial<Record<GrowthWindow, number | null>>;

export function computeGrowthGroupScore(
  maxWeight: number,
  windowPercentiles: GrowthWindowPercentiles,
): GroupScoreResult {
  const entries = (Object.keys(WINDOW_WEIGHTS) as GrowthWindow[]).map((window) => ({
    key: window,
    weight: WINDOW_WEIGHTS[window],
    percentile: windowPercentiles[window] ?? null,
  }));
  return computeWeightedGroupScore(maxWeight, entries);
}

export interface EfficiencyPercentiles {
  revenueToTvl: number | null;
  feesToTvl: number | null;
}

export function computeEfficiencyGroupScore(
  maxWeight: number,
  percentiles: EfficiencyPercentiles,
): GroupScoreResult {
  const entries = [
    {
      key: "REVENUE_TO_TVL",
      weight: EFFICIENCY_SUB_WEIGHTS.REVENUE_TO_TVL,
      percentile: percentiles.revenueToTvl,
    },
    {
      key: "FEES_TO_TVL",
      weight: EFFICIENCY_SUB_WEIGHTS.FEES_TO_TVL,
      percentile: percentiles.feesToTvl,
    },
  ];
  return computeWeightedGroupScore(maxWeight, entries);
}

export interface FundamentalScoreGroups {
  tvlGrowth: GrowthWindowPercentiles;
  revenueGrowth: GrowthWindowPercentiles;
  feesGrowth: GrowthWindowPercentiles;
  efficiency: EfficiencyPercentiles;
}

export interface FundamentalScoreResult {
  totalScore: number;
  maxScore: number;
  partial: boolean;
  missingGroups: string[];
  groups: {
    tvlGrowth: GroupScoreResult;
    revenueGrowth: GroupScoreResult;
    feesGrowth: GroupScoreResult;
    efficiency: GroupScoreResult;
  };
}

/**
 * Fase 3/4: soma os 4 grupos do Fundamental Score. Um grupo com `score: null` (Fase 9: sem
 * NENHUMA evidência disponível) contribui 0 ao total literal e é listado em `missingGroups`
 * — nunca é silenciosamente tratado como um score baixo legítimo (Fase 9: "não excluir
 * automaticamente... sem registrar o motivo" — aqui aplicado ao Score, não só ao Validator).
 */
export function computeFundamentalScore(groups: FundamentalScoreGroups): FundamentalScoreResult {
  const tvlGrowth = computeGrowthGroupScore(FUNDAMENTAL_GROUP_WEIGHTS.TVL_GROWTH, groups.tvlGrowth);
  const revenueGrowth = computeGrowthGroupScore(
    FUNDAMENTAL_GROUP_WEIGHTS.REVENUE_GROWTH,
    groups.revenueGrowth,
  );
  const feesGrowth = computeGrowthGroupScore(
    FUNDAMENTAL_GROUP_WEIGHTS.FEES_GROWTH,
    groups.feesGrowth,
  );
  const efficiency = computeEfficiencyGroupScore(
    FUNDAMENTAL_GROUP_WEIGHTS.EFFICIENCY,
    groups.efficiency,
  );

  const groupEntries: Array<[string, GroupScoreResult]> = [
    ["TVL_GROWTH", tvlGrowth],
    ["REVENUE_GROWTH", revenueGrowth],
    ["FEES_GROWTH", feesGrowth],
    ["EFFICIENCY", efficiency],
  ];

  const missingGroups = groupEntries.filter(([, g]) => g.score === null).map(([name]) => name);
  const totalScore = groupEntries.reduce((sum, [, g]) => sum + (g.score ?? 0), 0);

  return {
    totalScore,
    maxScore: FUNDAMENTAL_MAX_SCORE,
    partial: missingGroups.length > 0,
    missingGroups,
    groups: { tvlGrowth, revenueGrowth, feesGrowth, efficiency },
  };
}

/** Fase 3: Revenue/TVL e Fees/TVL — nunca NaN/Infinity, mesma filosofia de `calculateGrowth`
 * (research-engine/metrics.ts): ausência de base válida vira `null`, não 0 nem erro. */
export function computeEfficiencyRatio(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}
