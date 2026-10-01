import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Isola os testes dos dados de dev: carrega o `.env` da raiz e aponta DATABASE_URL/REDIS_URL para
// um banco e um database lógico do Redis só de testes. Antes os testes rodavam contra o mesmo
// `crypto_research` de dev, e em 2026-10-01 cleanups de teste apagaram dados reais (695 projetos
// e todas as Research Runs manuais). Usado pelos `tests/setup.ts` de cada workspace e por
// `scripts/prepare-test-db.ts` (`pretest`).

const TEST_DB_SUFFIX = "_test";
const TEST_REDIS_DB = "1"; // o worker real usa o database 0 (default)

/** Deriva `<banco>_test` do DATABASE_URL (mantém se já termina em `_test`). */
export function deriveTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName.endsWith(TEST_DB_SUFFIX)) url.pathname = `/${dbName}${TEST_DB_SUFFIX}`;
  return url.toString();
}

export function testDatabaseName(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, "");
}

export function loadTestEnv(): void {
  config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

  const baseDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseDbUrl) throw new Error("DATABASE_URL (ou TEST_DATABASE_URL) não configurada.");
  const testDbUrl = process.env.TEST_DATABASE_URL ?? deriveTestDatabaseUrl(baseDbUrl);
  if (!testDatabaseName(testDbUrl).endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Recusando rodar testes contra "${testDatabaseName(testDbUrl)}": o banco de testes precisa terminar em "${TEST_DB_SUFFIX}".`,
    );
  }
  process.env.DATABASE_URL = testDbUrl;

  const baseRedisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
  if (baseRedisUrl) {
    const redisUrl = new URL(baseRedisUrl);
    if (!process.env.TEST_REDIS_URL) redisUrl.pathname = `/${TEST_REDIS_DB}`;
    const redisDb = redisUrl.pathname.replace(/^\//, "") || "0";
    if (redisDb === "0") {
      throw new Error("Recusando rodar testes no database 0 do Redis (é o que o worker real usa).");
    }
    process.env.REDIS_URL = redisUrl.toString();
  }
}
