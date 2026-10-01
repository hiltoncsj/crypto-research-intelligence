import { prisma } from "@crypto-research/database";
import { calculateResearchPriority, PRIORITY_MODEL_VERSION } from "@crypto-research/scoring-engine";

import { computeFundingAggregates } from "./funding-repository";
import { logSelectionEvent } from "./logger";
import { getLatestFundamentalScore } from "./score-repository";

// Sprint 8 — Top 10 Selection (ver TOP10_SELECTION_SPEC.md). Substitui a dependência de
// `FIXED_DEV_PROJECT_SLUGS` por uma seleção dinâmica: todo `Project` conhecido é candidato,
// pontuado pelo Priority Model (packages/scoring-engine/src/priority.ts) a partir de dados JÁ
// PERSISTIDOS + o `change_7d` que o Discovery já baixou na mesma run (nenhuma chamada externa
// nova aqui — seção 30: reaproveitar). O resultado de cada Research Run é gravado em
// `ResearchRunSelection`, uma fotografia imutável — nunca sobrescreve a seleção de uma run
// anterior (seção 17).

export const DEFAULT_TOP_N = 10;

/** `change_7d` do TVL (pontos percentuais) por `defillamaId`, vindo de GET /protocols — ver
 * `DiscoverySummary.tvlChange7dByDefillamaId`. */
export type TvlChange7dByDefillamaId = ReadonlyMap<string, number>;

export interface CandidateProject {
  projectId: string;
  slug: string;
  score: number | null;
  growth7d: number | null;
  daysSinceLastRaise: number | null;
}

/** Universo pesquisável = todo `Project` já conhecido (descoberto automaticamente ou
 * manualmente) — não há uma tabela "Universe" separada (seção 10 do Sprint 8: "evitar criar
 * uma entidade apenas para dar nome ao conceito"; `Project` + snapshots + score já bastam). */
export async function buildCandidatePool(
  tvlChange7d: TvlChange7dByDefillamaId,
): Promise<CandidateProject[]> {
  const projects = await prisma.project.findMany({
    select: { id: true, slug: true, defillamaId: true },
  });
  const asOf = new Date();

  return Promise.all(
    projects.map(async (p): Promise<CandidateProject> => {
      const [latestScore, fundingAggregates] = await Promise.all([
        getLatestFundamentalScore(p.id),
        computeFundingAggregates(p.id, asOf),
      ]);

      const score =
        latestScore && Number(latestScore.maxScore) > 0
          ? (Number(latestScore.totalScore) / Number(latestScore.maxScore)) * 100
          : null;

      return {
        projectId: p.id,
        slug: p.slug,
        score,
        growth7d: tvlChange7d.get(p.defillamaId) ?? null,
        daysSinceLastRaise: fundingAggregates.daysSinceLastRaise,
      };
    }),
  );
}

export interface SelectedProject {
  projectId: string;
  slug: string;
  rank: number;
  priorityScore: number;
  reasons: string[];
}

export type ScoredCandidate = CandidateProject & ReturnType<typeof calculateResearchPriority>;

/** Ordem de prioridade (seção 26): priorityScore -> globalScore -> growth7d bruto -> captação
 * mais recente. Os desempates usam os valores BRUTOS, não os normalizados: o clamp de
 * normalização (±20% em 7d) faz todo projeto com growth >= +20% valer 100, e comparar só o
 * normalizado empataria dezenas deles. `null` sempre perde para um valor real. Retorna 0 só
 * para empate real em todos os critérios — o slug NUNCA decide quem entra (ver
 * `selectTopProjects`). */
function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  const scoreA = a.score ?? -1;
  const scoreB = b.score ?? -1;
  if (scoreA !== scoreB) return scoreB - scoreA;
  const growthA = a.growth7d ?? Number.NEGATIVE_INFINITY;
  const growthB = b.growth7d ?? Number.NEGATIVE_INFINITY;
  if (growthA !== growthB) return growthB > growthA ? 1 : -1;
  const raiseA = a.daysSinceLastRaise ?? Number.POSITIVE_INFINITY;
  const raiseB = b.daysSinceLastRaise ?? Number.POSITIVE_INFINITY;
  if (raiseA !== raiseB) return raiseA < raiseB ? -1 : 1;
  return 0;
}

/** Sem nenhum componente (sem Score, growth nem funding) não há base para priorizar — nunca
 * entra na seleção, nem para completar `topN` (antes entrava por ordem alfabética do slug). */
