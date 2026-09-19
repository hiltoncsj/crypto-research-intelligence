import type { FundamentalRegime } from "./fundamental-intelligence";

// Sprint 16 — Event Impact Analysis. Matemática pura, sem acesso a banco (mesma separação de
// camadas de fundamental-intelligence.ts, priority.ts). Quem chama (research-engine/
// event-impact-engine.ts) já extraiu os valores de before/after das séries reais.
//
// REGRA FUNDAMENTAL (seção 0/44 do Sprint 16): associação temporal, NUNCA causalidade. Nenhuma
// função aqui produz "causou"/"resultou em"/sinal de trading/recomendação — só classificação
// descritiva de uma mudança OBSERVADA depois de um evento real.

export const EVENT_IMPACT_MODEL_VERSION = "event-impact-v1";

// ------------------------------------------------------------------------------------------
// Change percent — mesma fórmula de calculateGrowth (research-engine/metrics.ts), reimplementada
// aqui deliberadamente (não importada de research-engine, que depende de Prisma types em outros
// arquivos do mesmo pacote — scoring-engine precisa continuar sem dependência de banco/DB
// package, mesma regra de layering do resto do projeto) — mesma fórmula, mesmos casos
// degenerados tratados.
// ------------------------------------------------------------------------------------------

export function computeChangePercent(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  if (before === 0) return null; // divisão por zero é indefinida, nunca "Infinity"/"0%" fabricado
  return ((after - before) / before) * 100;
}

export interface WindowValues {
  before: number | null;
  after: number | null;
  delta: number | null;
  changePercent: number | null;
}

export function computeWindowValues(before: number | null, after: number | null): WindowValues {
  const delta = before !== null && after !== null ? after - before : null;
  return { before, after, delta, changePercent: computeChangePercent(before, after) };
}

// ------------------------------------------------------------------------------------------
// Direção descritiva de uma métrica — usada para compor a classificação final (seção 12).
// ------------------------------------------------------------------------------------------

export type MetricDirection = "UP" | "DOWN" | "NO_CLEAR_CHANGE" | "INSUFFICIENT_DATA";

/** Limiar abaixo do qual uma variação é tratada como "sem mudança relevante", não ruído
 * classificado como sinal. v1, mesmo espírito dos limiares de fundamental-intelligence.ts. */
const DIRECTION_THRESHOLD_PERCENT = 5;

export function classifyMetricDirection(changePercent: number | null): MetricDirection {
  if (changePercent === null) return "INSUFFICIENT_DATA";
  if (Math.abs(changePercent) < DIRECTION_THRESHOLD_PERCENT) return "NO_CLEAR_CHANGE";
  return changePercent > 0 ? "UP" : "DOWN";
}

// ------------------------------------------------------------------------------------------
// Coverage — seção 13/14.
// ------------------------------------------------------------------------------------------

export interface EventImpactCoverage {
  market: boolean;
  tvl: boolean;
  revenue: boolean;
  fees: boolean;
  volume: boolean;
  momentum: boolean;
  regime: boolean;
}

export interface CoverageSummary {
  coverage: EventImpactCoverage;
  availableCount: number;
  totalCount: number;
  coveragePercent: number;
  missingMetrics: string[];
}

export function summarizeCoverage(coverage: EventImpactCoverage): CoverageSummary {
  const entries = Object.entries(coverage) as Array<[keyof EventImpactCoverage, boolean]>;
  const availableCount = entries.filter(([, v]) => v).length;
  const totalCount = entries.length;
  const missingMetrics = entries.filter(([, v]) => !v).map(([k]) => k);
  return {
    coverage,
    availableCount,
    totalCount,
    coveragePercent: Math.round((availableCount / totalCount) * 10000) / 100,
    missingMetrics,
  };
}

// ------------------------------------------------------------------------------------------
// Classificação final descritiva — seção 12. Nunca Bullish/Bearish/Buy/Sell.
// ------------------------------------------------------------------------------------------

export type EventImpactClassification =
  | "FUNDAMENTAL_EXPANSION_AFTER_EVENT"
  | "FUNDAMENTAL_CONTRACTION_AFTER_EVENT"
  | "MARKET_APPRECIATION_AFTER_EVENT"
  | "MARKET_DECLINE_AFTER_EVENT"
  | "MIXED"
  | "NO_CLEAR_CHANGE"
  | "INSUFFICIENT_DATA"
  | "OVERLAPPING_EVENTS";

