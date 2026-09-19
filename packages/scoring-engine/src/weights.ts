// Sprint 5 (Fase 2/4): pesos centralizados do Score Global futuro e do Fundamental Score
// implementado nesta sprint. Único lugar do repositório com esses números — nunca duplicar
// pesos hardcoded em outro arquivo (Fase 4: "não hardcodar pesos espalhados por vários
// arquivos").

/** Score Global futuro (não implementado nesta sprint — Fase 37) — documentado para
 * mostrar que a arquitetura já reserva espaço para as categorias futuras sem precisar
 * reescrever o Fundamental Score quando elas chegarem. */
export const GLOBAL_SCORE_CATEGORY_WEIGHTS = {
  FUNDAMENTAL: 30,
  TOKENOMICS: 20,
  INSTITUTIONAL_CAPITAL: 15,
  NARRATIVE: 15,
  CATALYSTS: 10,
  VALUATION: 10,
} as const;

/** Fundamental Score = 30 pontos, único implementado neste sprint. */
export const FUNDAMENTAL_MAX_SCORE = GLOBAL_SCORE_CATEGORY_WEIGHTS.FUNDAMENTAL;

/** Fase 4: distribuição sugerida pela spec entre os 4 componentes do Fundamental Score. */
export const FUNDAMENTAL_GROUP_WEIGHTS = {
  TVL_GROWTH: 10,
  REVENUE_GROWTH: 10,
  FEES_GROWTH: 5,
  EFFICIENCY: 5,
} as const;

/** Fase 4: dentro de cada grupo de growth, como 7d/30d/90d contribuem — soma 1.0. */
export const WINDOW_WEIGHTS = {
  "7d": 0.2,
  "30d": 0.5,
  "90d": 0.3,
} as const;

export type GrowthWindow = keyof typeof WINDOW_WEIGHTS;

/** Fase 4: dentro do grupo Efficiency, os dois ratios (Revenue/TVL, Fees/TVL) pesam igual. */
export const EFFICIENCY_SUB_WEIGHTS = {
  REVENUE_TO_TVL: 0.5,
  FEES_TO_TVL: 0.5,
} as const;

/** Fase 8: amostra de pares menor que isso torna o percentile não confiável (→ N/A). */
export const MIN_PEER_SAMPLE_SIZE = 3;

/** Fase 5: versão do modelo associada a todo resultado persistido nesta sprint. */
export const FUNDAMENTAL_SCORE_MODEL_VERSION = "fundamental-v1";

// Sprint 6 (Parte 7): Tokenomics Score = 20 pontos, distribuição sugerida pela spec.
export const TOKENOMICS_MAX_SCORE = GLOBAL_SCORE_CATEGORY_WEIGHTS.TOKENOMICS;
export const TOKENOMICS_GROUP_WEIGHTS = {
  SUPPLY_DILUTION: 5,
  UNLOCK_PRESSURE: 5,
  DISTRIBUTION: 4,
  VALUE_CAPTURE: 6,
} as const;
export const TOKENOMICS_SCORE_MODEL_VERSION = "tokenomics-v1";

// Sprint 6 (Parte 12): Institutional Capital Score = 15 pontos, distribuição sugerida.
export const INSTITUTIONAL_CAPITAL_MAX_SCORE = GLOBAL_SCORE_CATEGORY_WEIGHTS.INSTITUTIONAL_CAPITAL;
export const INSTITUTIONAL_CAPITAL_GROUP_WEIGHTS = {
  CAPITAL_RAISED: 5,
  INSTITUTIONAL_DEPTH: 4,
  FUNDING_RECENCY: 3,
  CONVICTION_SIGNALS: 3,
} as const;
export const INSTITUTIONAL_CAPITAL_SCORE_MODEL_VERSION = "institutional-capital-v1";
