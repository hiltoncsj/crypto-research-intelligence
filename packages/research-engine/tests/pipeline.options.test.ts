import { describe, expect, it, vi } from "vitest";

// Sprint 4 (Fase 21): testa a orquestração de `shouldContinue`/`onProjectCompleted` do
// `runManualResearchPipeline` — os callbacks que o Research Worker usa para progresso (Fase 12)
// e cancelamento cooperativo (Fase 22) — sem bater na rede/DefiLlama real (isso já é coberto
// pelos testes de integração existentes de `runPipelineForProject`). Mocka o Collector e o
// Prisma para isolar exclusivamente a lógica do loop em `runManualResearchPipeline`.

vi.mock("@crypto-research/defi-data", () => ({
  getProtocolTvlHistory: vi.fn().mockResolvedValue({
    raw: { error: "not implemented in mock", payload: null, fetchedAt: new Date().toISOString() },
    normalized: null,
  }),
  getProtocolFeesOrRevenue: vi.fn().mockResolvedValue({
    raw: { error: "not implemented in mock", payload: null, fetchedAt: new Date().toISOString() },
    normalized: null,
  }),
  normalizeProtocol: vi.fn().mockReturnValue(null),
}));

vi.mock("@crypto-research/database", () => ({
  prisma: {
    sector: { upsert: vi.fn() },
    chain: { upsert: vi.fn() },
    project: { upsert: vi.fn() },
    projectChain: { upsert: vi.fn() },
    // Sprint 11 (CoinGecko): resolveCoinGeckoApiKey em pipeline.ts consulta apiConnection —
    // mock retorna null (sem chave configurada), mesmo comportamento default de produção.
    apiConnection: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

const { runManualResearchPipeline } = await import("../src/pipeline");

describe("runManualResearchPipeline — callbacks de progresso/cancelamento", () => {
  it("chama onProjectCompleted uma vez por projeto, com índice e total corretos", async () => {
    const onProjectCompleted = vi.fn();
    const summary = await runManualResearchPipeline(["a", "b", "c"], { onProjectCompleted });

    expect(summary.results).toHaveLength(3);
    expect(onProjectCompleted).toHaveBeenCalledTimes(3);
    expect(onProjectCompleted).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ slug: "a" }),
      0,
      3,
    );
    expect(onProjectCompleted).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ slug: "c" }),
      2,
      3,
    );
  });

  it("interrompe o batch quando shouldContinue retorna false (cancelamento)", async () => {
    const shouldContinue = vi
      .fn()
      .mockResolvedValueOnce(true) // antes do 2º projeto: continua
      .mockResolvedValueOnce(false); // antes do 3º projeto: cancela

    const summary = await runManualResearchPipeline(["a", "b", "c", "d"], { shouldContinue });

    // Processa "a" (sem checagem, é o primeiro), "b" (checagem #1 -> true), então checagem #2
    // antes de "c" retorna false — "c" e "d" nunca são processados.
    expect(summary.results.map((r) => r.slug)).toEqual(["a", "b"]);
    expect(shouldContinue).toHaveBeenCalledTimes(2);
  });

  it("nunca chama shouldContinue antes do primeiro projeto", async () => {
    const shouldContinue = vi.fn().mockResolvedValue(true);
    await runManualResearchPipeline(["only-one"], { shouldContinue });
    expect(shouldContinue).not.toHaveBeenCalled();
  });

  it("sem callbacks, comportamento é idêntico ao Sprint 3 (todos os projetos processados)", async () => {
    const summary = await runManualResearchPipeline(["a", "b"]);
    expect(summary.results).toHaveLength(2);
  });
});
