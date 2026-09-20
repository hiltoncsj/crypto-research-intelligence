import { describe, expect, it } from "vitest";
import {
  calculateGrowth,
  calculateGrowthForWindow,
  calculateGrowthWindowPair,
  calculateWindowMetrics,
} from "../src/metrics";

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

// Regressão da auditoria (look-ahead bias): com um `asOf` histórico, NENHUM ponto posterior ao
// `asOf` pode influenciar o resultado. Antes, o "valor atual" era o último ponto da série inteira.
describe("look-ahead: asOf histórico não usa dados posteriores", () => {
  const asOf = new Date("2025-06-30T00:00:00Z");
  const at = (daysFromAsOf: number, valueUsd: number) => ({
    sourceTimestamp: new Date(asOf.getTime() + daysFromAsOf * day),
    valueUsd,
  });
  // 100 há 30d, 110 em asOf (+10%); depois explode para 1000 e 5000 (dados FUTUROS ao asOf).
  const series = [at(-60, 100), at(-30, 100), at(0, 110), at(20, 1000), at(90, 5000)];

  it("calculateGrowthForWindow ignora pontos futuros", () => {
    expect(calculateGrowthForWindow(series, 30, asOf)).toBeCloseTo(10);
  });

  it("resultado é idêntico com ou sem os pontos futuros na série", () => {
    const withoutFuture = series.filter((p) => p.sourceTimestamp.getTime() <= asOf.getTime());
    expect(calculateGrowthForWindow(series, 30, asOf)).toBe(
      calculateGrowthForWindow(withoutFuture, 30, asOf),
    );
  });

  it("calculateGrowthWindowPair ignora pontos futuros (current e previousComparable)", () => {
    const pair = calculateGrowthWindowPair(series, 30, asOf);
    expect(pair.current).toBeCloseTo(10); // 100 -> 110
    expect(pair.previousComparable).toBeCloseTo(0); // 100 (-60d) -> 100 (-30d)
  });

  it("asOf antes do primeiro ponto: N/A, nunca um valor extrapolado", () => {
    expect(calculateGrowthForWindow(series, 30, new Date(asOf.getTime() - 400 * day))).toBe("N/A");
  });
});
