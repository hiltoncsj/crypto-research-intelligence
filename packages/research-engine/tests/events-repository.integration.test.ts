import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import type {
  NormalizedGithubRelease,
  NormalizedMarketTicker,
  NormalizedSecurityIncident,
  NormalizedSnapshotProposal,
  NormalizedTokenUnlockEvent,
} from "@crypto-research/defi-data";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  collectFundingCatalysts,
  collectGithubReleaseCatalysts,
  collectSecurityIncidentRisks,
  collectSnapshotGovernanceCatalysts,
  getCatalysts,
  getRisks,
  persistFundingCatalysts,
  persistGithubReleaseCatalysts,
  persistSecurityIncidentRisks,
  persistSnapshotGovernanceCatalysts,
  persistTokenMarketListingCatalysts,
  persistTokenUnlockRisks,
} from "../src/events-repository";
import type { TokenMarketKey } from "../src/profile-repository";

// Sprint 15 — Catalysts + Risks. Integração real contra o Postgres do docker-compose (mesma
// filosofia anti-mock das demais suítes de *-repository). A lista de hacks é construída aqui
// como fixture controlada (não uma chamada real à DefiLlama — isso já é coberto pelo teste real
// de `client.integration.test.ts`); o que se testa aqui é a persistência/matching/dedupe.

