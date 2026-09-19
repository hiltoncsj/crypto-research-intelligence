import path from "node:path";
import { defineConfig } from "vitest/config";

// Testes de integração usam PrismaClient real (DATABASE_URL) — carregado explicitamente via
// dotenv em tests/setup.ts, seguindo o mesmo padrão de packages/queue (não há garantia de que o
// shell/CI já tenha a variável exportada antes de `npm test`).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
