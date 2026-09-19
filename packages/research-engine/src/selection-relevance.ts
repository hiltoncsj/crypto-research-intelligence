import { prisma } from "@crypto-research/database";
import { percentileRank } from "@crypto-research/scoring-engine";

import { diffResearchRuns } from "./diff";

// "Aprende com os dados e com o tempo melhora essa análise com destaque" (conversa que motivou
// isto): substitui o limiar fixo (≥70 em cada componente) por um percentil calculado contra
// TODA a população histórica de `ResearchRunSelection.priorityScore` já persistida — mesmo
// mecanismo determinístico de `percentileRank` já usado no Fundamental Score (nunca
// IA/LLM "aprendendo" de forma opaca, seção "nunca fabricar dado"). Como a população cresce a
// cada Research Run, o corte se recalibra sozinho com o tempo, sem qualquer ajuste manual.

export const RELEVANCE_MODEL_VERSION = "selection-relevance-v1";
export const RELEVANCE_PERCENTILE_THRESHOLD = 90;

export interface SelectionRelevance {
  projectId: string;
  priorityPercentile: number | null; // null = amostra histórica ainda insuficiente (MIN_PEER_SAMPLE_SIZE)
  relevant: boolean;
}

/** Percentil de cada seleção desta run contra toda a população histórica de priorityScore já
 * persistida (inclui a própria run, como o contrato de `percentileRank` exige). */
export async function computeSelectionRelevance(
  researchRunId: string,
): Promise<SelectionRelevance[]> {
  const [current, historical] = await Promise.all([
    prisma.researchRunSelection.findMany({
      where: { researchRunId },
      select: { projectId: true, priorityScore: true },
    }),
    prisma.researchRunSelection.findMany({ select: { priorityScore: true } }),
  ]);

  const peers = historical.map((h) => Number(h.priorityScore));

  return current.map((s) => {
    const percentile = percentileRank(Number(s.priorityScore), peers);
    return {
      projectId: s.projectId,
      priorityPercentile: percentile,
      relevant: percentile !== null && percentile >= RELEVANCE_PERCENTILE_THRESHOLD,
    };
  });
}

export interface RelevanceOutcome {
  previouslyHighlighted: boolean; // já cruzou o limiar em alguma run ANTERIOR (não a atual)
  sinceRunId: string | null;
  scoreDeltas: { label: string; delta: number }[]; // reaproveita diffResearchRuns — nunca recalcula
  tvlChangePct: number | null;
}

/** Confirma (ou não) se um destaque anterior "se sustentou": olha as seleções passadas deste
 * projeto, recalcula o percentil que CADA UMA tinha na época (contra a população que existia
 * até aquele momento — nunca reescreve história com dados que só existem hoje), e se alguma
 * cruzou o limiar, usa o Diff Engine já existente (Sprint 9, diff.ts) para mostrar o que
 * aconteceu de fato desde então — nunca uma narrativa inventada, só os deltas reais já
 * calculados por `diffResearchRuns`. */
export async function getRelevanceOutcome(projectId: string): Promise<RelevanceOutcome> {
  const pastSelections = await prisma.researchRunSelection.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { researchRunId: true, priorityScore: true, createdAt: true },
  });

  if (pastSelections.length < 2) {
    // Precisa de pelo menos uma seleção ANTERIOR à mais recente pra "confirmar" algo.
    return { previouslyHighlighted: false, sinceRunId: null, scoreDeltas: [], tvlChangePct: null };
  }

  const allScores = pastSelections.map((s) => ({
    value: Number(s.priorityScore),
    createdAt: s.createdAt,
  }));

  // Todas exceto a mais recente (essa é a run atual sendo exibida, não "o passado").
  const historicalOnes = pastSelections.slice(0, -1);

  let wasHighlighted = false;
  let sinceRunId: string | null = null;
  for (const sel of historicalOnes) {
    const peersAtTheTime = allScores
      .filter((s) => s.createdAt <= sel.createdAt)
      .map((s) => s.value);
    const percentileAtTheTime = percentileRank(Number(sel.priorityScore), peersAtTheTime);
    if (percentileAtTheTime !== null && percentileAtTheTime >= RELEVANCE_PERCENTILE_THRESHOLD) {
      wasHighlighted = true;
      sinceRunId = sel.researchRunId;
      break; // primeira vez que se destacou — é o ponto de partida da confirmação.
    }
  }

  if (!wasHighlighted) {
    return { previouslyHighlighted: false, sinceRunId: null, scoreDeltas: [], tvlChangePct: null };
  }

  const diff = await diffResearchRuns(projectId);
  const scoreDeltas = diff.entries
    .filter((e) => e.type === "SCORE_CHANGED")
    .map((e) => ({ label: String(e.data.label), delta: Number(e.data.delta) }));
  const tvlEntry = diff.entries.find((e) => e.type === "METRIC_CHANGED" && e.data.label === "TVL");
  const tvlChangePct = tvlEntry ? Number(tvlEntry.data.changePct) : null;

  return { previouslyHighlighted: true, sinceRunId, scoreDeltas, tvlChangePct };
}
