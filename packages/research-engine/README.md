# @crypto-research/research-engine

Implementado no Sprint 3. Responsável por:

- `validator.ts` — valida pontos de série temporal (TVL/Revenue/Fees) antes da persistência; classifica em `VALID`/`SUSPICIOUS`/`INVALID`/`MISSING`.
- `metrics.ts` — cálculo puramente funcional de growth 7d/30d/90d (sem acesso a banco).
- `snapshot-repository.ts` — persistência idempotente dos snapshots (Prisma), com deduplicação por `(projectId, source, sourceTimestamp)`.
- `pipeline.ts` — orquestra Collector (`@crypto-research/defi-data`) → Normalizer → Validator → Persist → Metrics para uma lista fixa de projetos de desenvolvimento (`FIXED_DEV_PROJECT_SLUGS`).

Não inclui: scheduler automático, fila (BullMQ/Redis), score/ranking — isso é de sprints futuras.
