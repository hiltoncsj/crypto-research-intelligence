import { describe, expect, it } from "vitest";
import {
  classifyAcceleration,
  classifyFundamentalPriceDivergence,
  classifyFundamentalRegime,
  compareGrowth,
  computeCorrelation,
  computeFundamentalMomentum,
  computeValuationRatio,
  detectLeadLag,
  FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION,
  MIN_CORRELATION_OBSERVATIONS,
} from "../src/fundamental-intelligence";

describe("classifyAcceleration", () => {
  it("crescimento acelerando (growth atual bem maior que o anterior)", () => {
    const result = classifyAcceleration(40, 15);
    expect(result.regime).toBe("ACCELERATING");
    expect(result.accelerationPp).toBe(25);
  });

  it("crescimento desacelerando", () => {
    const result = classifyAcceleration(10, 30);
    expect(result.regime).toBe("DECELERATING");
    expect(result.accelerationPp).toBe(-20);
  });

  it("variação pequena é tratada como estável, não ruído", () => {
    const result = classifyAcceleration(22, 20);
    expect(result.regime).toBe("STABLE");
  });

  it("qualquer lado N/A vira INSUFFICIENT_DATA, nunca 0", () => {
    expect(classifyAcceleration("N/A", 20).regime).toBe("INSUFFICIENT_DATA");
    expect(classifyAcceleration(20, "N/A").regime).toBe("INSUFFICIENT_DATA");
    expect(classifyAcceleration("N/A", "N/A").accelerationPp).toBe("N/A");
  });
});

describe("computeFundamentalMomentum", () => {
  it("expõe a versão do modelo", () => {
    const result = computeFundamentalMomentum({
      tvlGrowth30d: 0,
      revenueGrowth30d: null,
      feesGrowth30d: null,
      volumeGrowth30d: null,
    });
    expect(result.modelVersion).toBe(FUNDAMENTAL_INTELLIGENCE_MODEL_VERSION);
  });

  it("todos os componentes disponíveis: score é a média normalizada, coverage 100%", () => {
    const result = computeFundamentalMomentum({
      tvlGrowth30d: 50,
      revenueGrowth30d: 50,
      feesGrowth30d: 50,
      volumeGrowth30d: 50,
    });
    expect(result.score).toBe(100); // +50% (clamp máximo) normaliza para 100 nos 4 componentes
    expect(result.availableComponents).toBe(4);
    expect(result.totalPossibleComponents).toBe(4);
    expect(result.coverage).toBe(100);
    expect(result.confidence).toBe(100);
  });

  it("componentes parciais: score calculado só com os disponíveis, nunca penalizado por ausência", () => {
    const result = computeFundamentalMomentum({
      tvlGrowth30d: 50,
      revenueGrowth30d: "N/A",
      feesGrowth30d: null,
      volumeGrowth30d: null,
    });
    expect(result.score).toBe(100); // só TVL disponível, no máximo — não é diluído pelos ausentes
    expect(result.availableComponents).toBe(1);
    expect(result.coverage).toBe(25);
  });

  it("um componente: ainda calcula, mas coverage/confidence refletem a amostra pequena", () => {
    const result = computeFundamentalMomentum({
      tvlGrowth30d: 10,
      revenueGrowth30d: null,
      feesGrowth30d: null,
      volumeGrowth30d: null,
    });
    expect(result.score).not.toBeNull();
    expect(result.coverage).toBe(25);
  });

  it("nenhum componente disponível: score null, nunca 0 (0 seria fabricar um valor)", () => {
    const result = computeFundamentalMomentum({
      tvlGrowth30d: null,
      revenueGrowth30d: "N/A",
      feesGrowth30d: null,
      volumeGrowth30d: null,
    });
    expect(result.score).toBeNull();
    expect(result.availableComponents).toBe(0);
    expect(result.coverage).toBe(0);
  });
});

describe("compareGrowth (Market vs Fundamentals, Revenue vs TVL, etc.)", () => {
  it("A expandiu mais rápido que B", () => {
    const result = compareGrowth(80, 20);
    expect(result.relation).toBe("A_EXPANDED_FASTER");
    expect(result.deltaPp).toBe(60);
  });

  it("B expandiu mais rápido que A", () => {
    const result = compareGrowth(20, 70);
    expect(result.relation).toBe("B_EXPANDED_FASTER");
  });

  it("diferença pequena é CO_MOVED, não ruído classificado como vencedor", () => {
    const result = compareGrowth(34, 30);
    expect(result.relation).toBe("CO_MOVED");
  });

  it("qualquer lado N/A vira INSUFFICIENT_DATA", () => {
    expect(compareGrowth("N/A", 10).relation).toBe("INSUFFICIENT_DATA");
  });
});

describe("classifyFundamentalPriceDivergence", () => {
  it("fundamentos mais fortes que o movimento de preço", () => {
    const result = classifyFundamentalPriceDivergence(90, 10);
    expect(result.classification).toBe("POSITIVE_FUNDAMENTAL_DIVERGENCE");
  });

  it("movimento de preço mais forte que os fundamentos", () => {
    const result = classifyFundamentalPriceDivergence(20, 90);
    expect(result.classification).toBe("NEGATIVE_FUNDAMENTAL_DIVERGENCE");
  });

  it("nunca produz Buy/Sell/Long/Short — só as 4 classificações descritivas", () => {
    const result = classifyFundamentalPriceDivergence(50, 45);
    expect([
      "POSITIVE_FUNDAMENTAL_DIVERGENCE",
      "NEGATIVE_FUNDAMENTAL_DIVERGENCE",
      "ALIGNED",
      "INSUFFICIENT_DATA",
    ]).toContain(result.classification);
  });

  it("dado ausente vira INSUFFICIENT_DATA", () => {
    expect(classifyFundamentalPriceDivergence(null, 10).classification).toBe("INSUFFICIENT_DATA");
    expect(classifyFundamentalPriceDivergence(50, "N/A").classification).toBe("INSUFFICIENT_DATA");
    expect(classifyFundamentalPriceDivergence(50, null).classification).toBe("INSUFFICIENT_DATA");
  });
});

