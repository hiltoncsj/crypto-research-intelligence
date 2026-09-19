import { defineConfig } from "vitest/config";

// Sprint 4: ao contrário de packages/database, este package não importa o Prisma Client
// (cujo runtime carrega .env como efeito colateral) — precisamos carregar dotenv
// explicitamente para que REDIS_URL exista em process.env durante os testes.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
