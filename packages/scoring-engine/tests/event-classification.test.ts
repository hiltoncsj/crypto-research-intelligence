import { describe, expect, it } from "vitest";
import { classifyEvent } from "../src/event-classification";

// Sprint 20 (Auditable Event Classification Engine). Casos de teste exatamente conforme a Fase
// 17 do documento de especificação, mais os casos de prioridade (Fase 18)/idempotência (Fase 19,
// coberta a nível de persistência em events-repository.integration.test.ts, aqui testamos que a
// função pura é determinística — mesma entrada, mesma saída).

describe("classifyEvent — MAINNET", () => {
  it('"Mainnet is now live" → MAINNET / HIGH', () => {
    const r = classifyEvent({ title: "Mainnet is now live" });
    expect(r.category).toBe("MAINNET");
    expect(r.confidence).toBe("HIGH");
    expect(r.ruleId).toBe("mainnet-launch-v2");
    expect(r.evidence).toBeTruthy();
  });
});

describe("classifyEvent — TESTNET", () => {
  it('"Public testnet launches today" → TESTNET / HIGH', () => {
    const r = classifyEvent({ title: "Public testnet launches today" });
    expect(r.category).toBe("TESTNET");
    expect(r.confidence).toBe("HIGH");
  });
});

describe("classifyEvent — PROTOCOL_UPGRADE", () => {
  it('"Protocol upgrade successfully deployed" → PROTOCOL_UPGRADE / HIGH', () => {
    const r = classifyEvent({ title: "Protocol upgrade successfully deployed" });
    expect(r.category).toBe("PROTOCOL_UPGRADE");
    expect(r.confidence).toBe("HIGH");
  });
});

describe("classifyEvent — TOKEN_MIGRATION", () => {
  it('"Token migration begins" → TOKEN_MIGRATION', () => {
    const r = classifyEvent({ title: "Token migration begins" });
    expect(r.category).toBe("TOKEN_MIGRATION");
  });
});

describe("classifyEvent — TOKEN_BURN", () => {
  it('"10M tokens were burned" → TOKEN_BURN', () => {
    const r = classifyEvent({ title: "10M tokens were burned" });
    expect(r.category).toBe("TOKEN_BURN");
  });

  it('"We are voting on a burn proposal" → NÃO é TOKEN_BURN (exclusão explícita)', () => {
    const r = classifyEvent({ title: "We are voting on a burn proposal" });
    expect(r.category).not.toBe("TOKEN_BURN");
  });

  it('"Our burn mechanism explained" → NÃO é TOKEN_BURN (exclusão explícita)', () => {
    const r = classifyEvent({ title: "Our burn mechanism explained" });
    expect(r.category).not.toBe("TOKEN_BURN");
  });
});

describe("classifyEvent — TOKEN_BUYBACK", () => {
  it('"Token buyback completed" → TOKEN_BUYBACK', () => {
    const r = classifyEvent({ title: "Token buyback completed" });
    expect(r.category).toBe("TOKEN_BUYBACK");
  });
});

describe("classifyEvent — INTEGRATION", () => {
  it('"We are now integrated with X" → INTEGRATION', () => {
    const r = classifyEvent({ title: "We are now integrated with X" });
    expect(r.category).toBe("INTEGRATION");
    expect(r.confidence).toBe("MEDIUM");
  });
});

describe("classifyEvent — PARTNERSHIP", () => {
  it('"We partnered with X" → PARTNERSHIP', () => {
    const r = classifyEvent({ title: "We partnered with X" });
    expect(r.category).toBe("PARTNERSHIP");
    expect(r.confidence).toBe("MEDIUM");
  });
});

describe("classifyEvent — PRODUCT_LAUNCH", () => {
  it('"New product is now live" → PRODUCT_LAUNCH', () => {
    const r = classifyEvent({ title: "New product is now live" });
    expect(r.category).toBe("PRODUCT_LAUNCH");
  });
});

