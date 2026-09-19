import { randomUUID } from "node:crypto";
import { prisma, SnapshotSource } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeFundamentalHistoricalIntelligence } from "../src/historical-intelligence";

// Sprint 14 — Historical Fundamental Intelligence. Integração real contra o Postgres do
// docker-compose (mesma filosofia anti-mock das demais suítes de *-repository). Constrói séries
// TVL/Revenue/MarketData REAIS e controladas (não aleatórias) para poder afirmar resultados
// exatos de growth/aceleração/correlação.

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeFundamentalHistoricalIntelligence (Prisma, integração real)", () => {
  const sectorName = `test-hist-intel-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(): Promise<string> {
    const slug = `hist-intel-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    return project.id;
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterAll(async () => {
    await prisma.marketDataSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.revenueSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.feeSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.token.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("projeto sem nenhum histórico: tudo N/A/INSUFFICIENT_DATA, nunca erro nem valor fabricado", async () => {
    const projectId = await seedProject();
    const result = await computeFundamentalHistoricalIntelligence(projectId, "empty-project");

    expect(result.coverage.tvl.snapshots).toBe(0);
    expect(result.coverage.marketData.snapshots).toBe(0);
    expect(result.growth.tvl["30d"]).toBe("N/A");
    expect(result.fundamentalMomentum.score).toBeNull();
    expect(result.acceleration.tvl.regime).toBe("INSUFFICIENT_DATA");
    expect(result.regime).toBe("INSUFFICIENT_DATA");
    expect(result.correlation.marketCapVsTvl.classification).toBe("INSUFFICIENT_DATA");
    expect(result.valuationRatios.marketCapToTvl).toBeNull();
  });

  it("cobertura reflete exatamente o número e range real de snapshots persistidos", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");
    const oldest = new Date(asOf.getTime() - 40 * DAY_MS);
    const newest = new Date(asOf.getTime() - 1 * DAY_MS);

    await prisma.tvlSnapshot.createMany({
      data: [oldest, newest].map((d) => ({
        projectId,
        valueUsd: 1_000_000,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: d,
        retrievedAt: d,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(projectId, "coverage-test", asOf);
    expect(result.coverage.tvl.snapshots).toBe(2);
    expect(result.coverage.tvl.oldest).toBe(oldest.toISOString());
    expect(result.coverage.tvl.newest).toBe(newest.toISOString());
  });

  it("growth/aceleração calculados a partir de uma série TVL real e controlada", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");

    // TVL: 100 (60d atrás) -> 115 (30d atrás, +15%) -> 161 (agora, +40% sobre os 115).
    await prisma.tvlSnapshot.createMany({
      data: [
        { days: 60, value: 100 },
        { days: 30, value: 115 },
        { days: 0, value: 161 },
      ].map(({ days, value }) => ({
        projectId,
        valueUsd: value,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(projectId, "growth-test", asOf);

    expect(result.growth.tvl["30d"]).toBeCloseTo(40, 0); // (161/115 - 1) * 100
    expect(result.acceleration.tvl.regime).toBe("ACCELERATING"); // 40% > 15% da janela anterior
    expect(result.acceleration.tvl.accelerationPp).toBeCloseTo(25, 0);
  });

  it("Fundamental Momentum usa só os componentes com dado real (TVL sim, Revenue/Fees não)", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");
    await prisma.tvlSnapshot.createMany({
      data: [
        { days: 30, value: 100 },
        { days: 0, value: 140 },
      ].map(({ days, value }) => ({
        projectId,
        valueUsd: value,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(projectId, "momentum-test", asOf);
    expect(result.fundamentalMomentum.availableComponents).toBe(1);
    expect(result.fundamentalMomentum.components.tvlGrowth).not.toBeNull();
    expect(result.fundamentalMomentum.components.revenueGrowth).toBeNull();
    expect(result.fundamentalMomentum.score).not.toBeNull();
  });

  it("Market Cap vs TVL e ratios usam MarketDataSnapshot real (Sprint 12)", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");

    await prisma.tvlSnapshot.createMany({
      data: [
        { days: 90, value: 100 },
        { days: 0, value: 120 }, // +20%
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
        { days: 90, value: 1000 },
        { days: 0, value: 1800 }, // +80%
      ].map(({ days, value }) => ({
        projectId,
        marketCapUsd: value,
        priceUsd: value / 10,
        source: SnapshotSource.COINGECKO,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(
      projectId,
      "mc-vs-tvl-test",
      asOf,
    );
    expect(result.marketVsFundamentals.marketCapVsTvl.relation).toBe("A_EXPANDED_FASTER"); // MC (+80%) > TVL (+20%)
    expect(result.valuationRatios.marketCapToTvl).toBeCloseTo(1800 / 120, 2);
  });

  it("FDV histórico nunca é fabricado — ratio FDV/Revenue usa só o snapshot ATUAL de Token.fdvUsd", async () => {
    const projectId = await seedProject();
    await prisma.token.create({ data: { projectId, fdvUsd: 5_000_000, retrievedAt: new Date() } });
    await prisma.revenueSnapshot.create({
      data: {
        projectId,
        revenueUsd: 100_000,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(),
        retrievedAt: new Date(),
      },
    });

    const result = await computeFundamentalHistoricalIntelligence(projectId, "fdv-test");
    expect(result.valuationRatios.fdvToRevenue).toBeCloseTo(50, 0);
  });

  it("correlação exige um mínimo de observações pareadas por dia — sem isso, INSUFFICIENT_DATA", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");
    // Só 2 pontos de TVL e MarketData -> menos que MIN_CORRELATION_OBSERVATIONS.
    await prisma.tvlSnapshot.createMany({
      data: [0, 1].map((days) => ({
        projectId,
        valueUsd: 100 + days,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });
    await prisma.marketDataSnapshot.createMany({
      data: [0, 1].map((days) => ({
        projectId,
        marketCapUsd: 1000 + days,
        source: SnapshotSource.COINGECKO,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(
      projectId,
      "corr-insufficient",
      asOf,
    );
    expect(result.correlation.marketCapVsTvl.classification).toBe("INSUFFICIENT_DATA");
  });

  it("regime FUNDAMENTAL_CONTRACTION quando TVL e Revenue estão ambos caindo", async () => {
    const projectId = await seedProject();
    const asOf = new Date("2026-09-19T00:00:00.000Z");
    await prisma.tvlSnapshot.createMany({
      data: [
        { days: 30, value: 200 },
        { days: 0, value: 100 }, // -50%
      ].map(({ days, value }) => ({
        projectId,
        valueUsd: value,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });
    await prisma.revenueSnapshot.createMany({
      data: [
        { days: 30, value: 50 },
        { days: 0, value: 20 }, // -60%
      ].map(({ days, value }) => ({
        projectId,
        revenueUsd: value,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(asOf.getTime() - days * DAY_MS),
        retrievedAt: asOf,
      })),
    });

    const result = await computeFundamentalHistoricalIntelligence(
      projectId,
      "contraction-test",
      asOf,
    );
    expect(result.regime).toBe("FUNDAMENTAL_CONTRACTION");
  });

  it("nunca lança para um projeto inexistente contorna-se no chamador — mas com projeto válido sem dados, resolve normalmente", async () => {
    const projectId = await seedProject();
    await expect(
      computeFundamentalHistoricalIntelligence(projectId, "resilience-test"),
    ).resolves.toBeDefined();
  });
});
