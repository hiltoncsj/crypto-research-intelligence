# V1 Operations — Crypto Research Intelligence

Documento operacional para rodar, fazer backup/restore, monitorar e recuperar o sistema em
deployment single-user/controlado (V1.0). Todos os comandos abaixo foram testados nesta sessão
(2026-09-22) ou já existem no `package.json`/CLAUDE.md do projeto — nenhum foi inventado.

## 1. Architecture

Monorepo npm workspaces: `apps/web` (Next.js 14, App Router) + `packages/{database,defi-data,
research-engine,scoring-engine,queue,shared}` + `infrastructure/{docker-compose.yml,workers}`.

Processos em runtime:

- **Postgres** e **Redis** — containers Docker (`infrastructure/docker-compose.yml`), únicos
  serviços no compose.
- **Web** (`npm run dev` / `next start` em produção) — Next.js, serve dashboard + API routes.
- **Research Worker** (`npm run worker:dev`) — BullMQ, processa Research Runs da fila
  (`concurrency: 1`, nunca duas Research Runs em paralelo — decisão deliberada, ver CLAUDE.md).
- **Scheduler** (`npm run scheduler:dev`) — opcional, lê `agent_settings` a cada 60s e enfileira
  Research Runs agendadas. Sem ele, apenas Research Runs manuais funcionam.

Web, Worker e Scheduler **não** estão no docker-compose — são processos manuais (gotcha
documentado no CLAUDE.md).

## 2. Required Environment Variables

Um único `.env` na raiz do monorepo (nunca duplicado em `apps/web/`):

- `DATABASE_URL` — connection string Postgres.
- `REDIS_URL` — connection string Redis.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — NextAuth.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` — usuário único (bcrypt hash, nunca a senha em texto).
- `MASTER_ENCRYPTION_KEY` — AES-256-GCM, 32 bytes hex, ver seção 7.

`apps/web/next.config.mjs` carrega o `.env` da raiz explicitamente (Next.js só olha o próprio
diretório do app por padrão) — não remover esse trecho, senão `NO_SECRET`/erro de configuração.

## 3. Starting the System

```
# 1. Infra (Postgres + Redis)
docker compose -f infrastructure/docker-compose.yml up -d
docker ps   # confirmar "healthy" em ambos

# 2. Migrations (ver seção 4)
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# 3. Web
npm run dev                 # http://localhost:3000

# 4. Worker (obrigatório para Research Runs saírem de QUEUED)
npm run worker:dev

# 5. Scheduler (opcional — só se agendamento automático for necessário)
npm run scheduler:dev
```

Ordem importa: Postgres/Redis saudáveis → migrations aplicadas → Web/Worker/Scheduler.

## 4. Database Migration

- Aplicar migrations já existentes (produção/CI, não-interativo):
  `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`
- Conferir estado: `npx prisma migrate status --schema packages/database/prisma/schema.prisma`
- Conferir schema válido: `npx prisma validate --schema packages/database/prisma/schema.prisma`
- **Nunca** `prisma migrate dev` em ambiente não-interativo (falha com "non-interactive
  environment"). Ver CLAUDE.md para o procedimento de gerar SQL manualmente com `migrate diff`
  quando for necessário criar uma migration nova.
- Gotcha conhecido (Windows dev, ocorreu 2x nesta máquina): a tabela `_prisma_migrations` pode
  desaparecer entre sessões mesmo com os dados intactos, ou (uma vez, 2026-09-19) causar perda
  total de dados sem causa raiz identificada. Antes de assumir corrupção: `docker ps` (containers
  healthy) e `SELECT count(*) FROM projects` — ver procedimento de baseline no CLAUDE.md.

## 5. Backup

Script: `scripts/backup-db.ps1` (PowerShell — escolhido em vez de `.sh` porque a máquina de dev é
Windows e os únicos clients Postgres disponíveis são os de dentro do container Docker; o script
usa `docker exec pg_dump` + `docker cp`, não exige `pg_dump` instalado no host).

```
powershell -File scripts/backup-db.ps1 [-OutDir backups] [-ContainerName infrastructure-postgres-1]
```

- Formato: `pg_dump --format=custom` (comprimido, restaurável seletivamente com `pg_restore`).
- Nome do arquivo inclui timestamp UTC (`crypto_research_<timestamp>.dump`) — nunca sobrescreve
  um backup existente.
- Falha explicitamente (`throw`) em qualquer erro do `pg_dump`/`docker cp`; remove arquivo
  parcial em caso de falha.
- `backups/` está no `.gitignore` — dumps não vão para o git.
- **Testado nesta sessão**: backup real do banco de dev gerado com sucesso
  (`backups/crypto_research_20260922_121941.dump`, 1.31 MB, 29 tabelas, 7 projects, 56
  research_runs, 2634 research_events).
- O backup contém **apenas** dados do Postgres. `MASTER_ENCRYPTION_KEY` nunca é incluída (ver
  seção 7) — sem ela, os secrets de `api_connections.encrypted_secret` restaurados ficam
  irrecuperáveis mesmo com o dump íntegro.

Frequência recomendada: antes de qualquer migration nova, antes de updates de versão, e
periodicamente (ex.: diário) se o volume de dados justificar — não há agendamento automático
implementado nesta V1 (fora de escopo; ver Known Limitations).

## 6. Restore

Script: `scripts/restore-db.ps1`. **Não-destrutivo por padrão**:

- Recusa restaurar no database `crypto_research` (nome do banco principal de dev) —
  hardcoded, sempre.
- Se o destino já existe e tem tabelas, exige `-Confirm`.
- `-CreateIfMissing` cria o database de destino (uso esperado: banco de teste isolado).

```
powershell -File scripts/restore-db.ps1 -BackupFile backups/crypto_research_<ts>.dump `
    -TargetDatabase crypto_research_restore_test -CreateIfMissing
```

