import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("smoke: /api/health", () => {
  it("responde 200 com status ok", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      application: "healthy",
      database: "healthy",
      redis: "connected",
    });
  });
});
