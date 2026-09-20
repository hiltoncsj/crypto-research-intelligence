import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJsonWithRetry } from "../src/http-client.js";

// Regressão da auditoria: redirects não podem contornar a allowlist anti-SSRF. Servidor HTTP
// REAL local (nenhuma API externa e nenhum mock de fetch) — `127.0.0.1` é o host permitido e
// `localhost` é o host "fora da allowlist" (mesmo servidor, nome diferente).
describe("fetchJsonWithRetry — redirects e allowlist", () => {
  let server: Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.headers.host}${req.url}`);
      const path = req.url ?? "";
      if (path === "/ok") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      } else if (path === "/same-host") {
        res.writeHead(302, { location: "/ok" });
        res.end();
      } else if (path === "/other-host") {
        res.writeHead(302, { location: `http://localhost:${port}/ok` });
        res.end();
      } else if (path === "/loop") {
        res.writeHead(302, { location: "/loop" });
        res.end();
      } else if (path === "/no-location") {
        res.writeHead(302);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const call = (path: string) =>
    fetchJsonWithRetry(`http://127.0.0.1:${port}${path}`, {
      provider: "TEST",
      endpoint: path,
      allowlist: ["127.0.0.1"],
      maxAttempts: 1,
    });

  it("segue redirect para o MESMO host permitido", async () => {
    const result = await call("/same-host");
    expect(result.error).toBeNull();
    expect(result.payload).toEqual({ ok: true });
  });

  it("bloqueia redirect para host fora da allowlist — a requisição nunca chega lá", async () => {
    hits.length = 0;
    const result = await call("/other-host");
    expect(result.payload).toBeNull();
    expect(result.error).toContain("Domínio não permitido");
    expect(hits.some((h) => h.startsWith("localhost:"))).toBe(false);
  });

  it("limita a quantidade de redirects (loop) sem retry", async () => {
    const result = await call("/loop");
    expect(result.payload).toBeNull();
    expect(result.error).toContain("Redirecionamentos demais");
  });

  it("3xx sem Location é erro, nunca payload", async () => {
    const result = await call("/no-location");
    expect(result.payload).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
