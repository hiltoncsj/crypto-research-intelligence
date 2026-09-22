# PROJECT_COMPLETION_AUDIT.md

> Auditoria de estado / gap analysis, gerada em 2026-09-22 por leitura direta do código-fonte,
> schema Prisma, rotas de API, testes e documentação existente no repositório
> `C:\DEV\CryptoResearchIntelligence`. Este documento é **read-only** em relação ao código,
> schema, migrations e dependências do projeto — nenhuma alteração foi feita neles. Toda
> afirmação relevante cita caminho de arquivo, nome de teste ou é marcada como
> `NOT VERIFIED — Reason: ...`. **Atualização pós-auditoria (mesmo dia)**: `npm test` e
> `npm run build` completos foram executados em rodada de follow-up (fora do escopo read-only
> original) para fechar o gap identificado na Seção 31 — ver Seção 21 para o resultado.
>
> **Overall completion percentage: NOT CALCULATED — Reason: nenhuma metodologia de pesos
> objetiva e reproduzível foi definida para este projeto (features têm tamanho/risco muito
> desiguais — comparar "GET /hacks" com "Kanban Pull System completo" com um número único seria
> enganoso). A tabela executiva abaixo e a Seção 24 dão o detalhamento por área em vez de um
> percentual agregado.**

## Tabela executiva

| Área                | Estado                     | Implementação                                                                                                           | Integração                                                                                                                                      | Validação                                                                                                                                                                                | Falta                                                                                                                                                               |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Discovery   | DONE                       | `packages/research-engine/src/discovery.ts`, `selection.ts`                                                             | Rodada dentro de `runManualResearchPipeline` (`pipeline.ts`)                                                                                    | Testes de integração (`discovery.integration.test.ts`, `selection.integration.test.ts`)                                                                                                  | NOT VERIFIED se já rodou fim-a-fim em produção real (sem ambiente de produção neste repo)                                                                           |
| Market Data         | DONE                       | `packages/defi-data/src/{client,coingecko-client,adapter}.ts`                                                           | Persistido via `market-data-repository.ts`, consumido pelo pipeline                                                                             | Testes contra `api.llama.fi`/CoinGecko reais (`client.integration.test.ts`, `coingecko-client.test.ts`), sem mock (política do projeto)                                                  | —                                                                                                                                                                   |
| Fundamentals        | DONE                       | `TvlSnapshot`/`RevenueSnapshot`/`FeeSnapshot`, `metrics.ts`                                                             | Consumido por Fundamental Score e Historical Intelligence                                                                                       | `metrics.test.ts`, integração via pipeline                                                                                                                                               | —                                                                                                                                                                   |
| Tokenomics          | PARTIAL                    | `Token`, `TokenMarket`, `tokenomics-score.ts`                                                                           | Integrado ao pipeline e à UI                                                                                                                    | `tokenomics-score.test.ts`                                                                                                                                                               | Unlock Pressure/Distribution/Value Capture permanecem `null` — sem fonte gratuita (documentado no CLAUDE.md); `TOKEN_UNLOCK` pronto mas inativo (ver Seção 8)       |
| Funding             | DONE                       | `FundingRound`, `Investor`, `FundingRoundInvestor`, `funding-repository.ts`                                             | Rota `projects/[slug]/funding`, Fundamental Context, Report                                                                                     | `funding-and-capital.integration.test.ts`                                                                                                                                                | —                                                                                                                                                                   |
| Security            | PARTIAL                    | `GET /hacks` (DefiLlama) → `events-repository.ts` (`persistSecurityIncidentRisks`)                                      | Integrado a Research Events, Event Impact, Report                                                                                               | `events-repository.integration.test.ts`                                                                                                                                                  | Cobertura depende inteiramente de `/hacks` estar preenchido para o protocolo — sem fonte alternativa                                                                |
| Events              | DONE                       | `ResearchEvent` + 6+ fontes estruturadas (hacks, FundingRound, Listing/Delisting, Snapshot, Discourse, GitHub Releases) | `events-repository.ts`, pipeline                                                                                                                | `events-repository.integration.test.ts`                                                                                                                                                  | —                                                                                                                                                                   |
| Classification      | PARTIAL                    | `scoring-engine/src/event-classification.ts` (engine determinística)                                                    | Usada **só** para GitHub Releases (por decisão documentada)                                                                                     | `event-classification.test.ts`                                                                                                                                                           | Escopo intencionalmente restrito — não é gap, é decisão arquitetural (Discourse testado e rejeitado, ~50% falso positivo, Sprint 23)                                |
| Event Impact        | DONE                       | `event-impact-engine.ts`, `scoring-engine/src/event-impact.ts`                                                          | Rota `projects/[slug]/event-impacts`, batch size 1 (pool de conexões)                                                                           | `event-impact-engine.integration.test.ts`, `event-impact.test.ts`                                                                                                                        | —                                                                                                                                                                   |
| Fundamental Context | DONE                       | `fundamental-context.ts`                                                                                                | Rota `projects/[slug]/fundamental-context`; explicitamente não é Global Score                                                                   | `fundamental-context.integration.test.ts`                                                                                                                                                | —                                                                                                                                                                   |
| Scoring             | DONE                       | Fundamental/Tokenomics/Institutional Capital Score, sempre `INSERT`                                                     | Rotas `score`, `tokenomics-score`, `capital-score`                                                                                              | `fundamental-score.test.ts`, `tokenomics-score.test.ts`, `capital-score.test.ts`                                                                                                         | —                                                                                                                                                                   |
| Research Trace      | DONE                       | `scoring-engine/src/trace.ts`                                                                                           | Exposto junto ao score                                                                                                                          | `trace.test.ts`                                                                                                                                                                          | —                                                                                                                                                                   |
| Dashboard           | DONE (para o escopo atual) | 6 páginas (`dashboard/{page,kanban,rankings,research,settings}.tsx`, `projects/[slug]/page.tsx`)                        | Consome as rotas API acima                                                                                                                      | Sem teste de UI end-to-end encontrado (`NOT VERIFIED`)                                                                                                                                   | Sem cobertura de teste de front-end                                                                                                                                 |
| Reports             | DONE                       | `report.ts`, rota `projects/[slug]/report`, Markdown + download                                                         | `RESEARCH_HISTORY_SPEC.md`/`PROJECT_RESEARCH_REPORT_SPEC.md`                                                                                    | `history-and-diff.integration.test.ts`                                                                                                                                                   | —                                                                                                                                                                   |
| Kanban              | DONE                       | `KanbanBoard/Column/Card/CardMovement/Policy`, `kanban-repository.ts`, `kanban-metrics.ts`                              | API completa (pull/block/unblock/urgent/metrics), dashboard próprio                                                                             | `kanban-repository.integration.test.ts`                                                                                                                                                  | Raia visual "Urgente", múltiplos boards, endpoint de políticas — fora de escopo documentado (STATUS_PROJETO.md §2.7)                                                |
| Second Brain        | NOT STARTED                | —                                                                                                                       | —                                                                                                                                               | —                                                                                                                                                                                        | Nenhuma referência a "Second Brain"/"SecondBrain" encontrada em `apps/`/`packages/` (grep vazio) — só contrato de entrada/saída em documentação, conforme CLAUDE.md |
| Authentication      | DONE                       | NextAuth Credentials, single-user, `apps/web/src/app/api/auth/[...nextauth]/route.ts`                                   | Protege rotas via sessão                                                                                                                        | `auth.smoke.test.ts`                                                                                                                                                                     | —                                                                                                                                                                   |
| Testing             | DONE                       | 41 arquivos `*.test.ts` encontrados (bem acima dos "~24" citados em STATUS_PROJETO.md, que é um snapshot antigo)        | `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` executados em rodada de follow-up: **PASS** completo em todos os 6 workspaces | `npm test` executado (Seção 21); 2 falhas iniciais isoladas e reproduzidas fora do ambiente poluído por processos `dev`/`worker:dev` órfãos — com ambiente limpo, 100% dos testes passam | —                                                                                                                                                                   |

