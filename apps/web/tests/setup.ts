import { config } from "dotenv";
import { resolve } from "node:path";

// Sprint 19: era "../../.env" (2 níveis), resolvendo para apps/.env (inexistente) em vez da
// raiz do monorepo — apps/web/tests está 3 níveis abaixo da raiz (tests -> web -> apps -> raiz),
// mesma profundidade de packages/research-engine/tests (tests -> research-engine -> packages ->
// raiz), que já usa "../../../.env" corretamente. Causa raiz de 12 testes falhando com
// "DATABASE_URL not found"/health check 503 (DATABASE_URL nunca era carregado).
config({ path: resolve(__dirname, "../../../.env") });
