import { describe, expect, it } from "vitest";
import { validateMarketDataPoint, validatePoint } from "../src/validator";

const iso = (d: string) => new Date(d).toISOString();

function marketPoint(overrides: {
  sourceTimestamp?: string;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  volumeUsd?: number | null;
}) {
  return {
    source: "COINGECKO" as const,
    retrievedAt: iso("2026-09-10"),
    coinGeckoId: "bitcoin",
    sourceTimestamp: overrides.sourceTimestamp ?? iso("2026-09-10"),
    priceUsd: "priceUsd" in overrides ? overrides.priceUsd! : 100,
    marketCapUsd: "marketCapUsd" in overrides ? overrides.marketCapUsd! : 1_000_000,
    volumeUsd: "volumeUsd" in overrides ? overrides.volumeUsd! : 50_000,
  };
}

describe("validator", () => {
  it("aceita valor válido", () => {
    const result = validatePoint({ sourceTimestamp: iso("2026-09-10"), valueUsd: 100 }, null);
    expect(result.status).toBe("VALID");
  });

  it("rejeita valor negativo", () => {
    const result = validatePoint(
      { sourceTimestamp: iso("2026-09-10"), valueUsd: -500_000_000 },
      null,
    );
    expect(result.status).toBe("INVALID");
  });

  it("rejeita null/undefined explícito", () => {
    const result = validatePoint(undefined, null);
    expect(result.status).toBe("MISSING");
  });

  it("rejeita timestamp inválido", () => {
    const result = validatePoint({ sourceTimestamp: "not-a-date", valueUsd: 100 }, null);
    expect(result.status).toBe("INVALID");
  });

  it("rejeita timestamp futuro", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = validatePoint({ sourceTimestamp: future, valueUsd: 100 }, null);
    expect(result.status).toBe("INVALID");
  });

  it("marca variação anômala como SUSPICIOUS ($100M -> $4B em 24h)", () => {
    const result = validatePoint(
      { sourceTimestamp: iso("2026-09-10"), valueUsd: 4_000_000_000 },
      100_000_000,
    );
    expect(result.status).toBe("SUSPICIOUS");
  });

  it("não marca variação normal como suspeita", () => {
    const result = validatePoint(
      { sourceTimestamp: iso("2026-09-10"), valueUsd: 110_000_000 },
      100_000_000,
    );
    expect(result.status).toBe("VALID");
  });

  it("NaN é INVALID", () => {
    const result = validatePoint(
      { sourceTimestamp: iso("2026-09-10"), valueUsd: Number.NaN },
      null,
    );
    expect(result.status).toBe("INVALID");
  });
});

describe("validateMarketDataPoint", () => {
  it("aceita ponto válido com os três campos presentes", () => {
    const result = validateMarketDataPoint(marketPoint({}), null);
    expect(result.status).toBe("VALID");
  });

  it("aceita ponto com apenas price (marketCap/volume ausentes) — não exige os três juntos", () => {
    const result = validateMarketDataPoint(
      marketPoint({ marketCapUsd: null, volumeUsd: null }),
      null,
    );
    expect(result.status).toBe("VALID");
  });

  it("rejeita null/undefined explícito como MISSING", () => {
    expect(validateMarketDataPoint(undefined, null).status).toBe("MISSING");
    expect(validateMarketDataPoint(null, null).status).toBe("MISSING");
  });

  it("MISSING quando os três campos são null (nenhuma informação útil)", () => {
    const result = validateMarketDataPoint(
      marketPoint({ priceUsd: null, marketCapUsd: null, volumeUsd: null }),
      null,
    );
    expect(result.status).toBe("MISSING");
  });

  it("rejeita price negativo", () => {
    const result = validateMarketDataPoint(marketPoint({ priceUsd: -1 }), null);
    expect(result.status).toBe("INVALID");
  });

  it("rejeita marketCap negativo", () => {
    const result = validateMarketDataPoint(marketPoint({ marketCapUsd: -1 }), null);
    expect(result.status).toBe("INVALID");
  });

  it("rejeita volume negativo", () => {
    const result = validateMarketDataPoint(marketPoint({ volumeUsd: -1 }), null);
    expect(result.status).toBe("INVALID");
  });

  it("rejeita timestamp inválido", () => {
    const result = validateMarketDataPoint(marketPoint({ sourceTimestamp: "not-a-date" }), null);
    expect(result.status).toBe("INVALID");
  });

  it("rejeita timestamp futuro", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = validateMarketDataPoint(marketPoint({ sourceTimestamp: future }), null);
    expect(result.status).toBe("INVALID");
  });

  it("marca salto de preço anômalo como SUSPICIOUS (10x)", () => {
    const result = validateMarketDataPoint(marketPoint({ priceUsd: 1000 }), 100);
    expect(result.status).toBe("SUSPICIOUS");
  });

  it("não marca variação normal de preço como suspeita", () => {
    const result = validateMarketDataPoint(marketPoint({ priceUsd: 105 }), 100);
    expect(result.status).toBe("VALID");
  });

  it("NaN em qualquer campo é INVALID", () => {
    const result = validateMarketDataPoint(marketPoint({ priceUsd: Number.NaN }), null);
    expect(result.status).toBe("INVALID");
  });
});
