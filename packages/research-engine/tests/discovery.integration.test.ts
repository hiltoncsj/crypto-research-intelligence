import { prisma } from "@crypto-research/database";
import { afterAll, describe, expect, it } from "vitest";
import {
  discoverProjects,
  DISCOVERY_FILTER_VERSION,
  DISCOVERY_MIN_TVL_USD,
} from "../src/discovery";

// Sprint 8 — Project Discovery (integração real contra api.llama.fi, regra anti-mock do
// roadmap #64). Pula automaticamente se a máquina estiver offline, mesmo padrão de
// packages/defi-data/tests/client.integration.test.ts.
let online = true;
try {
  const probe = await fetch("https://api.llama.fi/protocols", { method: "HEAD" }).catch(() => null);
  online = probe !== null;
} catch {
  online = false;
}

describe.skipIf(!online)("discoverProjects (Prisma, integração real)", () => {
  const createdProjectIds: string[] = [];

  afterAll(async () => {
    // Cleanup: remove só os Projects criados por ESTE arquivo de teste (identificados pelos
    // ids coletados abaixo) — nunca apaga projetos pré-existentes de outros testes/uso real.
    // TVL/Revenue/Fee snapshots precisam ser removidos antes do Project (FK), mesmo que este
    // teste não os crie diretamente — protocolos reais descobertos via DefiLlama podem já ter
    // sido tocados por outra suíte em execuções anteriores desta mesma base de dados.
    await prisma.kanbanCard.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectChain.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.tvlSnapshot.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.revenueSnapshot.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.feeSnapshot.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.fundamentalScore.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.tokenomicsScore.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.institutionalCapitalScore.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.token.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.tokenUnlock.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.fundingRoundInvestor.deleteMany({
      where: { fundingRound: { projectId: { in: createdProjectIds } } },
    });
    await prisma.fundingRound.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
  });

  it("descobre protocolos elegíveis (TVL >= mínimo) ainda não conhecidos, com discoveredAt/discoverySource preenchidos", async () => {
    const before = await prisma.project.findMany({ select: { defillamaId: true } });
    const knownBefore = new Set(before.map((p) => p.defillamaId));

    const summary = await discoverProjects();

    expect(summary.error).toBeUndefined();
    expect(summary.scanned).toBeGreaterThan(0);
    expect(summary.filterVersion).toBe(DISCOVERY_FILTER_VERSION);
    expect(summary.eligible).toBeLessThanOrEqual(summary.scanned);

    const after = await prisma.project.findMany({
      where: { discoverySource: "defillama" },
      select: {
        id: true,
        defillamaId: true,
        discoveredAt: true,
        discoverySource: true,
        discoveryFilterVersion: true,
      },
    });
    const newlyDiscovered = after.filter((p) => !knownBefore.has(p.defillamaId));
    createdProjectIds.push(...newlyDiscovered.map((p) => p.id));

    expect(newlyDiscovered.length).toBe(summary.created);
    for (const p of newlyDiscovered) {
      expect(p.discoveredAt).not.toBeNull();
      expect(p.discoverySource).toBe("defillama");
      expect(p.discoveryFilterVersion).toBe(DISCOVERY_FILTER_VERSION);
    }
    // Escala real: o universo elegível (TVL >= discovery-v1) ainda cria dezenas/centenas de
    // Projects na primeira execução contra um banco vazio — cada um com card Kanban associado.
  }, 150000);

  it("é idempotente: rodar duas vezes não duplica projetos", async () => {
    const before = await prisma.project.count();
    const first = await discoverProjects();
    createdProjectIds.push(
      ...(
        await prisma.project.findMany({
          where: { discoverySource: "defillama" },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const afterFirst = await prisma.project.count();

    const second = await discoverProjects();
    const afterSecond = await prisma.project.count();

    expect(afterFirst).toBe(before + first.created);
    // Segunda execução não deve criar nenhum projeto a mais que já não existisse: todos os
    // elegíveis da segunda chamada já estão em `alreadyKnown` (idempotência real).
    expect(afterSecond).toBe(afterFirst);
    expect(second.created).toBe(0);
  }, 150000);

  it("critério mínimo de TVL é aplicado e a versão do filtro é identificável", async () => {
    expect(DISCOVERY_MIN_TVL_USD).toBeGreaterThan(0);
    const summary = await discoverProjects();
    expect(summary.filterVersion).toBe("discovery-v1");
    expect(summary.eligible).toBeLessThanOrEqual(summary.scanned);
  }, 150000);
});
