import { describe, expect, it } from "vitest";
import {
  classifyRoundType,
  normalizeCoinGeckoMarketChart,
  normalizeCoinGeckoProfile,
  normalizeCoinGeckoTickers,
  normalizeFeesSummary,
  normalizeFundingRounds,
  normalizeProtocol,
  normalizeProtocolList,
  normalizeTokenSummary,
  normalizeTokenUnlocks,
  normalizeTvlHistory,
} from "../src/adapter.js";

describe("normalizeProtocol", () => {
  it("maps known fields and defaults missing ones safely", () => {
    const result = normalizeProtocol(
      { id: "1", name: "Aave", symbol: "AAVE", chains: ["Ethereum"], tvl: 123.45 },
      "2026-09-15T00:00:00.000Z",
    );

    expect(result).toEqual({
      source: "DEFILLAMA",
      retrievedAt: "2026-09-15T00:00:00.000Z",
      defillamaId: "1",
      name: "Aave",
      slug: "aave",
      symbol: "AAVE",
      category: null,
      chains: ["Ethereum"],
      tvlUsd: 123.45,
      coinGeckoId: null,
    });
  });

  it("returns null for structurally invalid input (never invents data)", () => {
    expect(normalizeProtocol({ foo: "bar" }, "2026-09-15T00:00:00.000Z")).toBeNull();
    expect(normalizeProtocol(null, "2026-09-15T00:00:00.000Z")).toBeNull();
    expect(normalizeProtocol("not an object", "2026-09-15T00:00:00.000Z")).toBeNull();
  });

  it("extracts current TVL from a historical series (last point)", () => {
    const result = normalizeProtocol(
      {
        id: "1",
        name: "Aave",
        tvl: [
          { date: 1_700_000_000, totalLiquidityUSD: 100 },
          { date: 1_700_086_400, totalLiquidityUSD: 150 },
        ],
      },
      "2026-09-15T00:00:00.000Z",
    );
    expect(result?.tvlUsd).toBe(150);
  });
});

