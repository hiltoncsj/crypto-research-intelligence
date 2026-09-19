import { randomUUID } from "node:crypto";
import { prisma, SnapshotSource } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { persistFundingCatalysts, persistSecurityIncidentRisks } from "../src/events-repository";
import {
  aggregateEventImpactsByCategory,
  computeEventImpact,
  getEventImpactsForProject,
} from "../src/event-impact-engine";

// Sprint 16 — Event Impact Analysis. Integração real contra o Postgres do docker-compose.
// Constrói séries TVL/MarketData REAIS e controladas (não aleatórias) ao redor de uma data de
// evento fixa, para poder afirmar resultados exatos de before/after/changePercent/classificação.

const DAY_MS = 24 * 60 * 60 * 1000;

describe("event-impact-engine (Prisma, integração real)", () => {
  const sectorName = `test-impact-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(): Promise<string> {
    const slug = `impact-${randomUUID()}`;
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
    await prisma.researchEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.marketDataSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.fundingRoundInvestor.deleteMany({
      where: { fundingRound: { projectId: { in: projectIds } } },
    });
    await prisma.fundingRound.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("evento sem eventDate: analysisStatus NO_EVENT_DATE, nunca lança", async () => {
    const projectId = await seedProject();
    // Cria um evento diretamente sem eventDate (caso hipotético de fonte futura sem data
    // confirmada — hoje as 2 fontes reais sempre têm eventDate, mas o motor precisa suportar).
    const event = await prisma.researchEvent.create({
      data: {
        projectId,
        kind: "CATALYST",
        category: "FUNDING",
        title: "Sem data",
        source: "TEST",
        sourceId: randomUUID(),
        impact: "ECOSYSTEM",
        confidence: "HIGH",
        retrievedAt: new Date(),
      },
    });

    const result = await computeEventImpact(event.id);
    expect(result?.analysisStatus).toBe("NO_EVENT_DATE");
    expect(result?.classification).toBe("INSUFFICIENT_DATA");
  });

  it("evento inexistente retorna null, nunca lança", async () => {
    const result = await computeEventImpact(randomUUID());
    expect(result).toBeNull();
  });

  it("calcula before/after/changePercent reais para TVL ao redor da data do evento", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");

    await prisma.tvlSnapshot.createMany({
      data: [
        { days: -10, value: 100 }, // dentro da janela pré 30d
        { days: 10, value: 150 }, // dentro da janela pós 30d, +50%
      ].map(({ days, value }) => ({
        projectId,
        valueUsd: value,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(eventDate.getTime() + days * DAY_MS),
        retrievedAt: eventDate,
      })),
    });

    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        amountUsd: 1_000_000,
        raisedAt: eventDate,
        sourceTimestamp: eventDate,
        retrievedAt: eventDate,
      },
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    expect(impacts).toHaveLength(1);
    const impact = impacts[0];
    expect(impact.metrics.tvl["30d"].before).toBe(100);
    expect(impact.metrics.tvl["30d"].after).toBe(150);
    expect(impact.metrics.tvl["30d"].changePercent).toBe(50);
    expect(impact.coverage.coverage.tvl).toBe(true);
  });

  it("janela sem NENHUM ponto de dado: before/after null, nunca extrapola de fora da janela", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");

    // Só um ponto MUITO antes da janela pré-evento (60 dias antes, janela é só 30d).
    await prisma.tvlSnapshot.create({
      data: {
        projectId,
        valueUsd: 999,
        source: SnapshotSource.DEFILLAMA,
        sourceTimestamp: new Date(eventDate.getTime() - 60 * DAY_MS),
        retrievedAt: eventDate,
      },
    });
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        raisedAt: eventDate,
        sourceTimestamp: eventDate,
        retrievedAt: eventDate,
      },
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    expect(impacts[0].metrics.tvl["30d"].before).toBeNull();
    expect(impacts[0].metrics.tvl["30d"].changePercent).toBeNull();
  });

  it("detecta overlap quando dois eventos do mesmo projeto caem dentro de 30d", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");
    const secondEventDate = new Date(eventDate.getTime() + 10 * DAY_MS);

    await prisma.fundingRound.createMany({
      data: [
        { raisedAt: eventDate, sourceTimestamp: eventDate },
        { raisedAt: secondEventDate, sourceTimestamp: secondEventDate },
      ].map((d) => ({
        projectId,
        roundType: "SEED" as const,
        raisedAt: d.raisedAt,
        sourceTimestamp: d.sourceTimestamp,
        retrievedAt: eventDate,
      })),
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    const firstImpact = impacts.find((i) => i.eventDate === eventDate.toISOString());
    expect(firstImpact?.classification).toBe("OVERLAPPING_EVENTS");
    expect(firstImpact?.overlappingEvents.length).toBeGreaterThan(0);
  });

  it("evento único (sem outros eventos do projeto) nunca sobrepõe", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        raisedAt: eventDate,
        sourceTimestamp: eventDate,
        retrievedAt: eventDate,
      },
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    expect(impacts[0].overlappingEvents).toEqual([]);
    expect(impacts[0].classification).not.toBe("OVERLAPPING_EVENTS");
  });

  it("classifica MARKET_APPRECIATION_AFTER_EVENT quando só o Market Cap tem sinal claro", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");

    await prisma.marketDataSnapshot.createMany({
      data: [
        { days: -10, value: 1000 },
        { days: 10, value: 2000 }, // +100%
      ].map(({ days, value }) => ({
        projectId,
        marketCapUsd: value,
        source: SnapshotSource.COINGECKO,
        sourceTimestamp: new Date(eventDate.getTime() + days * DAY_MS),
        retrievedAt: eventDate,
      })),
    });
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        raisedAt: eventDate,
        sourceTimestamp: eventDate,
        retrievedAt: eventDate,
      },
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    expect(impacts[0].classification).toBe("MARKET_APPRECIATION_AFTER_EVENT");
  });

  it("evento de SECURITY_INCIDENT real (via defillamaId) também produz Event Impact", async () => {
    const projectId = await seedProject();
    // Precisa de um Project com defillamaId conhecido para casar o incidente.
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const eventDate = "2021-09-29T00:00:00.000Z";

    await persistSecurityIncidentRisks(projectId, project.defillamaId, [
      {
        source: "DEFILLAMA",
        retrievedAt: "2026-09-19T00:00:00.000Z",
        defillamaId: project.defillamaId,
        name: "Test Incident",
        eventDate,
        classification: "Exploit",
        technique: "Reentrancy",
        amountUsd: 500_000,
        chains: ["Ethereum"],
        sourceUrl: null,
      },
    ]);

    const impacts = await getEventImpactsForProject(projectId);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].eventKind).toBe("RISK");
    expect(impacts[0].eventType).toBe("SECURITY_INCIDENT");
  });

  it("nunca produz classificação Bullish/Bearish/Buy/Sell — só os labels descritivos", async () => {
    const projectId = await seedProject();
    const eventDate = new Date("2026-06-01T00:00:00.000Z");
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        raisedAt: eventDate,
        sourceTimestamp: eventDate,
        retrievedAt: eventDate,
      },
    });
    await persistFundingCatalysts(projectId);

    const impacts = await getEventImpactsForProject(projectId);
    const allowed = [
      "FUNDAMENTAL_EXPANSION_AFTER_EVENT",
      "FUNDAMENTAL_CONTRACTION_AFTER_EVENT",
      "MARKET_APPRECIATION_AFTER_EVENT",
      "MARKET_DECLINE_AFTER_EVENT",
      "MIXED",
      "NO_CLEAR_CHANGE",
      "INSUFFICIENT_DATA",
      "OVERLAPPING_EVENTS",
    ];
    expect(allowed).toContain(impacts[0].classification);
  });

  describe("aggregateEventImpactsByCategory", () => {
    it("agrega múltiplos eventos FUNDING reais com sampleSize correto", async () => {
      const projectA = await seedProject();
      const projectB = await seedProject();
      const eventDate = new Date("2026-06-01T00:00:00.000Z");

      for (const projectId of [projectA, projectB]) {
        await prisma.tvlSnapshot.createMany({
          data: [
            { days: -10, value: 100 },
            { days: 10, value: 120 },
          ].map(({ days, value }) => ({
            projectId,
            valueUsd: value,
            source: SnapshotSource.DEFILLAMA,
            sourceTimestamp: new Date(eventDate.getTime() + days * DAY_MS),
            retrievedAt: eventDate,
          })),
        });
        await prisma.fundingRound.create({
          data: {
            projectId,
            roundType: "SEED",
            raisedAt: eventDate,
            sourceTimestamp: eventDate,
            retrievedAt: eventDate,
          },
        });
        await persistFundingCatalysts(projectId);
      }

      const impactsA = await getEventImpactsForProject(projectA);
      const impactsB = await getEventImpactsForProject(projectB);
      const aggregation = aggregateEventImpactsByCategory("FUNDING", [...impactsA, ...impactsB]);

      expect(aggregation.sampleSize).toBe(2);
      expect(aggregation.tvlChange30d.mean).toBe(20);
      expect(aggregation.tvlChange30d.insufficientSample).toBe(true); // 2 < mínimo de 3
    });

    it("categoria sem nenhum evento: sampleSize 0, nunca lança", () => {
      const aggregation = aggregateEventImpactsByCategory("SECURITY_INCIDENT", []);
      expect(aggregation.sampleSize).toBe(0);
      expect(aggregation.tvlChange30d.mean).toBeNull();
    });
  });
});
