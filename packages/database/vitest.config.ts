import { defineConfig } from "vitest/config";

// Testes de integração usam PrismaClient real (DATABASE_URL) — carregado explicitamente via
// dotenv em tests/setup.ts, seguindo o mesmo padrão de packages/queue (não há garantia de que o
// shell/CI já tenha a variável exportada antes de `npm test`).
export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 20_000,
    testTimeout: 20_000,
    setupFiles: ["./tests/setup.ts"],
  },
});
