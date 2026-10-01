# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

- Responda sempre em português (PT-BR), independentemente do idioma da pergunta.

## Sobre o projeto

Plataforma de inteligência fundamentalista para criptoativos. `Crypto_Research_Intelligence_Master_Roadmap.md`
é a especificação mestre; `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` é o plano técnico com o
detalhamento sprint a sprint (arquitetura, schema, decisões de escopo) — **está desatualizado em
partes** (ex.: ainda lista Funding/Tokenomics/Investors como fora do MVP, o que já foi
implementado); use `STATUS_PROJETO.md` como fonte mais atual do estado real do projeto.
**Sprints 1–23 implementados.** O histórico de cada sprint está em `SPRINT_NN_IMPLEMENTATION_REPORT.md`
e o estado atual em `STATUS_PROJETO.md` — não repetir aqui. Relatórios `SPRINT_NN_*` só existem a
partir do 12; o Sprint 18 não tem relatório próprio e está documentado em `STATUS_PROJETO.md` §2.19.
Ciclo V1.0 fechado em 2026-09-22 (auditorias + `docs/V1_OPERATIONS.md`); ver `STATUS_PROJETO.md`.
Decisões duráveis, não óbvias no código:

- **Sem dado sintético:** fonte real ou `null`/`N/A`. Sem fonte gratuita hoje: Unlock Pressure/
  Distribution/Value Capture do Tokenomics Score. `TOKEN_UNLOCK` (DefiLlama Pro) está pronto e
  **inativo** sem key em Settings; a estrutura do payload nunca foi validada contra resposta real.
- **Calculado sob demanda, sem tabela nova:** Historical Fundamental Intelligence (Sprint 14) e
  Event Impact (Sprint 16). É Fundamental Intelligence, nunca Trading (sem RSI/MACD/sinal de
  compra-venda). `fundamental-context.ts` explicitamente não é Global Score. Event Impact é
  associação temporal, nunca causalidade.
- **Identidade externa** (`githubRepo`, `snapshotSpace`, `discourseForumUrl`): só curadoria
  manual via `PATCH /api/projects/[slug]`, nunca inferida por nome; validação anti-SSRF em
  `packages/defi-data/src/external-identity.ts`.
- **Classificação de eventos:** a engine determinística (`scoring-engine/src/event-classification.ts`)
  só é usada para GitHub Releases. Fontes estruturadas (Snapshot, Discourse, FundingRound, `/hacks`,
  Listing/Delisting, TokenUnlock) nunca passam por ela. Discourse foi testado com a engine e
  rejeitado (~50% de falsos positivos, Sprint 23). Regras só mudam com evidência real de dados
  (ver relatórios dos Sprints 21/22).
- **Persistência:** `ResearchEvent` idempotente por `(projectId, source, sourceId)`;
  `ProjectProfileSnapshot` INSERT-only com dedupe por conteúdo; `TokenMarket` é UPSERT.
- **Technical Signals (agente de indicadores Pine Script/TradingView) é um módulo separado,
  nunca integrado ao Fundamental Intelligence:** decisão revertida em 2026-09-24 (antes era
  "fora de escopo" por completo). **Planejado, ainda sem código** (arquitetura "a confirmar" na
  spec). Quando implementado, deve viver isolado do resto do monorepo — nunca importa nem é
  importado por `scoring-engine`/`fundamental-context.ts`, e não escreve em nenhuma tabela de
  Score. Consome só a lista de projetos já selecionados pelo histórico de Research Runs
  (`ResearchRunSelection`, ver `apps/web/src/lib/research.ts:listProjectsWithData`) como universo
  de análise técnica — nunca escolhe projetos por conta própria. Gera código Pine Script (para
  colar manualmente no TradingView) e, quando houver conta paga com webhooks configurados, emite
  alertas de entrada/saída via Telegram. Construído incrementalmente por indicador, a partir de
  prompts do usuário derivados de um curso externo (não documentar o conteúdo do curso aqui — só
  as decisões de arquitetura resultantes). Ver `TECHNICAL_SIGNALS_SPEC.md`.
- **Discovery/Top 10 (Sprint 8):** o worker roda Discovery → Selection → pesquisa detalhada;
  `FIXED_DEV_PROJECT_SLUGS` é só conveniência para chamada manual.
- **Pool do Prisma (5 conexões):** `getEventImpactsForProject` carrega série e eventos do projeto
  uma vez e calcula cada evento em memória — não reintroduzir query por evento nem `Promise.all`
  sem limite (estoura o pool com volume real).

