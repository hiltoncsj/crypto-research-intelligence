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
e o estado atual em `STATUS_PROJETO.md` — não repetir aqui. Não existe `SPRINT_18_IMPLEMENTATION_REPORT.md`
(lacuna na sequência 12–23; não investigado se o conteúdo do Sprint 18 foi mesclado em outro relatório).
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
- **Discovery/Top 10 (Sprint 8):** o worker roda Discovery → Selection → pesquisa detalhada;
  `FIXED_DEV_PROJECT_SLUGS` é só conveniência para chamada manual.
- **Pool do Prisma (5 conexões):** `getEventImpactsForProject` processa eventos sequencialmente
  (`EVENT_IMPACT_BATCH_SIZE = 1`); `Promise.all` sem limite estoura o pool com volume real.

Monorepo `apps/web` mais `packages/{database,defi-data,research-engine,scoring-engine,queue,shared}`
mais `infrastructure/{docker-compose,workers}`, todos como npm workspaces. Stack: Next.js 14 (App
Router) + TypeScript + PostgreSQL (Prisma) + Redis + BullMQ; auth via NextAuth (Credentials
provider, single-user); CI no GitHub Actions (lint + typecheck + `prisma migrate deploy` + testes,
contra um Postgres real em container, nunca mockado).

Ao estender o projeto, siga o padrão de camadas já estabelecido em vez de propor um novo:
rota HTTP fina (`apps/web/src/app/api/**/route.ts`, só sessão + validação zod) → serviço
(`apps/web/src/lib/*.ts`) → repositório de domínio (`packages/research-engine/src/*.ts`, dono da
lógica e das queries Prisma). Ver `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` para o detalhamento
de cada sprint (seção 18) e o que ficou deliberadamente fora do MVP original (seção 6).

## Comandos

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

## Convenções de código

- `strict: true` + `noUncheckedIndexedAccess: true` no TypeScript — sempre tratar
  `array[i]`/`map.get()` como possivelmente `undefined`.
- ESLint flat config (`@eslint/js` + `typescript-eslint`, ambos "recommended"); Prettier com
  aspas duplas, ponto e vírgula, trailing commas "all", `printWidth: 100`.
- `designer_system/` é lixo/asset estático não relacionado ao projeto (um template de
  landing page com efeitos de cursor/glow/tilt 3D) — já excluído do ESLint. Se for usado como
  referência visual para alguma UI, extrair só tokens simples (cor, espaçamento, radius) e
  **nunca** os efeitos de mouse-tracking/glow/parallax/tilt.
