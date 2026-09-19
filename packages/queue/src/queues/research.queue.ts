import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { ResearchRunJobPayload } from "../types";

// Sprint 4 (Fase 3): fila única "research-runs" (YAGNI — não precisamos de múltiplas filas
// ainda, mesma filosofia do plano de implementação seção 11). Única abstração de BullMQ
// exposta ao resto do código: `enqueueResearchRun()`. Nada mais no projeto deve importar
// `bullmq` diretamente fora deste package e do Worker.

export const RESEARCH_QUEUE_NAME = "research-runs";

let sharedQueue: Queue<ResearchRunJobPayload> | null = null;

function getQueue(): Queue<ResearchRunJobPayload> {
  if (!sharedQueue) {
    sharedQueue = new Queue<ResearchRunJobPayload>(RESEARCH_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return sharedQueue;
}

/**
 * Enfileira um job para processar a Research Run já criada no banco (`researchRunId`).
 * Idempotente por design de uso: usamos o próprio `researchRunId` como `jobId` do BullMQ, que
 * garante que enfileirar duas vezes o mesmo `researchRunId` não cria dois jobs (Fase 6) — a
 * segunda chamada é ignorada pelo BullMQ silenciosamente (mesmo jobId já existe na fila).
 *
 * Retry: attempts=3 com backoff exponencial (Fase 19). Erros de validação de payload (ex:
 * ResearchRun inexistente) são tratados como não-retryable pelo próprio Worker, que marca o
 * job como concluído com falha lógica em vez de lançar (lançar faria o BullMQ tentar de novo
 * inutilmente) — ver `infrastructure/workers/research-worker.ts`.
 */
export async function enqueueResearchRun(payload: ResearchRunJobPayload): Promise<void> {
  const queue = getQueue();
  await queue.add("process-research-run", payload, {
    jobId: payload.researchRunId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  });
}

export async function closeResearchQueue(): Promise<void> {
  if (sharedQueue) {
    await sharedQueue.close();
    sharedQueue = null;
  }
}
