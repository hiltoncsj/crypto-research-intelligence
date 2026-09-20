import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { persistDiscourseTopicCatalysts, persistFundingCatalysts } from "../src/events-repository";
import { computeFundamentalContext } from "../src/fundamental-context";

// Sprint 15 — Fundamental Context. Integração real contra o Postgres do docker-compose.

describe("computeFundamentalContext (Prisma, integração real)", () => {
  const sectorName = `test-context-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(): Promise<{ id: string; slug: string }> {
    const slug = `context-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    return { id: project.id, slug: project.slug };
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterAll(async () => {
    await prisma.researchEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.fundingRoundInvestor.deleteMany({
      where: { fundingRound: { projectId: { in: projectIds } } },
    });
    await prisma.fundingRound.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tokenomicsScore.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("projeto sem nenhum dado: contexto completo, mas honestamente vazio (nunca erro)", async () => {
    const { id: projectId, slug } = await seedProject();
    const context = await computeFundamentalContext(projectId, slug);

    expect(context.historicalIntelligence.regime).toBe("INSUFFICIENT_DATA");
    expect(context.catalysts.active).toEqual([]);
    expect(context.catalysts.upcoming).toEqual([]);
    expect(context.catalysts.completed).toEqual([]);
    expect(context.risks.identified).toEqual([]);
    expect(context.tokenomics.coverage).toBe("NONE");
    expect(context.capital.totalKnownCapitalUsd).toBeNull();
  });

  it("agrega catalysts reais (funding) sem recalcular nada — reflete o que já foi persistido", async () => {
    const { id: projectId, slug } = await seedProject();
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        amountUsd: 2_000_000,
        raisedAt: new Date(),
        sourceTimestamp: new Date(),
        retrievedAt: new Date(),
      },
    });
    await persistFundingCatalysts(projectId);

    const context = await computeFundamentalContext(projectId, slug);
    expect(context.catalysts.completed).toHaveLength(1);
    expect(context.catalysts.completed[0].category).toBe("FUNDING");
  });

  // Regressão da auditoria: eventos com status UNKNOWN (todo tópico Discourse) ou CANCELLED não
  // caíam em nenhum grupo e sumiam do contexto. Invariante: todo catalyst aparece em algum grupo.
  it("catalysts com status UNKNOWN/CANCELLED não somem do contexto (grupo `other`)", async () => {
    const { id: projectId, slug } = await seedProject();
    await persistDiscourseTopicCatalysts(projectId, [
      {
        source: "DISCOURSE",
        retrievedAt: new Date().toISOString(),
        forumOrigin: "https://forum.example.org",
        topicId: 1,
        title: "Tópico de discussão",
        bodyText: "texto",
        url: "https://forum.example.org/t/1",
        eventDate: new Date().toISOString(),
        categoryId: 1,
      },
    ]);
    await prisma.researchEvent.create({
      data: {
        projectId,
        kind: "CATALYST",
        category: "OTHER",
        title: "Evento cancelado",
        eventDate: new Date(),
        source: "TEST",
        sourceId: randomUUID(),
        status: "CANCELLED",
        confidence: "LOW",
        impact: "GOVERNANCE",
        retrievedAt: new Date(),
      },
    });

    const context = await computeFundamentalContext(projectId, slug);
    const { active, upcoming, completed, other } = context.catalysts;
    expect(other.map((e) => e.status).sort()).toEqual(["CANCELLED", "UNKNOWN"]);
    expect(active.length + upcoming.length + completed.length + other.length).toBe(2);
  });

  it("capital reflete computeFundingAggregates real (mesma fonte do Sprint 6, não duplicada)", async () => {
    const { id: projectId, slug } = await seedProject();
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        amountUsd: 5_000_000,
        raisedAt: new Date(),
        sourceTimestamp: new Date(),
        retrievedAt: new Date(),
      },
    });

    const context = await computeFundamentalContext(projectId, slug);
    expect(context.capital.totalKnownCapitalUsd).toBe(5_000_000);
  });

  it("tokenomics coverage reflete o campo `partial` do TokenomicsScore mais recente", async () => {
    const { id: projectId, slug } = await seedProject();
    const run = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    await prisma.tokenomicsScore.create({
      data: {
        researchRunId: run.id,
        projectId,
        scoreModelVersion: "tokenomics-v1",
        totalScore: 5,
        maxScore: 20,
        confidence: 25,
        partial: true,
        breakdown: {},
      },
    });

    const context = await computeFundamentalContext(projectId, slug);
    expect(context.tokenomics.coverage).toBe("PARTIAL");
    expect(context.tokenomics.scoreModelVersion).toBe("tokenomics-v1");

    // tokenomics_scores tem FK para research_runs — apaga na ordem certa (lição já documentada
    // no CLAUDE.md sobre ordem de FK em cleanups de teste).
    await prisma.tokenomicsScore.deleteMany({ where: { researchRunId: run.id } });
    await prisma.researchRun.delete({ where: { id: run.id } });
  });

  it("nunca produz um número único de score final — é contexto estruturado, não Global Score", async () => {
    const { id: projectId, slug } = await seedProject();
    const context = await computeFundamentalContext(projectId, slug);
    // Confirma explicitamente a AUSÊNCIA de qualquer campo tipo "globalScore"/"finalScore" no
    // resultado (seção 34 do Sprint 15).
    expect(context).not.toHaveProperty("globalScore");
    expect(context).not.toHaveProperty("finalScore");
    expect(context).not.toHaveProperty("investmentScore");
  });
});
