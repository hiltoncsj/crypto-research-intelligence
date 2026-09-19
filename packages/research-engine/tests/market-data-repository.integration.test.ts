import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  collectMarketDataForProject,
  getLastMarketDataAt,
  persistMarketDataSeries,
} from "../src/market-data-repository";

// Sprint 12 — Historical Market Data (integração real contra o Postgres do docker-compose, mesma
// filosofia anti-mock de banco das demais suítes de *-repository). O `fetch` para a CoinGecko é
// mockado aqui (não é um mock de banco) — os testes reais contra api.coingecko.com ficam em
// coingecko-client.test.ts/adapter.test.ts, que já cobrem o parsing real da resposta.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("market-data-repository (Prisma, integração real)", () => {
  const sectorName = `test-market-data-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(coinGeckoId: string | null): Promise<string> {
    const slug = `market-data-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId, coinGeckoId },
    });
    projectIds.push(project.id);
    return project.id;
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.marketDataSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  describe("persistMarketDataSeries", () => {
    it("insere uma série nova (INSERT-only) e é idempotente ao rodar de novo com os mesmos pontos", async () => {
      const projectId = await seedProject("test-coin-a");
      const points = [
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-a",
          sourceTimestamp: "2026-09-01T00:00:00.000Z",
          priceUsd: 100,
          marketCapUsd: 1_000_000,
          volumeUsd: 50_000,
        },
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-a",
          sourceTimestamp: "2026-09-02T00:00:00.000Z",
          priceUsd: 105,
          marketCapUsd: 1_050_000,
          volumeUsd: 52_000,
        },
      ];

      const first = await persistMarketDataSeries(projectId, points);
      expect(first.created).toBe(2);
      expect(first.skippedDuplicate).toBe(0);

      const second = await persistMarketDataSeries(projectId, points);
      expect(second.created).toBe(0);
      expect(second.skippedDuplicate).toBe(2);

      const rows = await prisma.marketDataSnapshot.findMany({ where: { projectId } });
      expect(rows).toHaveLength(2);
    });

    it("nunca sobrescreve um ponto já persistido (histórico imutável)", async () => {
      const projectId = await seedProject("test-coin-b");
      const original = {
        source: "COINGECKO" as const,
        retrievedAt: "2026-09-01T00:05:00.000Z",
        coinGeckoId: "test-coin-b",
        sourceTimestamp: "2026-09-01T00:00:00.000Z",
        priceUsd: 100,
        marketCapUsd: 1_000_000,
        volumeUsd: 50_000,
      };
      await persistMarketDataSeries(projectId, [original]);

      // Mesma data, valor DIFERENTE (ex.: reprocessamento com dado revisado da fonte) — não deve
      // sobrescrever a linha histórica original.
      await persistMarketDataSeries(projectId, [{ ...original, priceUsd: 999 }]);

      const row = await prisma.marketDataSnapshot.findFirstOrThrow({ where: { projectId } });
      expect(Number(row.priceUsd)).toBe(100);
    });

    it("rejeita ponto inválido (price negativo) sem persistir, mas continua os demais", async () => {
      const projectId = await seedProject("test-coin-c");
      const points = [
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-c",
          sourceTimestamp: "2026-09-01T00:00:00.000Z",
          priceUsd: -1,
          marketCapUsd: null,
          volumeUsd: null,
        },
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-c",
          sourceTimestamp: "2026-09-02T00:00:00.000Z",
          priceUsd: 100,
          marketCapUsd: null,
          volumeUsd: null,
        },
      ];

      const result = await persistMarketDataSeries(projectId, points);
      expect(result.rejectedInvalid).toBe(1);
      expect(result.created).toBe(1);
    });

    it("null em marketCap/volume persiste como null, nunca como 0", async () => {
      const projectId = await seedProject("test-coin-d");
      await persistMarketDataSeries(projectId, [
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-d",
          sourceTimestamp: "2026-09-01T00:00:00.000Z",
          priceUsd: 100,
          marketCapUsd: null,
          volumeUsd: null,
        },
      ]);

      const row = await prisma.marketDataSnapshot.findFirstOrThrow({ where: { projectId } });
      expect(row.marketCapUsd).toBeNull();
      expect(row.volumeUsd).toBeNull();
    });
  });

  describe("collectMarketDataForProject", () => {
    it("projeto sem coinGeckoId: skip explícito, nenhuma chamada de rede, nenhum erro", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const projectId = await seedProject(null);

      const outcome = await collectMarketDataForProject(projectId, "no-coingecko-slug", null);

      expect(outcome.status).toBe("SKIPPED_NO_COINGECKO_ID");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sucesso: coleta e persiste, nunca lança", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            prices: [[Date.UTC(2026, 8, 1), 100]],
            market_caps: [[Date.UTC(2026, 8, 1), 1_000_000]],
            total_volumes: [[Date.UTC(2026, 8, 1), 50_000]],
          }),
        ),
      );
      const projectId = await seedProject("test-coin-e");

      const outcome = await collectMarketDataForProject(
        projectId,
        "test-coin-e-slug",
        "test-coin-e",
      );

      expect(outcome.status).toBe("COLLECTED");
      if (outcome.status === "COLLECTED") {
        expect(outcome.created).toBe(1);
      }
      const rows = await prisma.marketDataSnapshot.findMany({ where: { projectId } });
      expect(rows).toHaveLength(1);
    });

    it("um projeto falhando (erro HTTP) nunca lança — retorna FAILED, isolado", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
      const projectId = await seedProject("test-coin-f");

      const outcome = await collectMarketDataForProject(
        projectId,
        "test-coin-f-slug",
        "test-coin-f",
      );

      expect(outcome.status).toBe("FAILED");
      const rows = await prisma.marketDataSnapshot.findMany({ where: { projectId } });
      expect(rows).toHaveLength(0);
    });

    it("timeout/exceção inesperada nunca propaga para o chamador", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
      const projectId = await seedProject("test-coin-g");

      const outcome = await collectMarketDataForProject(
        projectId,
        "test-coin-g-slug",
        "test-coin-g",
      );
      expect(outcome.status).toBe("FAILED");
    });
  });

  describe("getLastMarketDataAt", () => {
    it("retorna null quando não há nenhum snapshot", async () => {
      const projectId = await seedProject("test-coin-h");
      expect(await getLastMarketDataAt(projectId)).toBeNull();
    });

    it("retorna o timestamp mais recente entre múltiplos pontos", async () => {
      const projectId = await seedProject("test-coin-i");
      await persistMarketDataSeries(projectId, [
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-01T00:05:00.000Z",
          coinGeckoId: "test-coin-i",
          sourceTimestamp: "2026-09-01T00:00:00.000Z",
          priceUsd: 100,
          marketCapUsd: null,
          volumeUsd: null,
        },
        {
          source: "COINGECKO" as const,
          retrievedAt: "2026-09-03T00:05:00.000Z",
          coinGeckoId: "test-coin-i",
          sourceTimestamp: "2026-09-03T00:00:00.000Z",
          priceUsd: 110,
          marketCapUsd: null,
          volumeUsd: null,
        },
      ]);

      const last = await getLastMarketDataAt(projectId);
      expect(last?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    });
  });
});
