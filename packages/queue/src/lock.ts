import type { Redis } from "ioredis";
import { getRedisConnection } from "./connection";

// Sprint 4 (Fase 5): lock distribuído via Redis (SET NX PX + renovação). Não usamos uma lib
// como redlock porque um único nó Redis com SET NX + TTL já resolve o caso real do MVP (um
// único servidor Redis, não um cluster multi-master) sem trazer mais uma dependência — se o
// projeto crescer para Redis Cluster/Sentinel, reavaliar.

export const RESEARCH_AGENT_LOCK_KEY = "research-agent-lock";

/** TTL generoso: o pipeline atual leva 2-5min para 3 projetos (Sprint 3, Known Limitations). */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export interface DistributedLock {
  key: string;
  token: string;
}

/**
 * Tenta adquirir o lock. Retorna o lock (com um token único) se conseguiu, ou `null` se outro
 * processo já o detém — nunca bloqueia esperando (o chamador decide o que fazer: desistir,
 * marcar a run como falha, etc).
 */
export async function acquireLock(
  key: string = RESEARCH_AGENT_LOCK_KEY,
  ttlMs: number = DEFAULT_TTL_MS,
  redis: Redis = getRedisConnection(),
): Promise<DistributedLock | null> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await redis.set(key, token, "PX", ttlMs, "NX");
  return result === "OK" ? { key, token } : null;
}

/** Renova o TTL do lock — só se o token ainda for o dono atual (evita renovar o lock de outro processo). */
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export async function renewLock(
  lock: DistributedLock,
  ttlMs: number = DEFAULT_TTL_MS,
  redis: Redis = getRedisConnection(),
): Promise<boolean> {
  const result = await redis.eval(RENEW_SCRIPT, 1, lock.key, lock.token, ttlMs);
  return result === 1;
}

/** Libera o lock — só se o token ainda for o dono atual (evita liberar o lock de outro processo que já adquiriu depois de um TTL expirado). */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseLock(
  lock: DistributedLock,
  redis: Redis = getRedisConnection(),
): Promise<boolean> {
  const result = await redis.eval(RELEASE_SCRIPT, 1, lock.key, lock.token);
  return result === 1;
}

/**
 * Mantém o lock renovado periodicamente enquanto uma execução longa roda. Retorna uma função
 * de cleanup que deve ser chamada no `finally` do chamador (Fase 5: "liberado em caso de erro").
 */
export function startLockRenewal(
  lock: DistributedLock,
  ttlMs: number = DEFAULT_TTL_MS,
  redis: Redis = getRedisConnection(),
): () => void {
  const interval = setInterval(
    () => {
      void renewLock(lock, ttlMs, redis);
    },
    Math.floor(ttlMs / 2),
  );
  return () => clearInterval(interval);
}
