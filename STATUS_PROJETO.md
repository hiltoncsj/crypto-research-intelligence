# STATUS_PROJETO.md

> Resumo do que está implementado e do que falta no Crypto Research Intelligence,
> gerado a partir de auditoria direta do código (schema, rotas de API, packages,
> testes e infraestrutura) em 2026-09-16, e estendido sprint a sprint (seções 2.10–2.24,
> última atualização em 2026-09-19, Sprint 23). As seções 2.1–2.9 e 3.x são o snapshot
> original de 2026-09-16 e podem estar defasadas. Este arquivo não é atualizado
> automaticamente conforme o código evolui.
>
> **Atualização 2026-09-22 — ciclo de fechamento da V1.0**: quatro auditorias adicionais foram
> feitas e não estão repetidas aqui — `PROJECT_COMPLETION_AUDIT.md` (gap analysis geral, 35
> seções), `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md` (as 15 métricas do Sprint 14 verificadas
> fórmula a fórmula, look-ahead bias corrigido em `metrics.ts`), `V1_RELEASE_READINESS_AUDIT.md`
> (segurança/deploy/operação, concluiu READY WITH CONDITIONS) e o hardening resultante
> (`V1_RELEASE_NOTES.md`, `V1_FINAL_READINESS.md`, `docs/V1_OPERATIONS.md` — backup/restore
> testado de verdade contra banco isolado, procedimentos de start/stop/recovery). Ver esses
> arquivos para o estado mais atual; este documento continua sendo o mapa sprint a sprint.

---

## 1. Visão geral

O projeto está muito além do estágio descrito no `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`
original (que ainda diz "aguardando aprovação, nada implementado"). Na prática, os
Sprints 1–23 estão implementados e testados (as seções 2.1–2.9 descrevem o núcleo dos
Sprints 1–7; os sprints seguintes estão em 2.10–2.24): autenticação,
gestão de API Keys criptografadas, coleta real de dados da DefiLlama, pipeline de
Research Run assíncrono via BullMQ, três engines de score, Research Trace, Rankings
e um Kanban Pull System completo. Além disso, o código já foi **além** do que o
plano original definia como escopo (ver seção 4 — "Descompasso entre plano e código").

---

## 2. O que está implementado

### 2.1 Autenticação e segurança

- Login via NextAuth (Credentials provider, single-user) — `apps/web/src/app/api/auth/[...nextauth]/route.ts` e `apps/web/src/app/login/page.tsx`.
- Gestão de API Keys de terceiros, criptografadas em repouso (AES-256-GCM) e mascaradas na UI — modelo `ApiConnection`, rotas `apps/web/src/app/api/connections/route.ts`, `[id]/route.ts`, `[id]/test/route.ts`.
- Helpers de criptografia testados (`packages/shared/tests/crypto.test.ts`).

### 2.2 Coleta de dados (DefiLlama)

- Cliente HTTP com retry, normalizador e adaptador de dados brutos → snapshot em `packages/defi-data/src` (`client.ts`, `http-client.ts`, `adapter.ts`, `types.ts`), com testes de integração reais contra `api.llama.fi` (sem mocks, conforme convenção do projeto).
- Snapshots imutáveis versionados: `TvlSnapshot`, `RevenueSnapshot`, `FeeSnapshot`, persistidos via `packages/research-engine/src/snapshot-repository.ts`.

### 2.3 Pipeline de pesquisa (Research Run)

- Orquestração completa em `packages/research-engine/src/pipeline.ts`, com validação cruzada (`validator.ts`), cálculo de métricas de crescimento 7/30/90 dias (`metrics.ts`) e logging estruturado (`logger.ts`).
- Execução assíncrona via BullMQ: fila em `packages/queue/src`, worker dedicado (`infrastructure/workers/research-worker.ts`, com `lockDuration` de 30min propositalmente alto) e scheduler opcional (`infrastructure/workers/scheduler.ts`, lê `agent_settings` a cada 60s).
- Modelo `ResearchRun` com histórico de estados (QUEUED → ... → COMPLETED), API completa (`research-runs/route.ts`, `[id]/route.ts`, `[id]/cancel/route.ts`).

### 2.4 Scoring

- Três engines de score, cada um versionado e sempre gravado via `INSERT` (nunca `UPDATE`, para manter histórico completo):
  - **Fundamental Score** — `fundamental-score.ts` + `FundamentalScore` (tabela).
  - **Tokenomics Score** — `tokenomics-score.ts` + `TokenomicsScore`.
  - **Institutional Capital Score** — `capital-score.ts` + `InstitutionalCapitalScore`.
- Suporte a confiança estatística (`confidence.ts`) e percentis (`percentile.ts`).
- Geração de Research Trace (rastreabilidade métrica → fonte/timestamp) em `trace.ts`.
- Exposto via API em `projects/[slug]/score`, `.../tokenomics-score`, `.../capital-score`.

### 2.5 Funding, Tokenomics e Investidores

Apesar do plano original (`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`, seção 6) listar isso
como "fora do MVP", **já está implementado**: modelos `Token`, `TokenUnlock`,
`FundingRound`, `Investor`, `FundingRoundInvestor`, repositório dedicado
(`funding-repository.ts`) e rota `projects/[slug]/funding`, com teste de integração
(`funding-and-capital.integration.test.ts`).

### 2.6 Rankings e Research Trace

- Ranking fundamentalista via `apps/web/src/app/api/rankings/fundamental/route.ts`, exibido em `dashboard/rankings/page.tsx`.

### 2.7 Kanban Pull System