describe("normalizeTvlHistory", () => {
  it("converts the tvl array to a normalized time series", () => {
    const result = normalizeTvlHistory(
      {
        id: "1",
        name: "Aave",
        tvl: [
          { date: 1_700_000_000, totalLiquidityUSD: 100 },
          { date: 1_700_086_400, totalLiquidityUSD: 150 },
        ],
      },
      "aave",
      "2026-09-15T00:00:00.000Z",
    );

    expect(result?.points).toHaveLength(2);
    expect(result?.points[0].valueUsd).toBe(100);
    expect(result?.points[0].sourceTimestamp).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("returns null when tvl is not a historical series (e.g. plain number)", () => {
    expect(
      normalizeTvlHistory({ id: "1", name: "Aave", tvl: 123 }, "aave", "2026-09-15T00:00:00.000Z"),
    ).toBeNull();
  });

  it("returns null for structurally invalid input", () => {
    expect(normalizeTvlHistory({ foo: "bar" }, "aave", "2026-09-15T00:00:00.000Z")).toBeNull();
  });
});

describe("normalizeFeesSummary", () => {
  it("converts totalDataChart tuples to a normalized time series", () => {
    const result = normalizeFeesSummary(
      {
        totalDataChart: [
          [1_700_000_000, 1000],
          [1_700_086_400, 1500],
        ],
      },
      "aave",
      "FEES",
      "2026-09-15T00:00:00.000Z",
    );

    expect(result?.metric).toBe("FEES");
    expect(result?.points).toHaveLength(2);
    expect(result?.points[1].valueUsd).toBe(1500);
  });

  it("keeps FEES and REVENUE distinct", () => {
    const fees = normalizeFeesSummary(
      { totalDataChart: [[1_700_000_000, 1000]] },
      "aave",
      "FEES",
      "2026-09-15T00:00:00.000Z",
    );
    const revenue = normalizeFeesSummary(
      { totalDataChart: [[1_700_000_000, 300]] },
      "aave",
      "REVENUE",
      "2026-09-15T00:00:00.000Z",
    );
    expect(fees?.metric).toBe("FEES");
    expect(revenue?.metric).toBe("REVENUE");
    expect(fees?.points[0].valueUsd).not.toBe(revenue?.points[0].valueUsd);
  });

  it("returns null when totalDataChart is missing", () => {
    expect(normalizeFeesSummary({}, "aave", "FEES", "2026-09-15T00:00:00.000Z")).toBeNull();
    expect(normalizeFeesSummary(null, "aave", "FEES", "2026-09-15T00:00:00.000Z")).toBeNull();
  });
});

describe("normalizeProtocolList", () => {
  it("filters out invalid entries instead of throwing", () => {
    const result = normalizeProtocolList(
      [{ id: "1", name: "Aave" }, { garbage: true }, { id: "2", name: "Curve" }],
      "2026-09-15T00:00:00.000Z",
    );
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual(["Aave", "Curve"]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeProtocolList(null, "2026-09-15T00:00:00.000Z")).toEqual([]);
    expect(normalizeProtocolList({}, "2026-09-15T00:00:00.000Z")).toEqual([]);
  });
});

describe("normalizeTokenSummary (Sprint 6)", () => {
  it("extrai mcap real e nunca inventa supply/FDV", () => {
    const result = normalizeTokenSummary(
      { id: "111", name: "Aave", symbol: "AAVE", address: "0xabc", mcap: 1883745202.08 },
      "aave",
      "2026-09-15T00:00:00.000Z",
    );
    expect(result).toEqual({
      source: "DEFILLAMA",
      retrievedAt: "2026-09-15T00:00:00.000Z",
      defillamaId: "111",
      slug: "aave",
      symbol: "AAVE",
      contractAddress: "0xabc",
      marketCapUsd: 1883745202.08,
    });
  });

  it("mcap ausente/NaN vira null, nunca NaN/Infinity", () => {
    const result = normalizeTokenSummary(
      { id: "1", name: "X", mcap: NaN },
      "x",
      "2026-01-01T00:00:00.000Z",
    );
    expect(result?.marketCapUsd).toBeNull();
  });

  it("retorna null para input estruturalmente inválido", () => {
    expect(normalizeTokenSummary({ foo: "bar" }, "x", "2026-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("normalizeFundingRounds (Sprint 6)", () => {
  it("converte amount de milhões para USD e preserva investidores conhecidos", () => {
    const result = normalizeFundingRounds(
      {
        id: "111",
        name: "Aave",
        raises: [
          {
            date: 1602460800,
            round: "Strategic",
            amount: 25,
            leadInvestors: ["Blockchain Capital"],
            otherInvestors: [],
            valuation: null,
          },
        ],
      },
      "aave",
      "2026-09-15T00:00:00.000Z",
    );

    expect(result).toEqual([
      {
        source: "DEFILLAMA",
        retrievedAt: "2026-09-15T00:00:00.000Z",
        slug: "aave",
        date: new Date(1602460800 * 1000).toISOString(),
        roundLabel: "Strategic",
        amountUsd: 25_000_000,
        leadInvestors: ["Blockchain Capital"],
        otherInvestors: [],
        valuationUsd: null,
      },
    ]);
  });

  it("sem raises no payload retorna array vazio (nunca inventa)", () => {
    expect(normalizeFundingRounds({ id: "1", name: "X" }, "x", "2026-01-01T00:00:00.000Z")).toEqual(
      [],
    );
  });

  it("amount inválido (não numérico) vira amountUsd null, não descarta o round", () => {
    const result = normalizeFundingRounds(
      { id: "1", name: "X", raises: [{ date: 1600000000, round: "Seed", amount: "unknown" }] },
      "x",
      "2026-01-01T00:00:00.000Z",
    );
    expect(result[0].amountUsd).toBeNull();
  });
});

describe("classifyRoundType (Sprint 6)", () => {
  it("classifica rótulos conhecidos", () => {
    expect(classifyRoundType("Strategic")).toBe("STRATEGIC");
    expect(classifyRoundType("Private token sale")).toBe("PRIVATE");
    expect(classifyRoundType("Seed")).toBe("SEED");
  });

  it("cai em OTHER para rótulos desconhecidos ou ausentes", () => {
    expect(classifyRoundType("Some Weird Label")).toBe("OTHER");
    expect(classifyRoundType(null)).toBe("OTHER");
  });
});

describe("normalizeCoinGeckoMarketChart (Sprint 12)", () => {
  const retrievedAt = "2026-09-18T00:00:00.000Z";
  const day1Ms = Date.UTC(2026, 8, 10);
  const day2Ms = Date.UTC(2026, 8, 11);

  it("junta prices/market_caps/total_volumes pelo dia (truncado UTC), não por posição no array", () => {
    const result = normalizeCoinGeckoMarketChart(
      {
        prices: [
          [day1Ms + 3600_000, 100],
          [day2Ms + 3600_000, 110],
        ],
        market_caps: [
          [day1Ms + 7200_000, 1_000_000],
          [day2Ms + 7200_000, 1_100_000],
        ],
        total_volumes: [[day1Ms + 1800_000, 50_000]],
      },
      "bitcoin",
      retrievedAt,
    );

    expect(result).toHaveLength(2);
    expect(result[0].sourceTimestamp).toBe(new Date(day1Ms).toISOString());
    expect(result[0].priceUsd).toBe(100);
    expect(result[0].marketCapUsd).toBe(1_000_000);
    expect(result[0].volumeUsd).toBe(50_000);
    // Dia 2 não tem total_volumes — null, nunca 0/inventado.
    expect(result[1].volumeUsd).toBeNull();
    expect(result[1].priceUsd).toBe(110);
    expect(result[1].marketCapUsd).toBe(1_100_000);
  });

  it("retorna array vazio quando a resposta não tem nenhum dos três arrays", () => {
    expect(normalizeCoinGeckoMarketChart({}, "bitcoin", retrievedAt)).toEqual([]);
  });

  it("retorna array vazio para payload nulo/malformado", () => {
    expect(normalizeCoinGeckoMarketChart(null, "bitcoin", retrievedAt)).toEqual([]);
    expect(normalizeCoinGeckoMarketChart("not an object", "bitcoin", retrievedAt)).toEqual([]);
  });

  it("ignora tuplas malformadas (timestamp/valor não numéricos) sem quebrar as demais", () => {
    const result = normalizeCoinGeckoMarketChart(
      {
        prices: [
          [day1Ms, 100],
          // @ts-expect-error -- testando payload malformado da fonte externa
          ["not-a-number", 200],
          // @ts-expect-error -- testando payload malformado da fonte externa
          [day2Ms, "not-a-number"],
        ],
      },
      "bitcoin",
      retrievedAt,
    );
    expect(result).toHaveLength(1);
    expect(result[0].priceUsd).toBe(100);
  });

  it("ordena os pontos por timestamp crescente", () => {
    const result = normalizeCoinGeckoMarketChart(
      {
        prices: [
          [day2Ms, 110],
          [day1Ms, 100],
        ],
      },
      "bitcoin",
      retrievedAt,
    );
    expect(result.map((p) => p.priceUsd)).toEqual([100, 110]);
  });
});

describe("normalizeCoinGeckoProfile (Sprint 13)", () => {
  const retrievedAt = "2026-09-19T00:00:00.000Z";

  it("extrai descrição/categorias/blockchains/homepage reais", () => {
    const result = normalizeCoinGeckoProfile(
      {
        id: "aave",
        description: { en: "Aave is a decentralized liquidity protocol." },
        categories: ["Lending/Borrowing", "DeFi", null],
        platforms: { ethereum: "0xabc", "arbitrum-one": "0xdef", "": "" },
        links: { homepage: ["https://aave.com", ""] },
      },
      "aave",
      retrievedAt,
    );

    expect(result).toEqual({
      source: "COINGECKO",
      retrievedAt,
      coinGeckoId: "aave",
      descriptionEn: "Aave is a decentralized liquidity protocol.",
      categories: ["Lending/Borrowing", "DeFi"],
      platforms: ["ethereum", "arbitrum-one"],
      homepageUrl: "https://aave.com",
    });
  });

  it("preserva multi-chain (seção 19 do Sprint 13) — não descarta chains extras", () => {
    const result = normalizeCoinGeckoProfile(
      { id: "x", platforms: { ethereum: "0x1", base: "0x2", polygon: "0x3" } },
      "x",
      retrievedAt,
    );
    expect(result?.platforms).toEqual(["ethereum", "base", "polygon"]);
  });

  it("campos ausentes viram null/[], nunca inventados", () => {
    const result = normalizeCoinGeckoProfile({ id: "x" }, "x", retrievedAt);
    expect(result).toEqual({
      source: "COINGECKO",
      retrievedAt,
      coinGeckoId: "x",
      descriptionEn: null,
      categories: [],
      platforms: [],
      homepageUrl: null,
    });
  });

  it("retorna null para payload estruturalmente inválido", () => {
    expect(normalizeCoinGeckoProfile(null, "x", retrievedAt)).toBeNull();
    expect(normalizeCoinGeckoProfile({ foo: "bar" }, "x", retrievedAt)).toBeNull();
  });

  it("nunca copia descrição vazia/whitespace como se fosse dado real", () => {
    const result = normalizeCoinGeckoProfile(
      { id: "x", description: { en: "   " } },
      "x",
      retrievedAt,
    );
    expect(result?.descriptionEn).toBeNull();
  });
});

describe("normalizeCoinGeckoTickers (Sprint 13)", () => {
  const retrievedAt = "2026-09-19T00:00:00.000Z";

  it("extrai mercados reais com exchange/par/volume/URL", () => {
    const result = normalizeCoinGeckoTickers(
      {
        id: "aave",
        tickers: [
          {
            base: "AAVE",
            target: "USDT",
            market: { name: "CoinUp.io", identifier: "coinup" },
            trade_url: "https://www.coinup.io/en_US/trade/AAVE_USDT",
            timestamp: "2026-09-18T21:22:46+00:00",
            converted_volume: { usd: 702766040 },
            converted_last: { usd: 139.7 },
          },
        ],
      },
      "aave",
      retrievedAt,
    );

    expect(result).toEqual([
      {
        source: "COINGECKO",
        retrievedAt,
        coinGeckoId: "aave",
        exchangeId: "coinup",
        exchangeName: "CoinUp.io",
        baseSymbol: "AAVE",
        targetSymbol: "USDT",
        marketType: "SPOT",
        tradeUrl: "https://www.coinup.io/en_US/trade/AAVE_USDT",
        volumeUsd: 702766040,
        lastPriceUsd: 139.7,
        sourceTimestamp: "2026-09-18T21:22:46+00:00",
      },
    ]);
  });

  it("descarta tickers sem base/target/exchange identificáveis, mantém os demais", () => {
    const result = normalizeCoinGeckoTickers(
      {
        id: "x",
        tickers: [
          { base: "X", target: "USDT", market: { name: "A", identifier: "a" } },
          { base: null, target: "USDT", market: { name: "B", identifier: "b" } },
          { base: "X", target: "USDT", market: { name: null, identifier: null } },
        ],
      },
      "x",
      retrievedAt,
    );
    expect(result).toHaveLength(1);
    expect(result[0].exchangeId).toBe("a");
  });

  it("volume/preço ausentes viram null, nunca 0", () => {
    const result = normalizeCoinGeckoTickers(
      {
        id: "x",
        tickers: [{ base: "X", target: "USDT", market: { name: "A", identifier: "a" } }],
      },
      "x",
      retrievedAt,
    );
    expect(result[0].volumeUsd).toBeNull();
    expect(result[0].lastPriceUsd).toBeNull();
  });

  it("sourceTimestamp cai para retrievedAt quando o ticker não traz timestamp próprio", () => {
    const result = normalizeCoinGeckoTickers(
      {
        id: "x",
        tickers: [{ base: "X", target: "USDT", market: { name: "A", identifier: "a" } }],
      },
      "x",
      retrievedAt,
    );
    expect(result[0].sourceTimestamp).toBe(retrievedAt);
  });

  it("retorna array vazio quando a resposta não tem tickers", () => {
    expect(normalizeCoinGeckoTickers({ id: "x" }, "x", retrievedAt)).toEqual([]);
    expect(normalizeCoinGeckoTickers(null, "x", retrievedAt)).toEqual([]);
  });
});

// Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): a fixture abaixo é construída a partir da
// estrutura DOCUMENTADA publicamente da DefiLlama Pro API, NUNCA de um payload real observado
// (nenhuma key paga foi adquirida). O objetivo destes testes é garantir que o normalizador
// nunca lança e descarta itens malformados individualmente — não é uma garantia de que o
// formato real da API é exatamente este. Validar contra um payload real é obrigatório antes de
// confiar cegamente no resultado, no dia em que uma key for configurada.
describe("normalizeTokenUnlocks (Sprint 18 — PRONTO, não ativado)", () => {
  const retrievedAt = "2026-09-19T00:00:00.000Z";

  it("normaliza eventos com noOfTokens em array (soma) e em número (direto)", () => {
    const raw = {
      events: [
        { timestamp: 1_700_000_000, noOfTokens: [100, 50], category: "Team", description: "Cliff" },
        { timestamp: 1_710_000_000, noOfTokens: 25, category: "Ecosystem", description: null },
      ],
    };
    const result = normalizeTokenUnlocks(raw, "114", retrievedAt);
    expect(result).toHaveLength(2);
    expect(result[0]?.tokenAmount).toBe(150);
    expect(result[0]?.category).toBe("Team");
    expect(result[1]?.tokenAmount).toBe(25);
    expect(result[1]?.description).toBeNull();
  });

  it("descarta itens sem timestamp válido, sem lançar", () => {
    const raw = {
      events: [
        { noOfTokens: 10, category: "Team" },
        { timestamp: "not-a-number", noOfTokens: 10 },
        { timestamp: 1_700_000_000, noOfTokens: 10, category: "Valid" },
      ],
    };
    const result = normalizeTokenUnlocks(raw, "114", retrievedAt);
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("Valid");
  });

  it("payload nulo, malformado ou sem 'events': retorna array vazio, nunca lança", () => {
    expect(normalizeTokenUnlocks(null, "114", retrievedAt)).toEqual([]);
    expect(normalizeTokenUnlocks({}, "114", retrievedAt)).toEqual([]);
    expect(normalizeTokenUnlocks({ events: "not-an-array" }, "114", retrievedAt)).toEqual([]);
    expect(normalizeTokenUnlocks("garbage", "114", retrievedAt)).toEqual([]);
  });

  it("noOfTokens ausente/inválido: tokenAmount fica null, evento ainda é criado", () => {
    const raw = { events: [{ timestamp: 1_700_000_000, category: "Advisors" }] };
    const result = normalizeTokenUnlocks(raw, "114", retrievedAt);
    expect(result).toHaveLength(1);
    expect(result[0]?.tokenAmount).toBeNull();
  });
});
