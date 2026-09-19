import { describe, expect, it } from "vitest";
import { computeCapitalScore } from "../src/capital-score";

// Cenário completo, valor calculado à mão:
// Capital Raised (5): percentile 70 -> 3.5
// Institutional Depth (4): percentile 100 -> 4
// Funding Recency (3): percentile 40 -> 1.2
// Conviction Signals (3): percentile 66.67 -> 2 (aprox)
// Total = 3.5 + 4 + 1.2 + 2 = 10.7
describe("computeCapitalScore", () => {
  it("calcula o valor exato esperado quando todos os grupos têm dado", () => {
    const result = computeCapitalScore({
      capitalRaised: 70,
      institutionalDepth: 100,
      fundingRecency: 40,
      convictionSignals: 66.666666666667,
    });

    expect(result.groups.capitalRaised.score).toBeCloseTo(3.5, 10);
    expect(result.groups.institutionalDepth.score).toBeCloseTo(4, 10);
    expect(result.groups.fundingRecency.score).toBeCloseTo(1.2, 10);
    expect(result.groups.convictionSignals.score).toBeCloseTo(2, 5);
    expect(result.totalScore).toBeCloseTo(10.7, 5);
    expect(result.maxScore).toBe(15);
    expect(result.partial).toBe(false);
  });

  it("funding desconhecido (nenhum round encontrado) -> todos os grupos missing, score 0", () => {
    const result = computeCapitalScore({
      capitalRaised: null,
      institutionalDepth: null,
      fundingRecency: null,
      convictionSignals: null,
    });
    expect(result.totalScore).toBe(0);
    expect(result.missingGroups).toHaveLength(4);
    expect(result.partial).toBe(true);
  });

  it("é reprodutível", () => {
    const input = {
      capitalRaised: 70,
      institutionalDepth: 100,
      fundingRecency: 40,
      convictionSignals: 50,
    };
    expect(computeCapitalScore(input)).toEqual(computeCapitalScore(input));
  });

  it("grupo parcialmente ausente não vira zero silencioso", () => {
    const result = computeCapitalScore({
      capitalRaised: 70,
      institutionalDepth: null,
      fundingRecency: 40,
      convictionSignals: 50,
    });
    expect(result.groups.institutionalDepth.score).toBeNull();
    expect(result.missingGroups).toEqual(["INSTITUTIONAL_DEPTH"]);
    expect(result.partial).toBe(true);
  });
});