- Modelos completos: `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `KanbanCardMovement`, `KanbanPolicy`, com suporte a limites de WIP, cards bloqueados/urgentes e histórico de movimentação.
- Engine com métricas de fluxo e detecção de gargalo (`kanban-metrics.ts`).
- API com Pull atômico, Block/Unblock, Urgent e métricas: `kanban/route.ts`, `kanban/cards/[id]/{pull,block,unblock,urgent}`, `kanban/metrics/route.ts`.
- Dashboard próprio em `dashboard/kanban/page.tsx`.
- **Sprint 7 (auditoria + evolução)**: corrigido bug em que cards `BLOCKED` não contavam como
  WIP (mascarava gargalos); adicionada classificação de gargalo em 4 níveis
  (`NORMAL`/`WATCH`/`BOTTLENECK`/`CRITICAL`), métricas de Buffer (contagem + idade), Waiting Time
  (distinto de Cycle Time) e Aging (card aberto mais antigo); testes de concorrência real de Pull
  (dois Pulls simultâneos, só um sucede). Detalhes completos em
  `Crypto_Research_Intelligence_Kanban_Pull_System.md`, seção 76. Ficou fora deste ciclo: raia
  visual "Urgente", uso do campo `swimlane` na renderização, WIP experimental com histórico,
  endpoint de políticas, feedback loops e múltiplos boards.

### 2.8 Dashboard (UI)

Páginas existentes: Home (`dashboard/page.tsx`), detalhe de projeto
(`dashboard/projects/[slug]/page.tsx`), rankings, kanban, research
(`dashboard/research/page.tsx`) e settings (`dashboard/settings/page.tsx`), além de
login e página raiz.

### 2.9 Infraestrutura e testes

- `infrastructure/docker-compose.yml` sobe Postgres + Redis localmente.
- ~24 arquivos de teste reais (não placeholders), distribuídos entre os packages:
  database (2), defi-data (3), queue (2), research-engine (6), scoring-engine (6),
  shared (1), apps/web (4).
- CI configurado em `.github/workflows/ci.yml` (lint + typecheck + `prisma migrate deploy` +
  testes contra Postgres real) — pronto para rodar assim que o repositório for
  inicializado com git e enviado a um remoto GitHub.

---

## 2.10 Extensão futura — Knowledge Base, Discovery, Top 10, Histórico e Relatórios (planejamento original desta seção)

Auditoria e especificação conceitual feitas para preparar a evolução do sistema de "coleta +
score" para "plataforma contínua de descoberta e conhecimento" (ver documentos abaixo). Discovery
e Top 10 foram implementados no Sprint 8 (seção 2.11); Histórico/Diff/Changelog/Report foram
implementados no Sprint 9 (seção 2.12) — os itens abaixo descrevem o estado no momento da
auditoria original, mantido como registro histórico:

- `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md` — explicação central de pipeline e significado dos dados.
- `DATA_DICTIONARY.md` — referência campo a campo, incluindo estado real (sempre/parcial/nunca populado).
- `TUTORIAL.md` — guia de uso para quem nunca usou a plataforma.
- `PROJECT_DISCOVERY_SPEC.md` — descoberta dinâmica de projetos.
- `TOP10_SELECTION_SPEC.md` — seleção dinâmica de projetos priorizados por Research Run.
- `RESEARCH_HISTORY_SPEC.md` — histórico navegável por projeto (boa notícia: a base já existe, append-only).
- `PROJECT_RESEARCH_REPORT_SPEC.md` — relatório individual por projeto, gerado sob demanda.

**Achados centrais da auditoria** (fatos verificados no código, não suposição):

- `getProtocols()` (listagem completa de protocolos DefiLlama) **já existe** no client
  (`packages/defi-data/src/client.ts`) mas está desconectado do pipeline — só é usado no
  health-check. Reconectá-lo é o primeiro passo de Discovery, sem precisar de nova integração.
- O pipeline hoje processa uma **lista fixa** de projetos (`FIXED_DEV_PROJECT_SLUGS` em
  `pipeline.ts`) — não há nenhum mecanismo de seleção dinâmica ou descoberta de projeto novo.
- `FDV`, `MC/FDV` e `Value Capture` já estão **modelados no schema/score**, mas eram **sempre
  `null`** na época deste snapshot (2026-09-16) — a DefiLlama não expõe FDV, e não havia sinal
  real conectado para Value Capture. **Correção (2026-09-17): FDV/MC-FDV deixaram de ser sempre
  `null`** — a integração CoinGecko (Sprint 11, já implementada antes deste snapshot mas não
  refletida aqui) popula `fdvUsd` de verdade quando o projeto tem `coinGeckoId` conhecido;
  confirmado com dados reais em produção (Tokenomics Score → Supply Dilution já mostra percentis
  reais, não só `null`). `Value Capture` continua sem fonte conectada. `Catalyst` existe só como
  peso no modelo de score, sem tabela/lógica.
- `Narrative` **não é uma entidade real** — é uma coluna string solta sem FK (`Project.narrativeId`).
- O padrão de histórico já implementado (snapshots e scores sempre `INSERT`, nunca `UPDATE`)
  **já satisfaz a maior parte do requisito de histórico** da extensão — falta só a camada de
  agregação/visualização, não o dado em si.

## 2.11 Sprint 8 — Project Discovery + Top 10 Dinâmico (implementado)

Implementa os itens 1 e 2 do planejamento da seção 2.10 acima. `FIXED_DEV_PROJECT_SLUGS` **não
controla mais a seleção** de quais projetos são pesquisados — continua existindo só como
constante de conveniência para chamadas manuais explícitas (`packages/research-engine/src/pipeline.ts`).

- **Project Discovery** (`packages/research-engine/src/discovery.ts`): reconecta `getProtocols()`
  (já existia, só usado no health-check) ao pipeline. Critério versionado `discovery-v1` (TVL
  mínimo $10M). Idempotente (checado por `defillamaId` E `slug`, com fallback a erro de
  constraint única do Postgres para segurança sob concorrência real). `Project` ganhou
  `discoveredAt`/`discoverySource`/`discoveryFilterVersion` (só preenchidos por descoberta
  automática — nunca em criação manual). Cria card Kanban com `type: "DISCOVERY_AUTO"`
  (`KanbanCard.type`, campo já existente, antes só usado com `"RESEARCH"`).
- **Priority Model** (`packages/scoring-engine/src/priority.ts`, `priority-v1`): combina Score
  (0-100), Growth Momentum (TVL growth30d normalizado) e Capital Momentum (recência da última
  captação) — média dos componentes **disponíveis** (nunca trata ausência como 0). Testado
  isoladamente (8 testes unitários).
- **Top 10 Selection** (`packages/research-engine/src/selection.ts`): candidatos = todo `Project`
  conhecido (sem tabela "Universe" nova); ordena por Priority Score com desempate determinístico
  (Score → Growth → Capital → slug); persiste em `ResearchRunSelection` (tabela nova, `rank`,
  `priorityScore`, `globalScore`, `growthMomentum`, `capitalMomentum`,
  `selectionModelVersion`, `selectionReason`, `@@unique([researchRunId, projectId])`) — uma
  fotografia imutável por Research Run, nunca sobrescrita.
- **Worker** (`infrastructure/workers/research-worker.ts`): quando a run não tem `projectIds`
  explícitos, roda Discovery → Top 10 Selection → pesquisa detalhada só dos selecionados, em vez
  de cair na lista fixa antiga.
- **API**: `GET /api/research-runs/:id` (rota já existente, estendida) agora inclui `selections`
  (Top 10 ordenado com projeto, priority, componentes e motivo).
- **UI**: `dashboard/research/page.tsx` ganhou um botão "Ver" por run que expande o Top 10 (rank,
  priority, score, momentum, motivo) — sem reformulação visual, mesmos tokens do resto do
  dashboard.
- **Bug de concorrência corrigido durante os testes**: duas chamadas de `discoverProjects`
  sobrepostas (cenário real observado nos próprios testes de integração sob carga) colidiam na
  constraint única de `slug`/`defillamaId` — corrigido tratando a violação (Postgres `P2002`)
  como "outro processo já criou este projeto" em vez de derrubar o Discovery inteiro.
- **Testes**: `priority.test.ts` (8, unitário), `discovery.integration.test.ts` (3, integração
  real contra `api.llama.fi` + Postgres), `selection.integration.test.ts` (4, integração real —
  limite de topN, ordenação/desempate, histórico entre runs preservado, idempotência).
- **Fora deste ciclo** (não pedido no Sprint 8): Emerging/Established classification, telas
  dedicadas de Watchlist, containerização do Discovery como job agendado próprio.

## 2.12 Sprint 9 — Research History + Diff Engine + Changelog + Timeline + Project Report + Download (implementado)

Implementa os itens do planejamento da seção 2.10 (Histórico e Relatórios). Nenhuma tabela nova
no schema — tudo é agregação/leitura sobre dados já persistidos nos Sprints 1–8 (snapshots
append-only, scores insert-only, `ResearchRunSelection`).

- **Research History** (`packages/research-engine/src/history.ts`, `getProjectHistory(slug)`):
  agrega TVL/Revenue/Fees/Scores em janelas `7d/30d/90d/180d` a partir dos snapshots e scores já
  existentes — nenhuma chamada nova à DefiLlama. Ausência de dado retorna `null`/`"N/A"`
  explícito, nunca `0`. Exposto em `GET /api/projects/[slug]/history`.
- **Diff Engine + Changelog** (`packages/research-engine/src/diff.ts`, `diffResearchRuns(projectId)`,
  `diff-v1`): compara as duas Research Runs mais recentes que produziram qualquer dado para o
  projeto (união de Fundamental/Tokenomics/Institutional Capital Score + `ResearchRunSelection`).
  Gera entradas tipadas (`METRIC_CHANGED`/`SCORE_CHANGED`/`FUNDING_ADDED`/`RANKING_CHANGED`/
  `TOP10_ENTERED`/`TOP10_EXITED`/`PRIORITY_CHANGED`) com severidade `INFO`/`IMPORTANT`/`CRITICAL`
  a partir de thresholds versionados como constantes (nunca números mágicos espalhados). Sem
  mudança real, changelog vazio.
- **Project Report** (`packages/research-engine/src/report.ts`, `generateProjectReport(slug)`,
  `report-v1`): monta Markdown sob demanda a partir do banco (história + diff + funding +
  seleção), nunca reconsulta DefiLlama, usa `N/A` para todo campo sem fonte real (FDV, Value
  Capture, Narrativa, Catalysts, Risks). Nunca gera linguagem opinativa/recomendação financeira.
  Exposto em `GET /api/projects/[slug]/report` (`Content-Type: text/markdown`,
  `Content-Disposition: attachment`) — slug nunca é usado como caminho de filesystem.
- **UI**: `dashboard/projects/[slug]/page.tsx` ganhou seção "Research History" (tabela de janelas
  - timeline de Fundamental Score + lista de changelog com ícone por severidade) e botão "Baixar
    análise" (`handleDownloadReport`, download via blob), reaproveitando o `theme`/`cardStyle()` já
    existentes na página.
- **Logging estruturado**: `logHistoryEvent`/`logDiffEvent`/`logReportEvent` adicionados a
  `packages/research-engine/src/logger.ts`, seguindo o mesmo padrão de
  `logPipelineEvent`/`logScoringEvent`/`logDiscoveryEvent` (JSON, sem secrets/payload bruto).
- **Testes**: `packages/research-engine/tests/history-and-diff.integration.test.ts` (6 testes,
  Postgres real) — janelas de crescimento corretas, ausência de dado nunca vira `0`/`NaN`,
  diff com e sem Research Run anterior, changelog cobrindo Score/Funding/Top10/Priority, report
  sem `NaN`/`Infinity` e sem linguagem de recomendação.
- **Fora deste ciclo** (não pedido no Sprint 9): filtros de timeline por categoria na UI (a
  estrutura já suporta extensão), janelas `365d`/`2y`/`All Time` (arquitetura já permite sem
  reconstruir o endpoint), cache de history/report.

## 2.13 Sprint 10 — Knowledge Base + Tutorial + Data Dictionary + Perfil de Projeto (implementado)

Auditoria prévia (3 agentes em paralelo) mudou o escopo real: a maior parte do pedido já existia
em formato diferente do sugerido — o trabalho foi estender/reorganizar, não criar do zero.

- **Decisão arquitetural (Knowledge Base)**: nenhum `docs/` novo, nenhuma estrutura de pastas
  `/research/projects/<slug>/` foi criada — moveria os 3 documentos da raiz sem ganho real e
  quebraria referências cruzadas existentes, além de contrariar o princípio já estabelecido no
  Sprint 9 (relatório gerado sob demanda do banco, nunca arquivo estático como fonte). A
  Knowledge Base deste sprint é: `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md` +`TUTORIAL.md` +
  `DATA_DICTIONARY.md` (estendidos no lugar) + Project Report on-demand (Sprint 9) + Perfil de
  Projeto (abaixo) + tooltips contextuais.
- **`DATA_DICTIONARY.md`**: mantida a estrutura de tabelas + coluna "Estado" (🟢🟡🔴) já
  existente; adicionado bloco "Detalhamento por métrica" com Categoria/Definição/O que
  representa/Por que coletamos/Exemplo/Relação com outras métricas para as métricas centrais
  reais (TVL, Revenue, Fees, Market Cap, MC/FDV, Fundamental Score, Confidence, Research
  Priority, Funding, Unlocks); métricas citadas no prompt de extensão que não existem no código
  (DEX Volume, Perpetual Volume, Inflows/Outflows, Unlock Pressure etc.) foram listadas
  explicitamente como ausentes, não documentadas como se existissem. Duas informações
  desatualizadas foram corrigidas: Research Trace (só ligado ao Fundamental Score na UI, não a
  todos os scores) e Seleção Top 10 (já implementada desde o Sprint 8).
- **`CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`**: diagrama do pipeline atualizado (Discovery →
  Selection → History/Diff → Knowledge Base, refletindo Sprints 8-10); nova seção F com a
  diferença entre Project Universe / Discovery / Established-Emerging (N/A, não implementado) /
  Fundamental Score / Research Priority / Confidence.
- **`TUTORIAL.md`**: adicionadas as seções "Primeiro acesso" e "Configuração das APIs" (só
  faltavam essas — o resto já estava coberto); seção 2 (Research Run) corrigida para descrever
  Discovery → Selection em vez da antiga lista fixa.
- **Perfil de Projeto** (`apps/web/src/app/dashboard/projects/[slug]/page.tsx`, estendido, não
  uma rota nova): novas seções Identificação (setor/blockchain/narrativa/descoberto em),
  Classificação (Research Priority real; Emerging/Established explicitamente `N/A — critério