**Teste de restore real executado nesta sessão** (banco temporário `crypto_research_restore_test`,
mesmo container, dropado ao final):

1. Backup do banco `crypto_research` atual.
2. Restore em `crypto_research_restore_test` (novo database, criado pelo script).
3. `prisma migrate status` contra o banco restaurado → "Database schema is up to date!" (20
   migrations, mesmíssimo resultado do banco original).
4. Contagem de linhas comparada — **idêntica em todas as tabelas verificadas**:

   | Tabela                    | Original | Restaurado |
   | ------------------------- | -------- | ---------- |
   | tabelas (schema public)   | 29       | 29         |
   | projects                  | 7        | 7          |
   | research_runs             | 56       | 56         |
   | research_events           | 2634     | 2634       |
   | fundamental_scores        | 7        | 7          |
   | project_profile_snapshots | 1        | 1          |
   | kanban_cards              | 7        | 7          |

5. `DROP DATABASE crypto_research_restore_test;` executado — banco de teste removido, banco
   principal de dev nunca foi tocado.

Restore em produção real (substituindo o banco principal) é uma operação manual deliberada, fora
do escopo automatizado deste script — usar `pg_restore --clean --if-exists` diretamente com
atenção redobrada, após parar Web/Worker/Scheduler.

## 7. Master Encryption Key

- `MASTER_ENCRYPTION_KEY` (AES-256-GCM, 32 bytes hex) criptografa `api_connections.encrypted_secret`
  (`packages/shared/src/crypto.ts`).
- **Obrigatória**: sem ela, o processo não sobe (`EncryptionConfigError`).
- **Nunca vai para o banco nem para o backup do Postgres** — vive só no `.env`/secret manager do
  ambiente, separada fisicamente do backup do Postgres.
- **Perda da chave = perda dos secrets existentes.** Não há procedimento de recuperação — se a
  chave for perdida, os `ApiConnection.encrypted_secret` já gravados ficam permanentemente
  ilegíveis (o `authTag` do AES-GCM garante que não há como "forçar" a descriptografia). O único
  caminho é reconfigurar as API keys/secrets do zero em `/dashboard/settings`.
- **Rotação**: o formato do payload é versionado (`v: 1`, `packages/shared/src/crypto.ts`), mas
  o código **não implementa rotação automática de chave** — não existe um caminho para
  re-criptografar registros existentes com uma chave nova. Rotacionar hoje exigiria: decriptar
  todos os `encrypted_secret` com a chave antiga, trocar `MASTER_ENCRYPTION_KEY`, e re-gravar
  cada um com `encrypt()` sob a chave nova — um script manual que não existe atualmente. Isso é
  uma limitação real, documentada honestamente (não implementada nesta V1 — fora de escopo do
  hardening atual).

## 8. Redis

- Uso: apenas estado transitório do BullMQ (`packages/queue/src/*`) — filas de Research Run,
  locks distribuídos (`lock.ts`), jobs em andamento.
