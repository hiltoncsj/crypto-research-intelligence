import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry } from "../src/http-client.js";

const BASE = "https://api.llama.fi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchJsonWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("successful request returns normalized payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hello: "world" })));

    const result = await fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      allowlist: ["api.llama.fi"],
    });

    expect(result.error).toBeNull();
    expect(result.httpStatus).toBe(200);
    expect(result.payload).toEqual({ hello: "world" });
  });

  it("timeout is retried then fails after max attempts", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      timeoutMs: 10,
      maxAttempts: 2,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.error).toContain("Timeout");
    expect(result.payload).toBeNull();
  });

  it("HTTP 429 is retryable and eventually fails with error set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      maxAttempts: 3,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.httpStatus).toBe(429);
    expect(result.error).toContain("429");
  });

  it("HTTP 5xx is retryable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      maxAttempts: 2,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.error).toContain("503");
  });

  it("HTTP 400 is non-retryable (fails immediately)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      maxAttempts: 3,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.httpStatus).toBe(400);
  });

  it("HTTP 401/403 are non-retryable", async () => {
    for (const status of [401, 403]) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchJsonWithRetry(`${BASE}/protocols`, {
        provider: "DEFILLAMA",
        endpoint: "/protocols",
        maxAttempts: 3,
        baseDelayMs: 1,
        allowlist: ["api.llama.fi"],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.httpStatus).toBe(status);
    }
  });

  it("malformed JSON response is rejected without retry", async () => {
    const badResponse = new Response("{not valid json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn().mockResolvedValue(badResponse);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      maxAttempts: 3,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toContain("inválida");
  });

  it("empty response body is treated as failure, not silently accepted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      allowlist: ["api.llama.fi"],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toContain("vazia");
  });

  it("rejects requests to domains outside the allowlist (anti-SSRF)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithRetry("https://evil.example.com/steal", {
        provider: "DEFILLAMA",
        endpoint: "/steal",
        allowlist: ["api.llama.fi"],
      }),
    ).rejects.toThrow(/Domínio não permitido/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connection reset (network TypeError) is retryable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchJsonWithRetry(`${BASE}/protocols`, {
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      maxAttempts: 2,
      baseDelayMs: 1,
      allowlist: ["api.llama.fi"],
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
    expect(result.payload).toEqual({ ok: true });
  });
});
