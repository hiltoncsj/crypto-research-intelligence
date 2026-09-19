import type { GrowthResult } from "@crypto-research/shared";

// Sprint 14 — Historical Fundamental Intelligence. Matemática pura, sem acesso a banco (mesma
// separação de camadas de priority.ts/tokenomics-score.ts): quem chama já extraiu os números de
// growth/séries a partir dos snapshots reais (packages/research-engine). Esta camada nunca
// inventa dado — toda entrada `null`/"N/A" propaga honestamente para a saída, nunca vira 0.
//
// IMPORTANTE (regra do Sprint 14, seção 31): isto é inteligência FUNDAMENTAL, não Trading
// Intelligence. Nenhuma função aqui produz sinal de compra/venda, indicador técnico, ou
// recomendação — só classificação descritiva de movimentos fundamentais já observados.

export const FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION = "fundamental-intelligence-v1";

// ------------------------------------------------------------------------------------------
// Acceleration — diferença entre o growth da janela mais recente e o growth da janela
// comparável imediatamente anterior (seção 5 do Sprint 14).
// ------------------------------------------------------------------------------------------

export type AccelerationRegime = "ACCELERATING" | "DECELERATING" | "STABLE" | "INSUFFICIENT_DATA";

/** Limiar de estabilidade: variações menores que isto (em pontos percentuais) são tratadas como
 * "estável", não como aceleração/desaceleração ruidosa. v1, deliberadamente simples. */
const ACCELERATION_STABILITY_THRESHOLD_PP = 5;

export interface AccelerationResult {
  /** Pontos percentuais: growth atual - growth da janela comparável anterior. "N/A" quando
   * qualquer um dos dois growths não está disponível. */
  accelerationPp: number | "N/A";
  regime: AccelerationRegime;
}

export function classifyAcceleration(
  currentGrowth: GrowthResult,
  previousComparableGrowth: GrowthResult,
): AccelerationResult {
  if (currentGrowth === "N/A" || previousComparableGrowth === "N/A") {
    return { accelerationPp: "N/A", regime: "INSUFFICIENT_DATA" };
  }
  const accelerationPp = Math.round((currentGrowth - previousComparableGrowth) * 100) / 100;
  const regime: AccelerationRegime =
    Math.abs(accelerationPp) < ACCELERATION_STABILITY_THRESHOLD_PP
      ? "STABLE"
      : accelerationPp > 0
        ? "ACCELERATING"
        : "DECELERATING";
  return { accelerationPp, regime };
}

// ------------------------------------------------------------------------------------------
// Fundamental Momentum — composto de growth fundamentais disponíveis, cada um normalizado
// 0-100 (mesmo método de normalização de priority.ts: clamp ±50% -> 0-100), média só dos
// componentes disponíveis (seção 6 do Sprint 14: "não penalizar artificialmente ausência").
// ------------------------------------------------------------------------------------------

const MOMENTUM_GROWTH_CLAMP_PERCENT = 50;

function normalizeGrowthComponent(growth: GrowthResult | null): number | null {
  if (growth === null || growth === "N/A") return null;
  const clamped = Math.max(
    -MOMENTUM_GROWTH_CLAMP_PERCENT,
    Math.min(MOMENTUM_GROWTH_CLAMP_PERCENT, growth),
  );
  return ((clamped + MOMENTUM_GROWTH_CLAMP_PERCENT) / (2 * MOMENTUM_GROWTH_CLAMP_PERCENT)) * 100;
}

export interface FundamentalMomentumInput {
  tvlGrowth30d: GrowthResult | null;
  revenueGrowth30d: GrowthResult | null;
  feesGrowth30d: GrowthResult | null;
  volumeGrowth30d: GrowthResult | null;
}

export interface FundamentalMomentumResult {
  score: number | null;
  modelVersion: string;
  components: {
    tvlGrowth: number | null;
    revenueGrowth: number | null;
    feesGrowth: number | null;
    volumeGrowth: number | null;
  };
  availableComponents: number;
  totalPossibleComponents: number;
  /** availableComponents / totalPossibleComponents, 0-100. */
  coverage: number;
  /** v1: idêntico a `coverage` — quanto mais componentes disponíveis, mais confiável o score
   * composto. Deliberadamente simples (mesma filosofia de confidence.ts: "não inventar precisão
   * falsa"); pode divergir de coverage em versões futuras se novos fatores forem adicionados. */
  confidence: number;
}