---

## 1. Executive Summary

O repositório está em um estado substancialmente mais avançado do que o
`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` original sugere. Evidência direta: 28 models Prisma, 20
enums, 30 rotas de API (`apps/web/src/app/api/**/route.ts`), 24 módulos de domínio em
`packages/research-engine/src`, 13 em `packages/defi-data/src` e `packages/scoring-engine/src`
combinados, e 41 arquivos de teste (`*.test.ts`) espalhados pelos 6 workspaces. `npx prisma
validate` e `npx prisma migrate status` (rodados nesta auditoria) confirmam schema válido e 20
migrations aplicadas sem pendência. `npm run typecheck` e `npm run lint` (rodados nesta
auditoria, ~2min cada) passaram sem erros em todo o monorepo, incluindo o tsconfig separado dos
workers.

Não foi encontrado nenhum placeholder real (`TODO`/`FIXME`/`HACK`/`STUB`/`NOT_IMPLEMENTED`) fora
de comentários em português contendo a palavra "todo" (pronome, não a tag de placeholder) — a
única ocorrência de "not implemented" no código está dentro de um mock de teste
(`packages/research-engine/tests/pipeline.options.test.ts`), não em código de produção.

O principal item deliberadamente incompleto e **corretamente documentado como tal** é
`TOKEN_UNLOCK` (Sprint 18): estrutura de dados construída a partir de documentação pública da
DefiLlama Pro API, nunca testada contra uma resposta real (nenhuma key paga foi adquirida), e
inativa em produção até que uma key seja configurada em Settings. O código (`packages/defi-data/src/types.ts:281-291`)
confirma essa mesma ressalva de próprio punho, de forma consistente com o CLAUDE.md.

Second Brain não tem nenhuma linha de código no monorepo (grep por "Second Brain"/"SecondBrain"
em `apps/` e `packages/` retornou vazio) — está corretamente classificado como NOT STARTED, não
PARTIAL.

**Atualização**: `npm test` completo e `npm run build` foram rodados numa etapa de follow-up
(Seção 21) e passaram 100% em todos os 6 workspaces, sem nenhum bug de código encontrado. As duas
falhas observadas na primeira tentativa vieram do ambiente de desenvolvimento local, não do
projeto: contenção do pool de 5 conexões do Prisma ao rodar a suíte inteira concorrentemente
(confirmada como não-bug ao passar isolada) e um job da fila BullMQ travado por um processo
`worker:dev` órfão de uma sessão anterior que sobreviveu a um "kill" por pressão de memória do
Windows — ambos gotchas já documentados no CLAUDE.md, não achados novos.

## 2. Current Project State

- **Sprints 1–23 implementados**, conforme STATUS_PROJETO.md e os `SPRINT_NN_IMPLEMENTATION_REPORT.md`
  presentes (12 a 23, faltando 18 como arquivo próprio — mas o conteúdo do Sprint 18 está
  documentado dentro de STATUS_PROJETO.md §2.19, então é uma lacuna de nomenclatura de arquivo,
  não de documentação do sprint em si).
- Git: branch `master`, working tree com uma modificação pendente (`CLAUDE.md`, conforme
  `gitStatus` do ambiente) — nenhuma outra alteração seria esperada, já que esta auditoria não
  escreveu em nenhum arquivo de código.
- CI (`.github/workflows/ci.yml`): `NOT VERIFIED — Reason: não foi listado/lido nesta auditoria
pelo tempo disponível; STATUS_PROJETO.md afirma lint+typecheck+migrate deploy+testes contra
Postgres real`.

## 3. Architecture Map

Confirmado por leitura de `package.json` (raiz) e da árvore de diretórios:

