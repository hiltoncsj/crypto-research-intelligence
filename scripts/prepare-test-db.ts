import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

import { loadTestEnv, testDatabaseName } from "./test-env";

// `pretest` de `npm test`: cria o banco de testes (se não existir) e aplica as migrations nele.
// Idempotente — roda a cada `npm test`. Nunca toca o banco de dev (loadTestEnv recusa qualquer
// banco que não termine em `_test`).

async function main(): Promise<void> {
  loadTestEnv();
  const testDbUrl = process.env.DATABASE_URL!;
  const dbName = testDatabaseName(testDbUrl);

  const adminUrl = new URL(testDbUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existing = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      // Nome vem do próprio DATABASE_URL e já foi validado (termina em `_test`); CREATE
      // DATABASE não aceita parâmetro, então o identificador é citado.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(
        JSON.stringify({ event: "test_db.created", timestamp: new Date().toISOString(), dbName }),
      );
    }
  } finally {
    await admin.$disconnect();
  }

  execSync(
    `npx prisma migrate deploy --schema ${resolve(dirname(fileURLToPath(import.meta.url)), "../packages/database/prisma/schema.prisma")}`,
    { stdio: "inherit", env: process.env },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
