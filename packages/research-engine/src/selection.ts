import { prisma } from "@crypto-research/database";
import { calculateResearchPriority, PRIORITY_MODEL_VERSION } from "@crypto-research/scoring-engine";

import { computeFundingAggregates } from "./funding-repository";
import { logSelectionEvent } from "./logger";
import { getLatestFundamentalScore } from "./score-repository";
import { loadSeries } from "./snapshot-repository";
import { calculateWindowMetrics } from "./metrics";

// Sprint 8 — Top 10 Selection (ver TOP10_SELECTION_SPEC.md). Substitui a dependência de
// `FIXED_DEV_PROJECT_SLUGS` por uma seleção dinâmica: todo `Project` conhecido é candidato,
// pontuado pelo Priority Model (`priority-v1`, packages/scoring-engine/src/priority.ts) a
// partir de dados JÁ PERSISTIDOS (nenhuma chamada externa nova aqui — seção 30: reaproveitar).
// O resultado de cada Research Run é gravado em `ResearchRunSelection`, uma fotografia
// imutável — nunca sobrescreve a seleção de uma run anterior (seção 17).

export const DEFAULT_TOP_N = 10;

export interface CandidateProject {
  projectId: string;
  slug: string;
  score: number | null;
  growth30d: number | null;
  daysSinceLastRaise: number | null;
}

/** Universo pesquisável = todo `Project` já conhecido (descoberto automaticamente ou
 * manualmente) — não há uma tabela "Universe" separada (seção 10 do Sprint 8: "evitar criar
 * uma entidade apenas para dar nome ao conceito"; `Project` + snapshots + score já bastam). */
export async function buildCandidatePool(): Promise<CandidateProject[]> {
  const projects = await prisma.project.findMany({ select: { id: true, slug: true } });
  const asOf = new Date();

  return Promise.all(
    projects.map(async (p): Promise<CandidateProject> => {
      const [latestScore, tvlSeries, fundingAggregates] = await Promise.all([
        getLatestFundamentalScore(p.id),
        loadSeries("TVL", p.id),
        computeFundingAggregates(p.id, asOf),
      ]);

      const score =
        latestScore && Number(latestScore.maxScore) > 0
          ? (Number(latestScore.totalScore) / Number(latestScore.maxScore)) * 100
          : null;

      const growth30dRaw = calculateWindowMetrics(tvlSeries).growth30d;
      const growth30d = typeof growth30dRaw === "number" ? growth30dRaw : null;

      return {
        projectId: p.id,
        slug: p.slug,
        score,
        growth30d,
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

/** Desempate determinístico (seção 26): priorityScore -> globalScore -> growthMomentum ->
 * capitalMomentum -> slug. `null` sempre perde para um valor real no desempate. */
function compareCandidates(
  a: {
    priorityScore: number;
    score: number | null;
    growthMomentum: number | null;
    capitalMomentum: number | null;
    slug: string;
  },
  b: {
    priorityScore: number;
    score: number | null;
    growthMomentum: number | null;
    capitalMomentum: number | null;
    slug: string;
  },
): number {
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  const scoreA = a.score ?? -1;
  const scoreB = b.score ?? -1;
  if (scoreA !== scoreB) return scoreB - scoreA;
  const growthA = a.growthMomentum ?? -1;
  const growthB = b.growthMomentum ?? -1;
  if (growthA !== growthB) return growthB - growthA;
  const capitalA = a.capitalMomentum ?? -1;
  const capitalB = b.capitalMomentum ?? -1;
  if (capitalA !== capitalB) return capitalB - capitalA;
  return a.slug.localeCompare(b.slug);
}

/**
 * Calcula a prioridade de todo o universo, seleciona os `topN` primeiros e persiste a seleção
 * na `ResearchRunSelection` desta Research Run. Idempotente por construção: `researchRunId` +
 * `projectId` é `@@unique` no schema — reexecutar para a mesma run não duplica linhas (usa
 * `skipDuplicates`, seção 31).
 */
export async function selectTopProjects(
  researchRunId: string,
  topN: number = DEFAULT_TOP_N,
): Promise<SelectedProject[]> {
  logSelectionEvent("selection.started", {
    researchRunId,
    modelVersion: PRIORITY_MODEL_VERSION,
    topN,
  });

  const candidates = await buildCandidatePool();

  const scored = candidates.map((c) => {
    const priority = calculateResearchPriority({
      score: c.score,
      growth30d: c.growth30d,
      daysSinceLastRaise: c.daysSinceLastRaise,
    });
    return { ...c, ...priority };
  });

  scored.sort((a, b) =>
    compareCandidates(
      {
        priorityScore: a.priorityScore,
        score: a.score,
        growthMomentum: a.components.growthMomentum,
        capitalMomentum: a.components.capitalMomentum,
        slug: a.slug,
      },
      {
        priorityScore: b.priorityScore,
        score: b.score,
        growthMomentum: b.components.growthMomentum,
        capitalMomentum: b.components.capitalMomentum,
        slug: b.slug,
      },
    ),
  );

  // Nunca inventa projetos para completar `topN` (seção 25) — se houver menos candidatos
  // elegíveis, seleciona todos os disponíveis.
  const selected = scored.slice(0, topN);

  if (selected.length > 0) {
    await prisma.researchRunSelection.createMany({
      data: selected.map((s, index) => ({
        researchRunId,
        projectId: s.projectId,
        rank: index + 1,
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
    selectedCount: selected.length,
  });

  return selected.map((s, index) => ({
    projectId: s.projectId,
    slug: s.slug,
    rank: index + 1,
    priorityScore: s.priorityScore,
    reasons: s.reasons,
  }));
}
