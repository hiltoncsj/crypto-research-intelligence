import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "@crypto-research/database";
import {
  discoverProjects,
  revertRunCardsToBacklog,
  runManualResearchPipeline,
  selectTopProjects,
} from "@crypto-research/research-engine";
import {
  acquireLock,
  getRedisConnection,
  releaseLock,
  RESEARCH_QUEUE_NAME,
  startLockRenewal,
  type ResearchRunJobPayload,
} from "@crypto-research/queue";
import { ResearchRunStatus } from "@crypto-research/shared";

// Sprint 4 (Fase 4/16): processo Node standalone, separado do processo HTTP do Next.js
// (Fase 16 é explícita: "não misturar o Worker dentro do processo HTTP"). Em dev, rode com
// `npm run worker:dev` (tsx watch); em produção, compile e rode como um processo próprio
// (ex: `node dist/infrastructure/workers/research-worker.js`), nunca dentro do `next start`.
//
// O Worker NÃO duplica lógica de coleta/validação — ele só orquestra: carrega o ResearchRun,
// adquire o lock, chama `runManualResearchPipeline` (packages/research-engine, já existente
// desde o Sprint 3) passando callbacks de progresso/cancelamento, e persiste o resultado.

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

async function processResearchRunJob(job: Job<ResearchRunJobPayload>): Promise<void> {
  const { researchRunId, projectSlugs } = job.data;

  const run = await prisma.researchRun.findUnique({ where: { id: researchRunId } });
  if (!run) {
    // Payload malformado/ResearchRun inexistente: erro permanente, não adianta tentar de novo.
    // Não lançamos (lançar faria o BullMQ agendar retry) — apenas registramos e retornamos.
    log("research_run.failed", {
      researchRunId,
      reason: "ResearchRun não encontrada (não-retryable)",
    });
    return;
  }

  if (run.status === ResearchRunStatus.CANCELLED) {
    log("research_run.cancelled", { researchRunId, reason: "Cancelada antes do Worker iniciar" });
    return;
  }

  const lock = await acquireLock();
  if (!lock) {
    // Outra execução já está rodando (Fase 5/13) — deixamos o BullMQ tentar de novo mais
    // tarde via retry (attempts:3, backoff exponencial já configurado no enqueue).
    log("research_run.lock_acquired", { researchRunId, acquired: false });
    throw new Error(
      "Não foi possível adquirir o lock research-agent-lock — outra run em andamento.",
    );
  }
  log("research_run.lock_acquired", { researchRunId, acquired: true });
  const stopRenewal = startLockRenewal(lock);

  try {
    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: { status: ResearchRunStatus.RUNNING, startedAt: new Date() },
    });
    log("research_run.started", { researchRunId, mode: run.mode, trigger: run.trigger });

    // Sprint 8: sem slugs explícitos (run criada sem `projectIds`) → fluxo dinâmico:
    // Discovery (novos projetos do universo DefiLlama) seguido de Top 10 Selection (Priority
    // Model sobre TODO o universo já conhecido) — nunca mais cai em `FIXED_DEV_PROJECT_SLUGS`.
    // Ver TOP10_SELECTION_SPEC.md e PROJECT_DISCOVERY_SPEC.md.
    let slugs: string[];
    if (projectSlugs && projectSlugs.length > 0) {
      slugs = projectSlugs;
    } else {
      const discovery = await discoverProjects(researchRunId);
      log("research_run.discovery_completed", { researchRunId, ...discovery });

      const selection = await selectTopProjects(researchRunId);
      log("research_run.selection_completed", {
        researchRunId,
        selectedCount: selection.length,
        slugs: selection.map((s) => s.slug),
      });

      slugs = selection.map((s) => s.slug);
      await prisma.researchRun.update({
        where: { id: researchRunId },
        data: { totalProjects: slugs.length },
      });
    }

    const summary = await runManualResearchPipeline(slugs, {
      researchRunId,
      shouldContinue: async () => {
        const current = await prisma.researchRun.findUnique({
          where: { id: researchRunId },
          select: { cancelRequested: true },
        });
        return !current?.cancelRequested;
      },
      onProjectCompleted: async (result, index, total) => {
        log(
          result.status === "COMPLETED"
            ? "research_run.project_completed"
            : "research_run.project_failed",
          { researchRunId, slug: result.slug, index, total, error: result.error },
        );
        await prisma.researchRun.update({
          where: { id: researchRunId },
          data: { processedProjects: index + 1 },
        });
      },
    });

    const successful = summary.results.filter((r) => r.status === "COMPLETED").length;
    const failed = summary.results.filter((r) => r.status === "FAILED").length;
    // Fase 1: um projeto é "suspicious" se pelo menos um dos seus snapshots (TVL/Fees/Revenue)
    // nesta run caiu no caso SUSPICIOUS do Validator (persistido, mas com quality marcada).
    const suspicious = summary.results.filter((r) =>
      [r.tvl, r.fees, r.revenue].some((s) => s && s.suspicious > 0),
    ).length;

    const finalStatus = await prisma.researchRun.findUnique({
      where: { id: researchRunId },
      select: { cancelRequested: true },
    });

    let status: ResearchRunStatus;
    if (finalStatus?.cancelRequested) {
      status = ResearchRunStatus.CANCELLED;
      await revertRunCardsToBacklog(researchRunId);
    } else if (successful === 0 && failed > 0) {
      status = ResearchRunStatus.FAILED;
    } else if (failed > 0) {
      status = ResearchRunStatus.PARTIAL;
    } else {
      status = ResearchRunStatus.COMPLETED;
    }

    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: {
        status,
        finishedAt: new Date(),
        processedProjects: summary.results.length,
        successfulProjects: successful,
        failedProjects: failed,
        suspiciousProjects: suspicious,
      },
    });

    log(
      status === "COMPLETED"
        ? "research_run.completed"
        : status === "PARTIAL"
          ? "research_run.partial"
          : status === "CANCELLED"
            ? "research_run.cancelled"
            : "research_run.failed",
      { researchRunId, successful, failed, suspicious },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: { status: ResearchRunStatus.FAILED, finishedAt: new Date(), errorMessage: message },
    });
    log("research_run.failed", { researchRunId, error: message });
    throw err; // deixa o BullMQ registrar a falha do job (permite retry conforme configurado).
  } finally {
    stopRenewal();
    const released = await releaseLock(lock);
    log("research_run.lock_released", { researchRunId, released });
  }
}

