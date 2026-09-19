import { describe, expect, it } from "vitest";
import { calculateGrowth, calculateWindowMetrics } from "../src/metrics";

const day = 24 * 60 * 60 * 1000;

describe("calculateGrowth", () => {
  it("crescimento positivo", () => {
    expect(calculateGrowth(150, 100)).toBeCloseTo(50);
  });

  it("crescimento negativo", () => {
    expect(calculateGrowth(50, 100)).toBeCloseTo(-50);
  });

  it("zero (sem variação)", () => {
    expect(calculateGrowth(100, 100)).toBe(0);
  });

  it("previous = 0 retorna N/A (não Infinity)", () => {
    expect(calculateGrowth(100, 0)).toBe("N/A");
  });

  it("previous = null retorna N/A", () => {
    expect(calculateGrowth(100, null)).toBe("N/A");
  });

  it("current = null retorna N/A", () => {
    expect(calculateGrowth(null, 100)).toBe("N/A");
  });

  it("nunca retorna NaN ou Infinity", () => {
    const result = calculateGrowth(100, 0);
    expect(result).not.toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(result as number)).toBe(false);
  });
});

describe("calculateWindowMetrics", () => {
  const asOf = new Date("2026-09-15T00:00:00.000Z");

  it("ausência total de histórico -> tudo N/A", () => {
    const result = calculateWindowMetrics([], asOf);
    expect(result.current).toBeNull();
    expect(result.growth7d).toBe("N/A");
    expect(result.growth30d).toBe("N/A");
    expect(result.growth90d).toBe("N/A");
  });

  it("projeto recém-cadastrado (1 ponto) -> growth N/A em todas as janelas", () => {
    const result = calculateWindowMetrics([{ sourceTimestamp: asOf, valueUsd: 100_000_000 }], asOf);
    expect(result.current).toBe(100_000_000);
    expect(result.growth7d).toBe("N/A");
    expect(result.growth30d).toBe("N/A");
    expect(result.growth90d).toBe("N/A");
  });

  it("exatamente 7 dias de histórico calcula growth7d", () => {
    const series = [
      { sourceTimestamp: new Date(asOf.getTime() - 7 * day), valueUsd: 100 },
      { sourceTimestamp: asOf, valueUsd: 150 },
    ];
    const result = calculateWindowMetrics(series, asOf);
    expect(result.growth7d).toBeCloseTo(50);
  });

  it("exatamente 30 dias de histórico calcula growth30d", () => {
    const series = [
      { sourceTimestamp: new Date(asOf.getTime() - 30 * day), valueUsd: 200 },
      { sourceTimestamp: asOf, valueUsd: 100 },
    ];
    const result = calculateWindowMetrics(series, asOf);
    expect(result.growth30d).toBeCloseTo(-50);
  });

  it("exatamente 90 dias de histórico calcula growth90d", () => {
    const series = [
      { sourceTimestamp: new Date(asOf.getTime() - 90 * day), valueUsd: 100 },
      { sourceTimestamp: asOf, valueUsd: 100 },
    ];
    const result = calculateWindowMetrics(series, asOf);
    expect(result.growth90d).toBe(0);
  });

  it("usa o ponto mais próximo anterior quando não há dado exato na janela (gaps)", () => {
    const series = [
      { sourceTimestamp: new Date(asOf.getTime() - 10 * day), valueUsd: 80 },
      { sourceTimestamp: new Date(asOf.getTime() - 5 * day), valueUsd: 90 },
      { sourceTimestamp: asOf, valueUsd: 100 },
    ];
    const result = calculateWindowMetrics(series, asOf);
    // Para growth7d, o ponto de referência é o mais recente <= (asOf - 7d) => o de -10d (80)
    expect(result.growth7d).toBeCloseTo(25);
  });
});
