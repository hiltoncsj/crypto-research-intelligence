import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { selectTopProjects } from "../src/selection";
import { PRIORITY_MODEL_VERSION } from "@crypto-research/scoring-engine";

// Sprint 8 — Top 10 Selection (integração real contra o Postgres do docker-compose).
//
// `buildCandidatePool` (usado internamente por `selectTopProjects`) varre TODOS os projetos da
// tabela `projects`, não só os deste arquivo — por isso os testes abaixo evitam afirmar a
// composição EXATA do Top N (que dependeria do estado global do banco, potencialmente populado
// por outros arquivos de teste rodando em paralelo). Em vez disso: (a) testam limites de
// tamanho (`selection.length <= topN`), que são verdadeiros independente do tamanho do universo,
// e (b) testam a ORDEM RELATIVA apenas entre os projetos que este arquivo seedou, usando um
// `topN` grande o suficiente para garantir que todos entrem na seleção.

describe("selectTopProjects (Prisma, integração real)", () => {
  const sectorName = `selection-test-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];
  const researchRunIds: string[] = [];

  async function seedProject(slugPrefix: string): Promise<string> {
    const slug = `${slugPrefix}-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    return project.id;
  }

  async function seedResearchRun(): Promise<string> {
    const run = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    researchRunIds.push(run.id);
    return run.id;
  }

  async function seedScore(projectId: string, researchRunId: string, totalScore: number) {
    await prisma.fundamentalScore.create({
      data: {
        researchRunId,
        projectId,
        scoreModelVersion: "test-v1",
        totalScore,
        maxScore: 100,
        confidence: 50,
        breakdown: {},
      },
    });
  }

  async function seedTvlGrowth(projectId: string) {
    // Duas amostras (~35 e ~5 dias atrás) para produzir um growth30d de +40% real, calculado
    // pela mesma `calculateWindowMetrics` usada pelo pipeline — nada inventado no teste.
    const now = Date.now();
    await prisma.tvlSnapshot.createMany({
      data: [
        {
          projectId,
          valueUsd: 1_000_000,
          source: "DEFILLAMA",
          sourceTimestamp: new Date(now - 35 * 24 * 60 * 60 * 1000),
          retrievedAt: new Date(now - 35 * 24 * 60 * 60 * 1000),
        },
        {
          projectId,
          valueUsd: 1_400_000,
          source: "DEFILLAMA",
          sourceTimestamp: new Date(now - 1 * 24 * 60 * 60 * 1000),
          retrievedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
        },
      ],
    });
  }

  async function seedFunding(projectId: string, daysAgo: number) {
    const raisedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await prisma.fundingRound.create({
      data: {
        projectId,
        roundType: "SEED",
        amountUsd: 1_000_000,
        raisedAt,
        source: "DEFILLAMA",
        sourceTimestamp: raisedAt,
        retrievedAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterAll(async () => {
    await prisma.researchRunSelection.deleteMany({ where: { projectId: { in: projectIds } } });
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

  it("seleciona no máximo topN, mesmo quando o universo global é maior", async () => {
    await seedProject("cap-test");
    const runId = await seedResearchRun();

    const selection = await selectTopProjects(runId, 1);
    expect(selection.length).toBeLessThanOrEqual(1);
  }, 20000);

  it("ordena por Priority Score, com desempate determinístico, e persiste a seleção com o modelo versionado", async () => {
    const scoringRunId = await seedResearchRun();
    const selectionRunId = await seedResearchRun();

    const projectA = await seedProject("high-score-only");
    const projectB = await seedProject("balanced");
    const projectC = await seedProject("no-signal");

    // A: só Score alto (90), sem growth/funding — priority = 90 (média de 1 componente).
    await seedScore(projectA, scoringRunId, 90);
    // B: Score moderado (83) + growth +40% (30d) + funding recente (5d) — priority > A (seção 27
    // do Sprint 8: "B pode ser selecionado acima de A dependendo dos componentes de momentum").
    await seedScore(projectB, scoringRunId, 83);
    await seedTvlGrowth(projectB);
    await seedFunding(projectB, 5);
    // C: nenhum sinal disponível — priority 0, deve ficar por último (já seedado acima, sem
    // Score/growth/funding).

    // topN grande o suficiente para garantir que os 3 candidatos deste teste entrem, mesmo com
    // outros projetos no banco.
    const selection = await selectTopProjects(selectionRunId, 5000);

    const rankOf = (projectId: string) => selection.find((s) => s.projectId === projectId)?.rank;
    const rankA = rankOf(projectA);
    const rankB = rankOf(projectB);
    const rankC = rankOf(projectC);

    expect(rankA).toBeDefined();
    expect(rankB).toBeDefined();
    expect(rankC).toBeDefined();
    expect(rankB!).toBeLessThan(rankA!); // B (balanceado) prioritário sobre A (só score)
    expect(rankA!).toBeLessThan(rankC!); // A (com score) prioritário sobre C (sem sinal nenhum)

    const persisted = await prisma.researchRunSelection.findMany({
      where: { researchRunId: selectionRunId, projectId: { in: [projectA, projectB, projectC] } },
    });
    expect(persisted.length).toBe(3);
    for (const row of persisted) {
      expect(row.selectionModelVersion).toBe(PRIORITY_MODEL_VERSION);
    }
  }, 30000);

  it("Research Run diferente pode ter composição diferente do Top N, sem apagar a seleção anterior", async () => {
    const scoringRunId = await seedResearchRun();
    const run1 = await seedResearchRun();
    const run2 = await seedResearchRun();

    const projectX = await seedProject("history-x");
    const projectY = await seedProject("history-y");

    await seedScore(projectX, scoringRunId, 20); // baixa prioridade no Run 1

    await selectTopProjects(run1, 5000);
    const run1SelectionX = await prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: run1, projectId: projectX } },
    });
    expect(run1SelectionX).not.toBeNull();
    const run1RankX = run1SelectionX!.rank;

    // Entre os dois runs, X recebe um novo Score muito mais alto (simulando uma nova pesquisa).
    await seedScore(projectX, scoringRunId, 99);

    await selectTopProjects(run2, 5000);
    const run2SelectionX = await prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: run2, projectId: projectX } },
    });
    expect(run2SelectionX).not.toBeNull();

    // A linha do Run 1 continua exatamente como foi persistida — nunca sobrescrita pelo Run 2.
    const run1SelectionXAfter = await prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: run1, projectId: projectX } },
    });
    expect(run1SelectionXAfter!.rank).toBe(run1RankX);
    expect(Number(run1SelectionXAfter!.globalScore)).toBeCloseTo(20, 0);
    expect(Number(run2SelectionX!.globalScore)).toBeCloseTo(99, 0);

    // Y nunca recebeu Score/growth/funding — mesmo assim continua existindo no banco (histórico
    // preservado, seção 14/48 do Sprint 8: "projeto que sai do Top 10 não é deletado").
    const stillExists = await prisma.project.findUnique({ where: { id: projectY } });
    expect(stillExists).not.toBeNull();
  }, 30000);

  it("é idempotente por Research Run: rodar duas vezes para a mesma run não duplica a seleção", async () => {
    // `buildCandidatePool` varre TODOS os projetos da tabela (comentário no topo deste arquivo)
    // — com `npm test` rodando o monorepo inteiro, outro arquivo de teste pode estar criando/
    // removendo projetos reais entre as duas chamadas abaixo, mudando o TOTAL global de linhas
    // selecionadas mesmo sem nenhuma duplicação real acontecer. Por isso a asserção de
    // idempotência não pode comparar contagem global bruta (frágil, já causou falha real: 657
    // vs 681 numa run cheia) — em vez disso, verifica a garantia real de idempotência: (a)
    // nenhuma linha duplicada por (researchRunId, projectId), e (b) a linha do projeto seedado
    // por ESTE teste é estável entre as duas chamadas.
    const projectId = await seedProject("idempotent-test");
    const runId = await seedResearchRun();

    await selectTopProjects(runId, 5000);
    const firstRows = await prisma.researchRunSelection.findMany({
      where: { researchRunId: runId },
    });
    const firstOwnRow = firstRows.find((r) => r.projectId === projectId);
    expect(firstOwnRow).toBeDefined();

    await selectTopProjects(runId, 5000);
    const secondRows = await prisma.researchRunSelection.findMany({
      where: { researchRunId: runId },
    });
    const secondOwnRow = secondRows.find((r) => r.projectId === projectId);

    // (a) nenhuma linha duplicada por projeto, em nenhuma das duas chamadas.
    expect(new Set(firstRows.map((r) => r.projectId)).size).toBe(firstRows.length);
    expect(new Set(secondRows.map((r) => r.projectId)).size).toBe(secondRows.length);
    // (b) a linha do projeto seedado por este teste não duplica nem muda entre as duas chamadas.
    expect(secondOwnRow).toBeDefined();
    expect(secondRows.filter((r) => r.projectId === projectId)).toHaveLength(1);
    expect(secondOwnRow!.rank).toBe(firstOwnRow!.rank);
    expect(Number(secondOwnRow!.priorityScore)).toBe(Number(firstOwnRow!.priorityScore));
  }, 30000);
});
