import { describe, expect, it } from "vitest";
import { calculateResearchPriority, PRIORITY_MODEL_VERSION } from "../src/priority";

// Sprint 8 — Priority Model (priority-v2). Testa normalização, exclusão de componentes
// ausentes (nunca vira 0), e derivação mecânica de `reasons`.

describe("calculateResearchPriority", () => {
  it("expõe a versão do modelo", () => {
    const result = calculateResearchPriority({ score: 50, growth7d: 0, daysSinceLastRaise: null });
    expect(result.modelVersion).toBe(PRIORITY_MODEL_VERSION);
  });

  it("Score alto + capital baixo + growth baixo produz prioridade moderada, não igual ao Score", () => {
    const result = calculateResearchPriority({
      score: 90,
      growth7d: -10,
      daysSinceLastRaise: 300,
    });
    expect(result.priorityScore).toBeLessThan(90);
    expect(result.components.score).toBe(90);
  });

  it("Score moderado + capital alto + growth alto pode superar Score alto isolado (seção 27)", () => {
    const highScoreOnly = calculateResearchPriority({
      score: 90,
      growth7d: null,
      daysSinceLastRaise: null,
    });
    // growth7d em pontos percentuais (convenção do change_7d da DefiLlama) — 15 = +15%, não 0.15.
    const balanced = calculateResearchPriority({ score: 83, growth7d: 15, daysSinceLastRaise: 5 });
    expect(balanced.priorityScore).toBeGreaterThan(highScoreOnly.priorityScore);
  });

  it("componente ausente é EXCLUÍDO da média, nunca tratado como 0", () => {
    // Só Score disponível: priorityScore deve ser exatamente o Score (média de 1 elemento).
    const result = calculateResearchPriority({
      score: 60,
      growth7d: null,
      daysSinceLastRaise: null,
    });
    expect(result.priorityScore).toBe(60);
    expect(result.components.growthMomentum).toBeNull();
    expect(result.components.capitalMomentum).toBeNull();
  });

  it("growth7d é normalizado com clamp em ±20 pontos percentuais (seção 24)", () => {
    const extremeGrowth = calculateResearchPriority({
      score: null,
      growth7d: 500,
      daysSinceLastRaise: null,
    });
    const cappedGrowth = calculateResearchPriority({
      score: null,
      growth7d: 20,
      daysSinceLastRaise: null,
    });
    expect(extremeGrowth.components.growthMomentum).toBe(cappedGrowth.components.growthMomentum);
    expect(extremeGrowth.components.growthMomentum).toBe(100);
  });

  it("growth7d estável vale 50, queda de 20% ou mais vale 0", () => {
    const flat = calculateResearchPriority({ score: null, growth7d: 0, daysSinceLastRaise: null });
    const drop = calculateResearchPriority({
      score: null,
      growth7d: -35,
      daysSinceLastRaise: null,
    });
    expect(flat.components.growthMomentum).toBe(50);
    expect(drop.components.growthMomentum).toBe(0);
  });

  it("projeto nunca pesquisado mas com growth7d forte supera projeto pesquisado estagnado", () => {
    // O ciclo vicioso que motivou o priority-v2: sem growth para o universo inteiro, todo
    // projeto nunca pesquisado tinha prioridade 0 e nunca entrava no Top 10.
    const newcomer = calculateResearchPriority({
      score: null,
      growth7d: 15,
      daysSinceLastRaise: null,
    });
    const stale = calculateResearchPriority({ score: 40, growth7d: 0, daysSinceLastRaise: null });
    expect(newcomer.priorityScore).toBeGreaterThan(stale.priorityScore);
  });

  it("capital momentum é 100 para captação recente (<=30d) e decai até 0 em 365d", () => {
    const recent = calculateResearchPriority({
      score: null,
      growth7d: null,
      daysSinceLastRaise: 10,
    });
    const old = calculateResearchPriority({
      score: null,
      growth7d: null,
      daysSinceLastRaise: 400,
    });
    expect(recent.components.capitalMomentum).toBe(100);
    expect(old.components.capitalMomentum).toBe(0);
  });

  it("nenhum componente disponível produz priorityScore 0 e motivo explicando ausência de sinal", () => {
    const result = calculateResearchPriority({
      score: null,
      growth7d: null,
      daysSinceLastRaise: null,
    });
    expect(result.priorityScore).toBe(0);
    expect(result.reasons).toContain("No Signal Yet — Newly Discovered");
  });

  it("reasons refletem mecanicamente os componentes acima do threshold, nunca texto arbitrário", () => {
    const result = calculateResearchPriority({ score: 85, growth7d: 12, daysSinceLastRaise: 5 });
    expect(result.reasons).toContain("High Score");
    expect(result.reasons).toContain("Strong Growth Momentum");
    expect(result.reasons).toContain("Strong Capital Momentum");
  });
});