export function startResearchWorker(): Worker<ResearchRunJobPayload> {
  const worker = new Worker<ResearchRunJobPayload>(RESEARCH_QUEUE_NAME, processResearchRunJob, {
    connection: getRedisConnection(),
    concurrency: 1, // Fase 13: nunca duas Research Runs em paralelo, reforçado pelo lock também.
    // Sprint 6 (bug real encontrado durante o teste E2E obrigatório): o `lockDuration` default
    // do BullMQ é 30s, renovado automaticamente a cada ~15s — mas um único job aqui roda o
    // Research Run INTEIRO (todos os projetos + scores), o que já levava minutos desde o
    // Sprint 3/4. Uma instabilidade momentânea de conexão com o Postgres (observada de fato
    // nesta sprint: "Can't reach database server at localhost:5433") foi suficiente para
    // atrasar UMA renovação além do lockDuration, fazendo o BullMQ marcar o job como "stalled"
    // e movê-lo para failed (`job stalled more than allowable limit`) mesmo com o processamento
    // ainda rodando corretamente em memória — a ResearchRun ficava presa em RUNNING para
    // sempre, porque a Promise órfã do processamento real só atualizaria o status ao terminar,
    // e o BullMQ já tinha desistido do job. `lockDuration` generoso (30min) dá margem real para
    // o pipeline completo, sem depender de o event loop nunca sofrer um hiccup de rede.
    lockDuration: 30 * 60 * 1000,
  });

  worker.on("completed", (job) => log("research_run.completed", { jobId: job.id }));
  worker.on("failed", (job, err) =>
    log("research_run.failed", {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    }),
  );

  return worker;
}

// Este arquivo é sempre executado diretamente como processo standalone (`npm run worker:dev`
// ou `node dist/.../research-worker.js` em produção) — nunca importado por outro módulo do
// projeto — então inicia o Worker incondicionalmente ao carregar (sem guarda de entrypoint,
// que se mostrou frágil sob `tsx`: `import.meta.url` vs `process.argv[1]` não bate de forma
// portável entre loaders).
const worker = startResearchWorker();
console.log(JSON.stringify({ event: "worker_started", queue: RESEARCH_QUEUE_NAME }));

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});
