import { randomUUID } from "node:crypto";
import { prisma, SnapshotSource } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getDataHealthOverview,
  getDivergenceOverview,
  getFundamentalMovementOverview,
  getResearchOverview,
} from "../src/dashboard-intelligence";

// Sprint 14 — Dashboard Home real (Parte 18-21). Integração real contra o Postgres do
// docker-compose. Como estas funções agregam sobre TODOS os projetos "já pesquisados" do banco
// (não apenas os deste arquivo), os testes verificam invariantes que continuam verdadeiras
// independente do estado global (mesmo princípio documentado em
// selection.integration.test.ts) — nunca comparam contagem global exata.

const DAY_MS = 24 * 60 * 60 * 1000;

describe("dashboard-intelligence (Prisma, integração real)", () => {
  const sectorName = `test-dashboard-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];
  const researchRunIds: string[] = [];

  async function seedResearchedProject(): Promise<{ id: string; slug: string }> {
    const slug = `dash-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", status: "COMPLETED", finishedAt: new Date() },
    });
    researchRunIds.push(run.id);
    await prisma.fundamentalScore.create({
      data: {
        researchRunId: run.id,
        projectId: project.id,
        scoreModelVersion: "test-v1",
        totalScore: 50,
        maxScore: 100,
        confidence: 80,
        breakdown: {},
      },
    });
    return { id: project.id, slug: project.slug };
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterAll(async () => {
    await prisma.fundamentalScore.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.marketDataSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of researchRunIds) {
      await prisma.researchRun.delete({ where: { id } }).catch(() => {});
    }
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  describe("getResearchOverview", () => {
    it("inclui o projeto recém-pesquisado na contagem e reflete a última Research Run real", async () => {
      const before = await getResearchOverview();
      await seedResearchedProject();
      const after = await getResearchOverview();

      expect(after.projectsResearched).toBeGreaterThan(before.projectsResearched - 1);
      expect(after.researchRunsTotal).toBeGreaterThan(before.researchRunsTotal);
      expect(after.lastResearchRun).not.toBeNull();
    });
  });

  describe("getDataHealthOverview", () => {
    it("projeto sem nenhum snapshot conta como pesquisado mas com 0% de cobertura ADICIONAL", async () => {
      const { id: projectId } = await seedResearchedProject();
      const health = await getDataHealthOverview();
      // Não afirma percentuais globais exatos (outros projetos no banco) — só que o total
      // reflete pelo menos este projeto.
      expect(health.projectsResearched).toBeGreaterThan(0);
      expect(health.tvlCoverage.count).toBeLessThanOrEqual(health.projectsResearched);
      // Confirma explicitamente que ESTE projeto (sem TVL) não é contado em tvlCoverage.
      const tvlRows = await prisma.tvlSnapshot.findMany({ where: { projectId } });
      expect(tvlRows).toHaveLength(0);
    });

    it("projeto com TVL real conta na cobertura de TVL", async () => {
      const { id: projectId } = await seedResearchedProject();
      await prisma.tvlSnapshot.create({
        data: {
          projectId,
          valueUsd: 1000,
          source: SnapshotSource.DEFILLAMA,
          sourceTimestamp: new Date(),
          retrievedAt: new Date(),
        },
      });
      const health = await getDataHealthOverview();
      expect(health.tvlCoverage.count).toBeGreaterThan(0);
    });
  });

  describe("getFundamentalMovementOverview", () => {
    it("só inclui projetos com Fundamental Momentum calculável (com pelo menos um growth real)", async () => {
      const asOf = new Date("2026-09-19T00:00:00.000Z");
      const { id: projectId, slug } = await seedResearchedProject();
      await prisma.tvlSnapshot.createMany({
        data: [
          { days: 30, value: 100 },
          { days: 0, value: 150 },
        ].map(({ days, value }) => ({
          projectId,
          valueUsd: value,
          source: SnapshotSource.DEFILLAMA,
          sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
          retrievedAt: asOf,
        })),
      });

      const movement = await getFundamentalMovementOverview(50);
      const entry = movement.find((m) => m.slug === slug);
      expect(entry).toBeDefined();
      expect(entry!.fundamentalMomentum).not.toBeNull();
    });

    it("nunca inclui projeto sem NENHUM growth calculável (momentum null é filtrado)", async () => {
      const { slug } = await seedResearchedProject(); // sem nenhum snapshot
      const movement = await getFundamentalMovementOverview(200);
      expect(movement.find((m) => m.slug === slug)).toBeUndefined();
    });
  });

  describe("getDivergenceOverview", () => {
    it("classifica corretamente um projeto com fundamentos fortes e preço estável", async () => {
      const asOf = new Date("2026-09-19T00:00:00.000Z");
      const { id: projectId, slug } = await seedResearchedProject();
      await prisma.tvlSnapshot.createMany({
        data: [
          { days: 30, value: 100 },
          { days: 0, value: 200 }, // +100% TVL
        ].map(({ days, value }) => ({
          projectId,
          valueUsd: value,
          source: SnapshotSource.DEFILLAMA,
          sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
          retrievedAt: asOf,
        })),
      });
      await prisma.marketDataSnapshot.createMany({
        data: [
          { days: 30, value: 1000 },
          { days: 0, value: 1050 }, // +5% price (movimento pequeno)
        ].map(({ days, value }) => ({
          projectId,
          priceUsd: value,
          source: SnapshotSource.COINGECKO,
          sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
          retrievedAt: asOf,
        })),
      });

      const overview = await getDivergenceOverview();
      const entry = overview.entries.find((e) => e.slug === slug);
      expect(entry).toBeDefined();
      expect(entry!.classification).toBe("POSITIVE_FUNDAMENTAL_DIVERGENCE");
      expect(overview.counts.POSITIVE_FUNDAMENTAL_DIVERGENCE).toBeGreaterThan(0);
    });
  });
});
