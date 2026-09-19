import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";

// Integração real contra o Postgres do docker-compose (seção 17 do plano — sem mock de banco).
// Usa um provider único por execução para não colidir com dados de outros testes/execuções.

describe("ApiConnection (Prisma, integração real)", () => {
  const testProvider = `TEST_PROVIDER_${randomUUID()}`;

  afterAll(async () => {
    await prisma.apiConnection.deleteMany({
      where: { provider: { startsWith: "TEST_PROVIDER_" } },
    });
    await prisma.$disconnect();
  });

  it("cria uma conexão (create)", async () => {
    const created = await prisma.apiConnection.create({
      data: { provider: testProvider, name: "Test Provider" },
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("NOT_CONFIGURED");
    expect(created.encryptedSecret).toBeNull();
  });

  it("lê a conexão criada (read)", async () => {
    const found = await prisma.apiConnection.findUnique({ where: { provider: testProvider } });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Provider");
  });

  it("atualiza status/lastTestedAt (update)", async () => {
    const updated = await prisma.apiConnection.update({
      where: { provider: testProvider },
      data: { status: "REAL", lastTestedAt: new Date() },
    });
    expect(updated.status).toBe("REAL");
    expect(updated.lastTestedAt).not.toBeNull();
  });

  it("rejeita provider duplicado (unique constraint)", async () => {
    await expect(
      prisma.apiConnection.create({ data: { provider: testProvider, name: "Duplicado" } }),
    ).rejects.toThrow();
  });

  it("nunca persiste um campo `api_key_plaintext` (schema não expõe esse campo)", async () => {
    const found = await prisma.apiConnection.findUnique({ where: { provider: testProvider } });
    expect(found).not.toHaveProperty("api_key_plaintext");
    expect(found).not.toHaveProperty("apiKeyPlaintext");
  });
});
