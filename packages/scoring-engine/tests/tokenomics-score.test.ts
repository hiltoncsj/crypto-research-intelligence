import { describe, expect, it } from "vitest";
import {
  computeMcToFdvRatio,
  computeTokenomicsScore,
  computeUnlockPressureRatio,
} from "../src/tokenomics-score";

// Fase 22/23 do Sprint 6: cenário completo com percentiles conhecidos, valor calculado à mão:
// Supply/Dilution (5): percentile 80 -> 5 * 0.8 = 4
// Unlock Pressure (5): percentile 60 -> 5 * 0.6 = 3
// Distribution (4): percentile 50 -> 4 * 0.5 = 2
// Value Capture (6): percentile 90 -> 6 * 0.9 = 5.4
// Total = 4 + 3 + 2 + 5.4 = 14.4 / 20
describe("computeTokenomicsScore", () => {
  it("calcula o valor exato esperado quando todos os grupos têm dado", () => {
    const result = computeTokenomicsScore({
      supplyDilution: 80,
      unlockPressure: 60,
      distribution: 50,
      valueCapture: 90,
    });

    expect(result.groups.supplyDilution.score).toBeCloseTo(4, 10);
    expect(result.groups.unlockPressure.score).toBeCloseTo(3, 10);
    expect(result.groups.distribution.score).toBeCloseTo(2, 10);
    expect(result.groups.valueCapture.score).toBeCloseTo(5.4, 10);
    expect(result.totalScore).toBeCloseTo(14.4, 10);
    expect(result.maxScore).toBe(20);
    expect(result.partial).toBe(false);
    expect(result.missingGroups).toEqual([]);
  });

  it("nenhum grupo disponível (estado real hoje, sem fonte de dado) -> score 0, todos missing", () => {
    const result = computeTokenomicsScore({
      supplyDilution: null,
      unlockPressure: null,
      distribution: null,
      valueCapture: null,
    });
    expect(result.totalScore).toBe(0);
    expect(result.missingGroups).toHaveLength(4);
    expect(result.partial).toBe(true);
  });

  it("é reprodutível", () => {
    const input = { supplyDilution: 80, unlockPressure: 60, distribution: 50, valueCapture: 90 };
    expect(computeTokenomicsScore(input)).toEqual(computeTokenomicsScore(input));
  });

  it("nunca produz NaN/Infinity mesmo com percentile 0", () => {
    const result = computeTokenomicsScore({
      supplyDilution: 0,
      unlockPressure: 0,
      distribution: 0,
      valueCapture: 0,
    });
    expect(Number.isFinite(result.totalScore)).toBe(true);
    expect(result.totalScore).toBe(0);
    expect(result.missingGroups).toEqual([]); // percentile 0 é um valor válido, não "ausente"
  });
});

describe("computeUnlockPressureRatio", () => {
  it("calcula next30dUnlock / circulatingSupply", () => {
    expect(computeUnlockPressureRatio(1_000_000, 10_000_000)).toBeCloseTo(0.1, 10);
  });
  it("supply zero ou ausente vira null, nunca Infinity", () => {
    expect(computeUnlockPressureRatio(1_000_000, 0)).toBeNull();
    expect(computeUnlockPressureRatio(1_000_000, null)).toBeNull();
    expect(computeUnlockPressureRatio(null, 10_000_000)).toBeNull();
  });
});

describe("computeMcToFdvRatio", () => {
  it("calcula MC/FDV quando ambos > 0", () => {
    expect(computeMcToFdvRatio(50, 100)).toBeCloseTo(0.5, 10);
  });
  it("nunca 0/0, nunca NaN/Infinity", () => {
    expect(computeMcToFdvRatio(0, 0)).toBeNull();
    expect(computeMcToFdvRatio(null, 100)).toBeNull();
    expect(computeMcToFdvRatio(50, null)).toBeNull();
    expect(computeMcToFdvRatio(-10, 100)).toBeNull();
  });
});
