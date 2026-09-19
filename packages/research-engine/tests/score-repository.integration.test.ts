import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculateWindowMetrics } from "../src/metrics";
import {
  computeAndPersistFundamentalScore,
  getFundamentalRanking,
  getFundamentalScoreHistory,
  getLatestFundamentalScore,
} from "../src/score-repository";
import { loadSeries } from "../src/snapshot-repository";

// Sprint 5 (Fase 21/27): integração real contra o Postgres do docker-compose — sem mock de
// banco. Cria um setor isolado com 5 projetos de fixture para não misturar com dados reais
// (aave/uniswap/lido) de outras sprints, e valida a cadeia completa: snapshots → métricas →
// Scoring Engine → persistência → leitura (ranking/histórico).

const ASOF = new Date("2026-09-15T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_TS = new Date(ASOF.getTime() - 35 * DAY_MS); // referência para growth (>=30d atrás)

describe("score-repository (Prisma, integração real)", () => {
  const sectorName = `test-sector-${randomUUID()}`;
  let sectorId: string;
  let researchRunId: string;
  const projectIds: Record<string, string> = {};

  async function seedProject(
    key: string,
    values: { tvl?: [number, number]; revenue?: [number, number]; fees?: [number, number] },
  ): Promise<string> {
    const slug = `${key}-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });

    if (values.tvl) {
      await prisma.tvlSnapshot.createMany({
        data: [
          {
            projectId: project.id,
            valueUsd: values.tvl[0],
            sourceTimestamp: OLD_TS,
            retrievedAt: OLD_TS,
          },
          {
            projectId: project.id,
            valueUsd: values.tvl[1],
            sourceTimestamp: ASOF,
            retrievedAt: ASOF,
          },
        ],
      });
    }
    if (values.revenue) {
      await prisma.revenueSnapshot.createMany({
        data: [
          {
            projectId: project.id,
            revenueUsd: values.revenue[0],
            sourceTimestamp: OLD_TS,
            retrievedAt: OLD_TS,
          },
          {
            projectId: project.id,
            revenueUsd: values.revenue[1],
            sourceTimestamp: ASOF,
            retrievedAt: ASOF,
          },
        ],
      });
    }
    if (values.fees) {
      await prisma.feeSnapshot.createMany({
        data: [
          {
            projectId: project.id,
            feesUsd: values.fees[0],
            sourceTimestamp: OLD_TS,
            retrievedAt: OLD_TS,
          },
          {
            projectId: project.id,
            feesUsd: values.fees[1],
            sourceTimestamp: ASOF,
            retrievedAt: ASOF,
          },
        ],
      });
    }

    projectIds[key] = project.id;
    return project.id;
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;

    // 5 pares comparáveis (Fase 8: amostra >= 3 para percentile confiável).
    await seedProject("p1", { tvl: [50, 100], revenue: [5, 10], fees: [0.5, 1] }); // growth 100%
    await seedProject("p2", { tvl: [100, 150], revenue: [10, 15], fees: [1, 1.5] }); // growth 50%
    await seedProject("p3", { tvl: [100, 100], revenue: [10, 10], fees: [1, 1] }); // growth 0%
    await seedProject("p4", { tvl: [100, 80], fees: [1, 0.8] }); // revenue MISSING para p4
    // p5 é o projeto sob teste: tvl/revenue disponíveis, fees ausente.
    await seedProject("p5", { tvl: [100, 130], revenue: [10, 13] });

    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL" },
    });
    researchRunId = run.id;
  });

  afterAll(async () => {
    await prisma.fundamentalScore.deleteMany({ where: { researchRunId } });
    for (const id of Object.values(projectIds)) {
      await prisma.tvlSnapshot.deleteMany({ where: { projectId: id } });
      await prisma.revenueSnapshot.deleteMany({ where: { projectId: id } });
      await prisma.feeSnapshot.deleteMany({ where: { projectId: id } });
      await prisma.project.delete({ where: { id } });
    }
    await prisma.researchRun.delete({ where: { id: researchRunId } });
    await prisma.sector.delete({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  async function scoreP5() {
    const projectId = projectIds.p5;
    const [tvlSeries, revenueSeries, feesSeries] = await Promise.all([
      loadSeries("TVL", projectId),
      loadSeries("REVENUE", projectId),
      loadSeries("FEES", projectId),
    ]);
    const metrics = {
      tvl: calculateWindowMetrics(tvlSeries, ASOF),
      revenue: calculateWindowMetrics(revenueSeries, ASOF),
      fees: calculateWindowMetrics(feesSeries, ASOF),
    };

    return computeAndPersistFundamentalScore({
      researchRunId,
      projectId,
      sectorId,
      metrics,
      series: { tvl: tvlSeries, revenue: revenueSeries, fees: feesSeries },
      quality: {
        tvl: { suspicious: false, invalidRejected: false },
        revenue: { suspicious: false, invalidRejected: false },
        fees: { suspicious: false, invalidRejected: false },
      },
      asOf: ASOF,
    });
  }

  it("calcula e persiste um Fundamental Score real, com Fees MISSING marcado (não zero)", async () => {
    const result = await scoreP5();

    expect(result.scoreModelVersion).toBe("fundamental-v1");
    expect(result.maxScore).toBe(30);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThan(30); // Fees ausente impede o máximo
    expect(result.partial).toBe(true); // Fees Growth ausente

    const persisted = await getLatestFundamentalScore(projectIds.p5);
    expect(persisted).not.toBeNull();
    expect(persisted?.researchRunId).toBe(researchRunId);

    const breakdown = persisted?.breakdown as { missingGroups: string[]; trace: unknown[] };
    expect(breakdown.missingGroups).toContain("FEES_GROWTH");
    expect(breakdown.trace.length).toBeGreaterThan(0);
  });

  it("Fase 20: ranking inclui o projeto com score persistido, ordenado desc", async () => {
    await scoreP5();
    const ranking = await getFundamentalRanking();
    const entry = ranking.find((r) => r.projectId === projectIds.p5);
    expect(entry).toBeDefined();
    expect(entry?.sectorName).toBe(sectorName);

    // ordenado por totalScore desc
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].totalScore).toBeGreaterThanOrEqual(ranking[i].totalScore);
    }
  });

  it("Fase 18: histórico preserva múltiplas execuções sem sobrescrever (INSERT, nunca UPDATE)", async () => {
    const before = await getFundamentalScoreHistory(projectIds.p5);
    await scoreP5();
    const after = await getFundamentalScoreHistory(projectIds.p5);
    expect(after.length).toBe(before.length + 1);
  });

  it("Fase 27: reprodutibilidade — mesma entrada produz o mesmo Score e Confidence", async () => {
    const run2 = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    try {
      const projectId = projectIds.p5;
      const [tvlSeries, revenueSeries, feesSeries] = await Promise.all([
        loadSeries("TVL", projectId),
        loadSeries("REVENUE", projectId),
        loadSeries("FEES", projectId),
      ]);
      const metrics = {
        tvl: calculateWindowMetrics(tvlSeries, ASOF),
        revenue: calculateWindowMetrics(revenueSeries, ASOF),
        fees: calculateWindowMetrics(feesSeries, ASOF),
      };
      const quality = {
        tvl: { suspicious: false, invalidRejected: false },
        revenue: { suspicious: false, invalidRejected: false },
        fees: { suspicious: false, invalidRejected: false },
      };

      const first = await computeAndPersistFundamentalScore({
        researchRunId,
        projectId,
        sectorId,
        metrics,
        series: { tvl: tvlSeries, revenue: revenueSeries, fees: feesSeries },
        quality,
        asOf: ASOF,
      });
      const second = await computeAndPersistFundamentalScore({
        researchRunId: run2.id,
        projectId,
        sectorId,
        metrics,
        series: { tvl: tvlSeries, revenue: revenueSeries, fees: feesSeries },
        quality,
        asOf: ASOF,
      });

      expect(second.totalScore).toBeCloseTo(first.totalScore, 10);
      expect(second.confidence).toBeCloseTo(first.confidence, 10);
    } finally {
      await prisma.fundamentalScore.deleteMany({ where: { researchRunId: run2.id } });
      await prisma.researchRun.delete({ where: { id: run2.id } });
    }
  });

  it("Fase 26: projeto com Revenue inteiramente ausente (p4) não recebe score fabricado nesse grupo", async () => {
    const projectId = projectIds.p4;
    const [tvlSeries, revenueSeries, feesSeries] = await Promise.all([
      loadSeries("TVL", projectId),
      loadSeries("REVENUE", projectId),
      loadSeries("FEES", projectId),
    ]);
    const metrics = {
      tvl: calculateWindowMetrics(tvlSeries, ASOF),
      revenue: calculateWindowMetrics(revenueSeries, ASOF),
      fees: calculateWindowMetrics(feesSeries, ASOF),
    };

    const result = await computeAndPersistFundamentalScore({
      researchRunId,
      projectId,
      sectorId,
      metrics,
      series: { tvl: tvlSeries, revenue: revenueSeries, fees: feesSeries },
      quality: {
        tvl: { suspicious: false, invalidRejected: false },
        revenue: { suspicious: false, invalidRejected: false },
        fees: { suspicious: false, invalidRejected: false },
      },
      asOf: ASOF,
    });

    const persisted = await getLatestFundamentalScore(projectId);
    const breakdown = persisted?.breakdown as {
      missingGroups: string[];
      groups: { revenueGrowth: { score: number | null } };
    };
    expect(breakdown.missingGroups).toContain("REVENUE_GROWTH");
    expect(breakdown.groups.revenueGrowth.score).toBeNull();
    expect(result.confidence).toBeLessThan(100);
  });
});
