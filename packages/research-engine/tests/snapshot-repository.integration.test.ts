import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadSeries,
  persistSnapshotPoint,
  persistSnapshotSeries,
} from "../src/snapshot-repository";

// Integração real contra o Postgres do docker-compose (sem mock de banco — Fase 17/seção 17 do plano).

describe("snapshot-repository (Prisma, integração real)", () => {
  let projectId: string;
  const slug = `test-project-${randomUUID()}`;

  beforeAll(async () => {
    const sector = await prisma.sector.upsert({
      where: { name: "Uncategorized" },
      update: {},
      create: { name: "Uncategorized" },
    });
    const project = await prisma.project.create({
      data: { slug, name: "Test Project", defillamaId: slug, sectorId: sector.id },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.tvlSnapshot.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("insert: cria um novo snapshot", async () => {
    const result = await persistSnapshotPoint(
      "TVL",
      projectId,
      { sourceTimestamp: "2026-09-01T00:00:00.000Z", valueUsd: 100 },
      null,
      "2026-09-01T00:05:00.000Z",
    );
    expect(result.outcome).toBe("created");
  });

  it("duplicate: rodar de novo com o mesmo ponto não cria duplicata (idempotência)", async () => {
    const point = { sourceTimestamp: "2026-09-01T00:00:00.000Z", valueUsd: 100 };
    const result = await persistSnapshotPoint(
      "TVL",
      projectId,
      point,
      null,
      "2026-09-02T00:00:00.000Z",
    );
    expect(result.outcome).toBe("skipped_duplicate");

    const series = await loadSeries("TVL", projectId);
    const matching = series.filter(
      (s) => s.sourceTimestamp.toISOString() === "2026-09-01T00:00:00.000Z",
    );
    expect(matching).toHaveLength(1);
  });

  it("rejeita valor inválido sem persistir", async () => {
    const result = await persistSnapshotPoint(
      "TVL",
      projectId,
      { sourceTimestamp: "2026-09-03T00:00:00.000Z", valueUsd: -1 },
      null,
      "2026-09-03T00:00:00.000Z",
    );
    expect(result.outcome).toBe("rejected_invalid");

    const series = await loadSeries("TVL", projectId);
    expect(series.some((s) => s.sourceTimestamp.toISOString() === "2026-09-03T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("persiste uma série inteira, contando created/skipped/rejected", async () => {
    const freshSlug = `series-${randomUUID()}`;
    const sector = await prisma.sector.findFirstOrThrow({ where: { name: "Uncategorized" } });
    const project = await prisma.project.create({
      data: {
        slug: freshSlug,
        name: "Series Project",
        defillamaId: freshSlug,
        sectorId: sector.id,
      },
    });

    const points = [
      { sourceTimestamp: "2026-08-01T00:00:00.000Z", valueUsd: 100 },
      { sourceTimestamp: "2026-08-02T00:00:00.000Z", valueUsd: 110 },
      { sourceTimestamp: "2026-08-03T00:00:00.000Z", valueUsd: -5 },
    ];

    const summary = await persistSnapshotSeries(
      "TVL",
      project.id,
      points,
      "2026-08-03T01:00:00.000Z",
    );
    expect(summary.created).toBe(2);
    expect(summary.rejectedInvalid).toBe(1);

    const summary2 = await persistSnapshotSeries(
      "TVL",
      project.id,
      points,
      "2026-08-04T01:00:00.000Z",
    );
    expect(summary2.skippedDuplicate).toBe(2);

    await prisma.tvlSnapshot.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });
});
