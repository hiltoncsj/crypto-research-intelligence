---
name: verify
description: Run lint, typecheck, and tests across the whole monorepo (all npm workspaces plus the workers' separate tsconfig) before considering a change complete. Use after finishing an implementation task or before saying work is done.
---

Run, in order, stopping and reporting on the first failure:

1. `npm run lint` — ESLint flat config across all workspaces.
2. `npm run typecheck` — runs `typecheck` in every workspace plus `tsc --noEmit -p infrastructure/workers/tsconfig.json` (workers have their own tsconfig, checked separately from `apps/web`/`packages/*`).
3. `npm test` — runs `vitest run` in every workspace. Integration tests hit a real Postgres/Redis and DefiLlama's real API (`api.llama.fi`); DefiLlama-dependent tests skip automatically when offline — never treat that skip as a failure.

Report results per workspace, not just a pass/fail summary — name which workspace and which command failed so the failure is actionable.
