import { loadTestEnv } from "../../../scripts/test-env";

// Carrega o .env da raiz e redireciona DATABASE_URL/REDIS_URL para o banco e o Redis de
// testes (nunca os dados de dev) — ver scripts/test-env.ts.
loadTestEnv();
