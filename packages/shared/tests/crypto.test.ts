import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, DecryptionError, encrypt, EncryptionConfigError } from "../src/crypto.js";

// Nunca usar API keys reais em teste — apenas segredos sintéticos.
const FAKE_SECRET = "fake-api-key-do-not-use-in-prod-12345";

function validKeyHex(): string {
  return randomBytes(32).toString("hex");
}

describe("crypto service (AES-256-GCM)", () => {
  const originalKey = process.env.MASTER_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = validKeyHex();
  });

  afterEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("1. encrypt → decrypt retorna o valor original", () => {
    const payload = encrypt(FAKE_SECRET);
    expect(decrypt(payload)).toBe(FAKE_SECRET);
  });

  it("2. dois encrypts do mesmo valor produzem ciphertext diferente (IV único)", () => {
    const a = encrypt(FAKE_SECRET);
    const b = encrypt(FAKE_SECRET);
    expect(a).not.toBe(b);

    const parsedA = JSON.parse(Buffer.from(a, "base64").toString("utf8"));
    const parsedB = JSON.parse(Buffer.from(b, "base64").toString("utf8"));
    expect(parsedA.iv).not.toBe(parsedB.iv);
  });

  it("3. alteração do ciphertext falha", () => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    const lastChar = parsed.ciphertext.at(-1);
    parsed.ciphertext = parsed.ciphertext.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    const tampered = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64");
    expect(() => decrypt(tampered)).toThrow(DecryptionError);
  });

  it("4. alteração do authTag falha", () => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    const lastChar = parsed.authTag.at(-1);
    parsed.authTag = parsed.authTag.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    const tampered = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64");
    expect(() => decrypt(tampered)).toThrow(DecryptionError);
  });

  // Regressão da auditoria: o tamanho da authTag precisa ser exatamente 16 bytes. Uma tag truncada
  // (prefixo da tag verdadeira) enfraquece a autenticação do GCM se o decipher a aceitar.
  it.each([1, 4, 8, 12, 15])("4b. authTag truncada para %i byte(s) é rejeitada", (bytes) => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    parsed.authTag = parsed.authTag.slice(0, bytes * 2);
    const tampered = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64");
    expect(() => decrypt(tampered)).toThrow(DecryptionError);
  });

  it("4c. authTag maior que 16 bytes é rejeitada", () => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    parsed.authTag = parsed.authTag + "00";
    const tampered = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64");
    expect(() => decrypt(tampered)).toThrow(DecryptionError);
  });

  it("5. alteração do IV falha", () => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    const lastChar = parsed.iv.at(-1);
    parsed.iv = parsed.iv.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    const tampered = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64");
    expect(() => decrypt(tampered)).toThrow(DecryptionError);
  });

  it("6. ausência de MASTER_ENCRYPTION_KEY falha claramente", () => {
    delete process.env.MASTER_ENCRYPTION_KEY;
    expect(() => encrypt(FAKE_SECRET)).toThrow(EncryptionConfigError);
  });

  it("7. chave inválida (tamanho/formato errado) falha", () => {
    process.env.MASTER_ENCRYPTION_KEY = "chave-muito-curta";
    expect(() => encrypt(FAKE_SECRET)).toThrow(EncryptionConfigError);
  });

  it("8. nenhum plaintext aparece em logs (console.*) durante encrypt/decrypt", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const payload = encrypt(FAKE_SECRET);
    decrypt(payload);

    for (const spy of [logSpy, errorSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain(FAKE_SECRET);
      }
    }
  });

  it("9. payload possui campo de versão", () => {
    const payload = encrypt(FAKE_SECRET);
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    expect(parsed.v).toBe(1);
    expect(parsed.alg).toBe("aes-256-gcm");
  });

  it("10. payload malformado é rejeitado", () => {
    expect(() => decrypt("isso-nao-e-base64-json-valido")).toThrow(DecryptionError);
    const notJson = Buffer.from("nao e json", "utf8").toString("base64");
    expect(() => decrypt(notJson)).toThrow(DecryptionError);
    const missingFields = Buffer.from(
      JSON.stringify({ v: 1, alg: "aes-256-gcm" }),
      "utf8",
    ).toString("base64");
    expect(() => decrypt(missingFields)).toThrow(DecryptionError);
  });
});
