// Sprint 5 (Fase 14): Research Trace — estrutura que permite responder "de onde veio esse
// número" para cada componente do Score. Pura formatação/matemática; quem monta os valores
// brutos (research-engine/score-repository.ts) sabe de onde vieram (fonte, timestamps).

export type MetricDataQuality = "VALID" | "SUSPICIOUS" | "INVALID_REJECTED" | "MISSING";

export interface TraceEntry {
  /** Ex: "TVL_GROWTH_30D", "EFFICIENCY_REVENUE_TO_TVL". */
  component: string;
  /** Ex: "TVL Growth 30d" — rótulo legível. */
  metricLabel: string;
  /** Valor bruto usado (percentual de growth, ratio, etc.) ou "N/A" se ausente. */
  value: number | "N/A";
  /** Percentile do projeto dentro dos pares do setor, ou null se não calculável (Fase 8). */
  percentile: number | null;
  /** Peso relativo desta entrada dentro do seu grupo (soma dos pesos do grupo = 1, salvo
   * renormalização por ausência — ver fundamental-score.ts). */
  relativeWeight: number;
  /** Pontos efetivamente atribuídos ao Score por esta entrada, na escala do grupo (não da
   * escala do Score total) — null se a entrada não contribuiu (percentile null). */
  pointsAwarded: number | null;
  source: "DEFILLAMA";
  /** Timestamp do dado na fonte (não da coleta) — Fase 12 do Sprint 3 já distinguiu os dois
   * conceitos; o Trace usa `sourceTimestamp` porque é o que dá contexto ao VALOR em si. */
  sourceTimestamp: string | null;
  dataQuality: MetricDataQuality;
  /** Motivo textual quando dataQuality não é VALID (ex: motivo do SUSPICIOUS do Validator,
   * ou nota explicando por que está MISSING/INVALID_REJECTED). Nunca null silenciosamente
   * quando dataQuality !== "VALID" (Fase 6 do Sprint 3, reaplicada aqui ao Trace). */
  note: string | null;
}

/**
 * Fase 14: pontos atribuídos por uma entrada individual dentro do seu grupo, na escala do
 * grupo (ex: um grupo de 10 pontos com peso relativo 0.5 e percentile 80 contribui 10 * 0.5 *
 * 0.8 = 4 pontos ANTES de renormalização por ausência de outras janelas do grupo — a
 * renormalização real acontece em fundamental-score.ts; esta função é só para exibição no
 * Trace, não para o cálculo oficial do Score).
 */
export function computeTraceEntryPoints(
  groupMaxWeight: number,
  relativeWeight: number,
  percentile: number | null,
): number | null {
  if (percentile === null) return null;
  return groupMaxWeight * relativeWeight * (percentile / 100);
}