Monorepo `apps/web` mais `packages/{database,defi-data,research-engine,scoring-engine,queue,shared}`
como npm workspaces; `infrastructure/{docker-compose.yml,workers}` não é workspace (workers rodam
pelos scripts da raiz, com tsconfig próprio). Stack: Next.js 14 (App Router) + TypeScript +
PostgreSQL (Prisma) + Redis + BullMQ; auth via NextAuth (Credentials provider, single-user); CI no
GitHub Actions (prisma generate + lint + typecheck + `prisma migrate deploy` + testes, contra
Postgres e Redis reais em container, nunca mockados).

Ao estender o projeto, siga o padrão de camadas já estabelecido em vez de propor um novo:
rota HTTP fina (`apps/web/src/app/api/**/route.ts`, só sessão + validação zod) → serviço
(`apps/web/src/lib/*.ts`) → repositório de domínio (`packages/research-engine/src/*.ts`, dono da
lógica e das queries Prisma). Ver `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` para o detalhamento
de cada sprint (seção 18) e o que ficou deliberadamente fora do MVP original (seção 6).

## Comandos

- `docker compose -f infrastructure/docker-compose.yml up -d` — sobe Postgres+Redis. Ordem de subida:
  infra → `prisma migrate deploy` → web/worker/scheduler. Runbook completo (start/stop, recuperação,
  rollback): `docs/V1_OPERATIONS.md`.
- `npm run dev` — sobe `apps/web` (Next.js). **Precisa do `.env` na raiz** (ver "Env vars"
  abaixo).
- `npm run worker:dev` — Research Worker (BullMQ). **Obrigatório** para Research Runs saírem de
  `QUEUED` — sem ele os jobs ficam parados na fila.
- `npm run scheduler:dev` — scheduler opcional (lê `agent_settings` a cada 60s).
- `npm run reclassify-events` — reclassifica eventos GitHub já persistidos (idempotente; nunca toca
  fontes estruturadas).
- `npm run lint` — `eslint .` na raiz (flat config, cobre todos os workspaces).
- `npm run typecheck` — roda o `typecheck` de cada workspace + `tsc --noEmit -p
infrastructure/workers/tsconfig.json` (os workers têm tsconfig próprio, checado à parte).
- `npm test` — roda o `test` (`vitest run`) de cada workspace.
- Skill `/verify` — roda lint + typecheck + test de todo o monorepo (incluindo o tsconfig
  separado dos workers) de uma vez; usar antes de dar uma mudança por concluída.
- `npm run build` — build de todos os workspaces (`next build` para `apps/web`).
- `npm run prisma:generate` / `npm run prisma:migrate` — geram o client / criam+aplicam
  migration nova (dev). Para aplicar migrations já existentes sem criar novas (CI/produção):
  `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`.
- `npx prisma studio --schema packages/database/prisma/schema.prisma` — inspecionar/editar
  dados manualmente (não há UI para tudo ainda, ex.: `agent_settings`, `kanban_policies`).
- Rodar um teste isolado: `cd packages/<pkg> && npx vitest run <arquivo>` (ou `-t "<nome>"`).

## Env vars e gotcha de carregamento

Um único `.env` vive na **raiz** do monorepo (nunca duplicar em `apps/web/`). Scripts que rodam
com `cwd` na raiz (`worker:dev`, `scheduler:dev`, Prisma CLI) leem esse `.env` naturalmente via
`dotenv/config`. **`next dev`/`next build` rodam com `cwd` em `apps/web`** e o carregamento
automático de `.env` do Next.js só olha o diretório do próprio app — por isso
`apps/web/next.config.mjs` carrega o `.env` da raiz explicitamente com `dotenv`. Se esse trecho
for removido, o sintoma é `[next-auth][error][NO_SECRET]` e a página "Server error /
Configuration".