export function computeFundamentalMomentum(
  input: FundamentalMomentumInput,
): FundamentalMomentumResult {
  const components = {
    tvlGrowth: normalizeGrowthComponent(input.tvlGrowth30d),
    revenueGrowth: normalizeGrowthComponent(input.revenueGrowth30d),
    feesGrowth: normalizeGrowthComponent(input.feesGrowth30d),
    volumeGrowth: normalizeGrowthComponent(input.volumeGrowth30d),
  };
  const values = Object.values(components);
  const available = values.filter((v): v is number => v !== null);
  const totalPossibleComponents = values.length;
  const coverage = Math.round((available.length / totalPossibleComponents) * 10000) / 100;

  const score =
    available.length > 0
      ? Math.round((available.reduce((sum, v) => sum + v, 0) / available.length) * 100) / 100
      : null;

  return {
    score,
    modelVersion: FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION,
    components,
    availableComponents: available.length,
    totalPossibleComponents,
    coverage,
    confidence: coverage,
  };
}

// ------------------------------------------------------------------------------------------
// Relações descritivas entre duas séries de growth (Market Cap vs TVL, Revenue vs TVL, etc.) —
// seção 7/10 do Sprint 14. Linguagem estritamente factual, nunca "barato"/"caro" (seção 7).
// ------------------------------------------------------------------------------------------

export type GrowthComparisonRelation =
  "A_EXPANDED_FASTER" | "B_EXPANDED_FASTER" | "CO_MOVED" | "INSUFFICIENT_DATA";

/** Diferença menor que isto (pontos percentuais) é tratada como movimento alinhado/co-movido,
 * não como uma das séries "vencendo" por ruído. v1, deliberadamente simples. */
const COMPARISON_ALIGNMENT_THRESHOLD_PP = 5;

export interface GrowthComparisonResult {
  relation: GrowthComparisonRelation;
  /** growthA - growthB, em pontos percentuais. "N/A" se qualquer um ausente. */
  deltaPp: number | "N/A";
}

/** Compara duas séries de growth já calculadas (ex.: Market Cap growth vs TVL growth) — não
 * assume causalidade, só descreve qual expandiu mais rápido no período. */
export function compareGrowth(
  growthA: GrowthResult,
  growthB: GrowthResult,
): GrowthComparisonResult {
  if (growthA === "N/A" || growthB === "N/A") {
    return { relation: "INSUFFICIENT_DATA", deltaPp: "N/A" };
  }
  const deltaPp = Math.round((growthA - growthB) * 100) / 100;
  if (Math.abs(deltaPp) < COMPARISON_ALIGNMENT_THRESHOLD_PP) {
    return { relation: "CO_MOVED", deltaPp };
  }
  return { relation: deltaPp > 0 ? "A_EXPANDED_FASTER" : "B_EXPANDED_FASTER", deltaPp };
}

// ------------------------------------------------------------------------------------------
// Fundamental vs Price Divergence — seção 9 do Sprint 14. NUNCA gera Buy/Sell/Long/Short
// (regra explícita da seção 9 e 28).
// ------------------------------------------------------------------------------------------

export type DivergenceClassification =
  | "POSITIVE_FUNDAMENTAL_DIVERGENCE" // fundamentos mais fortes que o movimento de preço
  | "NEGATIVE_FUNDAMENTAL_DIVERGENCE" // movimento de preço mais forte que os fundamentos
  | "ALIGNED"
  | "INSUFFICIENT_DATA";

const DIVERGENCE_ALIGNMENT_THRESHOLD_PP = 10;

export interface FundamentalPriceDivergenceResult {
  classification: DivergenceClassification;
  /** fundamentalMomentum (0-100) - priceGrowthNormalized (0-100, mesmo clamp ±50%->0-100 de
   * Fundamental Momentum, para ficar na mesma escala comparável). "N/A" se qualquer um ausente. */
  deltaPoints: number | "N/A";
}

