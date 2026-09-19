import { describe, expect, it } from "vitest";
import { isValidGithubRepo, isValidSnapshotSpace } from "../src/external-identity";

// Sprint 19 (External Identity Mapping) — validadores anti-SSRF. Testa explicitamente os casos
// proibidos citados na Parte 21 do documento de especificação: "javascript:", "file:",
// "http://127.0.0.1", "localhost", IP interno, injeção de credencial.
describe("isValidGithubRepo", () => {
  it("aceita formato owner/repo válido", () => {
    expect(isValidGithubRepo("aave/aave-v3-core")).toBe(true);
    expect(isValidGithubRepo("Uniswap/v3-core")).toBe(true);
    expect(isValidGithubRepo("a/b")).toBe(true);
  });

  it("rejeita URLs completas e protocolos", () => {
    expect(isValidGithubRepo("https://github.com/aave/aave-v3-core")).toBe(false);
    expect(isValidGithubRepo("javascript:alert(1)")).toBe(false);
    expect(isValidGithubRepo("file:///etc/passwd")).toBe(false);
    expect(isValidGithubRepo("http://127.0.0.1/aave/v3")).toBe(false);
  });

  it("rejeita ausência de owner/repo, espaços, path traversal", () => {
    expect(isValidGithubRepo("aave")).toBe(false);
    expect(isValidGithubRepo("aave/../secrets")).toBe(false);
    expect(isValidGithubRepo("aave repo/v3")).toBe(false);
    expect(isValidGithubRepo("")).toBe(false);
    expect(isValidGithubRepo("owner@host/repo")).toBe(false);
  });
});

describe("isValidSnapshotSpace", () => {
  it("aceita slugs válidos", () => {
    expect(isValidSnapshotSpace("ens.eth")).toBe(true);
    expect(isValidSnapshotSpace("uniswap")).toBe(true);
    expect(isValidSnapshotSpace("aave.eth")).toBe(true);
  });

  it("rejeita URLs, protocolos e localhost/IP interno", () => {
    expect(isValidSnapshotSpace("https://hub.snapshot.org/#/ens.eth")).toBe(false);
    expect(isValidSnapshotSpace("javascript:alert(1)")).toBe(false);
    expect(isValidSnapshotSpace("http://localhost/x")).toBe(false);
    expect(isValidSnapshotSpace("http://127.0.0.1")).toBe(false);
  });

  it("rejeita espaços, path traversal, string vazia", () => {
    expect(isValidSnapshotSpace("ens space.eth")).toBe(false);
    expect(isValidSnapshotSpace("../ens.eth")).toBe(false);
    expect(isValidSnapshotSpace("")).toBe(false);
  });
});