ainda não implementado`, nunca inferido), Tokenomics bruto (Market Cap/FDV/supplies/unlocks,
  mesmos dados que já existiam no Project Report), Catalysts/Risks (`N/A — não modelado`, igual
  ao report), e agregados de Capital (`Total Known Capital`/investidores distintos/dias desde
  última captação via `computeFundingAggregates`, já existente mas nunca antes exibido em
  lugar nenhum). `apps/web/src/lib/research.ts` (`getProjectDashboardData`) e
  `apps/web/src/lib/scores.ts` (`getProjectFundingData`) estendidos para carregar esses dados —
  mesmas queries Prisma já usadas por `report.ts`, sem tabela/coluna nova.
- **Ajuda contextual**: novo componente `apps/web/src/components/InfoTooltip.tsx` — popover
  simples aberto por clique (sem hover mágico/posicionamento por mouse), aplicado a 8 métricas
  centrais (TVL, Revenue, Fees, Fundamental Score, Research Priority, MC/FDV, Funding Total,
  Unlock). Conteúdo curto fixo por métrica, não busca dinâmica.
- **Report**: `packages/research-engine/src/report.ts` ganhou os mesmos agregados de Capital
  (`Total Known Capital`/investidores/dias desde última captação) na seção "## Capital", para
  paridade com a UI — único ajuste no motor de relatório, História/Diff inalterados.
- **Segurança**: reconfirmado por grep que nenhuma das mudanças toca `encryptedSecret`/
  `ApiConnection` — nenhuma chave de API chega a UI/Markdown/logs/Research Trace.
- **Testes**: nenhum teste novo criado para a rota HTTP de funding estendida — `apps/web` não
  tinha precedente de teste por rota de projeto individual, e `computeFundingAggregates` já tem
  cobertura direta em `packages/research-engine/tests/funding-and-capital.integration.test.ts`
  (inalterada, continua passando). UI sem teste automatizado, como já era o caso antes deste
  sprint (nenhuma infraestrutura de teste de UI/dashboard existe no projeto).
- **Fora deste sprint** (deliberado, ver auditoria): motor de detecção de Catalysts/Risks,
  classificação Emerging/Established, extensão do Research Trace real (metric→fonte/timestamp)
  para Tokenomics/Capital — todos ficam `N/A` documentado, não implementados nem inferidos.

---

## 2.14 Sprint 12 — Test Reliability + Historical Market Data Foundation (implementado)

Ver `SPRINT_12_IMPLEMENTATION_REPORT.md` para o relatório completo com evidências. Resumo:

- **Parte A (confiabilidade de testes)**: corrigido `DATABASE_URL not found` que fazia 7 de 10
  arquivos de `research-engine` (e também `database`/`apps/web`, achado ao investigar) falharem
  sob `npm test` — `vitest.config.ts` desses 3 workspaces não carregava `.env` (só
  `worker:dev`/`scheduler:dev`/Prisma CLI faziam isso via `dotenv/config`); corrigido com o mesmo
  padrão já usado em `packages/queue` (`tests/setup.ts` + `dotenv`). Revalidados os dois testes
  flaky já documentados (`funding-and-capital.integration.test.ts` e
  `kanban-repository.integration.test.ts`) mais dois problemas NOVOS só visíveis depois da
  correção do DATABASE_URL: (1) `discovery.integration.test.ts` estourava o `hookTimeout` padrão
  (10s) limpando centenas de Projects reais criados na primeira execução — corrigido com
  `hookTimeout: 60_000`; (2) `kanban-repository.integration.test.ts` sofre contenção real de WIP
  Limit quando Vitest roda arquivos em paralelo, porque o Kanban usa um board singleton real
  (`DEFAULT_BOARD_NAME`) — corrigido com `fileParallelism: false` no workspace `research-engine`
  (mais lento, determinístico), não com um segundo board por teste (exigiria parametrizar ~10
  funções de produção, fora de escopo). Também corrigido `selection.integration.test.ts`: um
  teste de idempotência comparava contagem GLOBAL da tabela `projects` entre duas chamadas — o
  próprio arquivo já documentava esse risco no topo, mas o teste violava esse princípio;
  reescrito para verificar ausência de duplicata por `projectId`, imune ao estado global.
- **Parte B (Historical Market Data)**: novo model `MarketDataSnapshot` (preço/market
  cap/volume diários, `packages/database/prisma/schema.prisma`), populado via
  `GET /coins/{id}/market_chart` da CoinGecko (endpoint real já documentado, cliente novo em
  `packages/defi-data/src/coingecko-client.ts`, `getCoinMarketChart`) — só para projetos com
  `coinGeckoId` conhecido, mesmo padrão condicional do enriquecimento de FDV do Sprint 11. INSERT
  -only, idempotente (dedupe por projeto+fonte+timestamp), granularidade diária forçada (`days`
  sempre > 90, único jeito de garantir isso sem plano Enterprise pago), sem OHLC fabricado (a
  fonte só dá um preço por ponto). Isolamento total por projeto no pipeline (nunca aborta a
  Research Run). FDV histórico continua indisponível (fonte não expõe) — documentado, não
  estimado.
- **Drift de schema corrigido de passagem**: `SnapshotSource.COINGECKO` estava no `schema.prisma`
  desde o Sprint 3 mas NUNCA foi de fato adicionado ao enum no Postgres via migration (nenhum
  código chegou a persistir `source: COINGECKO` até este sprint) — corrigido com uma migration
  dedicada (`ALTER TYPE ... ADD VALUE`, em transação própria, requisito do Postgres) antes da
  migration que cria `market_data_snapshots`.
- **Fora deste sprint** (deliberado): Trading Intelligence, Backtesting, Opportunity Engine,
  Second Brain, Catalysts, Risks, Global Score, Tokenomics Score completo, Emerging/Established,
  `TokenUnlock` — nenhum tocado, todos continuam exatamente como estavam.

---

## 2.15 Sprint 13 — Tokenomics (investigação) + Perfil do Projeto + Mercados de Negociação (implementado)

Ver `SPRINT_13_IMPLEMENTATION_REPORT.md` para o relatório completo com evidências. Resumo:

- **Parte A (Tokenomics) — investigado, NÃO implementado com dado real (honestamente)**:
  reconfirmado empiricamente nesta sprint que não existe fonte gratuita viável para Unlock
  Pressure/Distribution/Value Capture: `api.llama.fi/emissions/*` continua HTTP 402 (plano
  pago, testado ao vivo); `GET /coins/{id}` da CoinGecko (inspecionado campo a campo) não expõe
  alocação/distribuição/holders nem cronograma de unlock em nenhum lugar do payload gratuito;
  Tokenomist.ai segue bloqueado por falta de API Key (não obtida nesta sprint). Por instrução
  explícita do prompt do sprint ("se não houver fonte adequada, NÃO criar dados sintéticos"),
  essas 3 dimensões continuam exatamente como estavam — `null`, `missingGroups`, `partial: true`.
  Supply Dilution (a única dimensão com dado real desde o Sprint 11) foi regression-testada, sem
  nenhuma mudança de código. `computeUnlockPressureRatio` (matemática pura já existente desde o
  Sprint 6) permanece pronta e testada para quando/se uma fonte real for integrada no futuro.
- **Parte B (Perfil do Projeto)**: novo model `ProjectProfileSnapshot` (descrição/categorias/
  blockchains/homepage), populado do MESMO payload de `GET /coins/{id}` já buscado para FDV
  (Sprint 11) — **zero chamadas HTTP novas**. INSERT-only com dedupe por CONTEÚDO (não por
  timestamp — evita poluir o histórico com linhas idênticas a cada run só porque o
  `last_updated` da CoinGecko mudou). Exibido no Project Report em nova seção "## Perfil do
  Projeto", com fonte e data de coleta sempre visíveis.
- **Parte B (Onde o Token é Negociado)**: novo model `TokenMarket` (exchange/par/tipo/volume),
  populado ligando `tickers=true` na MESMA chamada de `GET /coins/{id}` (confirmado por chamada
  real: 100 tickers reais para AAVE) — de novo, zero chamadas HTTP novas. UPSERT "estado atual"
  (mesma filosofia de `Token`), nunca ranking/recomendação de exchange (nova seção "## Onde o
  Token é Negociado" no report, sempre com o timestamp da última coleta visível, nunca
  apresentado como fato permanente).
- **Research Trace**: seção "## Sources" do report estendida com as duas novas origens
  (CoinGecko — Perfil do Projeto / CoinGecko — Mercados), mesmo padrão das demais.
- **Fora desta sprint** (deliberado): Trading Intelligence, Pine Script, TradingView,
  Backtesting, Opportunity Engine, Second Brain, Catalysts/Risks completos, Global Score,
  Emerging/Established, multi-tenant/RBAC — nenhum tocado.

---

## 2.16 Sprint 14 — Historical Fundamental Intelligence + Live Home Dashboard (implementado)

Ver `SPRINT_14_IMPLEMENTATION_REPORT.md` para o relatório completo com evidências. Resumo:

- **Camada de matemática pura** (`packages/scoring-engine/src/fundamental-intelligence.ts`,
  `fundamental-intelligence-v1`): Growth/Acceleration, Fundamental Momentum (composto de
  TVL/Revenue/Fees/Volume Growth 30d, só os componentes disponíveis, nunca 0 por ausência),
  comparação de growth entre duas séries (Market vs Fundamentals, Revenue vs TVL), Fundamental
  vs Price Divergence (4 classificações descritivas, nunca Buy/Sell), Valuation Ratios,
  Correlação de Pearson (mínimo de 5 observações pareadas), Leading/Lagging (cross-correlation
  em defasagens), Fundamental Regimes. 34 testes novos.
- **Camada de integração com dados reais** (`packages/research-engine/src/
historical-intelligence.ts`, `computeFundamentalHistoricalIntelligence`): lê TVL/Revenue/Fees
  (Sprint 3) + Price/MarketCap/Volume (`MarketDataSnapshot`, Sprint 12) já persistidos, alinha
  séries por dia, chama a camada pura acima. **Calculado sob demanda, sem tabela nova** — decisão
  arquitetural documentada explicitamente (custo computacional baixo sobre ~365 pontos por série,
  mesma filosofia de `history.ts`/`report.ts` desde o Sprint 9). 9 testes de integração com
  séries controladas (não aleatórias) para afirmar resultados exatos.
- **Project Report**: nova seção "## Inteligência Fundamental Histórica" (cobertura, growth
  7/30/90/180/365d, aceleração, momentum, relações fundamentos×valuation, divergência preço,
  ratios, correlação, leading/lagging, regime) — sempre com fonte/janela/fórmula/timestamp
  visíveis (Research Trace estendido na seção "## Sources").
- **Home do Dashboard deixa de ser menu estático**
  (`apps/web/src/app/dashboard/page.tsx`, consome `GET /api/dashboard/fundamental`): cards de
  Research (projetos pesquisados/Research Runs/última run), Qualidade dos Dados (cobertura
  TVL/Market Data/Revenue/Fees), Movimento Fundamental (tabela — nunca "Top Buys"/"Best
  Coins"/recomendação) e Divergências Fundamentos×Mercado. Agregação nova em
  `packages/research-engine/src/dashboard-intelligence.ts`, escopada aos projetos JÁ pesquisados
  (não ao universo inteiro de Discovery) — decisão de performance documentada, sem cache/Redis
  nesta primeira versão (nenhuma evidência ainda de que seja necessário).
- **Nova rota de API**: `GET /api/projects/[slug]/historical-intelligence` (mesma convenção de
  `/history`/`/report` — identifica por slug, não projectId, "reutilizar a arquitetura
  existente").
- **Fora desta sprint** (deliberado): Pine Script, TradingView, RSI/MACD/indicadores técnicos,
  Backtesting, Opportunity Engine, sinais de compra/venda, Global Score, Second Brain completo,
  Catalysts/Risks completos, Unlock Schedule/Distribution completos — nenhum tocado.

---

## 2.17 Sprint 15 — Catalysts + Risks + Fundamental Context (implementado, escopo real limitado)

Ver `SPRINT_15_IMPLEMENTATION_REPORT.md` e `CATALYSTS_RISKS_ARCHITECTURE.md` (investigação
completa de fontes) para os detalhes. Resumo:

- **Investigação de fontes real** (chamadas ao vivo, não suposição): de 8 candidatas avaliadas,
  só 2 passaram no critério "real + auto-identificável sem curadoria manual": DefiLlama `/hacks`
  (Risk `SECURITY_INCIDENT`, casado por `defillamaId` exato) e `FundingRound` já persistido
  (Catalyst `FUNDING`, zero coleta nova). GitHub Releases e Snapshot.org são APIs reais e
  funcionais, mas exigem mapeamento projeto→repositório/space que não existe hoje — não
  implementadas. CoinGecko `status_updates` confirmado vazio/abandonado em 5 projetos reais
  testados. CryptoPanic exige key (403 sem ela); CoinDesk/TheBlock/Decrypt/Blockworks/
  Cointelegraph/Messari sem API gratuita acessível.
- **Novo model `ResearchEvent`** (taxonomia completa das ~39 categorias pedidas, mas só 2
  populadas hoje — `FUNDING` e `SECURITY_INCIDENT`). Idempotente por `(projectId, source,
sourceId)`.
- **Fundamental Context** (`packages/research-engine/src/fundamental-context.ts`): reúne
  Historical Intelligence (Sprint 14) + Catalysts + Risks + Tokenomics coverage + Capital numa
  visão única — **explicitamente não é Global Score**, testado que o resultado não tem nenhum
  campo de score final.
- **Project Report**: seções `## Catalysts`, `## Risks` e `## Fundamental Context` reais
  (antes eram sempre `N/A`), com Research Trace estendido.
- **Dashboard**: cards de Catalysts (upcoming/recent/completed) e Risks (identified/with
  historical evidence), consolidados na mesma resposta de `GET /api/dashboard/fundamental` (não
  2 rotas novas — decisão de reaproveitamento).
- **Fora desta sprint** (deliberado): Trading Intelligence, RSI/MACD/indicadores técnicos,
  Backtesting, Opportunity Engine, Global Score, Second Brain completo, notícias de veículos de
  imprensa (sem fonte gratuita), resumo por IA de notícias (não há notícias coletadas ainda para
  resumir) — nenhum tocado.

---

## 2.18 Sprint 16 — Event Impact Analysis + Historical Event Intelligence (implementado)

Ver `SPRINT_16_IMPLEMENTATION_REPORT.md` para o relatório completo. Resumo:

- Conecta os eventos reais do Sprint 15 (`FUNDING`/`SECURITY_INCIDENT`) às séries históricas dos
  Sprints 3/12 (TVL/Revenue/Fees/Price/Market Cap/Volume) — janelas 7/14/30d antes/depois de
  cada `eventDate`, baseline = último valor dentro da janela (nunca extrapola de fora dela).
- Reaproveita EXATAMENTE Fundamental Momentum/Regime do Sprint 14 (mesmas funções, mesma versão
  de modelo) — before×after, nunca uma metodologia nova paralela.
- Detecção de eventos sobrepostos: `OVERLAPPING_EVENTS` sempre tem prioridade sobre qualquer
  outra classificação quando outro evento do mesmo projeto cai dentro da janela pós-evento de
  30d — nunca atribui a mudança a um evento isolado quando não é isolado.
- Classificação estritamente descritiva (`FUNDAMENTAL_EXPANSION_AFTER_EVENT`,
  `MARKET_DECLINE_AFTER_EVENT`, `MIXED`, `NO_CLEAR_CHANGE`, `INSUFFICIENT_DATA`,
  `OVERLAPPING_EVENTS`) — nunca Bullish/Bearish/Buy/Sell, nunca "causou".
- Agregação cross-event (média/mediana/min/max por categoria), com `insufficientSample` explícito
  abaixo de 3 observações — nunca tratado como previsão.
- **Calculado sob demanda, sem tabela nova** — mesma decisão e justificativa do Sprint 14.
- Project Report ("## Impacto Histórico de Eventos"), Dashboard ("Event Intelligence"),
  `GET /api/projects/[slug]/event-impacts`, Research Trace estendido.
- **Fora desta sprint** (deliberado): nenhuma fonte nova (reutiliza só as 2 já reais do Sprint
  15), Trading Intelligence, Backtesting, Opportunity Engine, Global Score, inferência causal
  sofisticada, machine learning preditivo — nenhum tocado.

---

## 2.19 Sprint 18 — Catalyst/Risk Source Intelligence Audit + LISTING/DELISTING (implementado,

escopo real limitado)

Nota de nomenclatura: o documento de especificação recebido para esta sprint se autodenomina
"Sprint 17" (Catalyst & Risk Source Expansion), mas "Sprint 17" já havia sido usado no histórico
de commits deste repositório para a tradução PT-BR da descrição do projeto + exibição de
Perfil/Mercados na página do projeto (ver `CLAUDE.md`). Por isso esta sprint é numerada 18 aqui,
mantendo a sequência cronológica real do projeto.

- **Fase de auditoria primeiro, sem implementar nada até concluí-la** (regra explícita do
  documento de especificação) — resultado em `CATALYSTS_RISKS_SOURCE_AUDIT.md`, que estende
  `CATALYSTS_RISKS_ARCHITECTURE.md` (Sprint 15) para as 18 categorias de Catalyst e 19 de Risk
  que ainda não tinham fonte real investigada.
- Confirmado por leitura direta do código (não suposição): `EventImpactEngine` já trata
  `category` como `string` puro em toda a pipeline — nenhuma mudança foi necessária lá para
  novas categorias.
- **Única categoria nova implementada**: Catalyst `LISTING`/`DELISTING`, derivada do diff de
  `TokenMarket` (já coletado desde o Sprint 13) entre duas Research Runs consecutivas — **zero
  chamada HTTP nova**. `packages/research-engine/src/profile-repository.ts`
  (`getCurrentTokenMarketKeys`, lê o estado ANTES do upsert da run corrente) +
  `packages/research-engine/src/events-repository.ts`
  (`persistTokenMarketListingCatalysts`/`collectTokenMarketListingCatalysts`).
  - Na primeira coleta de um projeto (nenhum `TokenMarket` anterior), nenhum evento é emitido —
    listar tudo como "LISTING" seria fabricar histórico nunca presenciado.
  - `eventDate` reflete o momento em que a mudança foi PERCEBIDA (retrievedAt da run atual), não
    a data real do anúncio da exchange — granularidade limitada ao intervalo entre Research
    Runs. `confidence` é `MEDIUM` (não `HIGH`) exatamente por essa imprecisão de data.
  - `sourceId` inclui o dia da detecção (`stableSourceId("LISTING"|"DELISTING", key,
YYYY-MM-DD)`) — permite um novo evento se o mesmo mercado for delistado e relistado depois,
    sem duplicar dentro do mesmo dia.
  - Conectado ao pipeline (`pipeline.ts`, dentro do bloco condicional a `coinGeckoId`, logo antes
    do upsert de `TokenMarket`) e ao Dashboard (`KNOWN_EVENT_CATEGORIES` em
    `dashboard-intelligence.ts`). Project Report e `getCatalysts`/`getRisks` já são genéricos por
    categoria — nenhuma mudança necessária.
- **Risk `TOKEN_UNLOCK` — PRONTO, NÃO ATIVADO** (adicionado depois, a pedido explícito do
  usuário: "deixar pronto, mas não irei usar agora"). Única fonte estruturada real é paga
  (DefiLlama Pro, US$300/mês) — o código de coleta/normalização/persistência foi implementado
  por completo e conectado ao pipeline (`packages/defi-data/src/client.ts` `getTokenUnlocks`,
  `packages/research-engine/src/events-repository.ts`
  `persistTokenUnlockRisks`/`collectTokenUnlockRisks`,
  `packages/research-engine/src/pipeline.ts` `resolveDefiLlamaProApiKey`), mas o gatilho único
  para ativação é uma `ApiConnection(provider="DEFILLAMA_PRO")` com secret configurado em
  Settings (terceiro provider real ao lado de DEFILLAMA/COINGECKO,
  `apps/web/src/lib/connections.ts`) — sem essa key, zero chamada HTTP, zero custo. A estrutura
  do payload foi construída a partir de documentação pública da DefiLlama Pro API, **nunca
  validada contra uma resposta real** (nenhuma key paga foi adquirida) — precisa ser conferida
  no dia em que uma key for configurada, antes de confiar cegamente no resultado. Ver
  `SPRINT_17_IMPLEMENTATION_REPORT.md` para os detalhes completos.
- **Categorias avaliadas e rejeitadas nesta sprint** (ver seção 6 do audit para a justificativa
  completa de cada uma): `PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET` via GitHub Releases e
  `GOVERNANCE` via Snapshot.org (ambas APIs reais/gratuitas/testadas, mas exigem curadoria manual
  de `Project.githubRepo`/`Project.snapshotSpace` que não existe hoje — decisão de produto
  pendente de aprovação do usuário, não implementada); `LISTING` via anúncio oficial de exchange
  (Binance não tem API pública oficial, a não-oficial retorna 403); as demais 12 categorias de
  Catalyst e 17 de Risk (sem fonte estruturada, automatizável e auto-identificável encontrada —
  a maioria dos Risks restantes é de natureza estrutural/contínua, não um "fato pontual com
  data", o que não se encaixa no modelo `ResearchEvent` sem uma decisão de produto separada).
- **Fora desta sprint** (deliberado): nenhuma fonte paga adicionada sem aprovação explícita de
  custo, nenhuma curadoria manual de mapeamento projeto→repositório/space, nenhum scraping
  frágil, nenhuma fabricação de cobertura para "completar" o enum `ResearchEventCategory`.

---

## 2.20 Sprint 19 — External Identity Mapping & Governance Intelligence (implementado)

Ver `SPRINT_19_IMPLEMENTATION_REPORT.md` e `EXTERNAL_IDENTITY_ARCHITECTURE.md` para os
detalhes completos. Resumo:

- **`Project.githubRepo`/`Project.snapshotSpace`** (colunas opcionais diretas em `Project`,
  Opção A escolhida sobre uma tabela `ProjectExternalIdentity` genérica — abstração prematura
  para só 2 identificadores 1:1). Preenchidos SOMENTE por curadoria manual via
  `PATCH /api/projects/[slug]` (UI mínima de 2 campos na página do projeto) — nunca inferidos
  por matching de nome. Validação anti-SSRF em dois pontos independentes
  (`packages/defi-data/src/external-identity.ts`): na API de curadoria e de novo em cada client,
  antes de montar qualquer URL.
- **GitHub Releases** (`packages/defi-data/src/github-client.ts`) — API oficial keyless,
  paginada (até 500 releases/projeto), confirmada AO VIVO contra
  `api.github.com/repos/aave/aave-v3-core/releases`. Vira Catalyst categoria SEMPRE `OTHER`
  (nunca `MAINNET`/`PROTOCOL_UPGRADE` sem evidência textual clara — regra explícita da sprint),
  `confidence` `MEDIUM` (publicada) ou `LOW` (draft).
- **Snapshot Governance** (`packages/defi-data/src/snapshot-client.ts`) — GraphQL oficial
  keyless, paginado, confirmado AO VIVO contra o space real `ens.eth` (2 propostas reais
  recuperadas com todos os campos). Vira Catalyst categoria `GOVERNANCE`, `confidence` `HIGH`
  (fonte primária estruturada), `status` mapeado diretamente do `state` cru da fonte
  (`pending`/`active`/`closed`→`SCHEDULED`/`ONGOING`/`COMPLETED`, outro→`UNKNOWN`).
- Ambos conectados ao pipeline (`pipeline.ts`, condicional a `githubRepo`/`snapshotSpace`
  configurado, cada um isolado por `try/catch` independente) e ao Dashboard
  (`KNOWN_EVENT_CATEGORIES` estendido com `GOVERNANCE`/`OTHER`). Nenhuma mudança necessária em
  `EventImpactEngine`/`report.ts` (já genéricos por categoria, confirmado por leitura direta).
- **Correção de 2 dívidas de teste pré-existentes** (pedido explícito da sprint): bug de path em
  `apps/web/tests/setup.ts` (`../../.env` → `../../../.env`, corrigindo 12 testes que falhavam
  com `DATABASE_URL not found`) e cleanup incompleto em `discovery.integration.test.ts` (4
  tabelas faltando no `afterAll`: `MarketDataSnapshot`/`ProjectProfileSnapshot`/`TokenMarket`/
  `ResearchEvent`, adicionadas desde os Sprints 12/13/15 e nunca incluídas na limpeza).
- **`npm run build` executado pela primeira vez** (pendência explícita apontada no
  `SPRINT_17_IMPLEMENTATION_REPORT.md`) — passou limpo, 1 warning pré-existente não relacionado
  (dependência opcional do BullMQ).
- Resultado: **396 testes passando, 0 falhando**, em todos os 7 workspaces — zero falhas
  pré-existentes remanescentes.
- **Fora desta sprint** (deliberado): `PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET`/`TOKEN_MIGRATION`/
  `TOKEN_BURN`/etc. via interpretação de texto de release/proposta (exigiria inferir significado
  sem evidência clara, proibido explicitamente); `TOKEN_UNLOCK` não tocado (segue pronto,
  inativo, Sprint 18).

---

## 2.21 Sprint 20 — Auditable Event Classification Engine (implementado)

Ver `SPRINT_20_IMPLEMENTATION_REPORT.md` e `EVENT_CLASSIFICATION_ARCHITECTURE.md` para os
detalhes completos. Resumo:

- Até o Sprint 19, todo evento do GitHub Releases virava Catalyst `OTHER` sempre. O Sprint 20
  substitui isso por uma engine determinística
  (`packages/scoring-engine/src/event-classification.ts`, `classifyEvent`) — 12 categorias
  (`MAINNET`, `TESTNET`, `PROTOCOL_UPGRADE`, `TOKEN_MIGRATION`, `TOKEN_BURN`, `TOKEN_BUYBACK`,
  `STAKING`, `NEW_CHAIN`, `ECOSYSTEM_EXPANSION`, `PRODUCT_LAUNCH`, `INTEGRATION`,
  `PARTNERSHIP`), regras conservadoras baseadas em regex verbo+ação (nunca
  `text.includes("palavra-chave")` isolado — "Preparing for mainnet" nunca vira `MAINNET`,
  testado explicitamente). Nenhum LLM, nenhuma IA — `FUTURE_LLM` existe só como valor reservado
  no enum, nunca usado.
- **Schema**: `ResearchEvent` ganhou 3 campos nullable —
  `classificationMethod`/`classificationRuleId`/`classificationEvidence` — e um novo enum
  `ResearchEventClassificationMethod` (`STRUCTURED_SOURCE`/`RULE`/`MANUAL`/`FUTURE_LLM`). O
  campo `confidence` já existente foi reaproveitado como a confiança da classificação (nenhum
  campo novo separado para isso).
- Fontes ESTRUTURADAS (Snapshot/FundingRound/DefiLlama `/hacks`/diff de `TokenMarket`/DefiLlama
  Pro emissions) marcadas `STRUCTURED_SOURCE` e **nunca passam pela engine** — confirmado por
  teste: uma proposta Snapshot com "mainnet" no título continua `GOVERNANCE`.
- GitHub Releases (`persistGithubReleaseCatalysts`) agora chama `classifyEvent` de verdade sobre
  título+corpo do release (`NormalizedGithubRelease.body`, novo campo — usado só para
  classificar, nunca persistido em `ResearchEvent.description`). Releases draft sempre recebem
  `confidence: LOW`/`status: UNKNOWN` independente da categoria classificada.
- Mecanismo de reclassificação (`reclassifyExistingGithubEvents`, script `npm run
reclassify-events`) — idempotente, nunca toca fontes estruturadas, nunca altera
  `sourceId`/`eventDate`/`publishedAt`/`retrievedAt`. Limitação documentada: só tem o `title`
  disponível (o `body` nunca foi persistido), então reclassificação de eventos antigos é menos
  precisa que a classificação original.
- Dashboard (`KNOWN_EVENT_CATEGORIES`) e leitura de eventos (`getCatalysts`/`getRisks`)
  estendidos para expor as novas categorias e os campos de classificação (auditoria via API,
  sem poluir a tabela do Project Report).
- Resultado: **423 testes passando, 0 falhando** (27 novos: 21 da engine pura + 6 de
  persistência/reclassificação), typecheck/lint/build limpos, 0 findings de segurança (ReDoS
  auditado — regex simples sem quantificadores aninhados; XSS auditado — nenhum
  `dangerouslySetInnerHTML` no app).

---

## 2.22 Sprint 21 — Production Event Activation & Coverage Validation (implementado)

Ver `SPRINT_21_IMPLEMENTATION_REPORT.md` para os detalhes completos. Resumo:

- **Primeira validação end-to-end com dados 100% reais.** 4 projetos DeFi reais (Aave V3,
  Uniswap V4, Compound V3, Lido) — `defillamaId` real via pipeline real, `githubRepo`/
  `snapshotSpace` verificados ao vivo (GitHub API + Snapshot GraphQL) antes de curar, nunca
  inferidos por nome.
- **1.244 eventos reais persistidos**: 85 GitHub Releases + 1.159 propostas Snapshot.
  Idempotência confirmada em 3 execuções completas do pipeline (0 duplicações).
- **Achado principal sobre a Classification Engine**: as 12 regras do Sprint 20 tiveram **0% de
  match em produção** — todos os 85 releases GitHub reais caíram em `OTHER`/`LOW`. Auditoria
  manual de 100% da amostra (85/85) confirmou: 83 `CORRECT_OTHER`, 2 `AMBIGUOUS`, 0 falso
  positivo, 0 falso negativo confirmado. Causa raiz identificada: GitHub Releases devolve
  changelogs técnicos terse (`"v1.19.4"`, `"Compound v2.31"`), não anúncios estilo
  press-release que as regras (corretamente conservadoras) exigem. Nenhuma regra foi alterada
  sem evidência real.
- Snapshot Governance confirmado 100% confiável com dados reais — 62 das 1.159 propostas reais
  contêm "mainnet"/"upgrade"/"staking" no título e **todas** permaneceram `GOVERNANCE`/`HIGH`,
  nunca contaminadas pela engine textual (que nunca é chamada para eventos Snapshot).
- **Bug real de infraestrutura encontrado e corrigido**: `getEventImpactsForProject`
  (`packages/research-engine/src/event-impact-engine.ts`) estourava o connection pool padrão do
  Prisma (5 conexões) com `Promise.all` sem limite — só reproduzível com volume real (Lido, 35
  eventos). Corrigido com processamento sequencial + teste de regressão. Nenhuma fixture
  anterior tinha eventos suficientes para expor isso.
- Event Impact validado com 10 eventos reais de Lido (todos `OVERLAPPING_EVENTS`, resultado
  correto dado o volume real de propostas próximas no tempo). Dashboard validado parcialmente
  (escopo confirmado por query direta — 35 eventos reais na janela de 30d — mas a chamada
  completa da função foi interrompida por limite de memória do ambiente local, não do código).
- Resultado: **424 testes passando, 0 falhando** (423 + 1 regressão nova), typecheck/lint/build
  limpos, 0 findings de segurança. **Nenhuma nova categoria/regra adicionada** — Sprint 21 foi
  deliberadamente sobre validação, não sobre expansão de features.

---

## 2.23 Sprint 22 — Multi-Sector Event Source Expansion & Intelligence Coverage (implementado)

Ver `SPRINT_22_IMPLEMENTATION_REPORT.md` para os detalhes completos. Resumo:

- **Amostra expandida de 4 para 7 projetos reais**, cobrindo 6 setores: GMX V2 Perps
  (Derivatives), Stargate V2 (Cross-Chain Bridge), Balancer V2 (AMM) — além dos 4 já curados no
  Sprint 21. `curve-dex` falhou isolado (`"Resposta JSON inválida"` da própria DefiLlama para
  esse protocolo especificamente — não investigado a fundo, fora do escopo).
- **433 eventos GitHub reais coletados** (era 85) — **100% permaneceram `OTHER`**, confirmando
  em 6 setores que a baixa densidade de sinal de anúncio em GitHub Releases não é peculiaridade
  do setor Lending observado no Sprint 21.
- **Primeira vez que a Classification Engine disparou de verdade em produção**: 28 matches reais
  (26 `MAINNET` + 2 `TESTNET`) em Stargate. Auditoria do corpo real de 2 releases via GitHub API
  confirmou **falso positivo real**: a frase `"<ChainName> mainnet/testnet deployment"` aparece
  rotineiramente em changelogs automáticos (changesets bot) de bridges cross-chain para
  descrever adição de suporte a uma nova chain (ex.: `"InjectiveEVM mainnet deployment"`), não
  um anúncio de lançamento do próprio protocolo.
- **Regras corrigidas com evidência real**: `mainnet-launch-v1`/`testnet-launch-v1` →
  `mainnet-launch-v2`/`testnet-launch-v2` — removido o padrão bare "X deployment"
  (`packages/scoring-engine/src/event-classification.ts`), mantidas as frases inequívocas
  (is live/launched/goes live). 2 testes de regressão adicionados.
- **Primeiro uso em produção do mecanismo de reclassificação** (Sprint 20,
  `reclassifyExistingGithubEvents`): 28 eventos já persistidos corrigidos (`scanned: 346,
reclassified: 28, unchanged: 318`), 0 remanescentes com categoria incorreta.
- **Nenhuma fonte nova implementada** — Official Blog/Announcements, Discourse (fóruns de
  governança), GitHub Commits/Tags investigados e rejeitados (sem host único/schema
  identificável, ou sem ganho semântico sobre Releases). Decisão registrada:
  `GITHUB_AS_SOURCE = PARTIALLY` (tecnicamente sólido, mas não é fonte primária adequada de
  catalisadores de anúncio); `CLASSIFICATION_ENGINE = KEEP` (com a correção pontual já
  aplicada).
- Idempotência confirmada em 3 execuções completas (0 duplicações). Event Impact validado com
  dados reais de um setor novo (GMX/Derivatives). Dashboard (`getEventIntelligenceOverview`) NÃO
  validado integralmente — interrompido por memória do ambiente local pela 2ª vez consecutiva
  (Sprint 21 e 22); recomendado revisitar em ambiente com mais memória.
- Resultado: **426 testes passando, 0 falhando** (424 + 2 de regressão), typecheck/lint/build
  limpos, 0 findings de segurança.

---

## 2.24 Sprint 23 — Discourse Governance Intelligence (implementado)

Fóruns Discourse oficiais como fonte de eventos de governança, complementar a Snapshot (votações)
e GitHub Releases (changelogs). Ver `DISCOURSE_SOURCE_ARCHITECTURE.md` e
`SPRINT_23_IMPLEMENTATION_REPORT.md`.

- `Project.discourseForumUrl` (curadoria manual via `PATCH /api/projects/[slug]`, validação
  anti-SSRF em `isValidDiscourseForumUrl`, host não fixo), `packages/defi-data/src/
discourse-client.ts` (`getDiscourseTopics`, keyless, 2 páginas / 40 tópicos por run),
  `normalizeDiscourseTopic`, `persistDiscourseTopicCatalysts`, bloco isolado no pipeline.
- **Achado principal:** a Classification Engine (Sprint 20) **não serve** para texto de fórum.
  Auditoria real de 240 tópicos (6 fóruns): 32 casaram alguma regra e cerca de metade eram falsos
  positivos claros (ex.: "Delegate Platform" → `NEW_CHAIN`). Decisão: Discourse é fonte
  estruturada — `GOVERNANCE` / `STRUCTURED_SOURCE`, `confidence` MEDIUM, `status` UNKNOWN, sem
  chamar a engine. Nenhuma regra foi alterada. (A auditoria foi sobre título + evidência curta,
  não sobre o corpo completo dos posts.)
- **Dados reais:** 7 projetos, 6 fóruns (`stargate-v2` sem fórum Discourse conhecido); 240 eventos
  Discourse, 1.890 Snapshot, 433 GitHub (idêntico ao Sprint 22).
- **Incidente de infraestrutura:** o Postgres local perdeu todos os dados (29 tabelas, 2.323+
  eventos) por provável instabilidade Docker Desktop/WSL2 — ver gotcha em `CLAUDE.md`. Os 7
  projetos foram re-curados a partir dos relatórios dos Sprints 21/22 (mappings **não**
  reverificados ao vivo nesta sprint).
- **Dívida técnica:** a coleta ainda busca o corpo de cada tópico (1 request por tópico, até 40 por
  fórum), que a decisão acima não usa mais — é o que torna a coleta lenta (~1–2 min por fórum).
- Não validado: Event Impact e Dashboard com os eventos Discourse.
- Resultado: **440 testes passando, 0 falhando**, typecheck/lint/build limpos.
- Fora do Sprint 23: `.github/workflows/ci.yml` disparava só em push para `main` (branch
  inexistente); corrigido para `master` no commit `febe170`. Primeira execução do CI em push ainda
  não conferida.

---

## 3. O que falta

### 3.1 Fora de escopo (deliberadamente, confirmado ausente no código)

- **Second Brain**: só existe o contrato de entrada/saída definido no plano — nenhuma implementação real em nenhum package.
- **Pine Script / TradingView / Technical Score / Opportunity Engine**: zero referências no código, nem reservado no schema do banco.
- **Backtesting / Historical Intelligence avançada**: não implementado — há apenas um comentário em `scoring-engine/src/confidence.ts` observando que ainda não existe ajuste de parâmetros baseado em backtest.
- **Multi-tenant / RBAC**: não implementado — há um comentário em `apps/web/src/lib/auth.ts` deixando explícito que o design atual é single-user.
- **Improvement Proposals automáticos**: nenhum código encontrado.

### 3.2 Lacunas dentro do escopo já assumido

- **Tokenomics Score parcialmente sem fonte de dado (revalidado no Sprint 13, 2026-09-18)**: dos
  4 grupos, só Supply Dilution usa dado real (CoinGecko/FDV, Sprint 11). Unlock Pressure e
  Distribution seguem sem fonte gratuita — Tokenomist.ai (`api.tokenomist.ai/v4`) continua
  bloqueado por falta de API Key; `api.llama.fi/emissions/*` reconfirmado HTTP 402 (pago) por
  chamada real nesta sprint; a CoinGecko não expõe esses dados em nenhum campo do payload
  gratuito de `/coins/{id}` (inspecionado campo a campo no Sprint 13). Value Capture segue sem
  candidato de fonte identificado. Nenhuma das 3 foi implementada com dado sintético.
- **Página de "Narrativas"**: mencionada no plano original (seção 5, escopo do MVP) mas não existe no dashboard atual — provavelmente foi absorvida pela página de rankings, ou simplesmente ainda não foi construída.
- **Infraestrutura parcialmente containerizada**: o `docker-compose.yml` só sobe Postgres e Redis. O worker e o scheduler rodam como processos TypeScript separados (`npm run worker:dev` / `npm run scheduler:dev`), não como serviços no compose — ou seja, "subir o projeto" hoje exige rodar 2–3 comandos manuais, não `docker compose up` sozinho.
- **Sem testes de UI/dashboard**: toda a cobertura de teste está em backend (engines, repositórios, API routes) — não há testes de componente ou end-to-end para as páginas React do dashboard.
- **Repositório git inicializado (2026-09-19, Sprint 16)**: `git init` + primeiro commit feitos, mas ainda sem remoto configurado — o CI (`.github/workflows/ci.yml`) só passa a rodar de verdade depois de um `git push` para um repositório no GitHub.
- **`npm test` na raiz exigia exportar `DATABASE_URL` manualmente (corrigido no Sprint 12)**: ver
  seção 2.14 — não é mais uma lacuna, registrado aqui só para histórico de quem ler versões
  antigas deste arquivo.
- **`funding-and-capital.integration.test.ts` — bug de ordem de FK no `afterAll` (não reproduzido
  no Sprint 12)**: o código atual já apaga `funding_round_investors`/`fundingRound` ANTES de
  `investor` (ordem correta), com um `.catch(() => {})` só no `deleteMany` de `Investor` (entidade
  global, best-effort). Revalidado 3x isolado e 1x dentro de `npm test` completo no Sprint 12 — os
  5 testes e o cleanup da suíte passaram limpos em todas as execuções, nenhuma falha de FK
  observada. Não foi possível reproduzir o bug descrito originalmente no Sprint 7; ou já havia
  sido corrigido silenciosamente em alguma sessão anterior sem atualizar este arquivo, ou exigia
  uma condição de corrida específica (dois arquivos de teste tocando `Investor` ao mesmo tempo)
  que deixou de ocorrer no `research-engine` desde que `fileParallelism: false` foi ativado neste
  mesmo Sprint 12 (ver acima). Mantendo a nota aqui só como histórico — se reaparecer, investigar
  de novo em vez de assumir que está definitivamente resolvido.
- **Preço/OHLCV histórico**: coleta iniciada no Sprint 12 (`MarketDataSnapshot`, granularidade
  diária), mas ainda não há nenhum consumidor (momentum, divergência, indicadores) — só a
  fundação de dados existe.
- **FDV histórico**: continua indisponível — a CoinGecko não expõe isso no endpoint gratuito de
  série histórica (`market_chart`), só no snapshot atual (`Token.fdvUsd`, Sprint 11).

### 3.3 Descompasso entre plano e código

O `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` (documento de planejamento original) está
desatualizado em pelo menos dois pontos:

1. Ainda descreve o repositório como "100% Fase 0, nada implementado" — não reflete o estado atual (Sprints 1–7 prontos).
2. Lista Funding/VC/Investidores/Tokenomics/Unlocks como "fora do MVP, prioridade P2" — mas esses recursos já estão totalmente implementados (schema, scoring, repositório e API), ou seja, o escopo cresceu além do que o plano registra.

Isso não é um problema funcional, mas vale atualizar o plano (ou pelo menos marcar essas
seções como desatualizadas) para não confundir quem ler o documento depois.

### 3.4 Limpeza pendente (organização, não funcionalidade)

- Artefatos locais (`.claude/scheduled_tasks.lock`, `*.tsbuildinfo`, `bash.exe.stackdump`) já estão no `.gitignore` e fora do índice (commit `d6b7bd3`). `ajuste.png` na raiz é uma imagem de referência de um ajuste de layout já corrigido — mantida de propósito. Nada mais pendente de limpeza nesta seção.

---

## 4. Resumo em uma frase

O núcleo funcional do produto (coleta de dados → pipeline de pesquisa assíncrono →
três engines de score → rankings/trace → Kanban operacional) está implementado,
testado e além do escopo originalmente planejado; o que falta é majoritariamente
o que já era esperado ficar para depois (Second Brain, Technical Score, Backtesting,
multi-tenant), mais alguns ajustes de organização (containerização completa,
testes de UI, atualização do plano, inicialização do git).

---

## 5. Sessão 2026-09-17 — mudanças desta sessão

- **Kanban — Cronômetro de Data Collection**: novo indicador na página do Kanban (tempo ao vivo
  da tarefa em andamento em Data Collection, comparado com a média histórica, verde/vermelho).
  Ver `apps/web/src/app/dashboard/kanban/page.tsx` (`DataCollectionTimer`) e TUTORIAL.md seção 17.
- **Kanban — Cancelamento reverte cards para Backlog**: `revertRunCardsToBacklog`
  (`packages/research-engine/src/kanban-repository.ts`) — cards de uma run cancelada que
  estavam em Discovery/Data Collection/Fundamental Analysis/Scoring voltam pra Backlog (nunca
  apagados), e esses movimentos são excluídos do cálculo de Cycle Time médio
  (`RUN_CANCELLED_MOVEMENT_REASON`, filtrado em `kanban-metrics.ts`).
- **Kanban — Baseline de métrica resetável**: `resetDataCollectionMetricBaseline`/
  `getDataCollectionMetricBaseline` (reaproveita `KanbanPolicy`, mesmo mecanismo do
  `urgent_policy`) — permite "zerar" a média de Data Collection sem apagar histórico real.
- **Correção de bug real na tela de Configurações** (`apps/web/src/app/dashboard/settings/page.tsx`):
  CoinGecko estava marcado `implemented: false` (desatualizado desde o Sprint 11, quando passou a
  ser um provider real) e a busca de conexão estava hardcoded só pra `DEFILLAMA` — CoinGecko nunca
  apareceria configurável na UI mesmo corrigindo o primeiro problema. Os dois corrigidos.
- **Correção de comentários desatualizados sobre Tokenomics Score**: `fdvUsd`/MC-FDV (Supply
  Dilution) foram documentados como "sempre `null`" em vários lugares
  (`tokenomics-score-repository.ts`, `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`, `DATA_DICTIONARY.md`)
  quando na verdade já funcionam de verdade desde a integração CoinGecko (Sprint 11) — confirmado
  com dados reais em produção (percentis reais calculados). Unlock Pressure/Distribution/Value
  Capture continuam sem fonte real.
- **Integração Tokenomist.ai identificada, não implementada ainda**: candidato de fonte pra
  Unlock Pressure e Distribution do Tokenomics Score (`api.tokenomist.ai/v4`,
  `/unlock-events/{tokenId}`). Bloqueada por falta de API Key (trial gratuito disponível) — o
  parser não pode ser escrito sem ver um payload real (nunca se adivinha schema de API externa).
- **Research — destaque adaptativo "aprende com os dados"**: nova página `/dashboard/research`
  destaca (fundo verde + tooltip educativo) projetos cujo `priorityScore` está no percentil ≥90
  contra toda a população histórica de seleções — recalibra sozinho a cada Research Run, sem
  limiar fixo. Também confirma, com dados reais do Diff Engine (Sprint 9), se um destaque
  anterior se sustentou. Ver `packages/research-engine/src/selection-relevance.ts` e TUTORIAL.md
  seção 19.
- **Limpeza manual de dados de teste**: 9 cards Published antigos deletados, 78 cards presos em
  Discovery/Data Collection (de runs `FAILED`/`PARTIAL` antigas, não relacionadas ao código de
  cancelamento) revertidos pra Backlog, baseline de Data Collection resetada — banco dev limpo
  pra validar as features acima do zero.

## 6. Próximos Sprints sugeridos (para retomar depois)

Nenhuma dessas 4 é bloqueante entre si — podem ser feitas em qualquer ordem, exceto onde indicado.

1. **Tokenomist.ai — Unlock Pressure + Distribution** (retomar quando houver API Key):
   client HTTP (`packages/defi-data`, mesmo padrão anti-SSRF/retry do CoinGecko), parser real
   (só depois de ver um payload de verdade), novo valor `TOKENOMIST` no enum `SnapshotSource`
   (migration), opção na tela de Conexões, popular `TokenUnlock` de verdade no pipeline.
   Resolveria 2 dos 4 grupos vazios do Tokenomics Score.
2. **Value Capture (Tokenomics Score)**: ainda sem candidato de fonte gratuita/trial
   identificado (staking/buyback/burn/revenue share). Precisa de pesquisa de mercado antes de
   qualquer implementação — não adivinhar fonte.
3. **`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` desatualizado**: ainda descreve o repo como "Fase
   0, nada implementado" e lista Funding/Tokenomics/Unlocks como fora do MVP — vale reescrever
   ou pelo menos marcar as seções obsoletas, para não confundir leitura futura (seção 3.3 acima).
4. **Limpeza de organização** (baixo risco, baixo esforço): decidir sobre containerizar
   worker/scheduler no `docker-compose.yml`; conferir a primeira execução do CI em push para
   `master` na aba Actions (o remoto GitHub e o `push` já funcionam, e o workflow passou a
   disparar em `master` no commit `febe170`). Artefatos locais já estão no `.gitignore` (seção
   3.4). (O bug de ordem de FK do `funding-and-capital.integration.test.ts` já foi revalidado e
   não reproduzido no Sprint 12 — ver seção 3.2.)

Fora de escopo deliberado, sem mudança de status (ver seção 3.1): Second Brain completo,
Pine Script/Technical Score, Backtesting avançado, multi-tenant, Improvement Proposals
automáticos — nenhum desses tem trabalho parcial pendente, são features novas do zero.
