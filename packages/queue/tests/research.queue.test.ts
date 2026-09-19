import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";
import {
  closeResearchQueue,
  enqueueResearchRun,
  RESEARCH_QUEUE_NAME,
} from "../src/queues/research.queue";
import { closeRedisConnection, getRedisConnection } from "../src/connection";
import { ResearchRunMode, ResearchRunTrigger } from "@crypto-research/shared";

describe("Research Queue (BullMQ, integração real contra Redis)", () => {
  afterAll(async () => {
    await closeResearchQueue();
    await closeRedisConnection();
  });

  it("enfileira um job com o payload correto", async () => {
    const researchRunId = randomUUID();
    await enqueueResearchRun({
      researchRunId,
      mode: ResearchRunMode.FULL,
      trigger: ResearchRunTrigger.MANUAL,
    });

    const queue = new Queue(RESEARCH_QUEUE_NAME, { connection: getRedisConnection() });
    const job = await queue.getJob(researchRunId);
    expect(job).not.toBeNull();
    expect(job?.data.researchRunId).toBe(researchRunId);
    expect(job?.data.mode).toBe(ResearchRunMode.FULL);

    await job?.remove();
  });

  it("é idempotente: enfileirar duas vezes o mesmo researchRunId não cria dois jobs", async () => {
    const researchRunId = randomUUID();
    await enqueueResearchRun({
      researchRunId,
      mode: ResearchRunMode.FULL,
      trigger: ResearchRunTrigger.MANUAL,
    });
    await enqueueResearchRun({
      researchRunId,
      mode: ResearchRunMode.FULL,
      trigger: ResearchRunTrigger.MANUAL,
    });

    const queue = new Queue(RESEARCH_QUEUE_NAME, { connection: getRedisConnection() });
    const job = await queue.getJob(researchRunId);
    expect(job).not.toBeNull();

    await job?.remove();
  });
});
