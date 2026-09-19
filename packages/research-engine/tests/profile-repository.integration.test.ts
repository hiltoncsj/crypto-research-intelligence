import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  collectProjectProfile,
  collectTokenMarkets,
  getLatestProjectProfile,
  getTokenMarkets,
  persistProjectProfile,
  persistTokenMarkets,
} from "../src/profile-repository";

// Sprint 13 (Parte B — Perfil do Projeto + Onde o Token é Negociado). Integração real contra o
// Postgres do docker-compose, mesma filosofia anti-mock de banco das demais suítes de
// *-repository.

describe("profile-repository (Prisma, integração real)", () => {
  const sectorName = `test-profile-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(): Promise<string> {
    const slug = `profile-${randomUUID()}`;
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
    await prisma.tokenMarket.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectProfileSnapshot.deleteMany({ where: { projectId: { in: projectIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  function profile(overrides: Partial<Parameters<typeof persistProjectProfile>[1]> = {}) {
    return {
      source: "COINGECKO" as const,
      retrievedAt: "2026-09-19T00:00:00.000Z",
      coinGeckoId: "test-coin",
      descriptionEn: "A decentralized protocol.",
      categories: ["DeFi"],
      platforms: ["ethereum"],
      homepageUrl: "https://example.com",
      ...overrides,
    };
  }

  describe("persistProjectProfile", () => {
    it("cria o primeiro snapshot", async () => {
      const projectId = await seedProject();
      const outcome = await persistProjectProfile(projectId, profile());
      expect(outcome).toBe("created_first");

      const latest = await getLatestProjectProfile(projectId);
      expect(latest?.descriptionEn).toBe("A decentralized protocol.");
      expect(latest?.categories).toEqual(["DeFi"]);
    });

    it("NUNCA insere linha nova quando o conteúdo é idêntico (dedupe por conteúdo, não timestamp)", async () => {
      const projectId = await seedProject();
      await persistProjectProfile(projectId, profile({ retrievedAt: "2026-09-19T00:00:00.000Z" }));
      // Mesmo conteúdo, timestamp de coleta DIFERENTE (simula rodar o pipeline de novo no dia
      // seguinte sem nenhuma mudança real de perfil).
      const outcome = await persistProjectProfile(
        projectId,
        profile({ retrievedAt: "2026-09-20T00:00:00.000Z" }),
      );
      expect(outcome).toBe("unchanged");

      const rows = await prisma.projectProfileSnapshot.findMany({ where: { projectId } });
      expect(rows).toHaveLength(1);
    });

    it("insere uma NOVA linha quando o conteúdo de fato muda, preservando a anterior (histórico)", async () => {
      const projectId = await seedProject();
      await persistProjectProfile(projectId, profile({ categories: ["DeFi"] }));
      const outcome = await persistProjectProfile(
        projectId,
        profile({ categories: ["DeFi", "Lending"], retrievedAt: "2026-09-20T00:00:00.000Z" }),
      );
      expect(outcome).toBe("updated");

      const rows = await prisma.projectProfileSnapshot.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].categories).toEqual(["DeFi"]);
      expect(rows[1].categories).toEqual(["DeFi", "Lending"]);
    });

    it("perfil totalmente vazio (sem descrição/categoria/blockchain/homepage) não persiste nada", async () => {
      const projectId = await seedProject();
      const outcome = await persistProjectProfile(
        projectId,
        profile({ descriptionEn: null, categories: [], platforms: [], homepageUrl: null }),
      );
      expect(outcome).toBe("skipped_empty");
      expect(await getLatestProjectProfile(projectId)).toBeNull();
    });

    it("null (chamada CoinGecko falhou) não persiste nada e não lança", async () => {
      const projectId = await seedProject();
      const outcome = await persistProjectProfile(projectId, null);
      expect(outcome).toBe("skipped_empty");
    });
  });

  describe("collectProjectProfile", () => {
    it("projeto sem coinGeckoId: skip, nunca lança", async () => {
      const projectId = await seedProject();
      await expect(
        collectProjectProfile(projectId, "no-coingecko", null, profile()),
      ).resolves.toBeUndefined();
      expect(await getLatestProjectProfile(projectId)).toBeNull();
    });
  });

  function ticker(overrides: Partial<Parameters<typeof persistTokenMarkets>[1][number]> = {}) {
    return {
      source: "COINGECKO" as const,
      retrievedAt: "2026-09-19T00:00:00.000Z",
      coinGeckoId: "test-coin",
      exchangeId: "binance",
      exchangeName: "Binance",
      baseSymbol: "XYZ",
      targetSymbol: "USDT",
      marketType: "SPOT" as const,
      tradeUrl: "https://binance.com/trade/XYZ_USDT",
      volumeUsd: 1_000_000,
      lastPriceUsd: 10,
      sourceTimestamp: "2026-09-19T00:00:00.000Z",
      ...overrides,
    };
  }

  describe("persistTokenMarkets", () => {
    it("upsert cria o mercado na primeira coleta", async () => {
      const projectId = await seedProject();
      const result = await persistTokenMarkets(projectId, [ticker()]);
      expect(result.upserted).toBe(1);

      const markets = await getTokenMarkets(projectId);
      expect(markets).toHaveLength(1);
      expect(markets[0].exchangeName).toBe("Binance");
    });

    it("upsert NÃO duplica — segunda coleta do MESMO mercado atualiza a mesma linha", async () => {
      const projectId = await seedProject();
      await persistTokenMarkets(projectId, [ticker({ volumeUsd: 1_000_000 })]);
      await persistTokenMarkets(projectId, [ticker({ volumeUsd: 2_000_000 })]);

      const markets = await getTokenMarkets(projectId);
      expect(markets).toHaveLength(1);
      expect(markets[0].volumeUsd).toBe(2_000_000);
    });

    it("dois mercados diferentes (exchanges diferentes) persistem como duas linhas", async () => {
      const projectId = await seedProject();
      await persistTokenMarkets(projectId, [
        ticker({ exchangeId: "binance", exchangeName: "Binance" }),
        ticker({ exchangeId: "coinbase", exchangeName: "Coinbase" }),
      ]);
      const markets = await getTokenMarkets(projectId);
      expect(markets).toHaveLength(2);
    });

    it("rejeita volume negativo sem derrubar os demais mercados", async () => {
      const projectId = await seedProject();
      const result = await persistTokenMarkets(projectId, [
        ticker({ exchangeId: "bad-exchange", volumeUsd: -1 }),
        ticker({ exchangeId: "good-exchange" }),
      ]);
      expect(result.rejectedInvalid).toBe(1);
      expect(result.upserted).toBe(1);
    });

    it("mercado sem volume (null) é aceito e persistido como null, nunca 0", async () => {
      const projectId = await seedProject();
      await persistTokenMarkets(projectId, [ticker({ volumeUsd: null, lastPriceUsd: null })]);
      const markets = await getTokenMarkets(projectId);
      expect(markets[0].volumeUsd).toBeNull();
    });

    it("resposta vazia de tickers não cria nenhum mercado", async () => {
      const projectId = await seedProject();
      const result = await persistTokenMarkets(projectId, []);
      expect(result.upserted).toBe(0);
      expect(await getTokenMarkets(projectId)).toEqual([]);
    });
  });

  describe("collectTokenMarkets", () => {
    it("projeto sem coinGeckoId: skip, nunca lança", async () => {
      const projectId = await seedProject();
      await expect(
        collectTokenMarkets(projectId, "no-coingecko", null, [ticker()]),
      ).resolves.toBeUndefined();
      expect(await getTokenMarkets(projectId)).toEqual([]);
    });

    it("token sem mercados identificados: não é erro, só lista vazia", async () => {
      const projectId = await seedProject();
      await collectTokenMarkets(projectId, "some-slug", "test-coin", []);
      expect(await getTokenMarkets(projectId)).toEqual([]);
    });
  });
});