```
apps/web                     Next.js 14 App Router + TS — rotas API finas, UI dashboard, NextAuth
packages/database             Prisma schema (954 linhas, 28 models, 20 enums) + client re-exportado
packages/defi-data             Clientes HTTP reais: DefiLlama, CoinGecko, GitHub, Discourse,
                                Snapshot, MyMemory Translate, validação anti-SSRF (external-identity.ts)
packages/research-engine       Orquestração: pipeline.ts, discovery/selection, repositórios de
                                domínio (score, funding, kanban, events, market-data, profile),
                                history/diff/report, fundamental-context, event-impact-engine,
                                historical-intelligence, dashboard-intelligence, logger
packages/scoring-engine        Cálculo puro: fundamental/tokenomics/capital-score, event-classification,
                                event-impact, fundamental-intelligence, percentile, confidence, trace,
                                priority, weights
packages/queue                 BullMQ: fila, lock, tipos
packages/shared                 crypto.ts (AES-256-GCM), enums espelhados
infrastructure/docker-compose   Postgres + Redis (só isso — worker/scheduler são processos manuais)
infrastructure/workers          research-worker.ts, scheduler.ts, reclassify-events.ts
```

Padrão de camadas (rota fina → serviço → repositório de domínio) confirmado nas rotas lidas
(`apps/web/src/app/api/projects/[slug]/{event-impacts,fundamental-context,historical-intelligence}/route.ts`)
— todas têm comentário explícito "rota fina; todo o cálculo vem de X (research-engine)".

## 4. Repository Inventory

- **Rotas de API** (`apps/web/src/app/api/**/route.ts`): 30 arquivos, cobrindo auth, connections,
  dashboard/fundamental, health, kanban (+4 sub-rotas de card), projects/[slug] (+9 sub-rotas:
  capital-score, catalysts, event-impacts, fundamental-context, funding, historical-intelligence,
  history, report, risks, score, tokenomics-score), rankings (capital/fundamental/growth),
  research-runs (+cancel).
- **Módulos de domínio** (`packages/research-engine/src`): 24 arquivos `.ts` fora de teste,
  incluindo `pipeline.ts` (orquestrador central), `discovery.ts`, `selection.ts`,
  `fundamental-context.ts`, `event-impact-engine.ts`, `historical-intelligence.ts`,
  `dashboard-intelligence.ts`, `kanban-repository.ts`, `kanban-metrics.ts`, `history.ts`,
  `diff.ts`, `report.ts`.
- **Clientes externos** (`packages/defi-data/src`): `client.ts` (DefiLlama), `coingecko-client.ts`,
  `github-client.ts`, `discourse-client.ts`, `snapshot-client.ts`, `translate-client.ts`,
  `external-identity.ts` (validação anti-SSRF), `adapter.ts`, `http-client.ts`.
- **Scoring puro** (`packages/scoring-engine/src`): 13 arquivos, incluindo
  `event-classification.ts`, `fundamental-intelligence.ts`, `generic-group-score.ts`,
  `priority.ts`, `weights.ts`.
- **Documentação na raiz**: 24 arquivos `.md`, incluindo 10 `SPRINT_NN_IMPLEMENTATION_REPORT.md`
  (12–17, 19–23 — falta 18 como arquivo dedicado), specs de feature
  (`PROJECT_DISCOVERY_SPEC.md`, `TOP10_SELECTION_SPEC.md`, `RESEARCH_HISTORY_SPEC.md`,
  `PROJECT_RESEARCH_REPORT_SPEC.md`, `Crypto_Research_Intelligence_Kanban_Pull_System.md`,
  `EVENT_CLASSIFICATION_ARCHITECTURE.md`, `EXTERNAL_IDENTITY_ARCHITECTURE.md`,
  `CATALYSTS_RISKS_ARCHITECTURE.md`, `CATALYSTS_RISKS_SOURCE_AUDIT.md`,
  `DISCOURSE_SOURCE_ARCHITECTURE.md`) e um `AUDIT_AND_REPAIR_REPORT.md` pré-existente (auditoria
  anterior, não esta).

## 5. Database Inventory

28 models confirmados em `packages/database/prisma/schema.prisma` (linhas exatas do `model`):
`ApiConnection`(36), `Sector`(51), `Chain`(62), `Project`(72), `ResearchRun`(174),
`ResearchRunSelection`(210), `AgentSettings`(242), `TvlSnapshot`(275), `RevenueSnapshot`(294),
`FeeSnapshot`(311), `MarketDataSnapshot`(347), `ProjectChain`(369), `FundamentalScore`(391),
`Token`(418), `TokenUnlock`(457), `ProjectProfileSnapshot`(481), `TokenMarket`(514),
`ResearchEvent`(632), `FundingRound`(700), `Investor`(725), `FundingRoundInvestor`(734),
`TokenomicsScore`(750), `InstitutionalCapitalScore`(772), `KanbanBoard`(833),
`KanbanColumn`(849), `KanbanCard`(872), `KanbanCardMovement`(922), `KanbanPolicy`(943).

20 enums confirmados, incluindo `ResearchEventKind/Category/Status/Confidence/ImpactDimension/ClassificationMethod`
(5 enums só para o subsistema de eventos), `KanbanColumnKey/CardStatus/Subcolumn/ActorType` (4 para
Kanban), `UnlockAllocationType` (usado por `TokenUnlock`, o model correspondente ao provider
inativo TOKEN_UNLOCK).

`Existe/Usada/Produzida/Consumida/Validada` por model individual: `NOT VERIFIED — Reason: uma
varredura linha-a-linha de todos os 28 models contra todos os call sites está fora do orçamento
desta rodada; a amostragem feita (Token/TokenUnlock, ResearchEvent, Kanban*, Score*) confirma uso
real em produção via os repositórios listados na Seção 4. Recomenda-se essa varredura completa
como item de trabalho futuro se granularidade por model for necessária.`