export interface ClassifyEventImpactInput {
  /** Direção do Fundamental Momentum (before/after, janela de 30d — seção 9). */
  fundamentalDirection: MetricDirection;
  /** Direção do Market Cap (before/after, janela de 30d — seção 7). */
  marketDirection: MetricDirection;
  hasOverlap: boolean;
}

/**
 * Combina a direção fundamental e a direção de mercado numa única classificação descritiva.
 * PRIORIDADE DOCUMENTADA (decisão explícita, seção 12 permite só 1 label por resultado):
 * overlap sempre vence primeiro (compromete a interpretação de qualquer outro sinal); depois,
 * se as duas direções existem e discordam em polaridade, MIXED; se só uma existe, ela decide o
 * label; se nenhuma existe, INSUFFICIENT_DATA; se ambas existem mas nenhuma é UP/DOWN,
 * NO_CLEAR_CHANGE.
 */
export function classifyEventImpact(input: ClassifyEventImpactInput): EventImpactClassification {
  if (input.hasOverlap) return "OVERLAPPING_EVENTS";

  const { fundamentalDirection: f, marketDirection: m } = input;
  const fSignal = f === "UP" || f === "DOWN";
  const mSignal = m === "UP" || m === "DOWN";

  if (!fSignal && !mSignal) {
    if (f === "INSUFFICIENT_DATA" && m === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
    return "NO_CLEAR_CHANGE";
  }

  if (fSignal && mSignal) {
    const samePolarity = (f === "UP" && m === "UP") || (f === "DOWN" && m === "DOWN");
    if (!samePolarity) return "MIXED";
    // Mesma polaridade — prioriza o label fundamental (produto é fundamental-first, seção 44).
    return f === "UP" ? "FUNDAMENTAL_EXPANSION_AFTER_EVENT" : "FUNDAMENTAL_CONTRACTION_AFTER_EVENT";
  }

  if (fSignal) {
    return f === "UP" ? "FUNDAMENTAL_EXPANSION_AFTER_EVENT" : "FUNDAMENTAL_CONTRACTION_AFTER_EVENT";
  }

  // só mSignal
  return m === "UP" ? "MARKET_APPRECIATION_AFTER_EVENT" : "MARKET_DECLINE_AFTER_EVENT";
}

// ------------------------------------------------------------------------------------------
// Regime transition — seção 10. Reaproveita EXATAMENTE os regimes do Sprint 14, nunca inventa
// um novo.
// ------------------------------------------------------------------------------------------

export interface RegimeTransition {
  before: FundamentalRegime;
  after: FundamentalRegime;
  changed: boolean;
}

export function compareRegimes(
  before: FundamentalRegime,
  after: FundamentalRegime,
): RegimeTransition {
  return { before, after, changed: before !== after };
}

// ------------------------------------------------------------------------------------------
// Momentum delta — seção 9. Subtração simples, null-safe.
// ------------------------------------------------------------------------------------------

export function computeMomentumDelta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return Math.round((after - before) * 100) / 100;
}

// ------------------------------------------------------------------------------------------
// Overlap — seção 15. Puramente uma função de janela temporal: um evento "sobrepõe" quando cai
// dentro da janela pós-evento sendo analisada.
// ------------------------------------------------------------------------------------------

export function detectOverlap(
  eventDate: Date,
  postWindowDays: number,
  otherEventDates: Date[],
): boolean {
  const windowEnd = new Date(eventDate.getTime() + postWindowDays * 24 * 60 * 60 * 1000);
  return otherEventDates.some(
    (d) => d.getTime() > eventDate.getTime() && d.getTime() <= windowEnd.getTime(),
  );
}

// ------------------------------------------------------------------------------------------
// Cross-event aggregation — seção 21/22. Média, mediana, min, max — só quando sampleSize > 0;
// nunca tratado como previsão (documentado no chamador/report, esta função só calcula).
// ------------------------------------------------------------------------------------------

export interface AggregateStats {
  sampleSize: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

const MIN_AGGREGATE_SAMPLE_SIZE = 3;

/** `insufficientSample` sinaliza quando sampleSize > 0 mas abaixo do mínimo para uma inferência
 * agregada minimamente estável (seção 21: "não tratar amostra pequena como evidência geral") —
 * os valores ainda são calculados (são reais), só marcados como não confiáveis para conclusão. */
export function computeAggregateStats(values: number[]): AggregateStats & {
  insufficientSample: boolean;
} {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) {
    return {
      sampleSize: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
      insufficientSample: true,
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  return {
    sampleSize: valid.length,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    insufficientSample: valid.length < MIN_AGGREGATE_SAMPLE_SIZE,
  };
}