export function classifyFundamentalPriceDivergence(
  fundamentalMomentum: number | null,
  priceGrowth: GrowthResult | null,
): FundamentalPriceDivergenceResult {
  const priceNormalized = normalizeGrowthComponent(priceGrowth);
  if (fundamentalMomentum === null || priceNormalized === null) {
    return { classification: "INSUFFICIENT_DATA", deltaPoints: "N/A" };
  }
  const deltaPoints = Math.round((fundamentalMomentum - priceNormalized) * 100) / 100;
  if (Math.abs(deltaPoints) < DIVERGENCE_ALIGNMENT_THRESHOLD_PP) {
    return { classification: "ALIGNED", deltaPoints };
  }
  return {
    classification:
      deltaPoints > 0 ? "POSITIVE_FUNDAMENTAL_DIVERGENCE" : "NEGATIVE_FUNDAMENTAL_DIVERGENCE",
    deltaPoints,
  };
}

// ------------------------------------------------------------------------------------------
// Valuation ratios — seção 11. Nunca calcula com denominador ausente/<=0; nunca fabrica FDV
// histórico (quem chama passa `null` quando a série não existe, ver research-engine).
// ------------------------------------------------------------------------------------------

export function computeValuationRatio(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

// ------------------------------------------------------------------------------------------
// Correlação temporal — seção 12. Correlação de Pearson simples entre duas séries alinhadas
// por timestamp (quem chama já alinhou — ver research-engine). Nunca "prediction".
// ------------------------------------------------------------------------------------------

export type CorrelationClassification =
  | "STRONG_POSITIVE"
  | "MODERATE_POSITIVE"
  | "WEAK_POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "INSUFFICIENT_DATA";

/** Mínimo de observações pareadas para um coeficiente minimamente estável. v1, conservador. */
export const MIN_CORRELATION_OBSERVATIONS = 5;

export interface CorrelationResult {
  coefficient: number | "N/A";
  classification: CorrelationClassification;
  observations: number;
}

/** Correlação de Pearson entre dois arrays JÁ ALINHADOS (mesmo índice = mesmo timestamp) —
 * alinhamento é responsabilidade de quem chama (research-engine, que conhece o formato real dos
 * snapshots). Retorna INSUFFICIENT_DATA com menos de `MIN_CORRELATION_OBSERVATIONS` pares. */
export function computeCorrelation(alignedA: number[], alignedB: number[]): CorrelationResult {
  const n = Math.min(alignedA.length, alignedB.length);
  if (n < MIN_CORRELATION_OBSERVATIONS) {
    return { coefficient: "N/A", classification: "INSUFFICIENT_DATA", observations: n };
  }

  const a = alignedA.slice(0, n);
  const b = alignedB.slice(0, n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  if (varA === 0 || varB === 0) {
    // Série constante — correlação indefinida, não 0 (0 implicaria "sem relação", diferente de
    // "não calculável").
    return { coefficient: "N/A", classification: "INSUFFICIENT_DATA", observations: n };
  }

  const coefficient = Math.round((cov / Math.sqrt(varA * varB)) * 10000) / 10000;

  let classification: CorrelationClassification;
  if (coefficient <= -0.1) classification = "NEGATIVE";
  else if (coefficient < 0.1) classification = "NEUTRAL";
  else if (coefficient < 0.4) classification = "WEAK_POSITIVE";
  else if (coefficient < 0.7) classification = "MODERATE_POSITIVE";
  else classification = "STRONG_POSITIVE";

  return { coefficient, classification, observations: n };
}

// ------------------------------------------------------------------------------------------
// Leading/Lagging — seção 13. Cross-correlation simples em diferentes defasagens (lags); a
// defasagem com maior |correlação| indica qual série historicamente se moveu primeiro. Puramente
// observacional — nunca "X predicts Y" (regra explícita da seção 13/28).
// ------------------------------------------------------------------------------------------

export type LeadLagRelation = "A_LED_B" | "B_LED_A" | "NO_CLEAR_RELATIONSHIP" | "INSUFFICIENT_DATA";

/** Correlação mínima na melhor defasagem para considerar a relação temporal "clara" — abaixo
 * disso, é ruído, não uma relação observável. v1, conservador. */
const LEAD_LAG_MATERIALITY_THRESHOLD = 0.5;

export interface LeadLagResult {
  relation: LeadLagRelation;
  /** Defasagem (em pontos da série, tipicamente dias) com maior correlação — positivo significa
   * A liderou B; negativo significa B liderou A. `null` se não computável. */
  bestLagDays: number | null;
  bestCorrelation: number | "N/A";
}

/**
 * `alignedA`/`alignedB` são séries diárias já alinhadas (mesmo índice = mesmo dia), índice
 * crescente no tempo. Desloca A em relação a B de `-maxLagDays` a `+maxLagDays` e escolhe a
 * defasagem com maior |correlação|.
 */
export function detectLeadLag(
  alignedA: number[],
  alignedB: number[],
  maxLagDays: number = 30,
): LeadLagResult {
  const n = Math.min(alignedA.length, alignedB.length);
  if (n < MIN_CORRELATION_OBSERVATIONS + maxLagDays) {
    return { relation: "INSUFFICIENT_DATA", bestLagDays: null, bestCorrelation: "N/A" };
  }

  let bestLag = 0;
  let bestAbsCorrelation = -1;
  let bestSignedCorrelation = 0;

  for (let lag = -maxLagDays; lag <= maxLagDays; lag += 1) {
    // lag > 0: A antecipado em relação a B (compara A[i] com B[i+lag]) — se essa defasagem
    // correlaciona bem, A historicamente liderou B.
    const shiftedA: number[] = [];
    const shiftedB: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      shiftedA.push(alignedA[i]!);
      shiftedB.push(alignedB[j]!);
    }
    const result = computeCorrelation(shiftedA, shiftedB);
    if (result.coefficient === "N/A") continue;
    const abs = Math.abs(result.coefficient);
    if (abs > bestAbsCorrelation) {
      bestAbsCorrelation = abs;
      bestLag = lag;
      bestSignedCorrelation = result.coefficient;
    }
  }

  if (bestAbsCorrelation < LEAD_LAG_MATERIALITY_THRESHOLD) {
    return {
      relation: bestAbsCorrelation < 0 ? "INSUFFICIENT_DATA" : "NO_CLEAR_RELATIONSHIP",
      bestLagDays: bestAbsCorrelation < 0 ? null : bestLag,
      bestCorrelation: bestAbsCorrelation < 0 ? "N/A" : bestSignedCorrelation,
    };
  }

  return {
    relation: bestLag > 0 ? "A_LED_B" : bestLag < 0 ? "B_LED_A" : "NO_CLEAR_RELATIONSHIP",
    bestLagDays: bestLag,
    bestCorrelation: bestSignedCorrelation,
  };
}

// ------------------------------------------------------------------------------------------
// Fundamental Regimes — seção 14. Classificação descritiva, nunca recomendação.
// ------------------------------------------------------------------------------------------

export type FundamentalRegime =
  | "FUNDAMENTAL_EXPANSION"
  | "FUNDAMENTAL_ACCELERATION"
  | "FUNDAMENTAL_DECELERATION"
  | "FUNDAMENTAL_CONTRACTION"
  | "MIXED_FUNDAMENTALS"
  | "INSUFFICIENT_DATA";

export function classifyFundamentalRegime(
  tvlGrowth30d: GrowthResult,
  tvlAcceleration: AccelerationRegime,
  revenueGrowth30d: GrowthResult,
): FundamentalRegime {
  const growths = [tvlGrowth30d, revenueGrowth30d].filter((g): g is number => g !== "N/A");
  if (growths.length === 0) return "INSUFFICIENT_DATA";

  const allNegative = growths.every((g) => g < 0);
  const allPositive = growths.every((g) => g > 0);

  if (allNegative) return "FUNDAMENTAL_CONTRACTION";
  if (!allPositive) return "MIXED_FUNDAMENTALS";

  // Daqui em diante, todos os growths disponíveis são positivos.
  if (tvlAcceleration === "ACCELERATING") return "FUNDAMENTAL_ACCELERATION";
  if (tvlAcceleration === "DECELERATING") return "FUNDAMENTAL_DECELERATION";
  return "FUNDAMENTAL_EXPANSION";
}