- Times únicos (`researchRunId`, `research_run_id`) sempre com um evento de log estruturado
  (`console.log(JSON.stringify({ event, timestamp, ... }))`) — não existe Event Bus, esse é o
  padrão estabelecido (`logPipelineEvent`/`logScoringEvent`/`logKanbanEvent` em
  `packages/research-engine/src/logger.ts`). Nunca logar secrets/payloads brutos.
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
<nome_da_migration>` para cada migration já reletida no schema real, na ordem, antes da
  primeira `migrate deploy` da sessão. Causa raiz não identificada (possível reinício do
  container Postgres sem persistir aquela tabela específica, ou volume parcialmente resetado).
- **ATUALIZAÇÃO (2026-09-19): o mesmo sintoma já ocorreu com PERDA TOTAL DE DADOS** (29 tabelas
  zeradas, `_prisma_migrations` intacta), sem nenhum comando do projeto ter causado. Causa
  provável: instabilidade do Docker Desktop/WSL2. Antes de re-semear, `docker ps` (containers
  "healthy") e `SELECT count(*) FROM projects`. Os campos curados (`githubRepo`/`snapshotSpace`/
  `discourseForumUrl`) precisam ser refeitos a partir dos `SPRINT_NN_IMPLEMENTATION_REPORT.md`.
  Se repetir: mover o Postgres para fora do Docker Desktop ou aumentar a RAM do WSL2 (`.wslconfig`).
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
- **Sem mock de fonte externa**: toda integração com DefiLlama (`api.llama.fi`), CoinGecko, e
  desde o Sprint 17 a MyMemory Translation API (`api.mymemory.translated.net`, tradução PT-BR de
  descrições — gratuita, sem API key, limite de ~500 caracteres por requisição, texto é dividido
  em frases de até 450 caracteres, máximo 2 tentativas) é real, mesmo em testes (que pulam
  automaticamente se a máquina estiver offline) — nunca fabricar um status "healthy"/dado
  sintético/tradução parcial para substituir uma chamada real.
- **`docker-compose` só sobe Postgres+Redis**: worker e scheduler continuam sendo processos
  manuais (`npm run worker:dev` / `npm run scheduler:dev`), não fazem parte do `dev` nem do
  compose.
- **`funding-and-capital.integration.test.ts`**: bug de ordem no `afterAll` descrito
  historicamente (deletava `investor` antes de `funding_round_investors`) não foi reproduzido no
  Sprint 12 — o código atual já limpa na ordem correta e passou limpo isolado e dentro de
  `npm test` completo. Ver `STATUS_PROJETO.md` seção 3 antes de assumir que ainda existe.
- **Data Collection é o gargalo real do pipeline, e não é ajustável só pelo WIP Limit do
  Kanban**: `runManualResearchPipeline` (`pipeline.ts:442`) processa projetos
  SEQUENCIALMENTE dentro de uma Research Run, e o Research Worker roda com `concurrency: 1`
  (`research-worker.ts:182`, comentário explícito: "nunca duas Research Runs em paralelo").
  Paralelizar de verdade exigiria mudar essa arquitetura de execução (risco de rate-limit da
  DefiLlama e de concorrência no Postgres) — avaliado e descartado por ora (2026-09-17);
  aumentar o número de "cards" visíveis na coluna não muda a velocidade real.
- **`kanban-repository.integration.test.ts` — contenção de WIP Limit entre arquivos (corrigido no
  Sprint 12)**: usa as colunas Kanban globais seedadas (`WIP Limit` fixo, ex. 1 em Data
  Collection) em vez de um board isolado por teste — quando o Vitest rodava arquivos de teste do
  `research-engine` em paralelo (ex. junto de `discovery.integration.test.ts`, que cria
  `KanbanCard`), os dois disputavam a mesma capacidade e testes de WIP Limit falhavam por
  contenção, não por bug de lógica. Corrigido com `fileParallelism: false` no
  `vitest.config.ts` do workspace (board é intencionalmente um singleton — "board único do
  MVP" — então isolar por board exigiria parametrizar ~10 funções de produção do
  `kanban-repository.ts`, fora de escopo de uma correção de flakiness).
- **Testes que usam Prisma precisam de `.env` carregado explicitamente**: `packages/database`,
  `packages/research-engine` e `apps/web` carregam `.env` da raiz via `tests/setup.ts` (dotenv) +
  `setupFiles` no `vitest.config.ts` de cada um — mesmo padrão já usado por `packages/queue`
  desde o Sprint 4. Sem isso, `npm test` falha com `DATABASE_URL not found` porque `next dev`/
  Prisma CLI carregam `.env` automaticamente mas o runtime do `@prisma/client` sozinho, chamado
  direto de dentro do Vitest, não. Se criar um novo workspace de teste que usa `prisma`/Redis,
  copiar esse padrão (`tests/setup.ts` importando `dotenv/config` com o path pra raiz).

## Escopo

- **Implementado (Sprints 1–23)**: auth, API Keys criptografadas, DefiLlama real (TVL/Fees/
  Revenue/Funding/Token summary), Research Run assíncrona via BullMQ, Scheduler, Fundamental/
  Tokenomics/Institutional Capital Score, Research Trace, Rankings, Kanban Pull System
  operacional (WIP, Pull atômico, Blocked, Urgent, métricas de fluxo, bottleneck detection),
  Funding/Tokenomics/Investors (models `Token`, `TokenUnlock`, `FundingRound`, `Investor`),
  Project Discovery + Top 10 Dinâmico (Sprint 8, ver acima), integração CoinGecko real
  (Sprint 11, popula `fdvUsd`/MC-FDV para o Tokenomics Score).
  Research History + Diff Engine + Changelog automático + Timeline + Project Report em Markdown
  mais download (Sprint 9 — `packages/research-engine/src/{history,diff,report}.ts`, rotas
  `projects/[slug]/{history,report}`, spec em `RESEARCH_HISTORY_SPEC.md`/
  `PROJECT_RESEARCH_REPORT_SPEC.md`), Knowledge Base (Sprint 10 — os 3 docs da raiz
  `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`/`TUTORIAL.md`/`DATA_DICTIONARY.md` estendidos no lugar,
  deliberadamente sem pasta `docs/` nova, e Perfil de Projeto estendendo
  `dashboard/projects/[slug]/page.tsx` com ajuda contextual via
  `apps/web/src/components/InfoTooltip.tsx` — popover por clique, sem hover/mouse-tracking).
  Specs adicionais na raiz (detalham features específicas, não substituem o
  `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`): `Crypto_Research_Intelligence_Kanban_Pull_System.md`,
  `PROJECT_DISCOVERY_SPEC.md`, `TOP10_SELECTION_SPEC.md`.
- **Fora de escopo ainda**: Second Brain completo (só contrato de entrada/saída definido),
  Pine Script/TradingView/Technical Score, Backtesting/Historical Intelligence avançada,
  multi-tenant, Improvement Proposals automáticos.
  Ver seção 6 do plano de implementação (desatualizada nesse ponto, conferir `STATUS_PROJETO.md`)
  e a seção 32/33 do Kanban Pull System para os contratos já reservados.
