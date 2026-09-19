import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { acquireLock, releaseLock, renewLock } from "../src/lock";
import { closeRedisConnection, createRedisConnection } from "../src/connection";

// Sprint 4 (Fase 21/9): lock distribuído real contra o Redis do docker-compose (não mockado —
// mesma filosofia anti-mock das integrações anteriores do projeto).

describe("lock distribuído (Redis, integração real)", () => {
  const clientA = createRedisConnection();
  const clientB = createRedisConnection();

  afterAll(async () => {
    await clientA.quit();
    await clientB.quit();
    await closeRedisConnection();
  });

  it("primeiro worker adquire o lock", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lock = await acquireLock(key, 5_000, clientA);
    expect(lock).not.toBeNull();
    await releaseLock(lock!, clientA);
  });

  it("segundo worker não consegue adquirir um lock já detido", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lockA = await acquireLock(key, 5_000, clientA);
    expect(lockA).not.toBeNull();

    const lockB = await acquireLock(key, 5_000, clientB);
    expect(lockB).toBeNull();

    await releaseLock(lockA!, clientA);
  });

  it("TTL expira e libera o lock automaticamente", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lockA = await acquireLock(key, 200, clientA);
    expect(lockA).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 400));

    const lockB = await acquireLock(key, 5_000, clientB);
    expect(lockB).not.toBeNull();
    await releaseLock(lockB!, clientB);
  });

  it("renovação estende o TTL do lock atual", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lockA = await acquireLock(key, 300, clientA);
    expect(lockA).not.toBeNull();

    const renewed = await renewLock(lockA!, 5_000, clientA);
    expect(renewed).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Ainda deveria estar bloqueado (renovamos para 5s antes do TTL original de 300ms expirar).
    const lockB = await acquireLock(key, 1_000, clientB);
    expect(lockB).toBeNull();

    await releaseLock(lockA!, clientA);
  });

  it("liberar um lock que já expirou/foi tomado por outro dono não afeta o novo dono", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lockA = await acquireLock(key, 100, clientA);
    expect(lockA).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 200)); // expira
    const lockB = await acquireLock(key, 5_000, clientB);
    expect(lockB).not.toBeNull();

    const releasedByA = await releaseLock(lockA!, clientA);
    expect(releasedByA).toBe(false); // token não confere mais — não libera o lock do B

    const stillLockedForC = await acquireLock(key, 1_000, clientA);
    expect(stillLockedForC).toBeNull();

    await releaseLock(lockB!, clientB);
  });

  it("não deixa lock permanente: liberado normalmente ao final", async () => {
    const key = `test-lock-${randomUUID()}`;
    const lock = await acquireLock(key, 5_000, clientA);
    await releaseLock(lock!, clientA);

    const reacquired = await acquireLock(key, 1_000, clientB);
    expect(reacquired).not.toBeNull();
    await releaseLock(reacquired!, clientB);
  });
});