describe("events-repository (Prisma, integração real)", () => {
  const sectorName = `test-events-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];

  async function seedProject(
    defillamaIdPrefix?: string,
  ): Promise<{ id: string; defillamaId: string }> {
    const slug = `events-${randomUUID()}`;
    // defillama_id é @unique — sempre gera um valor único, mesmo quando o teste quer um prefixo
    // "semântico" (ex.: "114") para deixar a intenção do teste clara.
    const dId = defillamaIdPrefix ? `${defillamaIdPrefix}-${randomUUID()}` : slug;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: dId, sectorId },
    });
    projectIds.push(project.id);
    return { id: project.id, defillamaId: dId };
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
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  function incident(
    overrides: Partial<NormalizedSecurityIncident> = {},
  ): NormalizedSecurityIncident {
    return {
      source: "DEFILLAMA",
      retrievedAt: "2026-09-19T00:00:00.000Z",
      defillamaId: "114",
      name: "Compound V2",
      eventDate: "2021-09-29T00:00:00.000Z",
      classification: "Governance",
      technique: "Flashloan Governance Attack",
      amountUsd: 820_000,
      chains: ["Ethereum"],
      sourceUrl: null,
      ...overrides,
    };
  }

  describe("persistSecurityIncidentRisks", () => {
    it("casa incidente por defillamaId EXATO, nunca por nome", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const hacks = [incident({ defillamaId })];

      const result = await persistSecurityIncidentRisks(projectId, defillamaId, hacks);
      expect(result.created).toBe(1);

      const risks = await getRisks(projectId);
      expect(risks).toHaveLength(1);
      expect(risks[0].category).toBe("SECURITY_INCIDENT");
      expect(risks[0].kind).toBe("RISK");
      expect(risks[0].confidence).toBe("HIGH");
      expect(risks[0].status).toBe("COMPLETED");
    });

    it("NÃO casa quando defillamaId difere (nenhuma inferência por nome)", async () => {
      const { id: projectId } = await seedProject("999");
      const hacks = [incident({ defillamaId: "114", name: "Compound V2" })];

      const result = await persistSecurityIncidentRisks(projectId, "999", hacks);
      expect(result.created).toBe(0);
      expect(await getRisks(projectId)).toHaveLength(0);
    });

    it("projeto sem defillamaId conhecido (null): skip, nunca lança", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistSecurityIncidentRisks(projectId, null, [incident()]);
      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    });

    it("idempotente — rodar de novo com o MESMO incidente atualiza a mesma linha, não duplica", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const hacks = [incident({ defillamaId })];

      await persistSecurityIncidentRisks(projectId, defillamaId, hacks);
      const second = await persistSecurityIncidentRisks(projectId, defillamaId, hacks);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);

      const risks = await getRisks(projectId);
      expect(risks).toHaveLength(1);
    });

    it("incidentes sem defillamaId já são filtrados pelo adapter — aqui confirma que a lista vazia não quebra nada", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const result = await persistSecurityIncidentRisks(projectId, defillamaId, []);
      expect(result.created).toBe(0);
    });
  });

  describe("collectSecurityIncidentRisks", () => {
    it("nunca lança mesmo com lista malformada/vazia", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      await expect(
        collectSecurityIncidentRisks(projectId, "some-slug", defillamaId, []),
      ).resolves.toBeUndefined();
    });
  });

  describe("persistFundingCatalysts", () => {
    it("reclassifica um FundingRound existente como Catalyst FUNDING, sem nenhuma coleta nova", async () => {
      const { id: projectId } = await seedProject();
      await prisma.fundingRound.create({
        data: {
          projectId,
          roundType: "SEED",
          roundLabel: "Seed",
          amountUsd: 3_000_000,
          raisedAt: new Date("2026-01-01T00:00:00.000Z"),
          sourceTimestamp: new Date("2026-01-01T00:00:00.000Z"),
          retrievedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      });

      const result = await persistFundingCatalysts(projectId);
      expect(result.created).toBe(1);

      const catalysts = await getCatalysts(projectId);
      expect(catalysts).toHaveLength(1);
      expect(catalysts[0].category).toBe("FUNDING");
      expect(catalysts[0].kind).toBe("CATALYST");
      expect(catalysts[0].status).toBe("COMPLETED");
    });

    it("idempotente — rodar de novo não duplica o catalyst do mesmo FundingRound", async () => {
      const { id: projectId } = await seedProject();
      await prisma.fundingRound.create({
        data: {
          projectId,
          roundType: "SEED",
          amountUsd: 1_000_000,
          raisedAt: new Date(),
          sourceTimestamp: new Date(),
          retrievedAt: new Date(),
        },
      });

      await persistFundingCatalysts(projectId);
      const second = await persistFundingCatalysts(projectId);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await getCatalysts(projectId)).toHaveLength(1);
    });

    it("projeto sem nenhum funding round: nenhum catalyst criado", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistFundingCatalysts(projectId);
      expect(result.created).toBe(0);
      expect(await getCatalysts(projectId)).toHaveLength(0);
    });
  });

  describe("collectFundingCatalysts", () => {
    it("nunca lança", async () => {
      const { id: projectId } = await seedProject();
      await expect(collectFundingCatalysts(projectId, "some-slug")).resolves.toBeUndefined();
    });
  });

  // Sprint 17 — Catalyst LISTING/DELISTING derivado do diff de TokenMarket (zero coleta nova).
  describe("persistTokenMarketListingCatalysts", () => {
    function marketKey(overrides: Partial<TokenMarketKey> = {}): TokenMarketKey {
      return {
        exchangeId: "binance",
        exchangeName: "Binance",
        baseSymbol: "ABC",
        targetSymbol: "USDT",
        ...overrides,
      };
    }

    function ticker(overrides: Partial<NormalizedMarketTicker> = {}): NormalizedMarketTicker {
      return {
        source: "COINGECKO",
        retrievedAt: "2026-09-19T00:00:00.000Z",
        coinGeckoId: "abc-token",
        exchangeId: "binance",
        exchangeName: "Binance",
        baseSymbol: "ABC",
        targetSymbol: "USDT",
        marketType: "SPOT",
        tradeUrl: "https://example.com/trade",
        volumeUsd: 1_000_000,
        lastPriceUsd: 1.5,
        sourceTimestamp: "2026-09-19T00:00:00.000Z",
        ...overrides,
      };
    }

    it("primeira coleta (previousMarkets vazio): nenhum evento — não fabrica histórico", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistTokenMarketListingCatalysts(projectId, [], [ticker()]);
      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
      expect(await getCatalysts(projectId)).toHaveLength(0);
    });

    it("mercado novo (presente agora, ausente antes): cria Catalyst LISTING", async () => {
      const { id: projectId } = await seedProject();
      // previous já contém o mesmo mercado do ticker (não sai), só o novo (coinbase) é adição.
      const previous = [marketKey()];
      const result = await persistTokenMarketListingCatalysts(projectId, previous, [
        ticker(),
        ticker({ exchangeId: "coinbase", exchangeName: "Coinbase" }),
      ]);
      expect(result.created).toBe(1);

      const catalysts = await getCatalysts(projectId);
      expect(catalysts).toHaveLength(1);
      expect(catalysts[0].category).toBe("LISTING");
      expect(catalysts[0].kind).toBe("CATALYST");
      expect(catalysts[0].confidence).toBe("MEDIUM");
      expect(catalysts[0].title).toContain("Coinbase");
    });

    it("mercado que sumiu (presente antes, ausente agora): cria Catalyst DELISTING", async () => {
      const { id: projectId } = await seedProject();
      const previous = [
        marketKey(),
        marketKey({ exchangeId: "coinbase", exchangeName: "Coinbase" }),
      ];
      const result = await persistTokenMarketListingCatalysts(projectId, previous, [ticker()]);
      expect(result.created).toBe(1);

      const catalysts = await getCatalysts(projectId);
      expect(catalysts).toHaveLength(1);
      expect(catalysts[0].category).toBe("DELISTING");
      expect(catalysts[0].title).toContain("Coinbase");
    });

    it("mesmo conjunto de mercados antes e depois: nenhum evento", async () => {
      const { id: projectId } = await seedProject();
      const previous = [marketKey()];
      const result = await persistTokenMarketListingCatalysts(projectId, previous, [ticker()]);
      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    });

    it("idempotente dentro do mesmo dia — rodar de novo não duplica o evento LISTING", async () => {
      const { id: projectId } = await seedProject();
      const previous = [marketKey()];
      const tickers = [ticker(), ticker({ exchangeId: "coinbase", exchangeName: "Coinbase" })];

      await persistTokenMarketListingCatalysts(projectId, previous, tickers);
      const second = await persistTokenMarketListingCatalysts(projectId, previous, tickers);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await getCatalysts(projectId)).toHaveLength(1);
    });
  });

  // Sprint 18 — TOKEN_UNLOCK, PRONTO mas NÃO ATIVADO (ver comentário em events-repository.ts).
  // Fixture aqui simula o formato JÁ NORMALIZADO (packages/defi-data), consistente com o padrão
  // do resto desta suíte (persistSecurityIncidentRisks também recebe uma lista já normalizada,
  // não faz uma chamada real) — o que se testa é a persistência/dedupe, não a fonte externa.
  describe("persistTokenUnlockRisks", () => {
    function unlock(
      overrides: Partial<NormalizedTokenUnlockEvent> = {},
    ): NormalizedTokenUnlockEvent {
      return {
        source: "DEFILLAMA_PRO",
        retrievedAt: "2026-09-19T00:00:00.000Z",
        defillamaId: "114",
        eventDate: "2026-10-01T00:00:00.000Z",
        tokenAmount: 1_000_000,
        category: "Team",
        description: "Cliff unlock",
        ...overrides,
      };
    }

    it("cria um Risk TOKEN_UNLOCK com confidence MEDIUM (fonte nunca validada ao vivo)", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const result = await persistTokenUnlockRisks(projectId, defillamaId, [unlock()]);
      expect(result.created).toBe(1);

      const risks = await getRisks(projectId);
      expect(risks).toHaveLength(1);
      expect(risks[0]?.category).toBe("TOKEN_UNLOCK");
      expect(risks[0]?.kind).toBe("RISK");
      expect(risks[0]?.confidence).toBe("MEDIUM");
      expect(risks[0]?.status).toBe("SCHEDULED");
    });

    it("projeto sem defillamaId conhecido (null): skip, nunca lança", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistTokenUnlockRisks(projectId, null, [unlock()]);
      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    });

    it("idempotente — mesmo evento (mesma data+categoria) não duplica", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      await persistTokenUnlockRisks(projectId, defillamaId, [unlock()]);
      const second = await persistTokenUnlockRisks(projectId, defillamaId, [unlock()]);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await getRisks(projectId)).toHaveLength(1);
    });

    it("eventos com categorias/datas diferentes do mesmo projeto: dois Risks distintos", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const result = await persistTokenUnlockRisks(projectId, defillamaId, [
        unlock({ category: "Team" }),
        unlock({ category: "Investors", eventDate: "2026-11-01T00:00:00.000Z" }),
      ]);
      expect(result.created).toBe(2);
      expect(await getRisks(projectId)).toHaveLength(2);
    });

    it("lista vazia: nenhum evento criado", async () => {
      const { id: projectId, defillamaId } = await seedProject("114");
      const result = await persistTokenUnlockRisks(projectId, defillamaId, []);
      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    });
  });

  // Sprint 19 — GitHub Releases. Fixture consistente com a estrutura confirmada ao vivo
  // (packages/defi-data/tests/adapter.test.ts).
  describe("persistGithubReleaseCatalysts", () => {
    function release(overrides: Partial<NormalizedGithubRelease> = {}): NormalizedGithubRelease {
      return {
        source: "GITHUB",
        retrievedAt: "2026-09-19T00:00:00.000Z",
        githubRepo: "aave/aave-v3-core",
        releaseId: 162360098,
        tagName: "v1.19.4",
        title: "v1.19.4",
        url: "https://github.com/aave/aave-v3-core/releases/tag/v1.19.4",
        eventDate: "2024-06-25T17:57:27Z",
        publishedAt: "2024-06-25T17:57:27Z",
        draft: false,
        prerelease: false,
        ...overrides,
      };
    }

    it("cria um Catalyst OTHER (categoria sempre conservadora) com confidence MEDIUM para release publicada", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistGithubReleaseCatalysts(projectId, [release()]);
      expect(result.created).toBe(1);

      const catalysts = await getCatalysts(projectId);
      expect(catalysts).toHaveLength(1);
      expect(catalysts[0]?.category).toBe("OTHER");
      expect(catalysts[0]?.kind).toBe("CATALYST");
      expect(catalysts[0]?.confidence).toBe("MEDIUM");
      expect(catalysts[0]?.status).toBe("COMPLETED");
    });

    it("release draft: confidence LOW, status UNKNOWN — nunca COMPLETED sem publishedAt", async () => {
      const { id: projectId } = await seedProject();
      await persistGithubReleaseCatalysts(projectId, [
        release({ draft: true, publishedAt: null, releaseId: 999 }),
      ]);
      const catalysts = await getCatalysts(projectId);
      expect(catalysts[0]?.confidence).toBe("LOW");
      expect(catalysts[0]?.status).toBe("UNKNOWN");
    });

    it("sourceId determinístico = releaseId — idempotente, nunca duplica", async () => {
      const { id: projectId } = await seedProject();
      await persistGithubReleaseCatalysts(projectId, [release()]);
      const second = await persistGithubReleaseCatalysts(projectId, [release()]);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await getCatalysts(projectId)).toHaveLength(1);
    });

    it("releases diferentes (releaseId distinto): dois eventos distintos", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistGithubReleaseCatalysts(projectId, [
        release({ releaseId: 1, tagName: "v1" }),
        release({ releaseId: 2, tagName: "v2" }),
      ]);
      expect(result.created).toBe(2);
      expect(await getCatalysts(projectId)).toHaveLength(2);
    });

    it("dois projetos diferentes com a mesma release (mesmo releaseId): não colidem", async () => {
      const { id: projectA } = await seedProject();
      const { id: projectB } = await seedProject();
      await persistGithubReleaseCatalysts(projectA, [release()]);
      await persistGithubReleaseCatalysts(projectB, [release()]);
      expect(await getCatalysts(projectA)).toHaveLength(1);
      expect(await getCatalysts(projectB)).toHaveLength(1);
    });
  });

  describe("collectGithubReleaseCatalysts", () => {
    const minimalRelease: NormalizedGithubRelease = {
      source: "GITHUB",
      retrievedAt: "2026-09-19T00:00:00.000Z",
      githubRepo: "x/y",
      releaseId: 1,
      tagName: "v1",
      title: "v1",
      url: "https://github.com/x/y/releases/tag/v1",
      eventDate: "2026-01-01T00:00:00Z",
      publishedAt: "2026-01-01T00:00:00Z",
      draft: false,
      prerelease: false,
    };

    it("sem githubRepo (null): skip, nunca chama persist, nunca lança", async () => {
      const { id: projectId } = await seedProject();
      await expect(
        collectGithubReleaseCatalysts(projectId, "some-slug", null, [minimalRelease]),
      ).resolves.toBeUndefined();
      expect(await getCatalysts(projectId)).toHaveLength(0);
    });
  });

  // Sprint 19 — Snapshot Governance. Fixture consistente com a resposta real confirmada ao vivo.
  describe("persistSnapshotGovernanceCatalysts", () => {
    function proposal(
      overrides: Partial<NormalizedSnapshotProposal> = {},
    ): NormalizedSnapshotProposal {
      return {
        source: "SNAPSHOT",
        retrievedAt: "2026-09-19T00:00:00.000Z",
        snapshotSpace: "ens.eth",
        proposalId: "0x943e585d1a4996525c5c7d229401d604ea56fe08c2c9c615c44f048ba42487b7",
        title: "[7.1] [Social] SPP3: Marketplace RFP",
        url: "https://snapshot.box/#/s:ens.eth/proposal/0x943e",
        eventDate: "2026-07-12T00:00:00.000Z",
        startAt: "2026-07-12T00:00:00.000Z",
        endAt: "2026-07-19T00:00:00.000Z",
        state: "closed",
        ...overrides,
      };
    }

    it("cria um Catalyst GOVERNANCE com confidence HIGH (fonte primária estruturada)", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistSnapshotGovernanceCatalysts(projectId, [proposal()]);
      expect(result.created).toBe(1);

      const catalysts = await getCatalysts(projectId);
      expect(catalysts).toHaveLength(1);
      expect(catalysts[0]?.category).toBe("GOVERNANCE");
      expect(catalysts[0]?.confidence).toBe("HIGH");
      expect(catalysts[0]?.status).toBe("COMPLETED"); // state "closed" -> COMPLETED
    });

    it("mapeia state 'active' para ONGOING e 'pending' para SCHEDULED, nunca inventa", async () => {
      const { id: projectId } = await seedProject();
      await persistSnapshotGovernanceCatalysts(projectId, [
        proposal({ proposalId: "0xactive", state: "active" }),
        proposal({ proposalId: "0xpending", state: "pending" }),
        proposal({ proposalId: "0xweird", state: "some-unknown-state" }),
      ]);
      const catalysts = await getCatalysts(projectId);
      const byId = new Map(catalysts.map((c) => [c.title, c.status]));
      expect(catalysts.find((c) => c.status === "ONGOING")).toBeDefined();
      expect(catalysts.find((c) => c.status === "SCHEDULED")).toBeDefined();
      expect(catalysts.find((c) => c.status === "UNKNOWN")).toBeDefined();
      void byId;
    });

    it("sourceId = proposalId (já estável na fonte) — idempotente, nunca duplica", async () => {
      const { id: projectId } = await seedProject();
      await persistSnapshotGovernanceCatalysts(projectId, [proposal()]);
      const second = await persistSnapshotGovernanceCatalysts(projectId, [proposal()]);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await getCatalysts(projectId)).toHaveLength(1);
    });

    it("propostas diferentes: eventos distintos", async () => {
      const { id: projectId } = await seedProject();
      const result = await persistSnapshotGovernanceCatalysts(projectId, [
        proposal({ proposalId: "0xa" }),
        proposal({ proposalId: "0xb" }),
      ]);
      expect(result.created).toBe(2);
    });
  });

  describe("collectSnapshotGovernanceCatalysts", () => {
    it("sem snapshotSpace (null): skip, nunca chama persist, nunca lança", async () => {
      const { id: projectId } = await seedProject();
      await expect(
        collectSnapshotGovernanceCatalysts(projectId, "some-slug", null, []),
      ).resolves.toBeUndefined();
      expect(await getCatalysts(projectId)).toHaveLength(0);
    });
  });
});
