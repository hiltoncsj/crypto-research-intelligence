import { describe, expect, it } from "vitest";
import { calculateResearchPriority, PRIORITY_MODEL_VERSION } from "../src/priority";

// Sprint 8 — Priority Model (priority-v1). Testa normalização, exclusão de componentes
// ausentes (nunca vira 0), e derivação mecânica de `reasons`.

describe("calculateResearchPriority", () => {
  it("expõe a versão do modelo", () => {
    const result = calculateResearchPriority({ score: 50, growth30d: 0, daysSinceLastRaise: null });
    expect(result.modelVersion).toBe(PRIORITY_MODEL_VERSION);
  });

  it("Score alto + capital baixo + growth baixo produz prioridade moderada, não igual ao Score", () => {
    const result = calculateResearchPriority({
      score: 90,
      growth30d: -10,
      daysSinceLastRaise: 300,
    });
    expect(result.priorityScore).toBeLessThan(90);
    expect(result.components.score).toBe(90);
  });

  it("Score moderado + capital alto + growth alto pode superar Score alto isolado (seção 27)", () => {
    const highScoreOnly = calculateResearchPriority({
      score: 90,
      growth30d: null,
      daysSinceLastRaise: null,
    });
    // growth30d em pontos percentuais (convenção de calculateGrowth) — 40 = +40%, não 0.4.
    const balanced = calculateResearchPriority({ score: 83, growth30d: 40, daysSinceLastRaise: 5 });
    expect(balanced.priorityScore).toBeGreaterThan(highScoreOnly.priorityScore);
  });

  it("componente ausente é EXCLUÍDO da média, nunca tratado como 0", () => {
    // Só Score disponível: priorityScore deve ser exatamente o Score (média de 1 elemento).
    const result = calculateResearchPriority({
      score: 60,
      growth30d: null,
      daysSinceLastRaise: null,
    });
    expect(result.priorityScore).toBe(60);
    expect(result.components.growthMomentum).toBeNull();
    expect(result.components.capitalMomentum).toBeNull();
  });

  it("growth30d é normalizado com clamp em ±50 pontos percentuais (seção 24)", () => {
    const extremeGrowth = calculateResearchPriority({
      score: null,
      growth30d: 500,
      daysSinceLastRaise: null,
    });
    const cappedGrowth = calculateResearchPriority({
      score: null,
      growth30d: 50,
      daysSinceLastRaise: null,
    });
    expect(extremeGrowth.components.growthMomentum).toBe(cappedGrowth.components.growthMomentum);
    expect(extremeGrowth.components.growthMomentum).toBe(100);
  });

  it("capital momentum é 100 para captação recente (<=30d) e decai até 0 em 365d", () => {
    const recent = calculateResearchPriority({
      score: null,
      growth30d: null,
      daysSinceLastRaise: 10,
    });
    const old = calculateResearchPriority({
      score: null,
      growth30d: null,
      daysSinceLastRaise: 400,
    });
    expect(recent.components.capitalMomentum).toBe(100);
    expect(old.components.capitalMomentum).toBe(0);
  });

  it("nenhum componente disponível produz priorityScore 0 e motivo explicando ausência de sinal", () => {
    const result = calculateResearchPriority({
      score: null,
      growth30d: null,
      daysSinceLastRaise: null,
    });
    expect(result.priorityScore).toBe(0);
    expect(result.reasons).toContain("No Signal Yet — Newly Discovered");
  });

  it("reasons refletem mecanicamente os componentes acima do threshold, nunca texto arbitrário", () => {
    const result = calculateResearchPriority({ score: 85, growth30d: 45, daysSinceLastRaise: 5 });
    expect(result.reasons).toContain("High Score");
    expect(result.reasons).toContain("Strong Growth Momentum");
    expect(result.reasons).toContain("Strong Capital Momentum");
  });
});
