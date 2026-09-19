import { prisma } from "@crypto-research/database";
import { enqueueResearchRun } from "@crypto-research/queue";
import {
  computeSelectionRelevance,
  getRelevanceOutcome,
  revertRunCardsToBacklog,
} from "@crypto-research/research-engine";
import { ResearchRunMode, ResearchRunStatus, ResearchRunTrigger } from "@crypto-research/shared";

// Sprint 4 (Fase 9/10): camada de serviço para Research Runs — a rota HTTP cria a entidade no
// banco e enfileira o job, então responde rápido (Fase 10: "não manter operações de vários
// minutos presas à request HTTP"). O Worker (infrastructure/workers/research-worker.ts) é
// quem de fato executa o pipeline, lendo esta mesma ResearchRun pelo id do job.
//
// Sprint 8: quando `projectSlugs` não é informado explicitamente, a seleção deixou de cair
// numa lista fixa (`FIXED_DEV_PROJECT_SLUGS`) — a run é enfileirada sem slugs, e o Worker
// resolve dinamicamente (Discovery + Top 10 Selection) assim que começa a processar, porque a
// seleção depende de dados atualizados (Score/Growth/Funding) que só fazem sentido calcular no
// momento da execução, não no momento da criação da run (ver TOP10_SELECTION_SPEC.md).

export interface CreateResearchRunInput {
  mode: ResearchRunMode;
  trigger: ResearchRunTrigger;
  projectSlugs?: string[];
  requestedBy?: string | null;
}

export async function createResearchRun(input: CreateResearchRunInput) {
  const explicitSlugs =
    input.projectSlugs && input.projectSlugs.length > 0 ? input.projectSlugs : undefined;

  const run = await prisma.researchRun.create({
    data: {
      mode: input.mode,
      trigger: input.trigger,
      requestedBy: input.requestedBy ?? null,
      totalProjects: explicitSlugs?.length ?? 0,
      status: ResearchRunStatus.QUEUED,
      metadata: explicitSlugs ? { projectSlugs: explicitSlugs } : { dynamicSelection: true },
    },
  });

  await enqueueResearchRun({
    researchRunId: run.id,
    mode: run.mode as ResearchRunMode,
    trigger: run.trigger as ResearchRunTrigger,
    projectSlugs: explicitSlugs,
  });

  return run;
}

export async function listResearchRuns(limit = 20) {
  return prisma.researchRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getResearchRun(id: string) {
  const run = await prisma.researchRun.findUnique({
    where: { id },
    include: {
      // Sprint 8 (seção 39): expõe o Top 10 dinâmico direto na rota já existente
      // (`GET /api/research-runs/:id`) em vez de criar um endpoint novo — inclui `project` só
      // com os campos usados pela UI (slug/name), sem trazer todo o resto do registro.
      selections: {
        orderBy: { rank: "asc" },
        include: { project: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!run) return null;

  const progress = run.totalProjects > 0 ? run.processedProjects / run.totalProjects : 0;

  // "Aprende com os dados": percentil de priorityScore contra toda a população histórica
  // (selection-relevance.ts) em vez de um limiar fixo no client — recalibra sozinho a cada
  // Research Run nova, sem ajuste manual. Só calculado quando há seleções (evita trabalho à
  // toa em runs com lista fixa de projetos, que não usam Top 10 dinâmico).
  if (run.selections.length === 0) {
    return { ...run, progress };
  }

  const relevance = await computeSelectionRelevance(run.id);
  const relevanceByProjectId = new Map(relevance.map((r) => [r.projectId, r]));

  const selectionsWithRelevance = await Promise.all(
    run.selections.map(async (s) => {
      const rel = relevanceByProjectId.get(s.projectId);
      const outcome = rel?.relevant ? await getRelevanceOutcome(s.projectId) : null;
      return {
        ...s,
        priorityPercentile: rel?.priorityPercentile ?? null,
        relevant: rel?.relevant ?? false,
        relevanceOutcome: outcome,
      };
    }),
  );

  return { ...run, progress, selections: selectionsWithRelevance };
}

/**
 * Cancelamento cooperativo (Fase 22): se a run ainda não começou (QUEUED), marca direto como
 * CANCELLED — o Worker vai encontrá-la já cancelada ao pegar o job e não processa nada. Se já
 * está RUNNING, apenas sinaliza `cancelRequested`; o Worker verifica esse campo entre projetos
 * e interrompe o batch, finalizando como CANCELLED por conta própria.
 */
export async function requestCancelResearchRun(id: string) {
  const run = await prisma.researchRun.findUnique({ where: { id } });
  if (!run) return null;

  if (run.status === ResearchRunStatus.QUEUED) {
    const cancelled = await prisma.researchRun.update({
      where: { id },
      data: { status: ResearchRunStatus.CANCELLED, finishedAt: new Date() },
    });
    await revertRunCardsToBacklog(id);
    return cancelled;
  }

  if (run.status === ResearchRunStatus.RUNNING) {
    return prisma.researchRun.update({
      where: { id },
      data: { cancelRequested: true },
    });
  }

  // Já finalizada (COMPLETED/PARTIAL/FAILED/CANCELLED) — cancelamento não se aplica.
  return run;
}
