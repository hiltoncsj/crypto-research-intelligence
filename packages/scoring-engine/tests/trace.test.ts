import { describe, expect, it } from "vitest";
import { computeTraceEntryPoints } from "../src/trace";

describe("computeTraceEntryPoints", () => {
  it("calcula pontos proporcionais ao peso relativo e ao percentile", () => {
    // grupo de 10 pontos, peso relativo 0.5 (janela 30d), percentile 80
    expect(computeTraceEntryPoints(10, 0.5, 80)).toBeCloseTo(4, 10);
  });

  it("retorna null quando percentile é null (métrica ausente/amostra insuficiente)", () => {
    expect(computeTraceEntryPoints(10, 0.5, null)).toBeNull();
  });

  it("percentile 0 retorna 0 pontos, não null", () => {
    expect(computeTraceEntryPoints(10, 1, 0)).toBe(0);
  });
});
