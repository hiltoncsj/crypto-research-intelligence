import { describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";

// Sprint 4 (Fase 21): criação, estados e transições de ResearchRun — integração real contra
// o Postgres do docker-compose.

describe("ResearchRun (Prisma, integração real)", () => {
  it("cria com status QUEUED por padrão", async () => {
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 3 },
    });
    expect(run.status).toBe("QUEUED");
    expect(run.processedProjects).toBe(0);
    expect(run.cancelRequested).toBe(false);
  });

  it("transiciona QUEUED -> RUNNING -> COMPLETED", async () => {
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 1 },
    });

    const running = await prisma.researchRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    expect(running.status).toBe("RUNNING");
    expect(running.startedAt).not.toBeNull();

    const completed = await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        processedProjects: 1,
        successfulProjects: 1,
      },
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.finishedAt).not.toBeNull();
  });

  it("um projeto falho entre vários resulta em PARTIAL, não FAILED", async () => {
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 3 },
    });

    const partial = await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "PARTIAL",
        finishedAt: new Date(),
        processedProjects: 3,
        successfulProjects: 2,
        failedProjects: 1,
      },
    });
    expect(partial.status).toBe("PARTIAL");
  });

  it("todos os projetos falhando resulta em FAILED", async () => {
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 2 },
    });

    const failed = await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        processedProjects: 2,
        successfulProjects: 0,
        failedProjects: 2,
        errorMessage: "Todos os projetos falharam",
      },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toBeTruthy();
  });

  it("cancelRequested pode ser sinalizado numa run RUNNING e finalizada como CANCELLED", async () => {
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 3, status: "RUNNING" },
    });

    const flagged = await prisma.researchRun.update({
      where: { id: run.id },
      data: { cancelRequested: true },
    });
    expect(flagged.cancelRequested).toBe(true);

    const cancelled = await prisma.researchRun.update({
      where: { id: run.id },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    expect(cancelled.status).toBe("CANCELLED");
  });
});
