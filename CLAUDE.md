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
**Sprints 1–8 já estão implementados** — não é mais um projeto "aguardando aprovação". O Sprint 8
adicionou Project Discovery + Top 10 Dinâmico: `packages/research-engine/src/discovery.ts`
(`getProtocols()` do DefiLlama, filtro de TVL mínimo, `discovery-v1`),
`packages/scoring-engine/src/priority.ts` (`priority-v1`, combina Score + Growth Momentum +
Capital Momentum) e `packages/research-engine/src/selection.ts` (Top 10 por run, persistido
imutavelmente em `ResearchRunSelection`) — o worker agora roda Discovery → Selection → pesquisa
detalhada, em vez da antiga lista fixa de projetos (`FIXED_DEV_PROJECT_SLUGS` virou só uma
constante de conveniência para chamada manual). O Sprint 11 adicionou integração real com
CoinGecko (provider configurável em Settings junto com DefiLlama) que popula `fdvUsd`/MC-FDV
quando o projeto tem `coinGeckoId` conhecido — usado hoje pelo grupo Supply Dilution do
Tokenomics Score (Unlock Pressure/Distribution/Value Capture seguem sem fonte real, ver
`STATUS_PROJETO.md`). O Sprint 12 adicionou a fundação de Historical Market Data: model
`MarketDataSnapshot` (preço/market cap/volume diários, INSERT-only, dedupe por
projeto+fonte+timestamp), populado via `GET /coins/{id}/market_chart` da CoinGecko
(`packages/defi-data/src/coingecko-client.ts`, `getCoinMarketChart`) e persistido por
`packages/research-engine/src/market-data-repository.ts` — chamado no pipeline logo depois do
enriquecimento de FDV, mesmo gate condicional (`project.coinGeckoId` conhecido), mesmo isolamento
de falha por projeto. Sem consumidor ainda (momentum/divergência/indicadores ficam para sprints
futuras) — só a coleta e a persistência existem. O Sprint 13 adicionou Perfil do Projeto
(`ProjectProfileSnapshot` — descrição/categorias/blockchains/homepage) e Onde o Token é Negociado
(`TokenMarket` — exchanges/pares/volume reais), ambos extraídos do MESMO payload de
`GET /coins/{id}` já buscado para FDV/supplies (Sprint 11) — só ligamos `tickers=true` na query
existente, **nenhuma chamada HTTP nova** (`packages/research-engine/src/profile-repository.ts`).
Perfil é INSERT-only com dedupe por CONTEÚDO (não por timestamp — o `last_updated` da CoinGecko
muda a cada run mesmo sem alteração real); Mercados é UPSERT "estado atual" (mesma filosofia de
`Token`, nunca ranking/recomendação de exchange). O Sprint 13 tentou (e não conseguiu, por falta
de fonte gratuita real) implementar Unlock Pressure/Distribution/Value Capture do Tokenomics
Score — confirmado empiricamente nesta sprint que `api.llama.fi/emissions/*` continua HTTP 402
(pago) e a CoinGecko não expõe alocação/distribuição/unlock no endpoint gratuito; Tokenomist.ai
segue bloqueado por falta de API Key. Nenhuma dessas 3 dimensões foi implementada com dado
sintético — continuam `null`/`N/A` honestamente, ver `STATUS_PROJETO.md`. O Sprint 14 adicionou
**Historical Fundamental Intelligence** — transforma os snapshots já existentes (TVL/Revenue/Fees
desde o Sprint 3, Price/MarketCap/Volume desde o Sprint 12) em análises temporais: Growth
(7/30/90/180/365d), Acceleration, Fundamental Momentum (composto TVL/Revenue/Fees/Volume Growth,
`packages/scoring-engine/src/fundamental-intelligence.ts`), Market vs Fundamentals, Fundamental
vs Price Divergence, Valuation Ratios (MC/TVL, MC/Revenue, FDV/Revenue, MC/Fees), Correlação
(Pearson) e Leading/Lagging (cross-correlation) entre séries, e Fundamental Regime — tudo
calculado **sob demanda** (`packages/research-engine/src/historical-intelligence.ts`,
`computeFundamentalHistoricalIntelligence`), **sem nenhuma tabela nova**: decisão explícita de
não persistir um "HistoricalFundamentalSnapshot" porque o cálculo é barato o suficiente sobre os
~365 pontos por série já existentes (mesma filosofia de `history.ts`/`report.ts`, Sprint 9). Isto
é **Fundamental Intelligence, não Trading Intelligence** — nenhuma função produz RSI/MACD/sinal
de compra-venda/recomendação; só classificações descritivas (ex.: "Fundamental Acceleration",
"Positive Fundamental Divergence"). Exposto no Project Report (nova seção "## Inteligência
Fundamental Histórica") e na Home do Dashboard, que deixou de ser um menu estático
(`apps/web/src/app/dashboard/page.tsx`, consome `GET /api/dashboard/fundamental`,
`packages/research-engine/src/dashboard-intelligence.ts`) — Research/Data Health/Fundamental
Movement/Divergences, escopados aos projetos JÁ pesquisados (distinct `FundamentalScore.projectId`),
não ao universo inteiro descoberto. O Sprint 15 adicionou **Catalysts + Risks + Fundamental
Context** (ver `CATALYSTS_RISKS_ARCHITECTURE.md` para a investigação completa de fontes) — model
`ResearchEvent` (`packages/database/prisma/schema.prisma`), mas só 2 fontes reais e
auto-identificáveis (sem curadoria manual) foram encontradas e implementadas: DefiLlama `/hacks`
(incidentes de segurança reais, casados por `defillamaId` — nunca por nome) como Risk
`SECURITY_INCIDENT`, e os `FundingRound` já persistidos desde o Sprint 6, reclassificados como
Catalyst `FUNDING` (zero coleta nova). GitHub Releases e Snapshot.org (governança) são APIs reais
e funcionais (confirmado por chamada ao vivo), mas exigem mapear projeto→repositório/space, que
não existe em nenhum campo hoje — não implementadas para não depender de curadoria manual.
`CoinGecko status_updates` testado em 5 projetos reais, sempre vazio (fonte parece
abandonada/deprecated). `packages/research-engine/src/events-repository.ts` (persistência,
idempotente por `(projectId, source, sourceId)`) e `fundamental-context.ts` (agrega Historical
Intelligence + Catalysts + Risks + Tokenomics + Capital — **explicitamente não é Global Score**).
O Sprint 16 adicionou **Event Impact Analysis** — associação temporal (nunca causalidade) entre
os eventos reais do Sprint 15 (FUNDING/SECURITY_INCIDENT) e as séries históricas dos Sprints 3/12:
janelas 7/14/30d antes/depois de cada `eventDate`, baseline = último valor dentro da janela
(`packages/research-engine/src/metrics.ts`, `getLastValueInRange`), Fundamental Momentum/Regime
before×after (reaproveita EXATAMENTE as funções do Sprint 14), detecção de eventos sobrepostos
(`OVERLAPPING_EVENTS` sempre tem prioridade sobre qualquer outra classificação), e agregação
cross-event (média/mediana/min/max por categoria, com aviso explícito de amostra insuficiente
abaixo de 3 observações). Matemática pura em
`packages/scoring-engine/src/event-impact.ts`; camada conectada ao banco em
`packages/research-engine/src/event-impact-engine.ts`. **Calculado sob demanda, sem tabela
nova** — mesma decisão do Sprint 14 (Historical Fundamental Intelligence), mesma justificativa
(volume de eventos ainda pequeno, cálculo barato). Exposto no Project Report (nova seção "##
Impacto Histórico de Eventos"), na Home do Dashboard ("Event Intelligence") e em
`GET /api/projects/[slug]/event-impacts`. O Sprint 17 passou a exibir Perfil do Projeto e Onde o
Token é Negociado (Sprint 13) diretamente na página do projeto
(`apps/web/src/app/dashboard/projects/[slug]/page.tsx`, via `apps/web/src/lib/research.ts`), não
mais só no Markdown baixável — reaproveita `getLatestProjectProfile`/`getTokenMarkets`, nenhuma
chamada nova. Também adicionou tradução real PT-BR da descrição do projeto (CoinGecko vem em
inglês) via MyMemory Translation API (`packages/defi-data/src/translate-client.ts`,
`translateToPortuguese`), persistida em `ProjectProfileSnapshot.descriptionPt` (calculada uma vez
por mudança de conteúdo do perfil); se a tradução falhar, cai para o texto em inglês com aviso
explícito — nunca uma tradução parcial ou fabricada. O Sprint 18 (numerado assim para não colidir
com o Sprint 17 acima — o doc de especificação recebido se autodenominava "Sprint 17") fez uma
Source Intelligence Audit completa para Catalysts/Risks (`CATALYSTS_RISKS_SOURCE_AUDIT.md`,
estende `CATALYSTS_RISKS_ARCHITECTURE.md` do Sprint 15) e implementou só a categoria com fonte
zero-custo/zero-curadoria encontrada: Catalyst `LISTING`/`DELISTING`, derivado do diff de
`TokenMarket` entre Research Runs consecutivas (`getCurrentTokenMarketKeys` em
`profile-repository.ts`, lido ANTES do upsert da run; `persistTokenMarketListingCatalysts` em
`events-repository.ts`) — nenhuma chamada HTTP nova, `eventDate` = momento em que a mudança foi
percebida (não a data real do anúncio), `confidence` MEDIUM por essa imprecisão. Na primeira
coleta de um projeto (sem `TokenMarket` anterior) nenhum evento é emitido, para não fabricar
histórico. `PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET` (GitHub Releases) e `GOVERNANCE` (Snapshot.org)
têm APIs reais e gratuitas mas exigem curadoria manual de `Project.githubRepo`/
`Project.snapshotSpace` (não implementado, decisão de produto pendente). `TOKEN_UNLOCK` só tem
fonte paga (DefiLlama Pro, $300/mês) mas, a pedido explícito do usuário ("deixar pronto, mas não
usar agora"), foi implementado como Risk **PRONTO, NÃO ATIVADO**: `getTokenUnlocks`/
`pingDefiLlamaPro` em `packages/defi-data/src/client.ts`,
`persistTokenUnlockRisks`/`collectTokenUnlockRisks` em `events-repository.ts`,
`resolveDefiLlamaProApiKey` em `pipeline.ts`, terceiro provider real em Settings
(`DEFILLAMA_PRO`, `apps/web/src/lib/connections.ts`) — sem uma key configurada lá, o código
nunca executa, zero custo. A estrutura do payload foi montada a partir de documentação pública,
nunca validada contra uma resposta real — validar antes de confiar no resultado quando ativado
(ver `SPRINT_17_IMPLEMENTATION_REPORT.md`). Demais 12 categorias de Catalyst e 17 de Risk seguem
sem fonte adequada — `NOT_IMPLEMENTED` documentado, nunca fabricado. O Sprint 19 implementou
**External Identity Mapping** (`EXTERNAL_IDENTITY_ARCHITECTURE.md`) — `Project.githubRepo`/
`Project.snapshotSpace`, colunas opcionais preenchidas SÓ por curadoria manual via
`PATCH /api/projects/[slug]` (UI mínima na página do projeto), nunca inferidas por nome — e
ligou as duas fontes que ficavam bloqueadas por falta desse mapeamento: **GitHub Releases**
(`packages/defi-data/src/github-client.ts`, Catalyst sempre `OTHER` — categoria nunca inferida
como MAINNET/PROTOCOL_UPGRADE sem evidência) e **Snapshot Governance**
(`packages/defi-data/src/snapshot-client.ts`, Catalyst `GOVERNANCE`, status mapeado do `state`
cru da fonte). Ambas confirmadas AO VIVO nesta sprint (diferente de `TOKEN_UNLOCK`, que segue
pronto e inativo — não tocado). Validação anti-SSRF em dois pontos independentes
(`packages/defi-data/src/external-identity.ts`) antes de qualquer URL ser montada. O Sprint 19
também corrigiu 2 dívidas de teste pré-existentes (path errado de `.env` em `apps/web/tests/
setup.ts`; cleanup incompleto em `discovery.integration.test.ts`) e rodou `npm run build` pela
primeira vez — ver `SPRINT_19_IMPLEMENTATION_REPORT.md` para evidência completa (396 testes
passando, 0 falhando). O Sprint 20 (`EVENT_CLASSIFICATION_ARCHITECTURE.md`) substituiu o
`OTHER` hardcoded dos eventos GitHub por uma **Auditable Event Classification Engine**
determinística (`packages/scoring-engine/src/event-classification.ts`, `classifyEvent` — 12
categorias com regras conservadoras baseadas em verbo+ação, nunca `text.includes("palavra")`
isolado; nunca LLM). Cada `ResearchEvent` ganhou `classificationMethod`
(`STRUCTURED_SOURCE`/`RULE`/`MANUAL`/`FUTURE_LLM`) + `classificationRuleId` +
`classificationEvidence` (nullable, expostos via `getCatalysts`/`getRisks` para auditoria).
Fontes estruturadas (Snapshot/FundingRound/`/hacks`/Listing-Delisting/TokenUnlock) continuam
`STRUCTURED_SOURCE`, nunca passam pela engine — confirmado que uma proposta Snapshot com
"mainnet" no título permanece `GOVERNANCE`. Mecanismo de reclassificação de eventos GitHub já
persistidos (`reclassifyExistingGithubEvents`, script `npm run reclassify-events`) — idempotente,
nunca toca fontes estruturadas. Ver `SPRINT_20_IMPLEMENTATION_REPORT.md` para evidência completa
(423 testes passando, 0 falhando).

Monorepo `apps/web` mais `packages/{database,defi-data,research-engine,scoring-engine,queue,shared}`

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
- `npm run lint` — `eslint .` na raiz (flat config, cobre todos os workspaces).
- `npm run typecheck` — roda o `typecheck` de cada workspace + `tsc --noEmit -p
infrastructure/workers/tsconfig.json` (os workers têm tsconfig próprio, checado à parte).
- `npm test` — roda o `test` (`vitest run`) de cada workspace.
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
- **`prisma migrate dev` pode falhar com "non-interactive environment"** quando rodado via Bash
  tool (sem TTY) — usar `prisma migrate diff --from-migrations <dir> --to-schema-datamodel
<schema> --shadow-database-url "$DATABASE_URL" --script` para gerar o SQL da migration
  manualmente, salvar em `prisma/migrations/<timestamp>_<nome>/migration.sql`, e aplicar com
  `prisma migrate deploy` (não interativo).
- **`npm run dev`/`worker:dev` em background**: no Windows, encerrar o processo "pai" nem
  sempre mata o processo filho real (`next-server`, `tsx`). Se a porta continuar em uso depois
  de parar o comando, encontre o PID (`netstat -ano | grep ":<porta>"`) e finalize direto
  (`taskkill //F //PID <pid>`).
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

- **Implementado (Sprints 1–8)**: auth, API Keys criptografadas, DefiLlama real (TVL/Fees/
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