Variáveis: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH` (bcrypt — a senha em texto puro nunca é persistida em lugar nenhum;
gerar com `node -e "console.log(require('bcryptjs').hashSync('senha', 10))"`),
`MASTER_ENCRYPTION_KEY` (AES-256-GCM para `api_connections.encrypted_secret`, gerar com
`openssl rand -hex 32`).

Opcional: `PDF_BROWSER_EXECUTABLE_PATH`. O download do Project Report gera PDF via `puppeteer-core`
usando um Chrome/Edge **já instalado** (nenhum Chromium é baixado); sem navegador encontrado a rota
retorna 500 de propósito. O Markdown de `generateProjectReport` continua sendo a fonte.

## Convenções de código

- `strict: true` + `noUncheckedIndexedAccess: true` no TypeScript — sempre tratar
  `array[i]`/`map.get()` como possivelmente `undefined`.
- ESLint flat config (`@eslint/js` + `typescript-eslint`, ambos "recommended"); Prettier com
  aspas duplas, ponto e vírgula, trailing commas "all", `printWidth: 100`. O Prettier é aplicado
  automaticamente após cada Write/Edit pelo hook em `.claude/settings.json`; não há script `format`
  e o CI não checa formatação.
- `designer_system/` é lixo/asset estático não relacionado ao projeto (um template de
  landing page com efeitos de cursor/glow/tilt 3D) — já excluído do ESLint. Se for usado como
  referência visual para alguma UI, extrair só tokens simples (cor, espaçamento, radius) e
  **nunca** os efeitos de mouse-tracking/glow/parallax/tilt.
- IDs únicos (`researchRunId`, `research_run_id`) sempre com um evento de log estruturado
  (`console.log(JSON.stringify({ event, timestamp, ... }))`) — não existe Event Bus, esse é o
  padrão estabelecido (uma função `log<Domínio>Event` por domínio em
  `packages/research-engine/src/logger.ts` — reutilize ou adicione ali). Nunca logar secrets/payloads brutos.
- Tabelas de score (`FundamentalScore`, `TokenomicsScore`, `InstitutionalCapitalScore`) são
  **sempre `INSERT`, nunca `UPDATE`** — histórico completo, versionado por
  `scoreModelVersion`.
- Enums do Prisma (gerados em `@prisma/client`, re-exportados por `@crypto-research/database`)
  e os enums espelhados em `@crypto-research/shared` têm os mesmos valores string mas são
  **tipos nominais distintos** para o TypeScript. `===` entre os dois funciona sem erro; passar
  um valor de um como argumento tipado pelo outro, ou atribuí-lo a uma variável do outro tipo,
  **não** compila. Ao escrever uma função que recebe uma linha vinda do Prisma, tipe o campo
  enum com o enum do Prisma (`import { X as PrismaX } from "@crypto-research/database"`), não
  com o de `shared`.

## Gotchas conhecidos

- **Testes rodam num banco e Redis próprios** (`crypto_research_test` + Redis database 1), nunca
  nos dados de dev: `scripts/test-env.ts` (chamado pelo `tests/setup.ts` de cada workspace)
  redireciona `DATABASE_URL`/`REDIS_URL` e recusa banco sem sufixo `_test` ou Redis db 0. O
  `pretest` (`scripts/prepare-test-db.ts`) cria o banco e aplica migrations a cada `npm test`;
  rodando um arquivo isolado depois de uma migration nova, rode antes `npm run test:db:prepare`.
  Motivo: em 2026-10-01 cleanups de teste apagaram dados reais do banco de dev. Workspace novo
  com testes de Prisma/Redis: `setupFiles` apontando para um `tests/setup.ts` que chama
  `loadTestEnv()`. Mesmo isolado, cleanup de teste filtra só pelo que o próprio teste criou.
- **Postgres local na porta 5433** (compose mapeia `5433:5432`, ver `.env.example`); no CI é 5432.
- **BullMQ `lockDuration`**: o Research Worker usa `lockDuration: 30 * 60 * 1000` (30min) de
  propósito — o default (30s) já causou jobs marcados como "stalled" e perdidos por uma única
  instabilidade momentânea de conexão com o Postgres, mesmo com o pipeline ainda rodando
  corretamente (ver comentário em `infrastructure/workers/research-worker.ts`). Não reduzir sem
  entender essa história.
- **FK de tabelas novas apontando para `Project`/`ResearchRun`**: várias suítes de teste fazem
  `prisma.project.delete()`/`prisma.researchRun.delete()` em `afterAll`. Se uma nova FK
  obrigatória apontar para essas tabelas, o cleanup quebra (aconteceu no Sprint 5). Prefira
  `onDelete: SetNull` com a coluna opcional (ver `KanbanCard.projectId`/`researchRunId`).
- **Windows + `prisma generate`**: `EPERM` geralmente é um processo `node`/`tsx` órfão ainda
  segurando o binário do query engine — feche processos antigos antes de rodar de novo.
- **Tabela `_prisma_migrations` pode "sumir" entre sessões (Windows dev, Postgres do
  docker-compose)**: já aconteceu (Sprint 13) o schema/dados do Postgres continuarem intactos
  (todas as tabelas de sprints anteriores presentes) mas a tabela de bookkeeping
  `_prisma_migrations` não existir mais — `prisma migrate deploy` então falha com `P3005: The
database schema is not empty` e `prisma migrate status` lista TODAS as migrations como "não
  aplicadas", mesmo já estando. Verificar antes de assumir corrupção: `SELECT tablename FROM
