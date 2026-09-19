import "dotenv/config";
import { reclassifyExistingGithubEvents } from "@crypto-research/research-engine";

// Sprint 20 (Fase 10 — Reclassificação de eventos existentes): script manual, não automático —
// só roda quando explicitamente invocado (`npm run reclassify-events`), nunca como parte da
// Research Run nem do scheduler. Só toca eventos `source: "GITHUB"` (nunca fontes estruturadas —
// ver comentário de `reclassifyExistingGithubEvents` em events-repository.ts). Idempotente:
// rodar de novo não duplica nem oscila.
//
// Uso: `npm run reclassify-events` (todos os projetos) ou
// `npm run reclassify-events -- --project=<projectId>` (um projeto específico).
async function main(): Promise<void> {
  const projectArg = process.argv.find((a) => a.startsWith("--project="));
  const projectId = projectArg ? projectArg.slice("--project=".length) : undefined;

  const result = await reclassifyExistingGithubEvents(projectId);
  console.log(
    JSON.stringify({
      event: "reclassify_events.completed",
      timestamp: new Date().toISOString(),
      projectId: projectId ?? "ALL",
      ...result,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(
      JSON.stringify({
        event: "reclassify_events.failed",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Erro desconhecido",
      }),
    );
    process.exit(1);
  });