describe("computeValuationRatio (MC/TVL, MC/Revenue, FDV/Revenue, MC/Fees)", () => {
  it("calcula quando ambos disponíveis e denominador > 0", () => {
    expect(computeValuationRatio(1000, 100)).toBe(10);
  });

  it("denominador zero ou negativo vira null, nunca Infinity/NaN", () => {
    expect(computeValuationRatio(1000, 0)).toBeNull();
    expect(computeValuationRatio(1000, -5)).toBeNull();
  });

  it("qualquer lado ausente vira null", () => {
    expect(computeValuationRatio(null, 100)).toBeNull();
    expect(computeValuationRatio(1000, null)).toBeNull();
  });
});

describe("computeCorrelation", () => {
  it("correlação positiva forte para séries que se movem juntas", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [2, 4, 6, 8, 10, 12];
    const result = computeCorrelation(a, b);
    expect(result.coefficient).toBeGreaterThan(0.99);
    expect(result.classification).toBe("STRONG_POSITIVE");
  });

  it("correlação negativa para séries inversas", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [6, 5, 4, 3, 2, 1];
    const result = computeCorrelation(a, b);
    expect(result.classification).toBe("NEGATIVE");
  });

  it("poucas observações (< mínimo) vira INSUFFICIENT_DATA, nunca um coeficiente fabricado", () => {
    const a = Array.from({ length: MIN_CORRELATION_OBSERVATIONS - 1 }, (_, i) => i);
    const b = Array.from({ length: MIN_CORRELATION_OBSERVATIONS - 1 }, (_, i) => i * 2);
    const result = computeCorrelation(a, b);
    expect(result.classification).toBe("INSUFFICIENT_DATA");
    expect(result.coefficient).toBe("N/A");
  });

  it("série constante (variância zero) é INSUFFICIENT_DATA, não correlação 0 fabricada", () => {
    const a = [5, 5, 5, 5, 5, 5];
    const b = [1, 2, 3, 4, 5, 6];
    const result = computeCorrelation(a, b);
    expect(result.coefficient).toBe("N/A");
  });

  it("neutro para séries sem relação linear clara", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [3, 1, 4, 1, 5, 9];
    const result = computeCorrelation(a, b);
    expect(result.observations).toBe(6);
  });
});

describe("detectLeadLag", () => {
  it("detecta que A liderou B quando B é A deslocada no tempo", () => {
    // B[i] = A[i-3] -> A antecipa B em 3 posições (A liderou B).
    const base = Array.from({ length: 60 }, (_, i) => Math.sin(i / 5) * 10 + i);
    const a = base;
    const b = [0, 0, 0, ...base.slice(0, base.length - 3)];
    const result = detectLeadLag(a, b, 10);
    expect(result.relation).toBe("A_LED_B");
    expect(result.bestLagDays).toBe(3);
  });

  it("séries curtas demais viram INSUFFICIENT_DATA", () => {
    const result = detectLeadLag([1, 2, 3], [1, 2, 3], 10);
    expect(result.relation).toBe("INSUFFICIENT_DATA");
  });

  it("nunca afirma causalidade — só as classificações observacionais", () => {
    const a = Array.from({ length: 40 }, () => Math.random());
    const b = Array.from({ length: 40 }, () => Math.random());
    const result = detectLeadLag(a, b, 10);
    expect(["A_LED_B", "B_LED_A", "NO_CLEAR_RELATIONSHIP", "INSUFFICIENT_DATA"]).toContain(
      result.relation,
    );
  });
});

describe("classifyFundamentalRegime", () => {
  it("crescimento positivo + aceleração = FUNDAMENTAL_ACCELERATION", () => {
    expect(classifyFundamentalRegime(40, "ACCELERATING", 30)).toBe("FUNDAMENTAL_ACCELERATION");
  });

  it("crescimento positivo + desaceleração = FUNDAMENTAL_DECELERATION", () => {
    expect(classifyFundamentalRegime(10, "DECELERATING", 5)).toBe("FUNDAMENTAL_DECELERATION");
  });

  it("crescimento positivo estável = FUNDAMENTAL_EXPANSION", () => {
    expect(classifyFundamentalRegime(20, "STABLE", 18)).toBe("FUNDAMENTAL_EXPANSION");
  });

  it("todos negativos = FUNDAMENTAL_CONTRACTION", () => {
    expect(classifyFundamentalRegime(-20, "STABLE", -10)).toBe("FUNDAMENTAL_CONTRACTION");
  });

  it("sinais mistos (um positivo, um negativo) = MIXED_FUNDAMENTALS", () => {
    expect(classifyFundamentalRegime(20, "STABLE", -10)).toBe("MIXED_FUNDAMENTALS");
  });

  it("nenhum dado disponível = INSUFFICIENT_DATA, nunca um regime fabricado", () => {
    expect(classifyFundamentalRegime("N/A", "INSUFFICIENT_DATA", "N/A")).toBe("INSUFFICIENT_DATA");
  });
});
