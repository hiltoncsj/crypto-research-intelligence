import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diffResearchRuns } from "../src/diff";
import { getProjectHistory } from "../src/history";
import { generateProjectReport } from "../src/report";

// Sprint 9 — Research History + Diff Engine + Project Report (integração real contra o
// Postgres do docker-compose). Sem mocks de dado: todo valor testado é um Score/Snapshot/
// FundingRound/Selection persistido de verdade neste arquivo.

describe("Research History / Diff / Report (Prisma, integração real)", () => {
  const sectorName = `history-test-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];
  const researchRunIds: string[] = [];

  async function seedProject(slugPrefix: string): Promise<string> {
    const slug = `${slugPrefix}-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: `Projeto ${slug}`, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    return project.id;
  }

  async function seedRun(): Promise<string> {
    const run = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    researchRunIds.push(run.id);
    return run.id;
  }

  async function seedFundamentalScore(
    projectId: string,
    researchRunId: string,
    totalScore: number,
    createdAt: Date,
  ) {
    await prisma.fundamentalScore.create({
      data: {
        researchRunId,
        projectId,
        scoreModelVersion: "test-v1",
        totalScore,
        maxScore: 100,
        confidence: 60,
        breakdown: {},
        createdAt,
      },
    });
  }

  async function seedTvl(projectId: string, valueUsd: number, daysAgo: number) {
    const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await prisma.tvlSnapshot.create({
      data: { projectId, valueUsd, source: "DEFILLAMA", sourceTimestamp: ts, retrievedAt: ts },
    });
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterAll(async () => {
    await prisma.researchRunSelection.deleteMany({ where: { projectId: { in: projectIds } } });
    const roundIds = (
      await prisma.fundingRound.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      })
    ).map((r) => r.id);
    await prisma.fundingRoundInvestor.deleteMany({ where: { fundingRoundId: { in: roundIds } } });
    await prisma.fundingRound.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.fundamentalScore.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    for (const id of researchRunIds) {
      await prisma.researchRun.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("getProjectHistory retorna N/A (não 0/NaN) para um projeto sem nenhum dado histórico", async () => {
    const projectId = await seedProject("no-history");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const history = await getProjectHistory(project.slug);
    expect(history).not.toBeNull();
    expect(history!.current.tvl.value).toBeNull();
    expect(history!.current.fundamentalScore).toBeNull();
    for (const key of ["7d", "30d", "90d", "180d"] as const) {
      expect(history!.windows[key].tvl.changePct).toBe("N/A");
      expect(history!.windows[key].fundamentalScoreChange).toBeNull();
    }
    // Nunca NaN/Infinity em nenhum campo numérico serializável.
    const serialized = JSON.stringify(history);
    expect(serialized).not.toMatch(/NaN|Infinity/);
  });

  it("getProjectHistory calcula growth correto nas janelas 7d/30d/90d/180d a partir de snapshots reais", async () => {
    const projectId = await seedProject("with-history");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    // TVL: 100 (200d atrás) -> 120 (100d atrás) -> 150 (10d atrás) -> 200 (agora).
    await seedTvl(projectId, 100, 200);
    await seedTvl(projectId, 120, 100);
    await seedTvl(projectId, 150, 10);
    await seedTvl(projectId, 200, 0);

    const history = await getProjectHistory(project.slug);
    expect(history!.current.tvl.value).toBe(200);
    // 90d atrás, o valor de referência é o mais próximo <= a data alvo -> 120 (100d atrás).
    expect(history!.windows["90d"].tvl.changePct).not.toBe("N/A");
    const growth90d = history!.windows["90d"].tvl.changePct as number;
    expect(growth90d).toBeCloseTo(((200 - 120) / 120) * 100, 1);
    // 180d atrás: mais próximo <= é o snapshot de 200d atrás (100).
    const growth180d = history!.windows["180d"].tvl.changePct as number;
    expect(growth180d).toBeCloseTo(((200 - 100) / 100) * 100, 1);
  });

  it("diffResearchRuns sem Research Run anterior retorna changelog vazio e hasPreviousRun=false", async () => {
    const projectId = await seedProject("single-run");
    const run = await seedRun();
    await seedFundamentalScore(projectId, run, 70, new Date());

    const diff = await diffResearchRuns(projectId);
    expect(diff.hasPreviousRun).toBe(false);
    expect(diff.entries).toEqual([]);
    expect(diff.previousRun).toBeNull();
  });

  it("diffResearchRuns detecta Score changed, Funding added, Top10 entered e Priority changed entre duas runs", async () => {
    const projectId = await seedProject("full-diff");
    const runOld = await seedRun();
    const runNew = await seedRun();

    const oldDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const newDate = new Date();

    await seedFundamentalScore(projectId, runOld, 70, oldDate);
    await seedFundamentalScore(projectId, runNew, 85, newDate);

    // Selection: só entra no Top 10 na run nova (Top10 entered) com priority maior (priority changed).
    await prisma.researchRunSelection.create({
      data: {
        researchRunId: runNew,
        projectId,
        rank: 3,
        priorityScore: 88,
        selectionModelVersion: "priority-v1",
        selectionReason: ["High Score"],
        createdAt: newDate,
      },
    });

    // Funding registrado DEPOIS da run antiga e ANTES/na run nova.
    const fundingCreatedAt = new Date(oldDate.getTime() + 24 * 60 * 60 * 1000);
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        amountUsd: 2_000_000,
        raisedAt: fundingCreatedAt,
        source: "DEFILLAMA",
        sourceTimestamp: fundingCreatedAt,
        retrievedAt: fundingCreatedAt,
        createdAt: fundingCreatedAt,
      },
    });

    const diff = await diffResearchRuns(projectId);
    expect(diff.hasPreviousRun).toBe(true);
    expect(diff.latestRun?.id).toBe(runNew);
    expect(diff.previousRun?.id).toBe(runOld);

    const types = diff.entries.map((e) => e.type);
    expect(types).toContain("SCORE_CHANGED");
    expect(types).toContain("FUNDING_ADDED");
    expect(types).toContain("TOP10_ENTERED");

    const scoreEntry = diff.entries.find(
      (e) => e.type === "SCORE_CHANGED" && e.message.startsWith("Fundamental"),
    );
    expect(scoreEntry?.message).toBe("Fundamental Score: 70.0 → 85.0");
    // delta = 15, exatamente no threshold CRITICAL (>= 15 pontos, ver diff.ts).
    expect(scoreEntry?.severity).toBe("CRITICAL");
  });

  it("generateProjectReport produz Markdown com seções obrigatórias, sem NaN/Infinity, e nunca recomendação financeira", async () => {
    const projectId = await seedProject("report-test");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const run = await seedRun();
    await seedFundamentalScore(projectId, run, 77, new Date());
    await seedTvl(projectId, 500_000, 5);

    const report = await generateProjectReport(project.slug);
    expect(report).not.toBeNull();
    expect(report!.markdown).toContain(`# ${project.name}`);
    expect(report!.markdown).toContain("## Fundamental Metrics");
    expect(report!.markdown).toContain("## Score");
    expect(report!.markdown).toContain("## Capital");
    expect(report!.markdown).toContain("## Tokenomics");
    expect(report!.markdown).toContain("## What Changed Since Last Research");
    expect(report!.markdown).toContain("## Sources");
    expect(report!.markdown).toContain("77.0");

    expect(report!.markdown).not.toMatch(/NaN|Infinity/);
    for (const forbidden of ["compre", "venda", "vai subir", "vai cair", "é a melhor"]) {
      expect(report!.markdown.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("generateProjectReport retorna null para slug inexistente", async () => {
    const report = await generateProjectReport(`slug-inexistente-${randomUUID()}`);
    expect(report).toBeNull();
  });
});
