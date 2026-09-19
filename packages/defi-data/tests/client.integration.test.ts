import { describe, expect, it } from "vitest";
import { getProtocols } from "../src/client.js";

// Integração real contra o endpoint público do DefiLlama (regra anti-mock do roadmap #64).
// Pula automaticamente se a máquina estiver offline, em vez de falhar o CI por causa de
// rede indisponível.
let online = true;
try {
  const probe = await fetch("https://api.llama.fi/protocols", { method: "HEAD" }).catch(() => null);
  online = probe !== null;
} catch {
  online = false;
}

describe.skipIf(!online)("DefiLlama client (integration, real network)", () => {
  it("getProtocols() returns real, normalized data", async () => {
    const { raw, normalized } = await getProtocols();

    expect(raw.error).toBeNull();
    expect(raw.httpStatus).toBe(200);
    expect(normalized).not.toBeNull();
    expect(normalized!.length).toBeGreaterThan(0);

    const first = normalized![0]!;
    expect(first.source).toBe("DEFILLAMA");
    expect(typeof first.name).toBe("string");
    expect(typeof first.retrievedAt).toBe("string");
  }, 20_000);
});
