import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeAndPersistCapitalScore } from "../src/capital-score-repository";
import {
  computeFundingAggregates,
  loadFundingRounds,
  persistFundingRounds,
  persistTokenSummary,
} from "../src/funding-repository";
import { computeAndPersistTokenomicsScore } from "../src/tokenomics-score-repository";

// Sprint 6: integração real contra o Postgres do docker-compose (mesma filosofia anti-mock
// de banco das suítes de score-repository do Sprint 5). Setor isolado com fixtures — nunca
// mistura com dados reais de aave/uniswap/lido.

const ASOF = new Date("2026-09-15T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("funding-repository (Prisma, integração real)", () => {
  const sectorName = `test-funding-sector-${randomUUID()}`;
  let sectorId: string;
  let researchRunId: string;
  const projectIds: Record<string, string> = {};

  async function seedProject(key: string): Promise<string> {
    const slug = `${key}-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds[key] = project.id;
    return project.id;
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;

    const p1 = await seedProject("well-funded");
    const p2 = await seedProject("modest-funded");
    await seedProject("unfunded");
    const p4 = await seedProject("also-funded"); // 3º peer com capital conhecido (MIN_PEER_SAMPLE_SIZE)
    await seedProject("unfunded-2");

    // p1: bem financiado, múltiplos rounds e investidores, round recente.
    await persistFundingRounds(p1, [
      {
        source: "DEFILLAMA",
        retrievedAt: ASOF.toISOString(),
        slug: "well-funded",
        date: new Date(ASOF.getTime() - 10 * DAY_MS).toISOString(),
        roundLabel: "Series A",
        amountUsd: 20_000_000,
        leadInvestors: ["Paradigm"],
        otherInvestors: ["a16z", "Coinbase Ventures"],
        valuationUsd: 200_000_000,
      },
      {
        source: "DEFILLAMA",
        retrievedAt: ASOF.toISOString(),
        slug: "well-funded",
        date: new Date(ASOF.getTime() - 400 * DAY_MS).toISOString(),
        roundLabel: "Seed",
        amountUsd: 3_000_000,
        leadInvestors: ["a16z"],
        otherInvestors: [],
        valuationUsd: null,
      },
    ]);

    // p2: um round modesto, mais antigo.
    await persistFundingRounds(p2, [
      {
        source: "DEFILLAMA",
        retrievedAt: ASOF.toISOString(),
        slug: "modest-funded",
        date: new Date(ASOF.getTime() - 600 * DAY_MS).toISOString(),
        roundLabel: "Seed",
        amountUsd: 500_000,
        leadInvestors: ["Small Fund"],
        otherInvestors: [],
        valuationUsd: null,
      },
    ]);

    // p4: 3º peer com capital conhecido (para MIN_PEER_SAMPLE_SIZE=3), valor intermediário.
    await persistFundingRounds(p4, [
      {
        source: "DEFILLAMA",
        retrievedAt: ASOF.toISOString(),
        slug: "also-funded",
        date: new Date(ASOF.getTime() - 200 * DAY_MS).toISOString(),
        roundLabel: "Seed",
        amountUsd: 5_000_000,
        leadInvestors: ["Mid Fund"],
        otherInvestors: [],
        valuationUsd: null,
      },
    ]);

    // p3 (unfunded) e o projeto extra: nenhum round conhecido.

    const run = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    researchRunId = run.id;
  });

  afterAll(async () => {
    await prisma.tokenomicsScore.deleteMany({ where: { researchRunId } });
    await prisma.institutionalCapitalScore.deleteMany({ where: { researchRunId } });
    for (const id of Object.values(projectIds)) {
      // funding_round_investors tem FK RESTRICT para funding_round_id — apagar antes das
      // rounds (mesma lição do Sprint 5/6: revisar ordem de FK ao adicionar tabelas novas).
      // Busca os ids das rounds primeiro em vez de depender de um filtro por relação aninhada
      // no deleteMany (mais previsível para uma tabela de junção com PK composta).
      const roundIds = (
        await prisma.fundingRound.findMany({ where: { projectId: id }, select: { id: true } })
      ).map((r) => r.id);
      await prisma.fundingRoundInvestor.deleteMany({ where: { fundingRoundId: { in: roundIds } } });
      await prisma.fundingRound.deleteMany({ where: { projectId: id } });
      await prisma.token.deleteMany({ where: { projectId: id } });
      await prisma.project.delete({ where: { id } });
    }
    await prisma.researchRun.delete({ where: { id: researchRunId } });
    await prisma.sector.delete({ where: { id: sectorId } });
    // `Investor` é uma entidade GLOBAL e reaproveitável (comentário no schema: "reaproveitável
    // entre rounds/projetos", sem escopo por teste) — outro arquivo de teste rodando em
    // paralelo, ou uma execução anterior desta mesma suíte ainda em voo, pode ter criado uma
    // `FundingRoundInvestor` referenciando um destes nomes compartilhados ("Paradigm" etc.)
    // depois que este bloco já leu `roundIds`. Apagar por nome aqui é só limpeza best-effort —
    // nunca deve derrubar a suíte por uma FK de outro teste ainda em execução.
    await prisma.investor
      .deleteMany({
        where: {
          name: { in: ["Paradigm", "a16z", "Coinbase Ventures", "Small Fund", "Mid Fund"] },
        },
      })
      .catch(() => {});
  });

  it("persiste funding rounds com investidores e é idempotente (não duplica ao rodar de novo)", async () => {
    const before = await loadFundingRounds(projectIds["well-funded"]);
    expect(before).toHaveLength(2);
    expect(before.find((r) => r.roundLabel === "Series A")?.leadInvestors).toEqual(["Paradigm"]);
    expect(before.find((r) => r.roundLabel === "Series A")?.otherInvestors).toEqual(
      expect.arrayContaining(["a16z", "Coinbase Ventures"]),
    );

    // Rodar de novo com os MESMOS dados não deve duplicar (dedupe por projectId+sourceTimestamp+roundLabel).
    const rounds = before.map((r) => ({
      source: "DEFILLAMA" as const,
      retrievedAt: ASOF.toISOString(),
      slug: "well-funded",
      date: r.raisedAt.toISOString(),
      roundLabel: r.roundLabel,
      amountUsd: r.amountUsd,
      leadInvestors: r.leadInvestors,
      otherInvestors: r.otherInvestors,
      valuationUsd: r.valuationUsd,
    }));
    const persistResult = await persistFundingRounds(projectIds["well-funded"], rounds);
    expect(persistResult.created).toBe(0);
    expect(persistResult.skippedDuplicate).toBe(2);

    const after = await loadFundingRounds(projectIds["well-funded"]);
    expect(after).toHaveLength(2);
  });

  it("computeFundingAggregates nunca trata ausência de round como funding = $0", async () => {
    const unfunded = await computeFundingAggregates(projectIds.unfunded, ASOF);
    expect(unfunded.totalKnownCapitalUsd).toBeNull(); // não é 0 — é "desconhecido"
    expect(unfunded.roundCount).toBe(0);
    expect(unfunded.daysSinceLastRaise).toBeNull();

    const funded = await computeFundingAggregates(projectIds["well-funded"], ASOF);
    expect(funded.totalKnownCapitalUsd).toBe(23_000_000);
    expect(funded.distinctInvestorCount).toBe(3);
    expect(funded.roundCount).toBe(2);
  });

  it("computeAndPersistCapitalScore calcula percentile real e nunca fabrica dado para quem não tem funding", async () => {
    const wellFundedScore = await computeAndPersistCapitalScore({
      researchRunId,
      projectId: projectIds["well-funded"],
      sectorId,
      asOf: ASOF,
    });
    const unfundedScore = await computeAndPersistCapitalScore({
      researchRunId,
      projectId: projectIds.unfunded,
      sectorId,
      asOf: ASOF,
    });

    expect(wellFundedScore.totalScore).toBeGreaterThan(unfundedScore.totalScore);
    expect(unfundedScore.totalScore).toBe(0);
    expect(unfundedScore.partial).toBe(true);
    expect(unfundedScore.maxScore).toBe(15);
  });

  it("computeAndPersistTokenomicsScore hoje sempre retorna partial=true (sem fonte de supply/unlocks)", async () => {
    const result = await computeAndPersistTokenomicsScore({
      researchRunId,
      projectId: projectIds["well-funded"],
      sectorId,
      asOf: ASOF,
    });
    expect(result.totalScore).toBe(0);
    expect(result.partial).toBe(true);
    expect(result.maxScore).toBe(20);
  });

  it("persistTokenSummary é upsert 1:1 por projeto e nunca inventa supply/FDV", async () => {
    await persistTokenSummary(projectIds["well-funded"], {
      source: "DEFILLAMA",
      retrievedAt: ASOF.toISOString(),
      defillamaId: "test-id",
      slug: "well-funded",
      symbol: "WF",
      contractAddress: "0xabc",
      marketCapUsd: 123,
    });
    const token = await prisma.token.findUnique({
      where: { projectId: projectIds["well-funded"] },
    });
    expect(token?.symbol).toBe("WF");
    expect(Number(token?.marketCapUsd)).toBe(123);
    expect(token?.circulatingSupply).toBeNull();
    expect(token?.fdvUsd).toBeNull();
  });
});