- **Não é fonte de verdade persistente.** Nenhum dado de negócio (Project, ResearchRun,
  ResearchEvent, Score, Snapshot, KanbanCard) vive no Redis — tudo isso está no Postgres.
- Perda do Redis (container reiniciado, volume perdido) = perda/recriação de jobs
  transitórios (uma Research Run `QUEUED`/`IN_PROGRESS` pode precisar ser re-enfileirada
  manualmente), **não** perda de histórico de pesquisa.

## 9. Health Checks

`GET /api/health` (`apps/web/src/app/api/health/route.ts`):

- Faz `SELECT 1` real no Postgres via Prisma e `PING` real no Redis (`pingRedis()`).
- Retorna `200` com `{"status":"ok","application":"healthy","database":"healthy","redis":"connected"}`
  quando ambos saudáveis.
- Retorna `503` com `{"status":"degraded", ...}` se qualquer dependência falhar.
- Não expõe connection strings, secrets nem stack traces — confirmado por leitura de código.
- Deliberadamente **não** reporta status de providers externos (DefiLlama/CoinGecko) — isso é
  responsabilidade de `GET /api/connections`, para não fabricar um "healthy" falso.

Health check está em conformidade com o contrato documentado; nenhuma correção foi necessária.

## 10. Worker

- `npm run worker:dev` (`infrastructure/workers/research-worker.ts`).
- `lockDuration: 30 * 60 * 1000` (30 min) — deliberado, não reduzir (ver CLAUDE.md: reduzir já
  causou jobs "stalled" perdidos por instabilidade momentânea de conexão).
- `concurrency: 1` — nunca duas Research Runs em paralelo (decisão arquitetural, não é bug).
- Graceful shutdown confirmado por leitura de código: `process.on("SIGTERM"/"SIGINT", async () =>
{ await worker.close(); process.exit(0); })` — fecha a conexão BullMQ antes de sair.
- Restart: `Ctrl+C` (ou `taskkill //F //PID <pid>` no Windows se o processo filho `tsx`/`node`
  não morrer com o wrapper `npm` — ver CLAUDE.md) e rodar `npm run worker:dev` de novo. Jobs
  `IN_PROGRESS` no BullMQ retomam conforme o `lockDuration`; ver seção 12 para card preso.
- Logs: JSON estruturado via `console.log(JSON.stringify({event, timestamp, researchRunId, ...}))`
  (`logPipelineEvent` etc. em `packages/research-engine/src/logger.ts`) — sem secrets/payloads
  brutos.

## 11. Scheduler

- `npm run scheduler:dev` (`infrastructure/workers/scheduler.ts`), tick a cada 60s, lê
  `agent_settings`.
- **Só uma instância de scheduler é suportada.** Não há lock distribuído entre múltiplas
  instâncias do scheduler em si (diferente do lock por Research Run, que o Worker já garante).
  Rodar duas instâncias simultaneamente pode gerar uma `ResearchRun` `QUEUED` extra no mesmo
  tick — aceitável como limitação conhecida do MVP, não corrigido nesta V1 (implementar lock
  distribuído de scheduler está fora de escopo do hardening atual).
- Sem handler explícito de SIGTERM/SIGINT no código atual (`setInterval` simples) — `Ctrl+C`
  encerra o processo; não há transação em aberto para corromper (cada tick decide e enfileira,
  não mantém estado mutável entre ticks). Restart seguro: parar e rodar `npm run scheduler:dev`
  de novo.

## 12. Logs

- Todos os processos (web, worker, scheduler) logam eventos estruturados em JSON via `stdout`
  (`console.log(JSON.stringify({event, timestamp, ...}))`) — não existe Event Bus/arquivo de log
  centralizado nesta V1; capturar stdout do processo é a forma de observar (ex.: redirecionar
  para arquivo, ou rodar sob um supervisor de processo que capture logs).
- Padrão: `logPipelineEvent`/`logScoringEvent`/`logKanbanEvent`
  (`packages/research-engine/src/logger.ts`).
- Nunca contém secrets ou payloads brutos de resposta de provider — só metadados
  (`researchRunId`, `slug`, `stage`, `error` como string curta).

## 13. Failure Recovery

**Research Run interrompida no meio** (worker morto, máquina reiniciada, etc.):

