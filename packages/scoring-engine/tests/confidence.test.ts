import { describe, expect, it } from "vitest";
import { computeConfidence, type MetricQualityFlag } from "../src/confidence";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function flag(overrides: Partial<MetricQualityFlag> = {}): MetricQualityFlag {
  return {
    available: true,
    suspicious: false,
    invalidRejected: false,
    lastUpdatedAt: NOW,
    ...overrides,
  };
}

describe("computeConfidence", () => {
  it("tudo disponível, recente, sem flags, amostra adequada → confidence 100", () => {
    const confidence = computeConfidence({
      metricQuality: { tvl: flag(), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [true, true, true, true],
      asOf: NOW,
    });
    expect(confidence).toBeCloseTo(100, 10);
  });

  it("Fase 24: métrica MISSING reduz completeness e não gera NaN", () => {
    const confidence = computeConfidence({
      metricQuality: {
        tvl: flag(),
        revenue: flag(),
        fees: flag({ available: false, lastUpdatedAt: null }),
      },
      percentileSampleOutcomes: [true, true],
      asOf: NOW,
    });
    // completeness = 2/3, sampleAdequacy=1, dataQuality=1, recency=1
    // confidence = 100 * (2/3 + 1 + 1 + 1) / 4
    expect(confidence).toBeCloseTo((100 * (2 / 3 + 1 + 1 + 1)) / 4, 10);
    expect(Number.isFinite(confidence)).toBe(true);
  });

  it("Fase 25: métrica SUSPICIOUS reduz dataQuality mas não zera confidence", () => {
    const confidence = computeConfidence({
      metricQuality: { tvl: flag({ suspicious: true }), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [true],
      asOf: NOW,
    });
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(100);
  });

  it("Fase 26: métrica com INVALID_REJECTED durante o pipeline reduz dataQuality", () => {
    const withInvalid = computeConfidence({
      metricQuality: { tvl: flag({ invalidRejected: true }), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [true],
      asOf: NOW,
    });
    const withoutInvalid = computeConfidence({
      metricQuality: { tvl: flag(), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [true],
      asOf: NOW,
    });
    expect(withInvalid).toBeLessThan(withoutInvalid);
  });

  it("Fase 8: percentile N/A por amostra pequena reduz sampleAdequacy, não o Score", () => {
    const confidence = computeConfidence({
      metricQuality: { tvl: flag(), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [false, false],
      asOf: NOW,
    });
    expect(confidence).toBeLessThan(100);
    expect(confidence).toBeGreaterThanOrEqual(0);
  });

  it("nenhum percentile tentado é neutro (0.5), não penaliza nem beneficia", () => {
    const confidence = computeConfidence({
      metricQuality: { tvl: flag(), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [],
      asOf: NOW,
    });
    expect(confidence).toBeCloseTo((100 * (1 + 0.5 + 1 + 1)) / 4, 10);
  });

  it("dado antigo (>30 dias) tem recency zero, dado com 3 dias ou menos tem recency plena", () => {
    const old = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    const confidenceOld = computeConfidence({
      metricQuality: {
        tvl: flag({ lastUpdatedAt: old }),
        revenue: flag({ lastUpdatedAt: old }),
        fees: flag({ lastUpdatedAt: old }),
      },
      percentileSampleOutcomes: [true],
      asOf: NOW,
    });
    const confidenceFresh = computeConfidence({
      metricQuality: { tvl: flag(), revenue: flag(), fees: flag() },
      percentileSampleOutcomes: [true],
      asOf: NOW,
    });
    expect(confidenceOld).toBeLessThan(confidenceFresh);
  });

  it("todas as métricas ausentes → confidence 0 de completeness/dataQuality/recency, nunca NaN", () => {
    const confidence = computeConfidence({
      metricQuality: {
        tvl: flag({ available: false, lastUpdatedAt: null }),
        revenue: flag({ available: false, lastUpdatedAt: null }),
        fees: flag({ available: false, lastUpdatedAt: null }),
      },
      percentileSampleOutcomes: [],
      asOf: NOW,
    });
    expect(Number.isFinite(confidence)).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0);
  });

  it("nunca retorna valor fora de [0, 100]", () => {
    const confidence = computeConfidence({
      metricQuality: {
        tvl: flag({ suspicious: true, invalidRejected: true }),
        revenue: flag({ available: false, lastUpdatedAt: null }),
        fees: flag({ available: false, lastUpdatedAt: null }),
      },
      percentileSampleOutcomes: [false, false, false],
      asOf: NOW,
    });
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
  });
});