pg_tables WHERE schemaname='public'` — se as tabelas esperadas já existem, é só a tabela de
  tracking que sumiu. Resolver com baseline: `npx prisma migrate resolve --applied
<nome_da_migration>` para cada migration já refletida no schema real, na ordem, antes da
  primeira `migrate deploy` da sessão. Causa raiz não identificada (possível reinício do
  container Postgres sem persistir aquela tabela específica, ou volume parcialmente resetado).
- **ATUALIZAÇÃO (2026-09-19): o mesmo sintoma já ocorreu com PERDA TOTAL DE DADOS** (29 tabelas
  zeradas, `_prisma_migrations` intacta), sem nenhum comando do projeto ter causado. Causa
  provável: instabilidade do Docker Desktop/WSL2. Antes de re-semear, `docker ps` (containers
  "healthy") e `SELECT count(*) FROM projects`. Os campos curados (`githubRepo`/`snapshotSpace`/
  `discourseForumUrl`) precisam ser refeitos a partir dos `SPRINT_NN_IMPLEMENTATION_REPORT.md`.
  Se repetir: mover o Postgres para fora do Docker Desktop ou aumentar a RAM do WSL2 (`.wslconfig`).
  Backup/restore: `scripts/backup-db.ps1` / `scripts/restore-db.ps1` (ver `docs/V1_OPERATIONS.md`;
  restore recusa o banco `crypto_research` como alvo; o dump não inclui `MASTER_ENCRYPTION_KEY`).
- **Rodar `runManualResearchPipeline` por script:** leva vários minutos com 7 projetos. Não use
  `timeout` curto — cortar a run no meio deixa um card preso em Data Collection (WIP Limit 1/1) e
  o projeto sem score, e isso faz `kanban-repository.integration.test.ts` falhar mesmo isolado.
- **`prisma migrate dev` pode falhar com "non-interactive environment"** quando rodado via Bash
  tool (sem TTY) — usar `prisma migrate diff --from-migrations <dir> --to-schema-datamodel
<schema> --shadow-database-url "$DATABASE_URL" --script` para gerar o SQL da migration
  manualmente, salvar em `prisma/migrations/<timestamp>_<nome>/migration.sql`, e aplicar com
  `prisma migrate deploy` (não interativo).
- **`npm run dev`/`worker:dev` em background**: no Windows, encerrar o processo "pai" nem
  sempre mata o processo filho real (`next-server`, `tsx`). Se a porta continuar em uso depois
  de parar o comando, encontre o PID (`netstat -ano | grep ":<porta>"`) e finalize direto
  (`taskkill //F //PID <pid>`). A skill `.claude/skills/reset-dev` automatiza esse passo.
- **Sem mock de fonte externa**: toda integração com DefiLlama (`api.llama.fi`), CoinGecko e
  MyMemory Translation API (tradução PT-BR de descrições, sem API key) é real, mesmo em testes
  (que pulam automaticamente se a máquina estiver offline) — nunca fabricar um status
  "healthy"/dado sintético/tradução parcial para substituir uma chamada real.
- **`docker-compose` só sobe Postgres+Redis**: worker e scheduler continuam sendo processos
  manuais (`npm run worker:dev` / `npm run scheduler:dev`), não fazem parte do `dev` nem do
  compose.
- **Pipeline sequencial de propósito**: `runManualResearchPipeline` processa projetos em série e o
  Research Worker roda com `concurrency: 1` — o WIP Limit do Kanban não muda a velocidade real.
  Paralelizar (rate-limit da DefiLlama, concorrência no Postgres) foi avaliado e descartado.
- **`research-engine` roda arquivos de teste em série (`fileParallelism: false`) de propósito**: o
  board Kanban é um singleton seedado e testes em paralelo disputam o WIP Limit — não remover.

## Escopo

- **Implementado (Sprints 1–23)**: ver `STATUS_PROJETO.md`. Specs por feature na raiz
  (`*_SPEC.md`, `*_ARCHITECTURE.md`, `Crypto_Research_Intelligence_Kanban_Pull_System.md`);
  auditorias do V1.0 em `AUDIT_AND_REPAIR_REPORT.md`/`PROJECT_COMPLETION_AUDIT.md`/`V1_*.md`.
  Ajuda contextual na UI usa `apps/web/src/components/InfoTooltip.tsx` (popover por clique, sem
  hover/mouse-tracking).
- **Fora de escopo ainda**: Second Brain completo (só contrato de entrada/saída definido),
  Backtesting/Historical Intelligence avançada, multi-tenant, Improvement Proposals automáticos.
  Contratos já reservados: seções 32/33 do Kanban Pull System.
