import { describe, expect, it } from "vitest";
import {
  classifyEventImpact,
  classifyMetricDirection,
  compareRegimes,
  computeAggregateStats,
  computeChangePercent,
  computeMomentumDelta,
  computeWindowValues,
  detectOverlap,
  EVENT_IMPACT_MODEL_VERSION,
  summarizeCoverage,
} from "../src/event-impact";

describe("computeChangePercent", () => {
  it("+20% quando before=100, after=120", () => {
    expect(computeChangePercent(100, 120)).toBe(20);
  });

  it("-20% quando before=100, after=80", () => {
    expect(computeChangePercent(100, 80)).toBe(-20);
  });

  it("before=0 vira null, nunca Infinity", () => {
    expect(computeChangePercent(0, 100)).toBeNull();
  });

  it("before=null vira null", () => {
    expect(computeChangePercent(null, 100)).toBeNull();
  });

  it("after=null vira null", () => {
    expect(computeChangePercent(100, null)).toBeNull();
  });

  it("nunca retorna NaN", () => {
    const result = computeChangePercent(0, 0);
    expect(result).toBeNull();
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("computeWindowValues", () => {
  it("calcula before/after/delta/changePercent juntos", () => {
    const result = computeWindowValues(100, 150);
    expect(result).toEqual({ before: 100, after: 150, delta: 50, changePercent: 50 });
  });

  it("delta null quando qualquer lado ausente", () => {
    expect(computeWindowValues(null, 150).delta).toBeNull();
    expect(computeWindowValues(100, null).delta).toBeNull();
  });
});

describe("classifyMetricDirection", () => {
  it("UP para variação positiva acima do limiar", () => {
    expect(classifyMetricDirection(20)).toBe("UP");
  });

  it("DOWN para variação negativa acima do limiar", () => {
    expect(classifyMetricDirection(-20)).toBe("DOWN");
  });

  it("NO_CLEAR_CHANGE para variação pequena (ruído)", () => {
    expect(classifyMetricDirection(2)).toBe("NO_CLEAR_CHANGE");
  });

  it("INSUFFICIENT_DATA quando null", () => {
    expect(classifyMetricDirection(null)).toBe("INSUFFICIENT_DATA");
  });
});

describe("summarizeCoverage", () => {
  it("conta métricas disponíveis corretamente (7/7)", () => {
    const result = summarizeCoverage({
      market: true,
      tvl: true,
      revenue: true,
      fees: true,
      volume: true,
      momentum: true,
      regime: true,
    });
    expect(result.availableCount).toBe(7);
    expect(result.totalCount).toBe(7);
    expect(result.coveragePercent).toBe(100);
    expect(result.missingMetrics).toEqual([]);
  });

  it("lista métricas ausentes (4/7)", () => {
    const result = summarizeCoverage({
      market: true,
      tvl: true,
      revenue: false,
      fees: false,
      volume: true,
      momentum: true,
      regime: false,
    });
    expect(result.availableCount).toBe(4);
    expect(result.missingMetrics).toEqual(["revenue", "fees", "regime"]);
  });
});

describe("classifyEventImpact", () => {
  it("OVERLAPPING_EVENTS sempre vence, mesmo com sinais claros", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "UP",
      marketDirection: "UP",
      hasOverlap: true,
    });
    expect(result).toBe("OVERLAPPING_EVENTS");
  });

  it("FUNDAMENTAL_EXPANSION_AFTER_EVENT quando só fundamental sobe", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "UP",
      marketDirection: "INSUFFICIENT_DATA",
      hasOverlap: false,
    });
    expect(result).toBe("FUNDAMENTAL_EXPANSION_AFTER_EVENT");
  });

  it("FUNDAMENTAL_CONTRACTION_AFTER_EVENT quando só fundamental cai", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "DOWN",
      marketDirection: "NO_CLEAR_CHANGE",
      hasOverlap: false,
    });
    expect(result).toBe("FUNDAMENTAL_CONTRACTION_AFTER_EVENT");
  });

  it("MARKET_APPRECIATION_AFTER_EVENT quando só mercado sobe", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "INSUFFICIENT_DATA",
      marketDirection: "UP",
      hasOverlap: false,
    });
    expect(result).toBe("MARKET_APPRECIATION_AFTER_EVENT");
  });

  it("MARKET_DECLINE_AFTER_EVENT quando só mercado cai", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "NO_CLEAR_CHANGE",
      marketDirection: "DOWN",
      hasOverlap: false,
    });
    expect(result).toBe("MARKET_DECLINE_AFTER_EVENT");
  });

  it("MIXED quando fundamental e mercado divergem em polaridade", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "UP",
      marketDirection: "DOWN",
      hasOverlap: false,
    });
    expect(result).toBe("MIXED");
  });

  it("prioriza label fundamental quando os dois concordam (mesma polaridade)", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "UP",
      marketDirection: "UP",
      hasOverlap: false,
    });
    expect(result).toBe("FUNDAMENTAL_EXPANSION_AFTER_EVENT");
  });

  it("NO_CLEAR_CHANGE quando ambos existem mas nenhum tem sinal claro", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "NO_CLEAR_CHANGE",
      marketDirection: "NO_CLEAR_CHANGE",
      hasOverlap: false,
    });
    expect(result).toBe("NO_CLEAR_CHANGE");
  });

  it("INSUFFICIENT_DATA quando nenhum dos dois tem dado", () => {
    const result = classifyEventImpact({
      fundamentalDirection: "INSUFFICIENT_DATA",
      marketDirection: "INSUFFICIENT_DATA",
      hasOverlap: false,
    });
    expect(result).toBe("INSUFFICIENT_DATA");
  });

  it("nunca produz Bullish/Bearish/Buy/Sell — só os 8 labels descritivos", () => {
    const allowed = [
      "FUNDAMENTAL_EXPANSION_AFTER_EVENT",
      "FUNDAMENTAL_CONTRACTION_AFTER_EVENT",
      "MARKET_APPRECIATION_AFTER_EVENT",
      "MARKET_DECLINE_AFTER_EVENT",
      "MIXED",
      "NO_CLEAR_CHANGE",
      "INSUFFICIENT_DATA",
      "OVERLAPPING_EVENTS",
    ];
    const result = classifyEventImpact({
      fundamentalDirection: "DOWN",
      marketDirection: "UP",
      hasOverlap: false,
    });
    expect(allowed).toContain(result);
  });
});