1. Identificar a run travada: `SELECT * FROM research_runs WHERE status IN ('QUEUED',
'IN_PROGRESS') ORDER BY created_at DESC;` via `prisma studio` ou `psql`.
2. Verificar o card Kanban correspondente (`SELECT * FROM kanban_cards WHERE
research_run_id = '<id>';`) — provavelmente preso em `Data Collection` (WIP Limit 1/1),
   bloqueando novas runs de entrarem nessa coluna.
3. Se a run realmente não está mais em progresso (nenhum worker rodando, ou `lockDuration` de
   30 min já expirou sem heartbeat): mover o card manualmente de volta ou marcar a run como
   `FAILED` (via Prisma Studio, não há endpoint de "forçar falha" dedicado nesta V1) para
   liberar o WIP Limit.
4. Rodar uma nova Research Run manual para os projetos afetados (`npm run worker:dev` ativo +
   disparo manual pelo dashboard/`/api/research-runs`).
5. **Nunca** interromper `runManualResearchPipeline` por script com `timeout` curto — isso é o
   que causa esse cenário; se precisar cancelar uma run, usar o cancelamento cooperativo
   (`shouldContinue`/rota de cancel), não `kill -9` no meio do processamento de um projeto.

**Postgres/Redis indisponível**: `/api/health` reporta `503` com o campo específico
(`database`/`redis`) degradado — usar isso para diagnosticar qual dependência caiu antes de
reiniciar containers.

**Perda de dados no Postgres de dev** (já ocorreu 2x nesta máquina, causa raiz não confirmada):
ver seção "Gotchas conhecidos" do CLAUDE.md — antes de re-semear, `docker ps` + `SELECT count(*)
FROM projects`; se confirmado zerado, restaurar do backup mais recente (seção 6) e refazer
curadoria manual de `githubRepo`/`snapshotSpace`/`discourseForumUrl` a partir dos
`SPRINT_NN_IMPLEMENTATION_REPORT.md`.

## 14. Updating the Application

1. Backup do banco (seção 5).
2. `git pull` (ou deploy do artefato de build).
3. `npm install` (se `package-lock.json` mudou).
4. `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`.
5. `npm run build`.
6. Parar Web/Worker/Scheduler → subir de novo com o novo build.
7. `GET /api/health` → confirmar `200`.
8. Verificar dashboard e disparar (ou observar) uma Research Run de teste se a mudança afetou o
   pipeline.

## 15. Rollback

1. Parar Web/Worker/Scheduler.
2. `git checkout <commit-anterior>` (ou reverter o deploy do artefato).
3. **Verificar compatibilidade de migration**: se a versão nova aplicou uma migration destrutiva
   (`DROP COLUMN`/`DROP TABLE`), o rollback de código **não** desfaz isso — restaurar do backup
   (seção 6) é o único caminho nesse caso. Migrations aditivas (nova coluna opcional, nova
   tabela) geralmente são seguras para rollback de código sem reverter o schema.
4. `npm install` + `npm run build` na versão revertida.
5. Subir os serviços de novo.
6. `GET /api/health` → `200`.
7. Verificar dashboard (`/dashboard`) e disparar uma Research Run de teste.

Nenhuma migration existente neste projeto foi identificada como destrutiva de dado de produção
nesta auditoria — mas isso deve ser reconfirmado a cada nova migration antes de assumir rollback
seguro.

## 16. Emergency Procedure

1. **Não entre em pânico, não rode comando destrutivo às cegas** (`prisma migrate reset`, `git
clean -fd`, `docker compose down -v` removem dados).
2. `docker ps` — confirmar containers Postgres/Redis "healthy".
3. `SELECT count(*) FROM projects;` — confirmar se há perda de dado real antes de agir.
4. Se dado íntegro: diagnosticar via `/api/health` + logs stdout dos processos.
5. Se dado perdido: parar tudo, restaurar do backup mais recente disponível (seção 6) em um
   database de teste primeiro para validar o backup, só depois considerar restaurar sobre o
   principal (fora do escopo automatizado do script — ação manual deliberada).
6. `MASTER_ENCRYPTION_KEY` perdida: não há recuperação — comunicar que as API Keys existentes
   precisarão ser reconfiguradas em `/dashboard/settings` após a chave ser trocada.
7. Documentar o incidente (causa, ação tomada, dado perdido se houver) — este projeto já teve 2
   incidentes reais de perda total de dado em dev sem causa raiz confirmada; manter esse
   histórico ajuda a identificar padrões.
