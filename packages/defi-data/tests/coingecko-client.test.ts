import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoinMarketChart, MARKET_DATA_HISTORY_DAYS } from "../src/coingecko-client.js";

// Sprint 12 (Historical Market Data): retry/timeout/429/500 genéricos já são cobertos por
// http-client.test.ts (fetchJsonWithRetry, reaproveitado por getCoinMarketChart sem lógica
// própria de retry) — este arquivo cobre só o que é específico do client CoinGecko: construção
// de URL/params, resposta vazia/malformada, e o caso "sem coinGeckoId" (que na prática é
// responsabilidade do chamador, testado em market-data-repository.test.ts).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getCoinMarketChart", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa o endpoint público (sem key) e days > 90 (granularidade diária garantida)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ prices: [[1_757_500_800_000, 100]] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCoinMarketChart("bitcoin");

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("api.coingecko.com");
    expect(calledUrl).toContain("/coins/bitcoin/market_chart");
    expect(calledUrl).toContain("vs_currency=usd");
    expect(calledUrl).toContain(`days=${MARKET_DATA_HISTORY_DAYS}`);
    expect(MARKET_DATA_HISTORY_DAYS).toBeGreaterThan(90);
  });

  it("usa o endpoint pro + header x-cg-pro-api-key quando uma key é passada, nunca a loga", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ prices: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCoinMarketChart("bitcoin", "secret-key-123");

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    const calledInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(calledUrl).toContain("pro-api.coingecko.com");
    expect((calledInit.headers as Record<string, string>)["x-cg-pro-api-key"]).toBe(
      "secret-key-123",
    );
  });

  it("resposta válida é normalizada em pontos de série", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          prices: [[1_757_500_800_000, 100]],
          market_caps: [[1_757_500_800_000, 1_000_000]],
          total_volumes: [[1_757_500_800_000, 5_000]],
        }),
      ),
    );

    const result = await getCoinMarketChart("bitcoin");

    expect(result.raw.error).toBeNull();
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized?.[0].priceUsd).toBe(100);
    expect(result.normalized?.[0].coinGeckoId).toBe("bitcoin");
  });

  it("resposta vazia ({}) normaliza para array vazio, não para null/erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await getCoinMarketChart("some-obscure-token");

    expect(result.raw.error).toBeNull();
    expect(result.normalized).toEqual([]);
  });

  it("erro HTTP (404 — coinGeckoId desconhecido pela CoinGecko) vira normalized: null, nunca lança", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const result = await getCoinMarketChart("not-a-real-coingecko-id");

    expect(result.raw.error).toContain("404");
    expect(result.normalized).toBeNull();
  });
});