function hasSignal(c: ScoredCandidate): boolean {
  const { score, growthMomentum, capitalMomentum } = c.components;
  return score !== null || growthMomentum !== null || capitalMomentum !== null;
}

/**
 * Ordena os candidatos COM sinal e corta em `topN`, estendendo o corte enquanto o seguinte empata
 * com o último selecionado (nenhum empatado é descartado). Empatados dividem o mesmo `rank`.
 * Função pura — separada de `selectTopProjects` para ser testável sem o estado global do banco.
 */
export function pickTopWithTies<T extends ScoredCandidate>(
  scored: T[],
  topN: number,
): { ranked: T[]; selected: Array<T & { rank: number }> } {
  const ranked = scored.filter(hasSignal);
  // Slug só fixa a ordem de exibição entre empatados — nunca decide quem entra.
  ranked.sort((a, b) => compareCandidates(a, b) || a.slug.localeCompare(b.slug));

  // Nunca inventa projetos para completar `topN` (seção 25) — se houver menos candidatos com
  // sinal, seleciona todos os disponíveis.
  let cutoff = Math.min(topN, ranked.length);
  while (cutoff > 0 && cutoff < ranked.length) {
    const last = ranked[cutoff - 1];
    const next = ranked[cutoff];
    if (!last || !next || compareCandidates(last, next) !== 0) break;
    cutoff++;
  }

  const ranks: number[] = [];
  const selected = ranked.slice(0, cutoff).map((s, index, list) => {
    const previous = list[index - 1];
    const previousRank = ranks[index - 1];
    const rank =
      previous && previousRank !== undefined && compareCandidates(previous, s) === 0
        ? previousRank
        : index + 1;
    ranks.push(rank);
    return { ...s, rank };
  });

  return { ranked, selected };
}

/**
 * Calcula a prioridade de todo o universo, seleciona os `topN` primeiros e persiste a seleção
 * na `ResearchRunSelection` desta Research Run. Idempotente por construção: `researchRunId` +
 * `projectId` é `@@unique` no schema — reexecutar para a mesma run não duplica linhas (usa
 * `skipDuplicates`, seção 31).
 *
 * Empate no corte: se o candidato seguinte ao `topN`-ésimo empata com ele em TODOS os critérios
 * de `compareCandidates`, ele também entra (Top 10 vira Top 11, 12...) — nenhum empatado é
 * descartado. Empatados dividem o mesmo `rank` (1, 2, 2, 4...).
 *
 * `tvlChange7d` vem do Discovery da mesma run. Sem ele (Discovery falhou, ou chamada manual),
 * o Growth Momentum fica `null` para todos e a prioridade usa só Score + Capital — nunca um
 * growth inventado.
 */
export async function selectTopProjects(
  researchRunId: string,
  topN: number = DEFAULT_TOP_N,
  tvlChange7d: TvlChange7dByDefillamaId = new Map(),
): Promise<SelectedProject[]> {
  logSelectionEvent("selection.started", {
    researchRunId,
    modelVersion: PRIORITY_MODEL_VERSION,
    topN,
    growthSignalCount: tvlChange7d.size,
  });

  const candidates = await buildCandidatePool(tvlChange7d);

  const scored = candidates.map((c) => {
    const priority = calculateResearchPriority({
      score: c.score,
      growth7d: c.growth7d,
      daysSinceLastRaise: c.daysSinceLastRaise,
    });
    return { ...c, ...priority };
  });

  const { ranked, selected } = pickTopWithTies(scored, topN);

  if (selected.length > 0) {
    await prisma.researchRunSelection.createMany({
      data: selected.map((s) => ({
        researchRunId,
        projectId: s.projectId,
        rank: s.rank,
        priorityScore: s.priorityScore,
        globalScore: s.score,
        growthMomentum: s.components.growthMomentum,
        capitalMomentum: s.components.capitalMomentum,
        selectionModelVersion: s.modelVersion,
        selectionReason: s.reasons,
      })),
      skipDuplicates: true,
    });
  }

  logSelectionEvent("selection.completed", {
    researchRunId,
    candidateCount: candidates.length,
    candidatesWithGrowth: candidates.filter((c) => c.growth7d !== null).length,
    candidatesWithSignal: ranked.length,
    selectedCount: selected.length,
    tieExpansion: selected.length - Math.min(topN, ranked.length),
  });

  return selected.map((s) => ({
    projectId: s.projectId,
    slug: s.slug,
    rank: s.rank,
    priorityScore: s.priorityScore,
    reasons: s.reasons,
  }));
}