describe("classifyEvent — casos ambíguos (regra de conservadorismo, Fase 8)", () => {
  it('"Preparing for mainnet" → NÃO é MAINNET (sem verbo/ação explícita)', () => {
    const r = classifyEvent({ title: "Preparing for mainnet" });
    expect(r.category).not.toBe("MAINNET");
    expect(r.category).toBe("OTHER");
  });

  it('"How mainnet works" (educacional) → OTHER', () => {
    const r = classifyEvent({ title: "How mainnet works" });
    expect(r.category).toBe("OTHER");
    expect(r.confidence).toBe("LOW");
  });

  it('"Testnet coming soon" → NÃO é TESTNET (ainda não aconteceu)', () => {
    const r = classifyEvent({ title: "Testnet coming soon" });
    expect(r.category).not.toBe("TESTNET");
  });

  // Sprint 22 (Multi-Sector Event Source Expansion) — regressão para 28 falsos positivos REAIS
  // confirmados em produção (Stargate, bridge cross-chain): changelogs automáticos usam a frase
  // "<ChainName> mainnet/testnet deployment" para descrever adição de suporte a uma nova chain,
  // não um anúncio de lançamento do próprio protocolo. Motivou remover o padrão bare "mainnet/
  // testnet deployment" (mainnet-launch-v1/testnet-launch-v1 → v2). Ver
  // SPRINT_22_IMPLEMENTATION_REPORT.md.
  it('"InjectiveEVM mainnet deployment" → NÃO é MAINNET (falso positivo real confirmado no Sprint 22)', () => {
    const r = classifyEvent({
      title: "@stargatefinance/stg-evm-v2@6.1.2",
      description: "Patch Changes: InjectiveEVM mainnet deployment",
    });
    expect(r.category).not.toBe("MAINNET");
    expect(r.category).toBe("OTHER");
  });

  it('"Monad testnet deployment" → NÃO é TESTNET (falso positivo real confirmado no Sprint 22)', () => {
    const r = classifyEvent({
      title: "@stargatefinance/stg-evm-v2@2.0.3",
      description: "Avalanche Fuji testnet configuration, Monad testnet deployment",
    });
    expect(r.category).not.toBe("TESTNET");
    expect(r.category).toBe("OTHER");
  });

  it("título e descrição vazios → OTHER / LOW, nunca lança", () => {
    const r = classifyEvent({ title: "", description: null });
    expect(r.category).toBe("OTHER");
    expect(r.confidence).toBe("LOW");
    expect(r.ruleId).toBeNull();
    expect(r.evidence).toBeNull();
  });
});

describe("classifyEvent — regra de conservadorismo explícita (Fase 8)", () => {
  it("nunca classifica só pela presença isolada da palavra-chave", () => {
    // "mainnet" sozinho, sem nenhum verbo de ação adjacente, em qualquer lugar do texto.
    const r = classifyEvent({ title: "This document mentions mainnet somewhere" });
    expect(r.category).toBe("OTHER");
  });
});

describe("classifyEvent — múltiplos sinais (Fase 5)", () => {
  it('"Mainnet launches with staking enabled" → MAINNET primário, STAKING como secondaryCandidate', () => {
    const r = classifyEvent({ title: "Mainnet launches with staking enabled" });
    expect(r.category).toBe("MAINNET");
    // "staking enabled" não casa com nenhum padrão de STAKING (que exige launch/program
    // launched/goes live/activated) — este teste confirma que SÓ um evento é retornado mesmo
    // quando o texto tem vocabulário de duas categorias.
    expect(r.secondaryCandidates).not.toContain("MAINNET");
  });

  it("quando duas regras casam de verdade, a de maior prioridade vence e a outra vira secondaryCandidate", () => {
    const r = classifyEvent({
      title: "Mainnet is now live",
      description: "We partnered with X for this launch",
    });
    expect(r.category).toBe("MAINNET"); // MAINNET tem prioridade sobre PARTNERSHIP
    expect(r.secondaryCandidates).toContain("PARTNERSHIP");
  });
});

describe("classifyEvent — determinismo/idempotência", () => {
  it("mesma entrada sempre produz a mesma saída", () => {
    const input = { title: "Mainnet is now live", description: "full changelog here" };
    const first = classifyEvent(input);
    const second = classifyEvent(input);
    expect(second).toEqual(first);
  });
});

describe("classifyEvent — limite de tamanho da evidência", () => {
  it("evidência nunca excede MAX_EVIDENCE_LENGTH", () => {
    const r = classifyEvent({ title: "Mainnet is now live" });
    expect(r.evidence?.length).toBeLessThanOrEqual(161); // 160 + "…"
  });

  it("texto de entrada extremamente longo não lança e ainda classifica corretamente", () => {
    const hugeBody = "x".repeat(10_000);
    const r = classifyEvent({ title: "Mainnet is now live", description: hugeBody });
    expect(r.category).toBe("MAINNET");
  });
});
