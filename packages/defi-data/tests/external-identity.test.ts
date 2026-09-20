import { describe, expect, it } from "vitest";
import {
  discourseForumOrigin,
  isValidDiscourseForumUrl,
  isValidGithubRepo,
  isValidSnapshotSpace,
} from "../src/external-identity";

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

// Sprint 23 (Discourse Governance Intelligence) — validação de forma de URL, já que (diferente
// de GitHub/Snapshot) o host varia por projeto e não pode usar allowlist fixa.
describe("isValidDiscourseForumUrl", () => {
  it("aceita URLs HTTPS reais de fóruns oficiais (confirmadas ao vivo nesta sprint)", () => {
    expect(isValidDiscourseForumUrl("https://governance.aave.com")).toBe(true);
    expect(isValidDiscourseForumUrl("https://gov.uniswap.org")).toBe(true);
  });

  it("rejeita esquema não-HTTPS", () => {
    expect(isValidDiscourseForumUrl("http://governance.aave.com")).toBe(false);
    expect(isValidDiscourseForumUrl("javascript:alert(1)")).toBe(false);
    expect(isValidDiscourseForumUrl("file:///etc/passwd")).toBe(false);
    expect(isValidDiscourseForumUrl("ftp://example.com")).toBe(false);
  });

  it("rejeita localhost e IPs privados/loopback", () => {
    expect(isValidDiscourseForumUrl("https://localhost")).toBe(false);
    expect(isValidDiscourseForumUrl("https://127.0.0.1")).toBe(false);
    expect(isValidDiscourseForumUrl("https://0.0.0.0")).toBe(false);
    expect(isValidDiscourseForumUrl("https://10.0.0.5")).toBe(false);
    expect(isValidDiscourseForumUrl("https://172.16.0.1")).toBe(false);
    expect(isValidDiscourseForumUrl("https://192.168.1.1")).toBe(false);
    expect(isValidDiscourseForumUrl("https://169.254.169.254")).toBe(false); // metadata endpoint (cloud SSRF clássico)
  });

  it("rejeita injeção de credencial e hostname sem ponto (host interno)", () => {
    expect(isValidDiscourseForumUrl("https://user:pass@governance.aave.com")).toBe(false);
    expect(isValidDiscourseForumUrl("https://internal-service")).toBe(false);
  });

  it("rejeita espaços e string vazia, nunca lança", () => {
    expect(isValidDiscourseForumUrl("https://exa mple.com")).toBe(false);
    expect(isValidDiscourseForumUrl("")).toBe(false);
    expect(isValidDiscourseForumUrl("not a url")).toBe(false);
  });
});

describe("discourseForumOrigin", () => {
  it("normaliza para origin puro, descartando path/query/hash", () => {
    expect(discourseForumOrigin("https://governance.aave.com/latest?x=1#y")).toBe(
      "https://governance.aave.com",
    );
  });
});