describe("compareRegimes", () => {
  it("changed=false quando o regime não muda", () => {
    const result = compareRegimes("FUNDAMENTAL_EXPANSION", "FUNDAMENTAL_EXPANSION");
    expect(result.changed).toBe(false);
  });

  it("changed=true quando o regime muda, reaproveitando os regimes do Sprint 14", () => {
    const result = compareRegimes("FUNDAMENTAL_CONTRACTION", "FUNDAMENTAL_EXPANSION");
    expect(result.changed).toBe(true);
    expect(result.before).toBe("FUNDAMENTAL_CONTRACTION");
    expect(result.after).toBe("FUNDAMENTAL_EXPANSION");
  });
});

describe("computeMomentumDelta", () => {
  it("subtração simples", () => {
    expect(computeMomentumDelta(40, 65)).toBe(25);
  });

  it("null quando qualquer lado ausente", () => {
    expect(computeMomentumDelta(null, 65)).toBeNull();
    expect(computeMomentumDelta(40, null)).toBeNull();
  });
});

describe("detectOverlap", () => {
  const eventDate = new Date("2026-01-10T00:00:00.000Z");

  it("detecta outro evento dentro da janela pós-evento", () => {
    const other = new Date("2026-01-18T00:00:00.000Z"); // 8 dias depois
    expect(detectOverlap(eventDate, 30, [other])).toBe(true);
  });

  it("não detecta evento fora da janela", () => {
    const other = new Date("2026-03-01T00:00:00.000Z");
    expect(detectOverlap(eventDate, 30, [other])).toBe(false);
  });

  it("não detecta evento ANTERIOR ao evento analisado (só olha para frente)", () => {
    const other = new Date("2026-01-05T00:00:00.000Z");
    expect(detectOverlap(eventDate, 30, [other])).toBe(false);
  });

  it("evento único (lista vazia de outros) nunca sobrepõe", () => {
    expect(detectOverlap(eventDate, 30, [])).toBe(false);
  });
});

describe("computeAggregateStats", () => {
  it("calcula mean/median/min/max reais", () => {
    const result = computeAggregateStats([10, 20, 30, 40, 50]);
    expect(result.sampleSize).toBe(5);
    expect(result.mean).toBe(30);
    expect(result.median).toBe(30);
    expect(result.min).toBe(10);
    expect(result.max).toBe(50);
    expect(result.insufficientSample).toBe(false);
  });

  it("amostra vazia: tudo null, sampleSize 0", () => {
    const result = computeAggregateStats([]);
    expect(result.sampleSize).toBe(0);
    expect(result.mean).toBeNull();
    expect(result.insufficientSample).toBe(true);
  });

  it("amostra pequena (< 3): valores calculados mas insufficientSample=true", () => {
    const result = computeAggregateStats([10, 20]);
    expect(result.sampleSize).toBe(2);
    expect(result.mean).toBe(15);
    expect(result.insufficientSample).toBe(true);
  });

  it("mediana correta para quantidade par de valores", () => {
    const result = computeAggregateStats([10, 20, 30, 40]);
    expect(result.median).toBe(25);
  });

  it("aceita valores negativos", () => {
    const result = computeAggregateStats([-30, -10, 20]);
    expect(result.mean).toBeCloseTo(-6.67, 1);
    expect(result.min).toBe(-30);
    expect(result.max).toBe(20);
  });
});

describe("EVENT_IMPACT_MODEL_VERSION", () => {
  it("expõe uma versão de modelo", () => {
    expect(EVENT_IMPACT_MODEL_VERSION).toBe("event-impact-v1");
  });
});