`npx prisma validate`: **PASS**. `npx prisma migrate status`: **PASS** (20 migrations, "Database
schema is up to date").

## 6. External Providers

| Provider                         | Cliente                                      | Dados                                           | Auth                                                                                    | Real?               | Validado?                                                                                                                       |
| -------------------------------- | -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| DefiLlama (api.llama.fi)         | `client.ts`                                  | TVL/Fees/Revenue/Funding/Token summary/`/hacks` | Sem key                                                                                 | REAL                | Testes de integração reais (`client.integration.test.ts`)                                                                       |
| DefiLlama Pro (pro-api.llama.fi) | `client.ts` (`getTokenUnlocks`, ver Seção 8) | Emissions/unlocks                               | API key paga (Settings)                                                                 | PRONTO, **INATIVO** | Estrutura nunca testada contra resposta real (`types.ts:281-291`)                                                               |
| CoinGecko                        | `coingecko-client.ts`                        | MC/FDV                                          | `NOT VERIFIED — Reason: não li se exige key`; Sprint 11 é citado como "integração real" | REAL                | `coingecko-client.test.ts`                                                                                                      |
| GitHub                           | `github-client.ts`                           | Releases                                        | `NOT VERIFIED`                                                                          | REAL                | Validado ao vivo (`types.ts:314-317`, 2026-09-19, repo aave/aave-v3-core)                                                       |
| Discourse                        | `discourse-client.ts`                        | Tópicos de fórum                                | `NOT VERIFIED`                                                                          | REAL                | Testado e classificação **rejeitada** (Sprint 23, ~50% falso positivo) — dados coletados mas não classificados pela rule engine |
| Snapshot (governança)            | `snapshot-client.ts`                         | Propostas de votação                            | `NOT VERIFIED`                                                                          | REAL                | `NOT VERIFIED — Reason: não localizei teste de integração dedicado nesta rodada`                                                |
| MyMemory Translation             | `translate-client.ts`                        | Tradução PT-BR de descrições                    | Sem key, limite ~500 chars                                                              | REAL                | Sem mock (CLAUDE.md confirma; testes pulam se offline)                                                                          |

Classificação conforme legenda pedida (REAL/MOCK/PLACEHOLDER/INATIVO/PARCIAL): todos os
providers acima são REAL exceto DefiLlama Pro (TOKEN_UNLOCK), que é **INATIVO**. Nenhum provider
MOCK ou PLACEHOLDER foi encontrado em código de produção.

## 7. Research Pipeline

Etapas confirmadas em `packages/research-engine/src/pipeline.ts` (arquivo lido parcialmente —
linhas 1-180, 300-340, 560-670): Discovery → Selection (top N, `selection.ts`) → Data Collection
(DefiLlama/CoinGecko por projeto, sequencial — comentário explícito linha ~442 confirma
"processa projetos SEQUENCIALMENTE", consistente com o gotcha do CLAUDE.md) → Normalization
(`adapter.ts`) → Persistence (snapshot-repository, market-data-repository) → Fundamental Metrics
(`metrics.ts`, growth 7/30/90d) → Classification (só GitHub Releases, `event-classification.ts`)
→ Event Impact (`event-impact-engine.ts`, batch size 1) → Fundamental Context
(`fundamental-context.ts`) → Scoring (3 engines) → Report (`report.ts`) → Trace (`trace.ts`) →
Dashboard.

`GET /hacks` é buscado **uma única vez por Research Run inteira** (cross-protocolo), não por
projeto — confirmado no comentário de `pipeline.ts:662-671` e `events-repository.ts`.

| Etapa               | Existe                | Implementada | Integrada                                     | Testada                                                                                 | Validada com dados reais                                                                        |
| ------------------- | --------------------- | ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Discovery           | Sim                   | Sim          | Sim (chamada por `runManualResearchPipeline`) | `discovery.integration.test.ts`                                                         | `NOT VERIFIED — Reason: teste roda contra banco real, não contra execução de produção completa` |
| Data Collection     | Sim                   | Sim          | Sim                                           | `client.integration.test.ts` etc.                                                       | Sim — clientes batem em `api.llama.fi` real nos testes                                          |
| Normalization       | Sim                   | Sim          | Sim                                           | `adapter.test.ts`                                                                       | `NOT VERIFIED` diretamente, mas indireta via testes de client real                              |
| Persistence         | Sim                   | Sim          | Sim                                           | `snapshot-repository.integration.test.ts`, `market-data-repository.integration.test.ts` | Sim (banco real)                                                                                |
| Fundamental Metrics | Sim                   | Sim          | Sim                                           | `metrics.test.ts`                                                                       | `NOT VERIFIED`                                                                                  |
| Classification      | Sim (escopo restrito) | Sim          | Sim (só GitHub)                               | `event-classification.test.ts`                                                          | `NOT VERIFIED`                                                                                  |
| Event Impact        | Sim                   | Sim          | Sim                                           | `event-impact-engine.integration.test.ts`                                               | `NOT VERIFIED`                                                                                  |
| Fundamental Context | Sim                   | Sim          | Sim                                           | `fundamental-context.integration.test.ts`                                               | `NOT VERIFIED`                                                                                  |
| Scoring             | Sim                   | Sim          | Sim                                           | `*-score.test.ts` (3 arquivos)                                                          | `NOT VERIFIED`                                                                                  |
| Report              | Sim                   | Sim          | Sim                                           | `history-and-diff.integration.test.ts`                                                  | `NOT VERIFIED`                                                                                  |
| Trace               | Sim                   | Sim          | Sim                                           | `trace.test.ts`                                                                         | `NOT VERIFIED`                                                                                  |
| Dashboard           | Sim                   | Sim          | Sim (consome as rotas)                        | Nenhum teste de UI encontrado                                                           | `NOT VERIFIED`                                                                                  |

## 8. Feature Inventory

Cobertura por domínio, conforme pedido — ênfase em REAL vs PLACEHOLDER vs INFRA-PREPARADA-INATIVA:

- **Project/Protocol Discovery**: DONE (`discovery.ts`, `selection.ts`, `selection-relevance.ts`).
- **Market Data**: DONE.
- **Fundamentals**: DONE.
- **Project Profile**: DONE (`profile-repository.ts`, `ProjectProfileSnapshot` INSERT-only com
  dedupe por conteúdo, conforme CLAUDE.md).
- **Funding/Capital**: DONE.
- **Security/hacks**: PARTIAL — depende 100% de `/hacks` estar preenchido pela DefiLlama para o
  protocolo específico; sem fonte alternativa.
- **Research Events**: DONE, múltiplas fontes estruturadas.
- **Event Classification Engine**: PARTIAL por design — só GitHub Releases passa pela engine
  determinística; Discourse coleta dados mas não classifica (rejeitado). Fontes estruturadas
  (Snapshot, FundingRound, `/hacks`, Listing/Delisting, TokenUnlock) nunca passam pela engine —
  decisão arquitetural documentada, não um gap.
- **GitHub integration**: DONE, validado ao vivo.
- **Snapshot/Governance**: DONE — `NOT VERIFIED — Reason: teste de integração dedicado não
localizado nesta rodada; recomenda-se checagem futura`.
- **Discourse**: PARTIAL — coleta real, classificação rejeitada.
- **Tokenomics**: PARTIAL — MC/FDV real (CoinGecko), Unlock Pressure/Distribution/Value Capture
  `null` (sem fonte gratuita), TOKEN_UNLOCK pronto mas **INATIVO** (ver Seção 6).
- **Historical Fundamental Intelligence**: DONE, calculado sob demanda (sem tabela nova),
  `packages/scoring-engine/src/fundamental-intelligence.ts` + `research-engine/src/historical-intelligence.ts`.
  Métrica por métrica (Growth 7/30/90/180/365d, Acceleration, Momentum, MC×TVL, MC×Revenue,
  Revenue×TVL, Divergence, Historical Valuation, Correlation, Leading/Lagging, Regime): `NOT
VERIFIED — Reason: exigiria leitura linha-a-linha completa de fundamental-intelligence.ts (>375
linhas confirmadas por grep) e historical-intelligence.ts, fora do orçamento desta rodada;
presença confirmada apenas por nomes de função/comentários encontrados via grep, não por
leitura integral de cada fórmula`.
- **Event Impact**: DONE.
- **Fundamental Context**: DONE, explicitamente não é Global Score.
- **Scoring Engine** (Fundamental/Tokenomics/Institutional Capital/Research Priority): DONE.
- **Second Brain**: NOT STARTED (zero código).
- **Kanban**: DONE para o escopo do MVP (ver ressalvas na tabela executiva).
- **Dashboard**: DONE para as 6 páginas existentes.
- **Reports**: DONE.
- **Research Trace/Auditability**: DONE.

## 9. Event System

`ResearchEvent` (schema.prisma:632) com 5 enums de suporte confirmados (Seção 5). Persistência
idempotente por `(projectId, source, sourceId)`, conforme CLAUDE.md e confirmado estruturalmente
pelo padrão em `events-repository.ts` (uso de `defillamaId` como chave de correspondência em
`persistSecurityIncidentRisks`, linha ~58). Tabela por tipo de evento: `NOT VERIFIED — Reason:
levantamento completo de todos os `ResearchEventCategory` × fonte não foi feito linha-a-linha
nesta rodada; confirmado por grep: SECURITY_INCIDENT (hacks), TOKEN_UNLOCK (categoria existe no
código, fonte inativa), e as citadas em CLAUDE.md (Snapshot, Discourse, FundingRound,
Listing/Delisting)`.

## 10. Classification Engine

`packages/scoring-engine/src/event-classification.ts` — regras determinísticas, case-insensitive,
"sem [complexidade adicional]" conforme comentário linha 79. Escopo: **só GitHub Releases**,
confirmado no CLAUDE.md e consistente com o fato de que `events-repository.ts` marca fontes
estruturadas como "nunca passa pela rule engine" (comentário linha 75, sobre `/hacks`). Tabela
por regra: `NOT VERIFIED — Reason: leitura completa do arquivo de regras não foi feita nesta
rodada`.

## 11. Event Impact

`event-impact-engine.ts` (research-engine) + `event-impact.ts` (scoring-engine). Batch size 1
confirmado (`EVENT_IMPACT_BATCH_SIZE = 1`, citado no CLAUDE.md e consistente com o comentário em
`score-repository.ts` sobre processamento em lote sequencial). Cross-event aggregation por
categoria confirmada em `event-impact-engine.ts:372`. Testado via
`event-impact-engine.integration.test.ts` e `event-impact.test.ts`.

## 12. Fundamental Intelligence

Ver Seção 8 — `NOT VERIFIED` em nível de métrica individual por orçamento da auditoria.
Estruturalmente confirmado: calculado sob demanda, "nunca Trading" (sem RSI/MACD/sinal de
compra-venda) — nenhuma ocorrência de RSI/MACD encontrada nos grep já feitos (ausência é
evidência negativa, não prova formal de ausência total).

## 13. Fundamental Context

`fundamental-context.ts` — comentário linha 24-25 confirma o fix documentado no CLAUDE.md/git log
recente ("catalysts UNKNOWN/CANCELLED não somem mais do Fundamental Context", commit `78a7656`
visível no gitStatus fornecido). Explicitamente não é Global Score (confirmado por comentário no
próprio arquivo, consistente com CLAUDE.md).

## 14. Scoring

3 engines confirmados: `fundamental-score.ts`, `tokenomics-score.ts`, `capital-score.ts`, todos
com repositório próprio (`score-repository.ts`, `tokenomics-score-repository.ts`,
`capital-score-repository.ts`) e model Prisma dedicado, sempre `INSERT` (nunca `UPDATE`, política
confirmada em CLAUDE.md, não reverificada linha-a-linha no código do repositório nesta rodada —
`NOT VERIFIED` a nível de cada `create()` individual, mas consistente com o padrão arquitetural
observado). `priority.ts` = Research Priority. `confidence.ts`/`percentile.ts` dão suporte
estatístico.

## 15. Second Brain

**NOT STARTED.** Grep por "Second Brain" e "SecondBrain" em `apps/` e `packages/` (excluindo
`node_modules`) não retornou nenhuma linha. Confirma o CLAUDE.md: "só contrato de entrada/saída
definido". Nenhum arquivo de contrato foi localizado dentro do código nesta rodada — presume-se
que o contrato vive apenas em documentação (`Crypto_Research_Intelligence_Kanban_Pull_System.md`
seções 32/33, conforme CLAUDE.md), não verificado linha-a-linha aqui.

## 16. Kanban

Modelos completos (5: Board/Column/Card/CardMovement/Policy). API com pull/block/unblock/urgent/
metrics (5 rotas dedicadas + rota raiz). `kanban-metrics.ts` com detecção de gargalo em 4 níveis
(NORMAL/WATCH/BOTTLENECK/CRITICAL, conforme STATUS_PROJETO.md §2.7, não relido linha-a-linha
nesta auditoria). Fora de escopo, conforme documentado: raia visual "Urgente", `swimlane` na
renderização, WIP experimental com histórico, endpoint de políticas dedicado, múltiplos boards.

## 17. Dashboard

6 páginas confirmadas por `find`: home, projects/[slug], rankings, kanban, research, settings
(+ login/root, não contados). Componentes compartilhados: `InfoTooltip.tsx` (popover por clique,
sem hover/mouse-tracking, conforme convenção anti-`designer_system`), `KanbanProvider.tsx`,
`LogoutButton.tsx`. Nenhum teste de UI/E2E foi localizado (`*.spec.ts`/Playwright/Cypress ausentes
da lista de 41 arquivos de teste) — **gap de testing, não de feature**.

## 18. Reports

`report.ts` + rota `projects/[slug]/report`, gera Markdown com download, conforme
`PROJECT_RESEARCH_REPORT_SPEC.md`. Inclui Catalysts/Risks só com fonte real (`report.ts:462`,
"DefiLlama /hacks + FundingRound"). Testado via `history-and-diff.integration.test.ts`.

## 19. Research Trace

`trace.ts` (scoring-engine), exposto junto às rotas de score. Testado (`trace.test.ts`).
Rastreabilidade métrica → fonte/timestamp confirmada por descrição em STATUS_PROJETO.md, não
relida linha-a-linha aqui.

## 20. Security

| Item                                     | Estado       | Evidência                                                                                                                                                                                  |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth (NextAuth Credentials, single-user) | OK           | `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `auth.smoke.test.ts`                                                                                                                   |
| Secrets em repouso                       | OK           | `ApiConnection.encrypted_secret`, AES-256-GCM (`packages/shared/src/crypto.ts`, `crypto.test.ts`)                                                                                          |
| authTag AES-GCM                          | OK           | Commit recente `53380f4` "exige authTag AES-GCM de exatamente 16 bytes no decrypt" — corrigido, não reverificado no diff nesta rodada (`NOT VERIFIED` a nível de linha)                    |
| SSRF (identidade externa)                | OK           | `packages/defi-data/src/external-identity.ts:1-32`, comentário confirma validadores anti-SSRF para `githubRepo`/`snapshotSpace`/`discourseForumUrl`, testado (`external-identity.test.ts`) |
| Senha em texto puro                      | OK           | CLAUDE.md confirma que nunca é persistida; `ADMIN_PASSWORD_HASH` via bcrypt                                                                                                                |
| Logs de payload bruto/secrets            | NOT VERIFIED | Convenção documentada ("nunca logar secrets/payloads brutos"), não auditada grep-a-grep em todos os `console.log` do repo nesta rodada                                                     |
| Validação de input (zod) nas rotas       | NOT VERIFIED | Confirmado como convenção no CLAUDE.md; amostragem das 3 rotas lidas não mostrou zod diretamente no trecho lido (rotas finas delegam a serviços) — recomenda-se checagem dedicada          |

## 21. Testing

41 arquivos `*.test.ts` (contagem exata via `find`), distribuídos: `apps/web` (4), `packages/database`
(2), `packages/defi-data` (6), `packages/queue` (2), `packages/research-engine` (16),
`packages/scoring-engine` (9), `packages/shared` (1). Isso é maior que o "~24" citado em
STATUS_PROJETO.md (snapshot de 2026-09-16/19) — evidência de que a suíte cresceu desde então
(esperado, dado que sprints 20-23 aconteceram depois).

Comandos executados nesta auditoria:

- `npx prisma validate`: **PASS**.
- `npx prisma migrate status`: **PASS** (20 migrations, schema up to date).
- `npm run typecheck`: **PASS** (rodou em background, completou com exit code 0, cobrindo todos
  os workspaces + `infrastructure/workers/tsconfig.json`).
- `npm run lint`: **PASS** (sem output de erro — `eslint .` limpo).
- `npm test` (rodada de follow-up, fora do modo read-only estrito da auditoria original): 2
  falhas na primeira execução — `packages/queue/tests/research.queue.test.ts` ("Job could not be
  removed because it is locked by another worker") e
  `packages/research-engine/tests/selection.integration.test.ts` ("Timed out fetching a new
  connection from the connection pool", limite 5). Ambas isoladas e reexecutadas fora da suíte
  completa: a segunda passou isolada de primeira (confirma contenção real do pool de 5 conexões
  quando a suíte inteira roda junto, o gotcha já documentado no CLAUDE.md, não um bug); a primeira
  só passou depois de matar processos `node`/`tsx` órfãos de um `npm run dev`/`worker:dev`
  anteriores desta mesma sessão que sobreviveram a um "kill" por pressão de memória (gotcha Windows
  também já documentado no CLAUDE.md — "encerrar o processo pai não mata o processo filho real").
  Com o ambiente limpo, **`npm test` completo: PASS** em todos os 6 workspaces (apps/web 20/20,
  database 10/10, defi-data 81/81, queue 2/2, research-engine 178/178, scoring-engine 142/142,
  shared 16/16).
- `npm run build`: primeira tentativa falhou (`PageNotFoundError` para `/api/auth/[...nextauth]`)
  por cache `.next` corrompido, resíduo do mesmo `npm run dev` órfão acima misturando build de dev
  e produção. Depois de `rm -rf apps/web/.next`, **PASS** — build de produção completo, 20 rotas
  geradas sem erro (só um aviso inofensivo do BullMQ sobre `@valkey/valkey-glide`, dependência
  opcional não instalada, que não afeta a build).

## 22. Real Data Validation

REAL DATA VALIDATED (evidência de execução contra fonte externa real, não mock):

- DefiLlama (`client.integration.test.ts`) — TVL/Fees/Revenue/`/hacks`.
- CoinGecko (`coingecko-client.test.ts`).
- GitHub Releases — validado ao vivo em 2026-09-19 contra `aave/aave-v3-core` (comentário em
  `types.ts:314-317`, não uma execução desta auditoria).
- MyMemory Translation — sem mock, testes pulam se offline (CLAUDE.md).

NOT REAL DATA VALIDATED:

- TOKEN_UNLOCK / DefiLlama Pro — nunca testado contra resposta real (confirmado, Seção 6).

NOT VERIFIED nesta rodada (não re-executado):

- Discourse, Snapshot — comentário do CLAUDE.md afirma que Discourse foi testado contra dados
  reais e a classificação rejeitada; esta auditoria não re-executou esses testes.

## 23. Documentation Consistency

| Documento                                                        | Afirmação                                                                 | Código real                                                            | Divergência?                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`                         | Lista Funding/Tokenomics/Investors como fora do MVP                       | Implementados (`FundingRound`, `Investor`, `Token`, `TokenomicsScore`) | **SIM** — documentado como desatualizado no próprio CLAUDE.md, confirmado                                                        |
| `STATUS_PROJETO.md`                                              | "~24 arquivos de teste"                                                   | 41 arquivos `*.test.ts` encontrados                                    | **SIM**, mas esperado — o próprio arquivo se declara snapshot de 2026-09-16/19, e sprints posteriores (20-23) adicionaram testes |
| CLAUDE.md                                                        | TOKEN_UNLOCK "nunca validada contra resposta real"                        | Confirmado pelo próprio código (`types.ts:281-291`)                    | NÃO — consistente                                                                                                                |
| STATUS_PROJETO.md §2.7                                           | Kanban Sprint 7 lista itens fora de escopo (raia Urgente, swimlane, etc.) | Nenhuma evidência de implementação posterior encontrada nesta rodada   | `NOT VERIFIED` se algum sprint 8-23 implementou algum desses itens depois — não cruzado item a item                              |
| Falta `SPRINT_18_IMPLEMENTATION_REPORT.md` como arquivo dedicado | CLAUDE.md já marca isso como "lacuna, não investigada"                    | Conteúdo do Sprint 18 está em STATUS_PROJETO.md §2.19                  | Lacuna de nomenclatura confirmada, não de conteúdo                                                                               |

## 24. Roadmap Reconciliation

| Item                                        | Planejado            | Implementado    | Validado                                                        | Estado                                                |
| ------------------------------------------- | -------------------- | --------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Auth single-user                            | Sim                  | Sim             | Sim                                                             | DONE                                                  |
| DefiLlama real                              | Sim                  | Sim             | Sim                                                             | DONE                                                  |
| Research Run assíncrona (BullMQ)            | Sim                  | Sim             | Parcial (worker/scheduler não relidos linha-a-linha)            | DONE                                                  |
| Scoring (3 engines)                         | Sim                  | Sim             | Sim                                                             | DONE                                                  |
| Funding/Tokenomics/Investors                | Não (plano original) | Sim             | Sim                                                             | DONE (além do escopo original)                        |
| Discovery + Top 10                          | Sim (Sprint 8)       | Sim             | Sim                                                             | DONE                                                  |
| History/Diff/Report                         | Sim (Sprint 9)       | Sim             | Sim                                                             | DONE                                                  |
| Knowledge Base (docs estendidos)            | Sim (Sprint 10)      | Sim             | `NOT VERIFIED` (docs não relidos in extenso)                    | DONE (presumido)                                      |
| Catalysts/Risks (`/hacks`)                  | Sim (Sprint 15)      | Sim             | Sim (fonte real)                                                | DONE                                                  |
| Historical Fundamental Intelligence         | Sim (Sprint 14)      | Sim             | `NOT VERIFIED` por métrica                                      | PARTIAL (validação)                                   |
| Event Impact                                | Sim (Sprint 16)      | Sim             | `NOT VERIFIED` a fundo                                          | DONE (integração), PARTIAL (validação profunda)       |
| GitHub/Snapshot/Discourse                   | Sim (Sprint 19-20)   | Sim             | GitHub validado ao vivo; Discourse rejeitado para classificação | PARTIAL (Discourse)                                   |
| TOKEN_UNLOCK                                | Sim (Sprint 18)      | Sim (estrutura) | Não                                                             | BLOCKED (falta key paga, decisão de negócio pendente) |
| Second Brain                                | Não (fora do MVP)    | Não             | Não                                                             | NOT STARTED                                           |
| Trading/TradingView/Pine Script/Backtesting | Não (fora do MVP)    | Não             | Não                                                             | NOT STARTED (por design, não é gap)                   |

## 25. Bugs Found

Nenhum bug novo foi encontrado nesta auditoria (typecheck, lint, build e suíte completa de testes
limpos com ambiente saneado — ver Seção 21). As duas falhas de `npm test` observadas numa primeira
rodada não eram bugs de código: uma foi contenção real do pool de 5 conexões do Prisma ao rodar a
suíte inteira concorrentemente (gotcha já documentado no CLAUDE.md, confirmada como não-bug ao
passar isolada), e a outra foi um job da fila BullMQ travado por um worker de desenvolvimento
órfão desta mesma sessão (processo `node`/`tsx` que sobreviveu a um "kill" por pressão de memória
no Windows — também gotcha já documentado no CLAUDE.md). Um bug histórico já corrigido foi
confirmado via git log: `78a7656` ("catalysts UNKNOWN/CANCELLED não somem mais do Fundamental
Context") e `53380f4` ("exige authTag AES-GCM de exatamente 16 bytes no decrypt") — ambos já
mergeados, não são bugs abertos.

## 26. Technical Debt

- Falta o arquivo `SPRINT_18_IMPLEMENTATION_REPORT.md` dedicado (conteúdo existe em
  STATUS_PROJETO.md, mas quebra o padrão de um relatório por sprint) — **pode esperar**.
- `STATUS_PROJETO.md` se autodeclara desatualizado desde 2026-09-19 e não é atualizado
  automaticamente — **necessário para finalizar** se a auditoria/handoff depender dele como
  fonte única de verdade.
- Ausência de testes de UI/E2E para as 6 páginas do dashboard — **pode esperar** para v1.0 dado
  que a lógica de negócio já é coberta por testes de integração no research-engine.

## 27. Validation Gaps

- Métricas individuais de Historical Fundamental Intelligence (Growth 7/30/90/180/365d,
  Acceleration, Momentum, cross-metrics, Regime) não foram verificadas fórmula-a-fórmula nesta
  auditoria.
- Validação de payload real do TOKEN_UNLOCK (bloqueada por decisão de negócio, não técnica).

~~`npm test`/`npm run build` completos não executados~~ — **resolvido em rodada de follow-up**
(Seção 21): ambos passam 100% com ambiente limpo.

## 28. Data Gaps

- Unlock Pressure / Distribution / Value Capture do Tokenomics Score: `null` — sem fonte
  gratuita, documentado e aceito como limitação conhecida (não é bug).
- Security incidents dependem inteiramente de `/hacks` estar populado pela DefiLlama para cada
  protocolo — não há fallback.

## 29. Blockers

| Blocker                               | Impacto                                                    | Dependência                                                                | Solução necessária                                                                       |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| TOKEN_UNLOCK inativo                  | Tokenomics Score permanece parcial (3 dimensões em `null`) | Compra de API key DefiLlama Pro (US$300/mês)                               | Decisão de negócio do usuário — aprovar custo — antes de qualquer trabalho técnico       |
| Sem fonte gratuita de unlock schedule | Mesmo item acima                                           | Nenhuma alternativa gratuita encontrada até o momento (conforme CLAUDE.md) | Pesquisa de fonte alternativa, ou aceitar `null` permanentemente como decisão de produto |

## 30. What Is Missing

- Validação por métrica do Historical Fundamental Intelligence (auditoria de fórmulas).
- Testes de UI/E2E do dashboard.
- `SPRINT_18_IMPLEMENTATION_REPORT.md` como arquivo dedicado.
- Atualização do `STATUS_PROJETO.md` para refletir sprints 20-23 de forma mais explícita na seção
  de visão geral (§1), que ainda cita só "Sprints 1-23... testados" de forma genérica sem
  detalhar os últimos 3.
- Ativação real de TOKEN_UNLOCK (bloqueada por decisão de negócio).

## 31. What Is Necessary to Finish

Para uma v1.0 minimamente defensável do escopo já decidido (excluindo Trading/Second
Brain/Backtesting, que são explicitamente fora de escopo):

1. ~~Rodar `npm test`/`npm run build` completos e registrar PASS/FAIL real~~ — **feito** em rodada
   de follow-up (Seção 21): 100% PASS em todos os 6 workspaces, sem nenhum bug de código; as 2
   falhas observadas na primeira tentativa eram ambas causadas pelo ambiente de dev local
   (contenção do pool de conexões e um worker órfão), não pelo projeto.
2. Auditoria dedicada e mais profunda das fórmulas de Historical Fundamental Intelligence
   (Seção 27), já que são citadas no roadmap como entregues mas não foram verificadas
   linha-a-linha aqui.
3. Atualizar `STATUS_PROJETO.md` para não estar mais "desatualizado desde 2026-09-19" antes de
   qualquer handoff externo.

## 32. What Can Wait

- Testes de UI/E2E.
- `SPRINT_18_IMPLEMENTATION_REPORT.md` como arquivo separado (conteúdo já existe em outro lugar).
- Itens já deliberadamente adiados do Kanban (raia Urgente, múltiplos boards, endpoint de
  políticas).
- Ativação de TOKEN_UNLOCK (depende de decisão de negócio externa, não de trabalho técnico
  pendente).

## 33. Future Roadmap

Fora de escopo desta rodada por instrução explícita do usuário, e corretamente fora de escopo do
código atual: Trading Intelligence/TradingView/Pine Script/Technical Score, Backtesting/Historical
Intelligence avançada, Opportunity Engine, LLM classification, novos providers pagos, Second Brain
completo, multi-tenant, Improvement Proposals automáticos.

## 34. Proposed Finalization Plan

Sequência lógica sugerida, baseada estritamente nos gaps reais encontrados (Seções 27-31), sem
inventar sprints desnecessários:

1. **Sprint de Validação** — rodar suíte completa (`npm test`, `npm run build`) em ambiente
   dedicado (não read-only), corrigir qualquer FAIL encontrado, e documentar resultado real.
2. **Sprint de Auditoria de Fórmulas** — verificar linha-a-linha cada métrica do Historical
   Fundamental Intelligence contra sua especificação documentada, com casos de teste adicionais
   onde faltarem.
3. **Sprint de Documentação** — atualizar `STATUS_PROJETO.md` (consolidar §2.10-2.24 numa visão
   geral atual), criar o `SPRINT_18_IMPLEMENTATION_REPORT.md` faltante (ou documentar
   explicitamente por que não existe), e revisar `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` seção 6
   para não listar mais Funding/Tokenomics como fora do MVP.
4. **(Opcional, decisão de negócio)** — se o usuário aprovar o custo, ativar TOKEN_UNLOCK:
   adquirir key, validar payload real contra `RawDefiLlamaUnlockEvent`, ajustar normalizador se a
   estrutura real divergir da documentada.

Nenhum novo sprint de feature é necessário para o escopo já decidido — os gaps encontrados são de
validação e documentação, não de código ausente.

## 35. Definition of Done

Para esta rodada de auditoria: **concluída** — todas as 35 seções produzidas, tabela executiva
preenchida, comandos de validação executados (`prisma validate`, `prisma migrate status`,
`npm run typecheck`, `npm run lint`, e em follow-up `npm test`/`npm run build` completos), toda
afirmação com evidência de arquivo ou marcada `NOT VERIFIED` com motivo. A única alteração feita
fora deste relatório foi remover o cache `apps/web/.next` corrompido (resíduo de um `npm run dev`
órfão de sessão anterior) e encerrar processos `node`/`tsx` órfãos — nenhum arquivo de código,
schema ou dependência do projeto foi alterado.

Para o projeto em si atingir v1.0 (escopo já decidido, excluindo itens da Seção 33): suíte de
testes completa passando com evidência registrada, fórmulas de Historical Fundamental
Intelligence auditadas, documentação (`STATUS_PROJETO.md`,
`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`) atualizada para refletir o estado real, e uma decisão
de negócio explícita sobre TOKEN_UNLOCK (ativar com custo, ou aceitar `null` permanentemente).
