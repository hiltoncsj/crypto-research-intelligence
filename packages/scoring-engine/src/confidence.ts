// Sprint 5 (Fase 10/11/12): Confidence é uma métrica INDEPENDENTE do Score — nunca
// multiplicamos Score × Confidence (Fase 12, regra explícita). Confidence responde "quão
// confiável é a evidência", não "quão bom é o projeto".
//
// Fórmula (documentada aqui por ser a única fonte de verdade — Fase 4 mesma filosofia
// aplicada a esta métrica): média de 4 fatores, cada um normalizado em [0,1], pesos iguais
// (25% cada). Não há tuning fino baseado em backtesting ainda — é uma primeira versão
// deliberadamente simples e auditável (Fase 10: "não inventar precisão falsa").

const RECENCY_FULL_CONFIDENCE_DAYS = 3;
const RECENCY_ZERO_CONFIDENCE_DAYS = 30;

/** 1.0 se o dado tem até 3 dias, decai linearmente até 0 aos 30 dias, 0 se ausente/mais velho. */
function recencyScore(lastUpdatedAt: Date | null, asOf: Date): number {
  if (!lastUpdatedAt) return 0;
  const ageDays = (asOf.getTime() - lastUpdatedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= RECENCY_FULL_CONFIDENCE_DAYS) return 1;
  if (ageDays >= RECENCY_ZERO_CONFIDENCE_DAYS) return 0;
  const span = RECENCY_ZERO_CONFIDENCE_DAYS - RECENCY_FULL_CONFIDENCE_DAYS;
  return 1 - (ageDays - RECENCY_FULL_CONFIDENCE_DAYS) / span;
}

export interface MetricQualityFlag {
  /** Há pelo menos um valor utilizável (current !== null) para esta métrica. */
  available: boolean;
  /** Fase 9 do Sprint 3: pelo menos um snapshot usado ficou marcado SUSPICIOUS. */
  suspicious: boolean;
  /** Decisão documentada em score-repository.ts (research-engine): pelo menos um ponto foi
   * rejeitado como INVALID durante ESTA execução do pipeline (sinal só disponível em tempo de
   * pipeline — Sprint 5, nota sobre INVALID vs MISSING). */
  invalidRejected: boolean;
  lastUpdatedAt: Date | null;
}

export interface ConfidenceInput {
  metricQuality: {
    tvl: MetricQualityFlag;
    revenue: MetricQualityFlag;
    fees: MetricQualityFlag;
  };
  /** Um `true` por percentile calculado com amostra suficiente (>=3 pares), `false` por
   * percentile que caiu em N/A por amostra pequena. Array vazio = nenhum percentile tentado
   * (ex: nenhum peer no setor) → tratado como neutro (0.5), documentado abaixo. */
  percentileSampleOutcomes: boolean[];
  asOf: Date;
}

export function computeConfidence(input: ConfidenceInput): number {
  const metrics = [input.metricQuality.tvl, input.metricQuality.revenue, input.metricQuality.fees];
  const availableMetrics = metrics.filter((m) => m.available);

  // 1. Completude: das 3 métricas fundamentais (TVL/Revenue/Fees), quantas têm dado.
  const completeness = availableMetrics.length / metrics.length;

  // 2. Adequação de amostra: fração dos percentiles que tiveram >=3 pares (Fase 8).
  // Nenhum percentile tentado ainda (setor sem pares) é neutro, não penaliza nem beneficia.
  const sampleAdequacy =
    input.percentileSampleOutcomes.length === 0
      ? 0.5
      : input.percentileSampleOutcomes.filter(Boolean).length /
        input.percentileSampleOutcomes.length;

  // 3. Qualidade dos dados: fração das métricas disponíveis que NÃO tiveram suspicious/invalid.
  const flaggedCount = availableMetrics.filter((m) => m.suspicious || m.invalidRejected).length;
  const dataQuality =
    availableMetrics.length === 0 ? 0 : 1 - flaggedCount / availableMetrics.length;

  // 4. Atualidade: média do recency score das métricas disponíveis.
  const recency =
    availableMetrics.length === 0
      ? 0
      : availableMetrics.reduce((sum, m) => sum + recencyScore(m.lastUpdatedAt, input.asOf), 0) /
        availableMetrics.length;

  const confidence = 100 * ((completeness + sampleAdequacy + dataQuality + recency) / 4);
  return Math.min(100, Math.max(0, confidence));
}
