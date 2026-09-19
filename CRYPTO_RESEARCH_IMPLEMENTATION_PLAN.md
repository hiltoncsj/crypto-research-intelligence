# CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md

> Plano de Implementação Técnico — Crypto Research Intelligence
> Baseado em: `Crypto_Research_Intelligence_Master_Roadmap.md` (v1.0)
> Status: aguardando aprovação. **Nenhum código foi modificado nesta etapa.**

---

## 1. Executive Summary

O repositório atual contém apenas o documento de especificação mestre (2889 linhas) e o `CLAUDE.md`. Não existe nenhum código, banco de dados, configuração, integração ou teste implementado — o projeto está 100% na Fase 0 (Specification) do próprio roadmap (seção #58).

Isso simplifica a análise de gap (tudo é gap), mas não simplifica o risco: a especificação é rica em regras de domínio e pobre em contratos técnicos executáveis (fórmulas de scoring não normalizadas, Second Brain sem schema de saída, sem decisão de autenticação/hospedagem). Este plano resolve essas lacunas de arquitetura **antes** de propor sprints, para que a implementação não tenha que parar no meio para tomar decisões estruturais.

O MVP proposto (Sprints 1–6) entrega o ciclo completo `DefiLlama → PostgreSQL → Métricas → Score → Ranking → Dashboard → Research Trace`, com Kanban básico e sem Second Brain nem Pine Script — exatamente como pedido. Second Brain fica com interface definida (contrato de entrada/saída) mas implementação adiada para Sprint 7 (pós-MVP), evitando repetir o erro da seção #60 do roadmap, que definia uma "Fase 1" grande demais para ser um MVP real.

---

## 2. Current Architecture

**Estado real do repositório** (verificado por inspeção direta, não por suposição):

| Camada                                    | Estado                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| Código-fonte                              | Inexistente                                                    |
| package.json / manifests                  | Inexistente                                                    |
| Banco de dados                            | Inexistente (nenhuma migration, nenhum schema)                 |
| Configuração (.env, docker-compose, etc.) | Inexistente                                                    |
| Integrações (DefiLlama, CoinGecko, etc.)  | Inexistente                                                    |
| Testes                                    | Inexistente                                                    |
| Controle de versão (git)                  | Não inicializado                                               |
| Documentação                              | `Crypto_Research_Intelligence_Master_Roadmap.md` + `CLAUDE.md` |

Não há nada a reutilizar, refatorar ou remover. Todo o plano abaixo assume criação do zero.

---

## 3. Target Architecture

A estrutura sugerida no roadmap (seção #44) é um monorepo modular com `apps/` + `packages/`. Para o MVP, essa granularidade completa é prematura — ela antecipa módulos (second-brain, tokenomics, catalysts, kanban como pacotes isolados) que ainda não têm lógica própria suficiente para justificar isolamento. Proponho uma versão **reduzida** da mesma estrutura, compatível com crescimento incremental para a estrutura completa do roadmap sem necessidade de reescrita:

```
crypto-research/
├── apps/
│   └── web/                    # Next.js: dashboard + API routes + scheduler trigger
├── packages/
│   ├── database/                # Prisma/Drizzle schema, migrations, client
│   ├── defi-data/                # Collector DefiLlama (único collector no MVP)
│   ├── research-engine/          # Normalizer, validator, metrics, research run orchestration
│   ├── scoring-engine/           # Score model v1.0 (versionado)
│   └── shared/                   # Tipos compartilhados, enums, utils
├── infrastructure/
│   ├── docker-compose.yml        # Postgres + Redis local
│   └── workers/                  # Worker BullMQ (research jobs)
└── CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md
```

**Decisões e justificativas:**

- `apps/research-agent`, `apps/second-brain`, `apps/scheduler` do roadmap são **fundidos** em `apps/web` + `infrastructure/workers` no MVP — não há lógica suficiente ainda para justificar processos separados; um monólito modular com BullMQ workers resolve o mesmo problema sem overhead operacional (múltiplos deploys, múltiplos Dockerfiles). Separação em apps distintos só se justifica quando escalar (ex.: Second Brain rodando em worker próprio por custo de IA).
- `packages/market-data`, `funding-data`, `tokenomics`, `catalysts`, `kanban`, `ai` do roadmap **não são criados agora** — ficam como pastas vazias reservadas (`.gitkeep` + `README.md` descrevendo o propósito futuro) apenas se o usuário preferir sinalizar a intenção arquitetural; caso contrário, criados apenas quando a Sprint correspondente chegar. Não criar código morto.
- Stack: Next.js + TypeScript + PostgreSQL + Redis + BullMQ + Docker, conforme roadmap #44. Adiciono explicitamente:
  - **ORM**: Prisma (migrations declarativas, type-safety, boa integração com Next.js/TypeScript) — decisão não coberta pelo roadmap.
  - **Autenticação**: NextAuth com single-user/admin no MVP (o roadmap não define, mas um dashboard com API keys de terceiros não pode ficar sem login). Multi-tenant fica fora do MVP.
  - **Hospedagem**: não decidida pelo roadmap — proponho Docker Compose local para desenvolvimento e deploy containerizado (Fly.io/Railway/VPS) como não-bloqueante para o MVP; discutir com o usuário antes do Sprint 1.
  - **CI**: GitHub Actions mínimo (lint + typecheck + testes) a partir do Sprint 1.

---

## 4. Gap Analysis

Como não há nada implementado, a matriz de gap é binária: **100% dos itens abaixo são "a construir"**. A tabela organiza por prioridade, não por gap incremental.

| Feature                                      | Estado Atual | Estado Desejado (MVP)                      | Prioridade | Dependências               | Complexidade |
| -------------------------------------------- | ------------ | ------------------------------------------ | ---------- | -------------------------- | ------------ |
| Monorepo + tooling (TS, lint, CI)            | Inexistente  | Configurado                                | P0         | —                          | Baixa        |
| PostgreSQL + Prisma schema (MVP)             | Inexistente  | Rodando, migrado                           | P0         | Monorepo                   | Média        |
| Redis + BullMQ                               | Inexistente  | Rodando                                    | P0         | Docker                     | Baixa        |
| Secret management (API keys)                 | Inexistente  | Criptografado em repouso                   | P0         | Banco                      | Média        |
| Auth do dashboard                            | Inexistente  | Login single-user                          | P0         | Next.js                    | Baixa        |
| Collector DefiLlama (TVL)                    | Inexistente  | Real, com retry                            | P0         | Secret mgmt                | Média        |
| Normalizer + Validator                       | Inexistente  | Funcional para TVL/Fees/Revenue            | P0         | Collector                  | Média        |
| Snapshot storage (tvl/fee/revenue)           | Inexistente  | Imutável, versionado                       | P0         | Banco                      | Média        |
| Research Run orchestration                   | Inexistente  | Estados QUEUED→COMPLETED                   | P0         | BullMQ                     | Alta         |
| Scheduler (manual + cron)                    | Inexistente  | Manual + Daily/Weekly                      | P1         | Research Run               | Média        |
| Metrics engine (growth, aceleração)          | Inexistente  | TVL/Revenue growth 7/30/90d                | P1         | Snapshots                  | Média        |
| Scoring Engine v1.0 (fórmulas normalizadas)  | Inexistente  | Score 0-100 + Confidence                   | P1         | Metrics                    | Alta         |
| Ranking (Growth/Value/Narrative)             | Inexistente  | 3 rankings básicos                         | P1         | Score                      | Média        |
| Research Trace (clicável)                    | Inexistente  | Métrica → fonte/timestamp                  | P1         | Snapshots com proveniência | Média        |
| Dashboard (Home, Projeto, Narrativas)        | Inexistente  | Funcional, dados reais                     | P1         | Todas API routes           | Alta         |
| Chains breakdown (TVL por chain)             | Inexistente  | Por protocolo                              | P1         | Collector DefiLlama        | Baixa        |
| Kanban básico (colunas + cards automáticos)  | Inexistente  | Cards seguem Research Run                  | P2         | Research Run               | Média        |
| Observability (logs, Research Run tracing)   | Inexistente  | Logs estruturados + painel admin           | P1         | Research Run               | Média        |
| Testes (unit/integration DefiLlama+Research) | Inexistente  | Cobertura dos módulos P0/P1                | P0/P1      | cada módulo                | —            |
| Second Brain (interface apenas)              | Inexistente  | Contrato de I/O definido, não implementado | P2         | Score, Research Run        | —            |
| Funding/VC/Tokenomics/Unlocks                | Inexistente  | Fora do MVP                                | P2         | —                          | Alta         |
| Catalysts                                    | Inexistente  | Fora do MVP                                | P2         | —                          | Média        |
| Backtesting / Historical Intelligence        | Inexistente  | Fora do MVP                                | P3         | Histórico acumulado        | Alta         |
| Pine Script / TradingView                    | Inexistente  | Fora do escopo (arquitetura reservada)     | P3         | Núcleo estável             | Alta         |
| Opportunity Engine (Fase 3)                  | Inexistente  | Fora do escopo                             | P3         | Technical + Fundamental    | Alta         |

---

## 5. MVP Scope

Conforme solicitado, o MVP prova o ciclo completo com dados reais:

```
Dashboard → Configuração → API Keys → Scheduler → Research Run →
DefiLlama → Dados reais → PostgreSQL → Métricas → Score → Ranking → Research Trace
```

**Incluído no MVP:**

- Dashboard (Home + página de projeto + página de narrativas, versão simplificada)
- Configuração de API Keys (criptografadas, testáveis, mascaradas)
- Scheduler (Manual + Daily + Weekly — modos Full/Incremental)
- Research Run com estados e histórico
- Integração real com DefiLlama: TVL (atual + histórico + por chain), Fees, Revenue
- Normalização, validação, cross-check mínimo (fonte única no MVP, arquitetura pronta para múltiplas fontes)
- Snapshots imutáveis com proveniência completa (source, retrieved_at, data_timestamp, period, confidence)
- Métricas fundamentais: growth 7/30/90d, aceleração
- Score 0–100 (fórmulas do roadmap #28, com normalização explícita definida na seção 13 deste plano) e Confidence
- 3 Rankings (Growth, Value, Narrative simplificado — sem VC/Funding, que são P2)
- Research Trace clicável
- Kanban básico (colunas fixas + criação/movimentação automática pelos eventos do Research Run)
- Logs estruturados, retries, tratamento de falha (sem inventar dado)
- Testes unitários/integração para DefiLlama e Research Engine
- Documentação mínima (README de setup + este plano mantido atualizado)

---

## 6. Out of Scope (explicitamente adiado)

- Pine Script, TradingView, indicadores técnicos, Technical Score, Opportunity Engine — arquitetura reservada (nomes de pacotes/tabelas previstos, sem implementação).
- Second Brain completo — apenas contrato de entrada/saída definido (seção 15).
- Funding, VC, Investors, Tokenomics, Unlocks, Catalysts — ficam para Sprint pós-MVP (P2), pois exigem fontes de dados adicionais (Tier 2/3 do roadmap #41) com custo e complexidade de integração maiores.
- Backtesting e Historical Intelligence avançada (divergência preço x fundamento, momentum) — dependem de histórico acumulado que só existe após o MVP rodar por semanas.
- Multi-tenant / múltiplos usuários / RBAC.
- Novas integrações além de DefiLlama.
- Automações complexas do Second Brain (Improvement Proposals automáticos).

---

## 7. Database Plan

Tabelas mínimas necessárias para o MVP (subconjunto do modelo do roadmap #46, sem `funding_rounds`, `investors`, `venture_capitals`, `token_unlocks`, `catalysts`, `second_brain_reviews`, `improvement_proposals`, `pine_indicators`, `technical_signals` — essas ficam reservadas para quando a Sprint correspondente for aprovada).

### `projects`

- **Finalidade**: entidade central (protocolo/projeto pesquisado).
- **Campos**: `id (uuid)`, `slug`, `name`, `defillama_id`, `sector_id (fk)`, `narrative_id (fk, nullable)`, `status (enum: DISCOVERED|ACTIVE|ARCHIVED)`, `created_at`, `updated_at`.
- **Relacionamentos**: 1:N com `tvl_snapshots`, `revenue_snapshots`, `fee_snapshots`, `scores`; N:1 com `sectors`.
- **Índices**: unique(`slug`), unique(`defillama_id`), index(`sector_id`).
- **Histórico**: não versionado em si — mudanças relevantes (nome, sector) ficam em log de auditoria simples (`updated_at` + trigger futuro, não no MVP).

### `sectors`

- **Finalidade**: taxonomia de setores/narrativas (roadmap #9).
- **Campos**: `id`, `name`, `parent_sector_id (nullable, self-fk)`.
- **Relacionamentos**: 1:N com `projects`.
- **Índices**: unique(`name`).

### `chains`

- **Finalidade**: blockchains suportadas.
- **Campos**: `id`, `name`, `defillama_chain_slug`.
- **Índices**: unique(`defillama_chain_slug`).

### `project_chains` (tabela de junção)

- **Finalidade**: TVL por chain por projeto (roadmap #12).
- **Campos**: `project_id (fk)`, `chain_id (fk)`, `tvl_snapshot_id (fk)`.
- **Constraints**: PK composta (`project_id`, `chain_id`, `tvl_snapshot_id`).

### `tvl_snapshots`

- **Finalidade**: histórico imutável de TVL (roadmap #47).
- **Campos**: `id`, `project_id (fk)`, `value_usd (numeric)`, `chain_id (fk, nullable = total)`, `retrieved_at (timestamptz)`, `data_timestamp (timestamptz)`, `period (enum: SPOT|7D|30D|90D|180D|1Y)`, `source (enum: DEFILLAMA)`, `confidence (enum: HIGH|MEDIUM|LOW|ESTIMATED)`, `raw_response_ref (jsonb, opcional para debug)`.
- **Índices**: index(`project_id`, `data_timestamp`), index(`project_id`, `chain_id`, `data_timestamp`).
- **Histórico**: append-only, nunca update.

### `revenue_snapshots` / `fee_snapshots`

- **Finalidade**: mesma estrutura de `tvl_snapshots`, mas separando explicitamente Fees / Revenue / Protocol Revenue / Token Holder Revenue (roadmap #10, regra de não misturar conceitos).
- **Campos**: idênticos a `tvl_snapshots` + `metric_type (enum: FEES|REVENUE|PROTOCOL_REVENUE)`.
- **Índices**: index(`project_id`, `metric_type`, `data_timestamp`).

### `research_runs`

- **Finalidade**: cada execução do pipeline (roadmap #16, #47).
- **Campos**: `id`, `started_at`, `finished_at (nullable)`, `trigger (enum: MANUAL|SCHEDULED)`, `mode (enum: FULL|INCREMENTAL)`, `status (enum: QUEUED|RUNNING|PARTIAL|COMPLETED|FAILED)`, `score_model_version`, `second_brain_version (nullable, não usado no MVP)`, `projects_found (int)`, `projects_analyzed (int)`, `error_summary (jsonb, nullable)`.
- **Índices**: index(`status`), index(`started_at`).

### `research_findings`

- **Finalidade**: liga um Research Run a um projeto e às métricas calculadas naquela run (permite responder "por que o Score foi X nessa semana").
- **Campos**: `id`, `research_run_id (fk)`, `project_id (fk)`, `metrics_snapshot (jsonb — cópia imutável dos valores usados)`, `score_id (fk, nullable)`.
- **Índices**: index(`research_run_id`, `project_id`).

### `research_sources`

- **Finalidade**: rastreabilidade por dado individual (Research Trace, roadmap #32).
- **Campos**: `id`, `research_finding_id (fk)`, `field_name (text, ex: "tvl_growth_30d")`, `source (enum)`, `source_ref (text, url/endpoint)`, `retrieved_at`, `data_timestamp`.
- **Índices**: index(`research_finding_id`).

### `scores`

- **Finalidade**: Score + Confidence por projeto por run (roadmap #28, #29), versionado (seção 13 deste plano).
- **Campos**: `id`, `research_finding_id (fk)`, `project_id (fk)`, `total_score (numeric 0-100)`, `confidence (numeric 0-100)`, `breakdown (jsonb — pontuação por categoria: fundamental/tokenomics/capital/narrative/catalysts/valuation)`, `score_model_version`, `created_at`.
- **Índices**: index(`project_id`, `created_at`).
- **Histórico**: `score_history` é a própria tabela `scores` consultada por `project_id` ordenada por `created_at` — não precisa de tabela separada no MVP (evita duplicação; roadmap sugere `score_history` separado, mas com `scores` append-only isso é redundante).

### `kanban_boards` / `kanban_columns` / `kanban_cards`

- **Finalidade**: pipeline visual (roadmap #33/#34), versão mínima com colunas fixas do MVP: `BACKLOG, DISCOVERY, DATA_COLLECTION, FUNDAMENTAL_ANALYSIS, SCORING, PUBLISHED` (sem `CROSS-CHECK` e `SECOND BRAIN` ainda, pois não implementados no MVP — ver seção 17 sobre como resolver a contradição do roadmap aqui).
- **Campos** (`kanban_cards`): `id`, `project_id (fk)`, `research_run_id (fk)`, `column (enum)`, `progress_checklist (jsonb)`, `created_at`, `updated_at`.
- **Índices**: index(`column`), index(`project_id`).
- `kanban_events` fica reservado (não criado no MVP) — eventos podem ser reconstruídos via `updated_at` + logs estruturados no MVP; criar quando o Second Brain precisar de auditoria de transições.

### `api_connections`

- **Finalidade**: API keys criptografadas (roadmap #6, #14).
- **Campos**: `id`, `provider (enum: DEFILLAMA|COINGECKO|...)`, `encrypted_secret (bytea)`, `secret_iv (bytea)`, `status (enum: REAL|PARTIAL|MOCK|UNAVAILABLE|ERROR|NOT_CONFIGURED)`, `last_tested_at`, `created_at`, `updated_at`.
- **Constraints**: unique(`provider`). Nunca expor `encrypted_secret` via API — decriptar apenas em memória no worker.

### `agent_settings`

- **Finalidade**: configuração do scheduler (frequência, modo).
- **Campos**: `id`, `frequency (enum: MANUAL|DAILY|EVERY_12H|WEEKLY|BIWEEKLY|MONTHLY|CUSTOM)`, `cron_expression (nullable, para CUSTOM)`, `day_of_week (nullable)`, `time_of_day (nullable)`, `timezone`, `default_mode (enum: FULL|INCREMENTAL)`.
- **Constraint**: singleton (uma linha) no MVP — sem multi-agent settings.

**Migration strategy**: Prisma Migrate, migrations versionadas e commitadas, nunca `db push` direto em produção. Cada Sprint que altera schema gera sua própria migration nomeada (`sprint2_defillama_snapshots`, etc.).

**Reservado, não criado agora**: `tokenomics`, `token_unlocks`, `funding_rounds`, `investors`, `venture_capitals`, `catalysts`, `second_brain_reviews`, `improvement_proposals`, `kanban_events`, `pine_indicators`, `technical_signals`, `user_snapshots`, `volume_snapshots` (estes últimos dois entram quando DefiLlama expuser dados de usuários/volume confiáveis — não confirmado no MVP).

---

## 8. Data Architecture

```
DefiLlama API
      ↓
Collector (packages/defi-data)         — chamada HTTP, retry exponencial, timeout
      ↓
Normalizer (packages/research-engine)  — unidades consistentes (USD), remove ruído
      ↓
Validator (packages/research-engine)   — schema check, anomaly detection, timestamp sanity
      ↓
PostgreSQL (snapshots imutáveis)       — nunca sobrescreve, sempre insere
      ↓
Metrics Engine (packages/research-engine) — growth 7/30/90d, aceleração, TVL por chain
      ↓
Scoring Engine (packages/scoring-engine)  — score normalizado + confidence
      ↓
Dashboard (apps/web)                   — leitura via API routes, nunca acesso direto ao worker
```

**Contratos por etapa:**

- **Collector → Normalizer**: `RawCollectorResponse { provider, endpoint, fetched_at, payload: unknown, http_status }`. Nunca lança exceção silenciosa — status `ERROR` propagado explicitamente.
- **Normalizer → Validator**: `NormalizedDataPoint { projectRef, metric, value, unit, period, dataTimestamp }`.
- **Validator → PostgreSQL**: `ValidatedSnapshot` (mesmo shape + `confidence` calculado + `validation_flags: string[]` se houver anomalia) — só grava se `validation_flags` não contiver erro bloqueante; anomalias não bloqueantes são gravadas com confidence reduzida.
- **PostgreSQL → Metrics Engine**: leitura por `project_id` + janela de tempo; puramente funcional (sem side-effect).
- **Metrics Engine → Scoring Engine**: `ProjectMetricsBundle` versionado por `research_run_id`.
- **Scoring Engine → Dashboard**: via API route que faz join `scores` + `research_sources` para montar o Research Trace sob demanda (não pré-computado, para evitar duplicação de dados).

**Tratamento de erros**: erro em qualquer etapa é capturado, logado com `research_run_id` de correlação, e propaga um estado `PARTIAL` ou `ERROR` no Research Run — nunca interrompe silenciosamente nem inventa dado (regra anti-alucinação do roadmap #43, que é inegociável).

---

## 9. API Architecture

**Internas (apps/web, Next.js API routes / Server Actions):**

- `POST /api/research-runs` — dispara Research Run manual (mode: FULL|INCREMENTAL).
- `GET /api/research-runs/:id` — status e detalhes de uma run.
- `GET /api/projects` — lista com score/ranking.
- `GET /api/projects/:slug` — detalhe + Research Trace.
- `GET /api/rankings/:type` — Growth|Value|Narrative.
- `POST /api/connections` — cadastrar/testar API key (nunca retorna o secret; retorna apenas status + máscara).
- `PATCH /api/connections/:provider` — revogar/substituir.
- `GET /api/settings/scheduler` / `PUT /api/settings/scheduler`.
- `GET /api/kanban` — estado atual do board.

Todas as rotas autenticadas (NextAuth session), exceto webhook interno do worker (protegido por secret compartilhado, não exposto publicamente).

**Externa (única no MVP): DefiLlama** — pública, sem key obrigatória para os endpoints usados (`/protocols`, `/protocol/{name}`, `/summary/fees/{protocol}`). Mesmo sem exigir key, o `api_connections` registra o provider com status `REAL` assim que a primeira chamada bem-sucedida ocorrer, para manter o padrão de status do roadmap #64.

---

## 10. Security Plan

Avaliação direta dos requisitos do roadmap (#6, #14, #63) aplicados ao MVP:

- **Secrets**: `api_connections.encrypted_secret` via AES-256-GCM, chave mestra fora do banco (env var `MASTER_ENCRYPTION_KEY`, nunca commitada). Nunca logar o valor decriptado.
- **Autenticação**: NextAuth, single-user/admin no MVP (credentials provider com senha hash bcrypt, ou magic-link — decidir com o usuário). Sem isso, qualquer pessoa com acesso à URL vê e testa API keys de terceiros.
- **Autorização**: MVP é single-user, então não há RBAC — mas todas as rotas exigem sessão válida; nenhuma rota de mutação é pública.
- **Endpoints**: rate limiting básico (ex.: `@upstash/ratelimit` ou middleware simples com Redis) nas rotas que disparam Research Run, para impedir disparo repetido acidental/abusivo.
- **Banco**: acesso via Prisma com prepared statements (proteção nativa contra SQL injection); nenhuma query raw concatenando input do usuário.
- **Logs**: nunca logar `encrypted_secret`, `MASTER_ENCRYPTION_KEY`, ou payloads brutos de resposta de API que possam conter tokens.
- **SSRF**: o Collector só faz requisições para domínios em allowlist (`api.llama.fi` no MVP) — nunca URL dinâmica vinda de input do usuário.
- **Input validation**: toda entrada de API route validada com Zod antes de tocar o banco.
- **Exposição de dados**: `GET /api/connections` retorna apenas `provider`, `status`, `last_tested_at` — nunca o secret, nem mascarado parcialmente reversível.

Nenhuma vulnerabilidade conhecida fica "para depois" sem registro — riscos adiados (multi-tenant/RBAC, WAF, secret rotation automática) ficam listados na seção 20 (Riscos).

---

## 11. Scheduler Plan

- **Job**: BullMQ job `research-run` enfileirado por (a) ação manual via API route, ou (b) `node-cron`/BullMQ repeatable job lendo `agent_settings`.
- **Queue**: fila única `research-runs` no MVP (não precisa de múltiplas filas ainda — YAGNI).
- **Worker**: processo separado (`infrastructure/workers`), consome a fila, orquestra Collector → Normalizer → Validator → Metrics → Scoring sequencialmente por projeto.
- **Retry**: BullMQ retry nativo (3 tentativas, backoff exponencial) por job; falhas de coleta de um projeto específico não abortam a run inteira — ficam marcadas como `PARTIAL` para aquele projeto.
- **Timeout**: timeout por job (ex.: 10min para Full Research com N projetos; ajustar empiricamente) — acima disso, marca `FAILED` e loga motivo.
- **Idempotência**: cada Research Run tem `id` único; reprocessar a mesma run não duplica snapshots (constraint de unicidade em `(project_id, metric, data_timestamp, source)` seria ideal, mas como `data_timestamp` pode repetir entre runs incrementais, a idempotência real é por `research_run_id` — um job cancelado e reenfileirado gera nova run, não reaproveita a antiga).
- **Lock**: lock distribuído via Redis (`redlock` ou lock simples com `SET NX EX`) para impedir duas Full Research simultâneas.
- **Histórico**: cada execução persiste em `research_runs`, nunca deletado — consulta futura de "o que rodou quando" vem direto dessa tabela.

---

## 12. Research Run Architecture

Entidade `research_runs` (schema completo na seção 7). Estados:

```
QUEUED → RUNNING → COMPLETED
                 → PARTIAL   (alguns projetos falharam, mas a run terminou)
                 → FAILED    (erro fatal, ex: banco indisponível)
```

Transições disparadas pelo worker, nunca pelo frontend diretamente. Cada mudança de estado é logada com timestamp e motivo (quando aplicável). `projects_found` e `projects_analyzed` são atualizados incrementalmente durante `RUNNING`, permitindo à Dashboard mostrar progresso em tempo real (polling simples no MVP; websocket fica para depois).

---

## 13. Scoring Architecture

**Problema identificado na auditoria**: o roadmap (#28) define pesos por categoria (ex.: "TVL Growth: 8 pontos") mas não a fórmula de normalização de cada sub-métrica em uma escala 0–1 antes de multiplicar pelo peso. Isso precisa ser resolvido agora, porque sem isso o Score não é implementável de forma determinística.

**Decisão proposta para Score Model v1.0** (a validar com o usuário antes do Sprint 5):

- Cada sub-métrica é normalizada via **percentile rank dentro do próprio setor** (não threshold fixo arbitrário) — ex.: TVL Growth 30d de um projeto é comparado à distribuição de TVL Growth 30d de todos os projetos do mesmo setor na mesma Research Run. Isso evita hardcodar limites (“+50% = nota máxima”) que não escalam entre setores com dinâmicas diferentes (DeFi vs RWA).
- `pontos_da_submetrica = peso_da_submetrica × percentile_rank(valor, distribuição_do_setor)`.
- Quando não houver dados suficientes no setor (poucos projetos), fallback para threshold fixo documentado (a definir por sub-métrica na implementação do Sprint 5, com constantes nomeadas e comentadas — não números mágicos soltos).
- **No MVP**, apenas a categoria **Fundamental (30 pontos)** é calculável de fato (TVL Growth, Revenue Growth, Fees/Revenue — dados que o DefiLlama fornece). As demais categorias (Tokenomics, Capital Institucional, Narrative, Catalysts, Valuation) ficam com peso redistribuído proporcionalmente dentro do que há dado disponível, e o Score exibe claramente `partial: true` com a lista de categorias não avaliadas — nunca preenche com 0 silenciosamente (isso distorceria o ranking).

**Confidence** (roadmap #29): calculada como função de (a) completude dos campos esperados, (b) recência do dado (`data_timestamp` vs. agora), (c) presença de anomalias reportadas pelo Validator. Fórmula simples e documentada no Sprint 5 (ex.: média ponderada dos três fatores, cada um normalizado 0–1) — não uma IA/LLM avaliando confidence no MVP (isso é tarefa do Second Brain, fora de escopo).

**Versionamento**: `score_model_version` (string, ex. `"1.0.0"`) gravado em cada linha de `scores` e em `research_runs`. Mudança de fórmula = nova versão, nunca sobrescreve a anterior — permite comparar Score v1.0 vs v1.1 retroativamente se necessário. A tabela de versões e suas regras fica documentada em `packages/scoring-engine/CHANGELOG.md`.

---

## 14. Kanban Architecture

Não implementado com automação completa no MVP, mas a estrutura de dados e transições básicas sim (permitindo visualizar o pipeline rodando).

**Resolução da contradição encontrada na auditoria** (roadmap seções #33 vs #34 divergem sobre quais colunas o fluxo automatizado atravessa): para o MVP, uso o subconjunto de colunas que efetivamente existem nesta fase — `BACKLOG → DISCOVERY → DATA_COLLECTION → FUNDAMENTAL_ANALYSIS → SCORING → PUBLISHED`. As colunas `CROSS-CHECK` e `SECOND BRAIN` só entram no board quando essas etapas forem implementadas (Sprint 7+), evitando um board com colunas "fantasma" que nunca recebem cards no MVP.

**Eventos que movem cards automaticamente:**

- Research Run cria/atualiza card em `DISCOVERY` quando um projeto novo é descoberto.
- Collector conclui coleta → card move para `DATA_COLLECTION` → ao finalizar, `FUNDAMENTAL_ANALYSIS`.
- Scoring Engine conclui → card move para `SCORING` → `PUBLISHED` quando a run atinge `COMPLETED` para aquele projeto.
- Falha em qualquer etapa → card permanece na coluna atual com badge de erro (não avança nem regride).

---

## 15. Second Brain Architecture (interface apenas — não implementado no MVP)

**Contrato de entrada:**

```ts
interface SecondBrainInput {
  researchRunId: string;
  findings: ResearchFinding[]; // já persistidos
  sources: ResearchSource[];
  score: Score;
}
```

**Contrato de saída:**

```ts
interface SecondBrainOutput {
  validation: "APPROVED" | "FLAGGED" | "REJECTED";
  problems: Problem[]; // { category, description, severity }
  risks: Risk[];
  contradictions: Contradiction[];
  questions: string[];
  improvementProposals: ImprovementProposal[]; // vão para BACKLOG mediante aprovação humana
  secondBrainVersion: string; // versionado, como o Score
}
```

Definir esse contrato agora (sem implementar a lógica) permite que `research_findings` e `scores` já sejam gravados no formato que o Second Brain vai consumir depois, evitando retrabalho de schema quando a Sprint 7 chegar. Conforme roadmap #38, o Second Brain nunca altera regras críticas de scoring automaticamente — toda proposta de melhoria exige aprovação humana antes de virar card no Kanban.

---

## 16. Observability

- **Logs estruturados** (JSON, via pino ou similar) com `research_run_id` como campo de correlação em toda a cadeia Collector→Normalizer→Validator→Metrics→Scoring.
- **Métricas por Research Run**: duração total, duração por etapa, projetos encontrados/analisados, erros, retries, fontes consultadas, chamadas de API realizadas.
- **Painel administrativo simples** (`/admin/observability` no dashboard): última run, duração, status por provider (`REAL/PARTIAL/MOCK/UNAVAILABLE/ERROR/NOT_CONFIGURED`, conforme roadmap #64), contagem de erros recentes.
- **AI usage**: não aplicável no MVP (sem Second Brain/IA ainda) — campo reservado em `research_runs.ai_cost_estimate` para quando existir.
- Sem stack de observability externa (Datadog/Grafana) no MVP — logs estruturados + painel simples bastam; reavaliar quando o volume de execução justificar.

---

## 17. Testing Strategy

| Módulo                                   | Unit                                                                        | Integration                                                                              | Notas                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `defi-data` (Collector DefiLlama)        | Parsing de resposta, tratamento de erro HTTP                                | Chamada real contra sandbox/endpoint público em CI (com skip se offline), teste de retry | Mock de HTTP apenas em unit; integration usa endpoint real conforme regra anti-mock do roadmap #64 |
| `research-engine` (Normalizer/Validator) | Normalização de unidades, detecção de anomalia, timestamps inconsistentes   | Pipeline completo Collector→Snapshot contra banco de teste                               | Casos: dado ausente, valor negativo inesperado, timestamp futuro                                   |
| `research-engine` (Metrics)              | Cálculo de growth 7/30/90d, aceleração, ausência de dado em período         | —                                                                                        | Casos de borda: snapshot único (sem histórico), gap de dados                                       |
| `scoring-engine`                         | Normalização por percentile rank, fallback threshold, cálculo de Confidence | Score determinístico ponta-a-ponta com fixtures de DB                                    | Garantir reprodutibilidade: mesma entrada → mesmo score                                            |
| API routes (`apps/web`)                  | Validação Zod                                                               | Auth obrigatória, cenários 401/403                                                       | —                                                                                                  |
| Database (Prisma)                        | —                                                                           | Migrations aplicam limpo em banco vazio; constraints (unique, FK) validadas              | —                                                                                                  |
| E2E                                      | —                                                                           | Fluxo: cadastrar API key → disparar Research Run manual → ver Score no dashboard         | Playwright, 1–2 cenários críticos no MVP, não suite completa                                       |

CI (GitHub Actions): lint + typecheck + unit + integration em cada PR; E2E roda em pipeline separado (mais lento, não bloqueia todo PR).

---

## 18. Sprint Plan

### SPRINT 1 — Fundação

**Objetivo**: monorepo funcional, banco rodando, dashboard "hello world" autenticado.
**Dependências**: nenhuma (primeira sprint).
**Arquivos**: estrutura do monorepo (seção 3), `package.json`s, `tsconfig`, ESLint/Prettier, `docker-compose.yml`, `.env.example`.
**Banco**: schema inicial Prisma (`projects`, `sectors`, `chains` — tabelas sem dependência de coleta ainda) + migration inicial.
**APIs**: nenhuma externa ainda.
**Implementação**: Next.js app com NextAuth (login single-user), layout base do dashboard (shell vazio).
**Testes**: CI configurado (lint/typecheck), teste de smoke (app sobe, login funciona).
**Definition of Done**: `docker compose up` sobe Postgres+Redis; `npm run dev` sobe o dashboard; login funciona; migration aplica limpo.

### SPRINT 2 — Secrets + Primeira Integração Real

**Objetivo**: API keys protegidas + Collector DefiLlama funcional.
**Dependências**: Sprint 1.
**Arquivos**: `packages/defi-data`, criptografia de secrets em `packages/database` (ou `packages/shared`), rota `/api/connections`.
**Banco**: `api_connections`, migration.
**APIs**: DefiLlama (`/protocols`, `/protocol/{name}`).
**Implementação**: tela de Configurações → API Keys (mascarado, testar conexão); Collector com retry/timeout.
**Testes**: unit (parsing/erro), integration (chamada real contra DefiLlama em CI).
**Definition of Done**: cadastro de conexão DefiLlama funciona, status muda para `REAL` após teste bem-sucedido; nenhuma chave em texto puro no banco (verificar manualmente).

### SPRINT 3 — Snapshots + Métricas Básicas (TVL/Fees/Revenue)

**Objetivo**: dados reais persistidos com proveniência; growth calculável.
**Dependências**: Sprint 2.
**Arquivos**: `packages/research-engine` (normalizer, validator, metrics).
**Banco**: `tvl_snapshots`, `revenue_snapshots`, `fee_snapshots`, `project_chains`, migrations.
**APIs**: DefiLlama fees/revenue endpoints.
**Implementação**: pipeline Collector→Normalizer→Validator→Snapshot rodando manualmente (sem scheduler ainda) para um conjunto fixo de projetos de teste; cálculo de growth 7/30/90d.
**Testes**: conforme seção 17 (Normalizer/Validator/Metrics).
**Definition of Done**: rodar o pipeline manualmente popula snapshots reais no banco; growth calculado corretamente para um projeto conhecido (validação manual cruzando com o site do DefiLlama).

### SPRINT 4 — Research Run + Scheduler + BullMQ

**Objetivo**: orquestração assíncrona real, disparo manual e agendado.
**Dependências**: Sprint 3.
**Arquivos**: `infrastructure/workers`, `agent_settings`, rota `/api/research-runs`, tela de Scheduler.
**Banco**: `research_runs`, `research_findings`, `research_sources`, `agent_settings`, migrations.
**APIs**: nenhuma nova.
**Implementação**: fila BullMQ, worker que executa o pipeline da Sprint 3 orquestrado por Research Run; scheduler lendo `agent_settings`; modos Full/Incremental (Incremental = reprocessa apenas projetos com snapshot desatualizado).
**Testes**: idempotência, retry, timeout, lock (duas runs simultâneas).
**Definition of Done**: disparar Research Run manual via dashboard atualiza estado em tempo real (polling) até `COMPLETED`; scheduler dispara run automaticamente no horário configurado.

**Status: CONCLUÍDO.** Implementado conforme o objetivo, com os seguintes desvios do escopo original (documentados e aceitos como decisão de engenharia, não pendências):

- `research_findings`/`research_sources` **não foram criadas** nesta sprint — o rastreamento de proveniência por métrica (Research Trace) já existe via `tvl_snapshots`/`revenue_snapshots`/`fee_snapshots` (Sprint 3, `sourceTimestamp`/`retrievedAt`); essas duas tabelas ficam para quando o Sprint 5 (Scoring) precisar consolidar findings por categoria.
- Tela de Scheduler dedicada **não foi criada** — `agent_settings` existe e o scheduler (`infrastructure/workers/scheduler.ts`) funciona lendo a tabela diretamente; editar a configuração hoje é feito via Prisma Studio ou diretamente no banco, não pela UI do dashboard.
- INCREMENTAL está registrado corretamente como `mode` mas ainda coleta a série histórica inteira (mesmo comportamento de FULL) — otimização real fica para uma sprint futura, conforme já era esperado pelo próprio objetivo do Sprint 4 ("não fazer otimização prematura").

### SPRINT 5 — Scoring Engine + Confidence + Research Trace

**Objetivo**: Score 0-100 real, versionado, rastreável.
**Dependências**: Sprint 4.
**Arquivos**: `packages/scoring-engine`.
**Banco**: `scores`, migration.
**APIs**: nenhuma nova.
**Implementação**: fórmulas da seção 13 (percentile rank por setor, fallback threshold, partial score quando faltam categorias), cálculo de Confidence, `score_model_version = "1.0.0"`.
**Testes**: determinismo (mesma entrada → mesmo score), casos de poucos projetos no setor (fallback), partial score.
**Definition of Done**: Score aparece no dashboard com breakdown por categoria; clicar numa métrica mostra fonte/timestamp (Research Trace).

### SPRINT 6 — Dashboard Completo + Rankings + Kanban Básico

**Objetivo**: MVP visualmente completo e navegável.
**Dependências**: Sprint 5.
**Arquivos**: páginas Home/Projeto/Narrativas, `packages/database` queries de ranking, board Kanban simplificado.
**Banco**: `kanban_boards`, `kanban_columns`, `kanban_cards`, migrations.
**APIs**: `/api/rankings/:type`, `/api/kanban`.
**Implementação**: 3 rankings (Growth/Value/Narrative simplificado), página de narrativas agregando por setor, board Kanban com as 6 colunas do MVP e movimentação automática pelos eventos do Research Run (seção 14).
**Testes**: E2E do fluxo completo (seção 17).
**Definition of Done**: todos os itens da seção 24 (DoD do MVP) marcados como concluídos.

### SPRINT 7+ (pós-MVP, fora deste plano de aprovação)

Second Brain completo, Funding/VC/Tokenomics/Unlocks, Catalysts, Historical Intelligence/Backtesting, e só então Pine Script/TradingView — nesta ordem, conforme princípio final do roadmap (seção 28 do prompt original).

---

## 19. Dependencies

- Sprint 2 depende de decisão sobre mecanismo de criptografia (seção 10) — confirmar com o usuário antes de iniciar.
- Sprint 1 depende de decisão de hospedagem/deploy target (seção 3) — não bloqueia desenvolvimento local, mas deve ser decidida antes do Sprint 6 (deploy do MVP).
- Todas as sprints dependem de acesso à internet para DefiLlama (sem mock — regra do roadmap #64).
- Scoring (Sprint 5) depende da fórmula de normalização (seção 13) ser validada com o usuário — é uma decisão de produto, não só técnica.

---

## 20. Risks

| Risco                                                                    | Impacto                                    | Mitigação                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| DefiLlama mudar formato de resposta sem aviso                            | Quebra o Collector silenciosamente         | Validator com schema estrito (Zod) rejeita e marca `ERROR`, nunca aceita formato inesperado silenciosamente             |
| Fórmula de Score (percentile rank) não refletir a intenção do usuário    | Rankings "errados" na percepção do usuário | Validar a fórmula com o usuário antes do Sprint 5, com exemplos concretos                                               |
| Ausência de autenticação real na v0 do dashboard                         | Exposição de API keys/status de conexões   | Auth entra já no Sprint 1, não é opcional                                                                               |
| Rate limit do DefiLlama em Full Research com muitos projetos             | Research Run falha/demora                  | Retry com backoff, processar em lotes, considerar cache de curto prazo                                                  |
| Hospedagem/deploy não decidida                                           | Bloqueia deploy do MVP em produção         | Decidir até o Sprint 6, não bloqueia trabalho local                                                                     |
| Escopo "MVP" crescer de volta para o DoD gigante da seção #60 do roadmap | Sprint infinita, nunca "pronto"            | Este plano já corta explicitamente Funding/VC/Tokenomics/Unlocks/Catalysts/Second Brain do MVP — manter essa disciplina |

---

## 21. Definition of Done — MVP

- [ ] Dashboard funcional (Home, Projeto, Narrativas)
- [ ] Configuração funcional
- [ ] API Keys protegidas (criptografadas, mascaradas, testáveis)
- [ ] Scheduler funcional (Manual + Daily/Weekly, Full/Incremental)
- [ ] Research Run funcional (estados, histórico)
- [ ] DefiLlama real (sem mock)
- [ ] TVL (atual, histórico, por chain)
- [ ] Fees
- [ ] Revenue + Revenue Growth
- [ ] Chains
- [ ] Snapshots imutáveis com proveniência
- [ ] PostgreSQL migrado e versionado
- [ ] Métricas fundamentais (growth, aceleração)
- [ ] Score (categoria Fundamental completa; demais com partial score explícito)
- [ ] Confidence
- [ ] Ranking (Growth, Value, Narrative)
- [ ] Research Trace clicável
- [ ] Kanban básico com movimentação automática
- [ ] Logs estruturados + retries + tratamento de falha sem inventar dado
- [ ] Testes (unit + integration para DefiLlama e Research Engine; E2E do fluxo principal)
- [ ] Documentação (README de setup, este plano atualizado)

---

## 22. Future Architecture — Pine Script / TradingView

Não implementado nesta fase. Reservas arquiteturais para quando a Fase 2 (roadmap #52-55) for aprovada:

- Tabelas `pine_indicators`, `technical_signals` (já listadas no modelo de dados do roadmap #46) — criadas apenas quando a Sprint correspondente iniciar.
- `packages/technical-analysis` (novo pacote, não fundido com `research-engine` — indicadores técnicos têm ciclo de vida e fontes de dados distintos de fundamentos).
- O `Fundamental Score` (Score deste MVP) e o futuro `Technical Score` permanecem **separados** no Opportunity Engine (Fase 3, roadmap #56) — nunca combinados prematuramente, respeitando a distinção "boa empresa" vs "bom trade" (roadmap #57).
- Nenhuma dependência do MVP bloqueia essa fase futura; a separação de `scoring-engine` (fundamental) de um futuro `technical-scoring-engine` já é prevista na estrutura de pacotes da seção 3.

---

## 23. Sprint 5 — Scoring Engine + Confidence + Research Trace (concluído)

Implementado sobre a fundação de Research Runs do Sprint 4, sem criar um segundo pipeline:

- `packages/scoring-engine`: matemática pura do Fundamental Score (0-30, `fundamental-v1`),
  percentile rank por setor (fórmula documentada no README do package), Confidence (0-100,
  independente do Score) e Research Trace.
- Modelo: TVL Growth (10 pts), Revenue Growth (10 pts), Fees Growth (5 pts), Efficiency —
  Revenue/TVL e Fees/TVL (5 pts); dentro de cada grupo de growth, janelas 7d/30d/90d pesam
  20%/50%/30%, renormalizado quando uma janela está ausente. Grupo inteiramente ausente conta
  0 no total e é listado em `missingGroups` (`partial: true`) — nunca um valor fabricado.
- Tabela nova: `fundamental_scores` (sempre INSERT, nunca UPDATE — preserva histórico),
  associada a `researchRunId` e `projectId`. Trace e breakdown vivem no campo `breakdown`
  (JSON) — decisão deliberada de não criar `research_findings`/`research_sources` como
  tabelas relacionais nesta sprint.
- Integrado ao Worker (Sprint 4): depois que `runPipelineForProject` calcula métricas de um
  projeto, se um `researchRunId` foi passado, o Score é calculado e persistido na mesma run.
- **Limitação documentada**: o Validator (Sprint 3) rejeita pontos `INVALID` antes de
  persistir — não sobra registro no banco. A distinção fina `INVALID` vs `MISSING` só é
  observável durante a mesma execução do pipeline (contadores efêmeros), nunca recuperável
  retroativamente a partir do estado do banco.
- **Limitação documentada**: todo projeto processado hoje cai no setor "Uncategorized" (não
  há taxonomia real ainda) — o percentile compara Aave/Uniswap/Lido entre si por enquanto;
  os testes determinísticos usam fixtures de 5 projetos para provar o percentile com amostra
  adequada.
- Dashboard: `/dashboard/projects/[slug]` mostra Score/Confidence/Breakdown/Trace;
  `/dashboard/rankings` lista o "Fundamental Ranking" (nunca "Best Investment"/"Buy").

---

## Aprovação pendente

Este documento não modificou código, migrations, dependências, banco de dados, frontend ou backend — apenas foi criado este arquivo, conforme solicitado.

Pontos que exigem decisão explícita do usuário antes do Sprint 1:

1. Mecanismo de criptografia de secrets (seção 10) — AES-256-GCM local é aceitável, ou há preferência por um serviço externo (Vault/KMS)?
2. Hospedagem/deploy target (seção 3) — Docker local é suficiente por ora, mas qual o destino de produção (Fly.io, Railway, VPS, outro)?
3. Fórmula de normalização do Score (seção 13, percentile rank por setor) — está alinhada com a intenção do usuário, ou há preferência por thresholds fixos mais simples no v1.0?
4. Confirmar que o corte de escopo do MVP (seção 6) está correto — especialmente adiar Funding/VC/Tokenomics/Unlocks para pós-MVP.

Aguardando aprovação para iniciar o Sprint 1.
