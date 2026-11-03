import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { selectTopProjects, type RankBucket } from "../src/selection";
import { PRIORITY_MODEL_VERSION } from "@crypto-research/scoring-engine";

// Faixa única cobrindo todo rank, com `count` grande o suficiente para garantir que os
// candidatos seedados por este arquivo entrem — substitui o antigo `topN` plano (o critério de
// seleção por faixa de `marketCapRank`, pedido do usuário em 2026-11-02, é testado separadamente
// no describe abaixo "seleção por faixa de marketCapRank").
const BIG_SINGLE_BUCKET: RankBucket[] = [
  { minRank: 1, maxRank: Number.POSITIVE_INFINITY, count: 5000 },
];

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
  const defillamaIdOf = new Map<string, string>();

  // `marketCapRank` default (1) garante que os projetos deste arquivo entrem na faixa única de
  // `BIG_SINGLE_BUCKET` sem precisar seedar em cada chamada — testes que verificam a seleção POR
  // faixa (describe abaixo) passam um rank explícito.
  async function seedProject(
    slugPrefix: string,
    marketCapRank: number | null = 1,
  ): Promise<string> {
    const slug = `${slugPrefix}-${randomUUID()}`;
    const project = await prisma.project.create({
      data: {
        slug,
        name: slug,
        defillamaId: slug,
        sectorId,
        token: { create: { marketCapRank, retrievedAt: new Date() } },
      },
    });
    projectIds.push(project.id);
    defillamaIdOf.set(project.id, project.defillamaId);
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

  /** `change_7d` (pontos percentuais) no mesmo formato que o Discovery repassa para a seleção. */
  function growthMap(entries: Array<[projectId: string, change7d: number]>): Map<string, number> {
    return new Map(
      entries.map(([projectId, change7d]) => [defillamaIdOf.get(projectId)!, change7d]),
    );
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
    await prisma.fundamentalScore.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.token.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    for (const id of researchRunIds) {
      await prisma.researchRun.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("seleciona topN, passando disso só por empate no corte", async () => {
    await seedProject("cap-test");
    const runId = await seedResearchRun();

    const selection = await selectTopProjects(runId, [
      { minRank: 1, maxRank: Number.POSITIVE_INFINITY, count: 1 },
    ]);
    // Mais de 1 só se todos empatarem no rank 1 (empatados nunca são descartados).
    expect(selection.every((s) => s.rank === 1)).toBe(true);
  }, 20000);

  it("ordena por Priority Score, com desempate determinístico, e persiste a seleção com o modelo versionado", async () => {
    const scoringRunId = await seedResearchRun();
    const selectionRunId = await seedResearchRun();

    const projectA = await seedProject("high-score-only");
    const projectB = await seedProject("balanced");
    const projectC = await seedProject("no-signal");

    // A: só Score alto (90), sem growth/funding — priority = 90 (média de 1 componente).
    await seedScore(projectA, scoringRunId, 90);
    // B: Score moderado (83) + growth +15% (7d) + funding recente (5d) — priority > A (seção 27
    // do Sprint 8: "B pode ser selecionado acima de A dependendo dos componentes de momentum").
    await seedScore(projectB, scoringRunId, 83);
    await seedFunding(projectB, 5);
    // C: nenhum sinal disponível — nunca entra na seleção (já seedado acima, sem
    // Score/growth/funding).

    // topN grande o suficiente para garantir que os 3 candidatos deste teste entrem, mesmo com
    // outros projetos no banco.
    const selection = await selectTopProjects(
      selectionRunId,
      BIG_SINGLE_BUCKET,
      growthMap([[projectB, 15]]),
    );

    const rankOf = (projectId: string) => selection.find((s) => s.projectId === projectId)?.rank;
    const rankA = rankOf(projectA);
    const rankB = rankOf(projectB);
    const rankC = rankOf(projectC);

    expect(rankA).toBeDefined();
    expect(rankB).toBeDefined();
    expect(rankC).toBeUndefined();
    expect(rankB!).toBeLessThan(rankA!); // B (balanceado) prioritário sobre A (só score)

    const persisted = await prisma.researchRunSelection.findMany({
      where: { researchRunId: selectionRunId, projectId: { in: [projectA, projectB, projectC] } },
    });
    expect(persisted.length).toBe(2); // C (sem sinal) não é persistido
    for (const row of persisted) {
      expect(row.selectionModelVersion).toBe(PRIORITY_MODEL_VERSION);
    }
  }, 30000);

  it("projeto nunca pesquisado com growth7d forte supera projeto pesquisado estagnado (priority-v2)", async () => {
    // Regressão do ciclo vicioso do priority-v1: sem growth para o universo inteiro, projetos
    // nunca pesquisados tinham prioridade 0 e as mesmas 10 cryptos se repetiam em toda run.
    const scoringRunId = await seedResearchRun();
    const withGrowthRunId = await seedResearchRun();
    const withoutGrowthRunId = await seedResearchRun();

    const stale = await seedProject("stale-researched");
    const newcomer = await seedProject("newcomer");
    await seedScore(stale, scoringRunId, 40);

    const withGrowth = await selectTopProjects(
      withGrowthRunId,
      BIG_SINGLE_BUCKET,
      growthMap([
        [stale, 0],
        [newcomer, 15],
      ]),
    );
    const rankWith = (id: string) => withGrowth.find((s) => s.projectId === id)?.rank;
    expect(rankWith(newcomer)!).toBeLessThan(rankWith(stale)!);

    // Sem o mapa (Discovery falhou): growth nunca é inventado — o recém-chegado volta a ficar
    // sem sinal e não é selecionado; o projeto pesquisado continua.
    const withoutGrowth = await selectTopProjects(withoutGrowthRunId, BIG_SINGLE_BUCKET);
    const selectedWithout = new Set(withoutGrowth.map((s) => s.projectId));
    expect(selectedWithout.has(stale)).toBe(true);
    expect(selectedWithout.has(newcomer)).toBe(false);
  }, 30000);

  it("Research Run diferente pode ter composição diferente do Top N, sem apagar a seleção anterior", async () => {
    const scoringRunId = await seedResearchRun();
    const run1 = await seedResearchRun();
    const run2 = await seedResearchRun();

    const projectX = await seedProject("history-x");
    const projectY = await seedProject("history-y");

    await seedScore(projectX, scoringRunId, 20); // baixa prioridade no Run 1

    await selectTopProjects(run1, BIG_SINGLE_BUCKET);
    const run1SelectionX = await prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: run1, projectId: projectX } },
    });
    expect(run1SelectionX).not.toBeNull();
    const run1RankX = run1SelectionX!.rank;

    // Entre os dois runs, X recebe um novo Score muito mais alto (simulando uma nova pesquisa).
    await seedScore(projectX, scoringRunId, 99);

    await selectTopProjects(run2, BIG_SINGLE_BUCKET);
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
    await seedScore(projectId, await seedResearchRun(), 55); // sem sinal, não seria selecionado

    await selectTopProjects(runId, BIG_SINGLE_BUCKET);
    const firstRows = await prisma.researchRunSelection.findMany({
      where: { researchRunId: runId },
    });
    const firstOwnRow = firstRows.find((r) => r.projectId === projectId);
    expect(firstOwnRow).toBeDefined();

    await selectTopProjects(runId, BIG_SINGLE_BUCKET);
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

  it("seleciona 2 (top 100) + 5 (101-250) + 3 (>250), respeitando a prioridade dentro de cada faixa", async () => {
    const scoringRunId = await seedResearchRun();
    const runId = await seedResearchRun();

    // Mesmos limites de DEFAULT_RANK_BUCKETS, mas começando em 2 (não 1): `seedProject` sem rank
    // explícito usa rank=1 por padrão, e outros testes deste arquivo deixam vários projetos
    // nesse rank no banco (sem afterEach) — rank 1 ficaria contaminado por eles.
    const buckets = [
      { minRank: 2, maxRank: 100, count: 2 },
      { minRank: 101, maxRank: 250, count: 5 },
      { minRank: 251, maxRank: Number.POSITIVE_INFINITY, count: 3 },
    ];

    // 3 candidatos top100 (count=2): o de score mais baixo deve ficar de fora.
    const top1 = await seedProject("top100-a", 10);
    const top2 = await seedProject("top100-b", 50);
    const top3 = await seedProject("top100-c", 90);
    await seedScore(top1, scoringRunId, 90);
    await seedScore(top2, scoringRunId, 80);
    await seedScore(top3, scoringRunId, 10); // deve ficar de fora (só 2 vagas)

    // 6 candidatos 101-250 (count=5): o de score mais baixo deve ficar de fora.
    const midSlugs = await Promise.all(
      [120, 150, 180, 200, 230, 249].map((rank, i) =>
        seedProject(`mid-${i}`, rank).then(async (id) => {
          await seedScore(id, scoringRunId, 90 - i * 10); // scores decrescentes
          return id;
        }),
      ),
    );

    // 4 candidatos >250 (count=3): o de score mais baixo deve ficar de fora.
    const lowSlugs = await Promise.all(
      [260, 300, 500, 900].map((rank, i) =>
        seedProject(`low-${i}`, rank).then(async (id) => {
          await seedScore(id, scoringRunId, 90 - i * 10);
          return id;
        }),
      ),
    );

    const selection = await selectTopProjects(runId, buckets);
    const selectedIds = new Set(
      selection
        .filter((s) => [top1, top2, top3, ...midSlugs, ...lowSlugs].includes(s.projectId))
        .map((s) => s.projectId),
    );

    expect(selectedIds.has(top1)).toBe(true);
    expect(selectedIds.has(top2)).toBe(true);
    expect(selectedIds.has(top3)).toBe(false); // 3ª vaga do top100, só cabem 2

    expect(midSlugs.slice(0, 5).every((id) => selectedIds.has(id))).toBe(true);
    expect(selectedIds.has(midSlugs[5]!)).toBe(false); // 6ª vaga do 101-250, só cabem 5

    expect(lowSlugs.slice(0, 3).every((id) => selectedIds.has(id))).toBe(true);
    expect(selectedIds.has(lowSlugs[3]!)).toBe(false); // 4ª vaga do >250, só cabem 3
  }, 30000);
});
