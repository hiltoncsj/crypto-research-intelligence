---
name: verify
description: Run lint, typecheck, and tests across the whole monorepo (all npm workspaces plus the workers' separate tsconfig) before considering a change complete. Use after finishing an implementation task or before saying work is done.
---

Run, in order, stopping and reporting on the first failure:

1. `npm run lint` — ESLint flat config across all workspaces.
2. `npm run typecheck` — runs `typecheck` in every workspace plus `tsc --noEmit -p infrastructure/workers/tsconfig.json` (workers have their own tsconfig, checked separately from `apps/web`/`packages/*`).
3. `npm test` — runs `vitest run` in every workspace. Integration tests hit a real Postgres/Redis and DefiLlama's real API (`api.llama.fi`); DefiLlama-dependent tests skip automatically when offline — never treat that skip as a failure.

Known non-regressions to not chase if they reproduce exactly as described:

- `funding-and-capital.integration.test.ts`: all 50 tests pass individually; only the suite's `afterAll` cleanup fails (deletes `investor` before `funding_round_investors`).
- `kanban-repository.integration.test.ts` under the full parallel `npm test` run: can fail on WIP Limit contention with `discovery.integration.test.ts` (both touch the shared seeded Kanban board). Run it isolated (`npx vitest run tests/kanban-repository.integration.test.ts`) to confirm it's this known issue and not a real regression.

Report results per workspace, not just a pass/fail summary — name which workspace and which command failed so the failure is actionable.
