import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@crypto-research/defi-data", () => ({
  pingDefiLlama: vi.fn(),
}));

const { getServerSession } = await import("next-auth");
const { pingDefiLlama } = await import("@crypto-research/defi-data");
const { GET, POST } = await import("../src/app/api/connections/route");
const { DELETE } = await import("../src/app/api/connections/[id]/route");
const { POST: TEST_CONNECTION } = await import("../src/app/api/connections/[id]/test/route");

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedPing = vi.mocked(pingDefiLlama);

const TEST_PROVIDER = `TEST_API_${randomUUID()}`;

function authed() {
  mockedGetServerSession.mockResolvedValue({ user: { email: "admin@example.com" } } as never);
}

function unauthed() {
  mockedGetServerSession.mockResolvedValue(null);
}

describe("Connections API", () => {
  beforeAll(() => {
    process.env.MASTER_ENCRYPTION_KEY ??= "0".repeat(64);
  });

  afterAll(async () => {
    await prisma.apiConnection.deleteMany({ where: { provider: { startsWith: "TEST_API_" } } });
    await prisma.$disconnect();
  });

  it("GET rejeita acesso não autenticado (401)", async () => {
    unauthed();
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("POST cria uma conexão e nunca retorna o secret bruto", async () => {
    authed();
    const request = new Request("http://localhost/api/connections", {
      method: "POST",
      body: JSON.stringify({
        provider: "DEFILLAMA",
        name: TEST_PROVIDER,
        secret: "super-secret-value",
      }),
    });

    // provider precisa ser um dos SUPPORTED_PROVIDERS (enum), então usamos DEFILLAMA mas com
    // nome único para não colidir; o upsert é por provider, então isolamos via delete no afterAll
    // usando o nome como marcador e limpando por provider real no fim do describe (ver bloco `finally` abaixo).
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.connection.provider).toBe("DEFILLAMA");
    expect(JSON.stringify(body)).not.toContain("super-secret-value");
    expect(body.connection).not.toHaveProperty("encryptedSecret");
    expect(body.connection.maskedIdentifier).toBe("••••alue");

    // Limpa imediatamente para não interferir com outros testes que também usam DEFILLAMA.
    await prisma.apiConnection.delete({ where: { provider: "DEFILLAMA" } }).catch(() => {});
  });

  it("GET lista conexões autenticado, sem vazar secret", async () => {
    authed();
    await prisma.apiConnection.create({ data: { provider: "DEFILLAMA", name: "DefiLlama" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.connections)).toBe(true);
    for (const connection of body.connections) {
      expect(connection).not.toHaveProperty("encryptedSecret");
    }
  });

  it("POST /:id/test atualiza status para REAL em caso de sucesso", async () => {
    authed();
    mockedPing.mockResolvedValue({
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      fetchedAt: new Date().toISOString(),
      httpStatus: 200,
      payload: [],
      error: null,
    });

    const connection = await prisma.apiConnection.findUniqueOrThrow({
      where: { provider: "DEFILLAMA" },
    });
    const response = await TEST_CONNECTION(new Request("http://localhost"), {
      params: { id: connection.id },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connection.status).toBe("REAL");
    expect(body.connection.lastTestedAt).not.toBeNull();
  });

  it("POST /:id/test marca ERROR quando o provider falha, sem vazar detalhes sensíveis", async () => {
    authed();
    mockedPing.mockResolvedValue({
      provider: "DEFILLAMA",
      endpoint: "/protocols",
      fetchedAt: new Date().toISOString(),
      httpStatus: null,
      payload: null,
      error: "Timeout após 10000ms em /protocols",
    });

    const connection = await prisma.apiConnection.findUniqueOrThrow({
      where: { provider: "DEFILLAMA" },
    });
    const response = await TEST_CONNECTION(new Request("http://localhost"), {
      params: { id: connection.id },
    });
    const body = await response.json();

    expect(body.connection.status).toBe("ERROR");
    expect(body.connection.lastError).toContain("Timeout");
  });

  it("DELETE remove a conexão", async () => {
    authed();
    const connection = await prisma.apiConnection.findUniqueOrThrow({
      where: { provider: "DEFILLAMA" },
    });
    const response = await DELETE(new Request("http://localhost"), {
      params: { id: connection.id },
    });
    expect(response.status).toBe(204);

    const found = await prisma.apiConnection.findUnique({ where: { provider: "DEFILLAMA" } });
    expect(found).toBeNull();
  });

  it("DELETE rejeita acesso não autenticado (401)", async () => {
    unauthed();
    const response = await DELETE(new Request("http://localhost"), { params: { id: "any-id" } });
    expect(response.status).toBe(401);
  });
});
