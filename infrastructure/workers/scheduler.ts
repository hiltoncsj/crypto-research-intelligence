import "dotenv/config";
import { prisma } from "@crypto-research/database";
import { enqueueResearchRun } from "@crypto-research/queue";
import {
  AgentFrequency,
  ResearchRunMode,
  ResearchRunStatus,
  ResearchRunTrigger,
} from "@crypto-research/shared";

// Sprint 4 (Fase 13/14): scheduler simples — não é um scheduler de produção robusto (não
// coordena múltiplas instâncias do próprio scheduler além do lock que o Worker já adquire
// por Research Run; se dois processos scheduler rodarem ao mesmo tempo, ambos podem tentar
// criar uma ResearchRun no mesmo tick — o lock distribuído do Worker garante que só uma
// execução real acontece por vez, mas poderia sobrar uma ResearchRun QUEUED extra. Aceitável
// para o MVP de single-instance; documentado como limitação conhecida).
//
// Roda como processo separado (`npm run scheduler:dev`), verificando `agent_settings` a cada
// `TICK_INTERVAL_MS`. Mesma infraestrutura de Manual + Scheduled (Fase 14) — só muda o
// `trigger` do ResearchRun criado.

const TICK_INTERVAL_MS = 60_000;

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

function computeNextRunAt(frequency: AgentFrequency, from: Date): Date | null {
  const next = new Date(from);
  switch (frequency) {
    case AgentFrequency.DAILY:
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case AgentFrequency.EVERY_12_HOURS:
      next.setUTCHours(next.getUTCHours() + 12);
      return next;
    case AgentFrequency.WEEKLY:
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case AgentFrequency.BIWEEKLY:
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case AgentFrequency.MONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case AgentFrequency.MANUAL:
    default:
      return null;
  }
}

export async function tick(): Promise<void> {
  const settings = await prisma.agentSettings.findFirst();
  if (!settings || !settings.enabled || settings.frequency === AgentFrequency.MANUAL) {
    return;
  }

  const now = new Date();
  if (settings.nextRunAt && settings.nextRunAt > now) {
    return;
  }

  // Fase 13: nunca criar uma nova run se já existe uma QUEUED/RUNNING (evita duplicação).
  const activeRun = await prisma.researchRun.findFirst({
    where: { status: { in: [ResearchRunStatus.QUEUED, ResearchRunStatus.RUNNING] } },
  });
  if (activeRun) {
    log("research_run.scheduler_skipped_running", { activeRunId: activeRun.id });
    return;
  }

  log("research_run.scheduler_tick", { frequency: settings.frequency, mode: settings.mode });

  const run = await prisma.researchRun.create({
    data: {
      mode: settings.mode as ResearchRunMode,
      trigger: ResearchRunTrigger.SCHEDULED,
      status: ResearchRunStatus.QUEUED,
    },
  });

  await enqueueResearchRun({
    researchRunId: run.id,
    mode: run.mode as ResearchRunMode,
    trigger: ResearchRunTrigger.SCHEDULED,
  });

  await prisma.agentSettings.update({
    where: { id: settings.id },
    data: {
      lastRunAt: now,
      nextRunAt: computeNextRunAt(settings.frequency as AgentFrequency, now),
    },
  });
}

// Sempre executado diretamente como processo standalone (ver comentário equivalente em
// research-worker.ts sobre por que não há guarda de entrypoint).
console.log(JSON.stringify({ event: "scheduler_started", intervalMs: TICK_INTERVAL_MS }));
setInterval(() => {
  tick().catch((err) =>
    log("scheduler_tick_error", { error: err instanceof Error ? err.message : String(err) }),
  );
}, TICK_INTERVAL_MS);
