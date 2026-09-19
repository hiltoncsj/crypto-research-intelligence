import type { GrowthResult } from "@crypto-research/shared";

// Sprint 3 (Fase 7/8/9): métricas puramente funcionais — sem acesso a banco (Fase 13/14:
// "evitar colocar acesso direto ao banco em módulos puramente matemáticos"). Recebem a série
// já carregada (do repository) e devolvem números; quem persiste/consulta é outra camada.

export interface TimeSeriesEntry {
  sourceTimestamp: Date;
  valueUsd: number;
}

export interface WindowMetrics {
  current: number | null;
  growth7d: GrowthResult;
  growth30d: GrowthResult;
  growth90d: GrowthResult;
}

/**
 * Sprint 16 (Event Impact Analysis, seção 5): baseline de uma janela — o valor MAIS RECENTE
 * dentro de `[rangeStart, rangeEnd]` (inclusive nos dois limites). Diferente de `findValueAt`
 * (que aceita qualquer ponto até `targetDate`, mesmo bem antes dela): aqui, se a série não tiver
 * NENHUM ponto dentro da janela, o resultado é `null` — nunca usa um valor de fora da janela
 * como se fosse "o mais próximo o suficiente" (seção 14: "não estimar, não extrapolar"). Ordena
 * a série internamente — não assume pré-ordenação.
 */
export function getLastValueInRange(
  series: TimeSeriesEntry[],
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  let candidate: number | null = null;
  for (const entry of sorted) {
    const t = entry.sourceTimestamp.getTime();
    if (t < rangeStart.getTime()) continue;
    if (t > rangeEnd.getTime()) break;
    candidate = entry.valueUsd;
  }
  return candidate;
}

/**
 * Encontra o ponto mais próximo (mas não posterior) a `targetDate` dentro de uma série
 * ordenada por `sourceTimestamp` ascendente — usado para achar o valor "de referência" de N
 * dias atrás mesmo que a série tenha gaps (Fase 9: "não inventar histórico").
 */
function findValueAt(series: TimeSeriesEntry[], targetDate: Date): number | null {
  let candidate: number | null = null;
  for (const entry of series) {
    if (entry.sourceTimestamp.getTime() <= targetDate.getTime()) {
      candidate = entry.valueUsd;
    } else {
      break;
    }
  }
  return candidate;
}

/**
 * Growth = (current - previous) / previous × 100, tratando os casos degenerados da Fase 8:
 * nunca retorna NaN/Infinity — "N/A" quando não há base válida para comparar.
 */
export function calculateGrowth(current: number | null, previous: number | null): GrowthResult {
  if (current === null || previous === null) return "N/A";
  if (previous === 0) return "N/A"; // divisão por zero é indefinida, não "infinito de crescimento"
  return ((current - previous) / previous) * 100;
}

/** Sprint 9 (Research History): generalização de `calculateWindowMetrics` para uma janela
 * arbitrária de dias (180d, e futuramente 365d/2y — seção 6: "sem precisar reconstruir o
 * endpoint"). `calculateWindowMetrics` continua intocada (7/30/90d, já usada por
 * selection.ts/pipeline.ts) para não arriscar regressão nos consumidores existentes. */
export function calculateGrowthForWindow(
  series: TimeSeriesEntry[],
  days: number,
  asOf: Date = new Date(),
): GrowthResult {
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  const lastEntry = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  const current = lastEntry ? lastEntry.valueUsd : null;
  const day = 24 * 60 * 60 * 1000;
  const valueAgo = findValueAt(sorted, new Date(asOf.getTime() - days * day));
  return calculateGrowth(current, valueAgo);
}

/**
 * Sprint 14 (Historical Fundamental Intelligence, seção 5): growth da janela [asOf-days, asOf]
 * comparado ao growth da janela COMPARÁVEL imediatamente anterior [asOf-2*days, asOf-days] — a
 * "aceleração" fica para `classifyAcceleration` (packages/scoring-engine), esta função só extrai
 * os dois growths brutos da série real. Nunca inventa ponto histórico: se a série não cobrir
 * `2*days`, o growth anterior vem "N/A" (via `calculateGrowth`/`findValueAt`, que já tratam
 * ausência de referência).
 */
export function calculateGrowthWindowPair(
  series: TimeSeriesEntry[],
  days: number,
  asOf: Date = new Date(),
): { current: GrowthResult; previousComparable: GrowthResult } {
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  const day = 24 * 60 * 60 * 1000;

  const currentValue = getCurrentValue(sorted);
  const valueAtWindowStart = findValueAt(sorted, new Date(asOf.getTime() - days * day));
  const valueAtPreviousWindowStart = findValueAt(sorted, new Date(asOf.getTime() - 2 * days * day));

  return {
    current: calculateGrowth(currentValue, valueAtWindowStart),
    previousComparable: calculateGrowth(valueAtWindowStart, valueAtPreviousWindowStart),
  };
}

export function getCurrentValue(series: TimeSeriesEntry[]): number | null {
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );
  const lastEntry = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  return lastEntry ? lastEntry.valueUsd : null;
}

export function calculateWindowMetrics(
  series: TimeSeriesEntry[],
  asOf: Date = new Date(),
): WindowMetrics {
  const sorted = [...series].sort(
    (a, b) => a.sourceTimestamp.getTime() - b.sourceTimestamp.getTime(),
  );

  const lastEntry = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  const current = lastEntry ? lastEntry.valueUsd : null;

  const day = 24 * 60 * 60 * 1000;
  const value7dAgo = findValueAt(sorted, new Date(asOf.getTime() - 7 * day));
  const value30dAgo = findValueAt(sorted, new Date(asOf.getTime() - 30 * day));
  const value90dAgo = findValueAt(sorted, new Date(asOf.getTime() - 90 * day));

  return {
    current,
    growth7d: calculateGrowth(current, value7dAgo),
    growth30d: calculateGrowth(current, value30dAgo),
    growth90d: calculateGrowth(current, value90dAgo),
  };
}
