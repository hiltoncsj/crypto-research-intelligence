import { describe, expect, it } from "vitest";
import { computeFundamentalScore } from "../src/fundamental-score";

// Fase 23: cenário completo com percentiles conhecidos, valor final calculado manualmente
// (não apenas "maior que zero"):
//
// TVL Growth: só a janela 30d disponível, percentile 90.
//   usedWeightFraction = 0.5 (peso da janela 30d) → score = 10 * (0.5*0.9 / 0.5) = 10*0.9 = 9
// Revenue Growth: só 30d, percentile 80 → score = 10 * 0.8 = 8
// Fees Growth: só 30d, percentile 70 → score = 5 * 0.7 = 3.5
// Efficiency: só Revenue/TVL disponível, percentile 60, peso 0.5 do grupo →
//   score = 5 * (0.5*0.6 / 0.5) = 5*0.6 = 3
// Total = 9 + 8 + 3.5 + 3 = 23.5 / 30
describe("computeFundamentalScore", () => {
  const scenario = {
    tvlGrowth: { "30d": 90 },
    revenueGrowth: { "30d": 80 },
    feesGrowth: { "30d": 70 },
    efficiency: { revenueToTvl: 60, feesToTvl: null },
  };

  it("calcula o valor exato esperado para o cenário da Fase 23", () => {
    const result = computeFundamentalScore(scenario);

    expect(result.groups.tvlGrowth.score).toBeCloseTo(9, 10);
    expect(result.groups.revenueGrowth.score).toBeCloseTo(8, 10);
    expect(result.groups.feesGrowth.score).toBeCloseTo(3.5, 10);
    expect(result.groups.efficiency.score).toBeCloseTo(3, 10);
    expect(result.totalScore).toBeCloseTo(23.5, 10);
    expect(result.maxScore).toBe(30);
    expect(result.partial).toBe(false);
    expect(result.missingGroups).toEqual([]);
  });

  it("é reprodutível: mesma entrada produz exatamente o mesmo resultado (Fase 27)", () => {
    const first = computeFundamentalScore(scenario);
    const second = computeFundamentalScore(scenario);
    expect(second).toEqual(first);
  });

  it("todas as 3 janelas disponíveis usam a distribuição 20/50/30 (Fase 4)", () => {
    const result = computeFundamentalScore({
      tvlGrowth: { "7d": 100, "30d": 100, "90d": 100 },
      revenueGrowth: {},
      feesGrowth: {},
      efficiency: { revenueToTvl: null, feesToTvl: null },
    });
    // percentile 100 em todas as janelas → grupo atinge o peso máximo exato.
    expect(result.groups.tvlGrowth.score).toBeCloseTo(10, 10);
  });

  it("grupo totalmente ausente vira null, não zero silencioso (Fase 9/24)", () => {
    const result = computeFundamentalScore({
      tvlGrowth: { "30d": 90 },
      revenueGrowth: { "30d": 80 },
      feesGrowth: {}, // nenhuma janela disponível — Fees = MISSING
      efficiency: { revenueToTvl: 60, feesToTvl: null },
    });

    expect(result.groups.feesGrowth.score).toBeNull();
    expect(result.missingGroups).toContain("FEES_GROWTH");
    expect(result.partial).toBe(true);
    // Total não inclui os 5 pontos possíveis de Fees — não fabrica um valor para o grupo ausente.
    expect(result.totalScore).toBeCloseTo(9 + 8 + 3, 10);
  });

  it("nenhum grupo disponível → score total 0, todos marcados como missing", () => {
    const result = computeFundamentalScore({
      tvlGrowth: {},
      revenueGrowth: {},
      feesGrowth: {},
      efficiency: { revenueToTvl: null, feesToTvl: null },
    });
    expect(result.totalScore).toBe(0);
    expect(result.missingGroups).toHaveLength(4);
    expect(result.partial).toBe(true);
  });

  it("nunca produz NaN ou Infinity mesmo em cenários degenerados", () => {
    const result = computeFundamentalScore({
      tvlGrowth: { "7d": 0, "30d": 0, "90d": 0 },
      revenueGrowth: {},
      feesGrowth: {},
      efficiency: { revenueToTvl: 0, feesToTvl: 0 },
    });
    expect(Number.isFinite(result.totalScore)).toBe(true);
  });
});
