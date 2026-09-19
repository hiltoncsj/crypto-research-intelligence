import IORedis, { type Redis } from "ioredis";

// Sprint 4 (Fase 15): conexão Redis compartilhada pela Queue, pelo Worker e pelo lock
// distribuído. BullMQ exige `maxRetriesPerRequest: null` na conexão usada por Workers
// (documentado pela própria lib) — usamos essa mesma conexão em todos os contextos para não
// duplicar configuração.

let sharedConnection: Redis | null = null;

export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurada.");
  }
  return url;
}

export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
    });
  }
  return sharedConnection;
}

/** Cria uma conexão Redis independente (usada por testes que precisam de dois clientes distintos). */
export function createRedisConnection(): Redis {
  return new IORedis(getRedisUrl(), { maxRetriesPerRequest: null });
}

export async function pingRedis(): Promise<boolean> {
  try {
    const conn = getRedisConnection();
    const result = await conn.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
