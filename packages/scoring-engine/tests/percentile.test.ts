import { describe, expect, it } from "vitest";
import { percentileRank } from "../src/percentile";

// Fase 22: fixture fixa de 5 projetos com valores conhecidos de TVL Growth 30d.
const FIVE_PROJECT_TVL_GROWTH_30D = [10, 20, 30, 40, 50];

describe("percentileRank", () => {
  it("valor mediano de amostra ímpar recebe percentile 50", () => {
    // (count<30=2 + 0.5*count==30=1) / 5 * 100 = 50
    expect(percentileRank(30, FIVE_PROJECT_TVL_GROWTH_30D)).toBe(50);
  });

  it("valor máximo não recebe 100 (evita confiança falsa de 'melhor absoluto')", () => {
    // (4 + 0.5) / 5 * 100 = 90
    expect(percentileRank(50, FIVE_PROJECT_TVL_GROWTH_30D)).toBe(90);
  });

  it("valor mínimo não recebe 0", () => {
    // (0 + 0.5) / 5 * 100 = 10
    expect(percentileRank(10, FIVE_PROJECT_TVL_GROWTH_30D)).toBe(10);
  });

  it("empate: dois valores iguais dividem o mesmo percentile", () => {
    const peers = [10, 20, 20, 30, 40];
    // value=20: count<20=1, count==20=2 → (1 + 1)/5*100 = 40
    expect(percentileRank(20, peers)).toBe(40);
  });

  it("amostra menor que MIN_PEER_SAMPLE_SIZE (3) retorna null", () => {
    expect(percentileRank(10, [10, 20])).toBeNull();
  });

  it("amostra vazia retorna null", () => {
    expect(percentileRank(10, [])).toBeNull();
  });

  it("nunca retorna NaN ou Infinity mesmo com valores negativos", () => {
    const result = percentileRank(-50, [-100, -50, -50, 0, 100]);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("value não finito retorna null", () => {
    expect(percentileRank(Number.NaN, FIVE_PROJECT_TVL_GROWTH_30D)).toBeNull();
  });

  it("ignora peers não finitos na amostra", () => {
    const withGarbage = [10, 20, 30, 40, 50, Number.NaN, Number.POSITIVE_INFINITY];
    expect(percentileRank(30, withGarbage)).toBe(50);
  });
});
