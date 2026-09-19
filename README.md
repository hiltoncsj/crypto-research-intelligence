# Crypto Research Intelligence

Ver `Crypto_Research_Intelligence_Master_Roadmap.md` (especificação) e
`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` (plano técnico/sprints).

## Setup local

```bash
npm install

# Sobe Postgres + Redis
docker compose -f infrastructure/docker-compose.yml up -d

cp .env.example .env
```

Edite `.env` e preencha:

- `NEXTAUTH_SECRET` — gere com `openssl rand -base64 32`.
- `ADMIN_PASSWORD_HASH` — gere localmente (a senha em si nunca deve ir para nenhum arquivo do
  repositório): `node -e "console.log(require('bcryptjs').hashSync('sua-senha', 10))"` e cole
  o hash resultante (`$2a$...` ou `$2b$...`) no `.env`.
- `MASTER_ENCRYPTION_KEY` (a partir do Sprint 2) — chave mestra AES-256-GCM usada para
  criptografar secrets de `api_connections`. Gere com `openssl rand -hex 32` (64 caracteres
  hex = 32 bytes). Nunca commitar o valor real, nunca colocar no `.env.example`.

⚠️ Se a porta `5432` já estiver em uso por um Postgres nativo/local, o
`infrastructure/docker-compose.yml` já mapeia o Postgres do Docker para a porta `5433` do
host (o container continua ouvindo na `5432` internamente) — ajuste `DATABASE_URL` de acordo
se mudar isso.

⚠️ O `.env` fica na **raiz** do monorepo (não em `apps/web/`). `npm run worker:dev` e `npm run
scheduler:dev` funcionam porque rodam com `cwd` na raiz (o `dotenv/config` deles lê o `.env`
dali direto), mas `next dev`/`next build` rodam com `cwd` em `apps/web` — por isso
`apps/web/next.config.mjs` carrega o `.env` da raiz explicitamente (`dotenv` com `path`
apontando duas pastas acima). Se um dia migrar para múltiplos `.env` por ambiente, ajuste esse
carregamento também.

```bash
# Aplica as migrations existentes (schema + api_connections)
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

npm run dev
```

Dashboard em `http://localhost:3000` (redireciona para `/login`). Após logar, acesse
`/dashboard/settings` para ver a tela "API & Data Sources" (Sprint 2).

## Testando a integração DefiLlama

1. Faça login no dashboard e vá em **Configurações → API & Data Sources**.
2. Clique em **Configurar** no card do DefiLlama (não exige API key — é um provider público).
3. Clique em **Test Connection** — o backend chama `GET /protocols` real do DefiLlama; o
   status muda para `REAL` em caso de sucesso, `ERROR` caso contrário (nunca fica marcado
   como saudável sem uma checagem real).

Via API diretamente (autenticado por sessão do navegador):

```bash
curl http://localhost:3000/api/connections
curl -X POST http://localhost:3000/api/connections \
  -H "content-type: application/json" \
  -d '{"provider":"DEFILLAMA","name":"DefiLlama"}'
curl -X POST http://localhost:3000/api/connections/<id>/test
```

## Pipeline de dados (Sprint 3) e Research Runs assíncronas (Sprint 4)

A partir do Sprint 4, o pipeline (Collector → Normalizer → Validator → Persist → Metrics, do
Sprint 3) roda dentro de um **Research Worker** separado, orquestrado por **BullMQ + Redis**,
não mais sincronamente dentro da requisição HTTP.

### Rodando o Worker (obrigatório para Research Runs funcionarem)

Em um terminal separado, com o Docker Compose já de pé:

```bash
npm run worker:dev
```

Isso inicia `infrastructure/workers/research-worker.ts` (via `tsx watch`), que consome a fila
`research-runs` do Redis, executa o pipeline do Sprint 3 e atualiza a `ResearchRun` no banco
(`QUEUED → RUNNING → COMPLETED/PARTIAL/FAILED/CANCELLED`). **Sem o Worker rodando, os jobs
ficam parados na fila** — `POST /api/research-runs` só cria a run e enfileira, não processa.

Em produção, compile e rode este arquivo como um processo Node standalone, separado do
`next start` — nunca dentro do processo HTTP do Next.js.

### Scheduler (opcional)

```bash
npm run scheduler:dev
```

Lê a linha singleton de `agent_settings` a cada 60s; se `enabled=true` e `nextRunAt` já
passou, cria uma `ResearchRun` com `trigger=SCHEDULED` e enfileira, sem duplicar se já houver
uma run `QUEUED`/`RUNNING`. Sem uma UI dedicada ainda para editar `agent_settings` nesta
sprint — ajuste diretamente no banco ou via Prisma Studio se quiser testar:

```bash
npx prisma studio --schema packages/database/prisma/schema.prisma
```

### Usando o dashboard

1. Com o Worker rodando, faça login e vá em **Research** (`/dashboard/research`).
2. Escolha o modo (**Full**/**Incremental** — no Sprint 4 ambos coletam da mesma forma; a
   otimização real de "só o que mudou" fica para uma sprint futura) e clique em **Run
   Research**. A run aparece na tabela como `QUEUED`, depois `RUNNING` (com polling automático
   a cada 3s), até `COMPLETED`/`PARTIAL`/`FAILED`.
3. Runs `QUEUED`/`RUNNING` têm um botão **Cancel** — cancelamento é cooperativo: uma run
   `RUNNING` termina o projeto atual antes de parar (não aborta chamadas de rede em curso).
4. Clique em qualquer projeto listado para ver TVL atual, growth 7d/30d/90d, Revenue/Fees
   30d, fonte, last updated e um gráfico simples de TVL ao longo do tempo.

Via API diretamente:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/research-runs \
  -H "content-type: application/json" \
  -d '{"mode":"FULL","trigger":"MANUAL"}'
curl -b cookies.txt http://localhost:3000/api/research-runs
curl -b cookies.txt http://localhost:3000/api/research-runs/<id>
curl -b cookies.txt -X POST http://localhost:3000/api/research-runs/<id>/cancel
curl -b cookies.txt http://localhost:3000/api/projects
curl -b cookies.txt http://localhost:3000/api/projects/aave
```

### Fundamental Score (Sprint 5)

A partir do Sprint 5, cada Research Run também calcula o **Fundamental Score** (0-30,
`fundamental-v1`) de cada projeto processado com sucesso — ver
`packages/scoring-engine/README.md` para a fórmula completa (percentile rank por setor,
Confidence independente do Score, tratamento de dados ausentes/suspeitos/inválidos).

- `GET /dashboard/projects/:slug` mostra Score, Confidence, breakdown por categoria e o
  Research Trace (fonte, timestamp, percentile, cálculo) de cada métrica usada.
- `GET /dashboard/rankings` lista o **Fundamental Ranking** — mede força fundamental
  observável, **não é recomendação de investimento**.
- O Score só é calculado dentro de uma Research Run real (worker) — não há endpoint para
  recalcular sob demanda fora desse fluxo.

### Troubleshooting

- **`/api/health` mostra `redis: "disconnected"`**: confira `docker compose -f
infrastructure/docker-compose.yml ps` — o serviço `redis` precisa estar `healthy`.
- **Run fica presa em `QUEUED`**: o Worker (`npm run worker:dev`) não está rodando, ou não
  conseguiu adquirir o lock `research-agent-lock` porque outra run já o detém (aguarde a run
  ativa terminar, ou verifique `docker exec infrastructure-redis-1 redis-cli GET
research-agent-lock`).
- **EPERM ao rodar `prisma generate` no Windows**: normalmente causado por um processo
  Node/Next/Worker anterior ainda segurando o binário do query engine. Feche os processos
  `node`/`tsx` órfãos (`tasklist | grep node`) antes de rodar de novo.
- **`[next-auth][error][NO_SECRET]` / página "Server error"**: o `.env` não foi carregado —
  confira se `apps/web/next.config.mjs` ainda tem o `dotenv.config({ path: "../../.env" })` e
  se o arquivo `.env` (raiz) existe e tem `NEXTAUTH_SECRET` preenchido.
- **`npm run dev` reclama que a porta 3000 já está em uso mesmo depois de parar o processo no
  Claude Code/terminal**: no Windows, encerrar o processo "pai" (`npm run dev`) às vezes não
  mata o `next-server` filho, que continua segurando a porta. Encontre o PID e finalize
  manualmente: `netstat -ano | grep ":3000"` → `taskkill //F //PID <pid>`.

## Kanban Pull System (Sprint 7)

O Research Pipeline (Discovery → Data Collection → Fundamental Analysis → Scoring →
Published) tem um board Kanban operacional em `/dashboard/kanban`, com **Pull System** real:

- O pipeline (`pipeline.ts`) move os cards automaticamente conforme processa cada projeto de
  verdade (ator `SYSTEM`) — isso nunca é bloqueado por WIP, só registra visibilidade
  (`kanban.wip_violation`) se o limite já estiver estourado, porque o BullMQ/lock global já
  garante que só uma Research Run roda por vez.
- A operação **Pull** explícita (usada pela API/UI para mover um card do buffer `READY` de uma
  etapa para a próxima) aplica o **WIP Limit de verdade no backend**, dentro de uma transação
  com `SELECT ... FOR UPDATE` — não dá pra furar via frontend nem por corrida entre duas
  chamadas simultâneas.
- Cards ficam com histórico imutável de movimentações (`kanban_card_movements`), usado para
  calcular Cycle Time, Lead Time, Blocked Time e Throughput (`GET /api/kanban/metrics`).
- Um card com falha em qualquer etapa vira `BLOCKED` com motivo — nunca avança nem regride
  sozinho; desbloquear é uma ação explícita (`POST /api/kanban/cards/:id/unblock`).

API: `GET /api/kanban` (board completo), `GET /api/kanban/metrics`, `POST /api/kanban`
(cria card manual no Backlog), `POST /api/kanban/cards/:id/{pull,block,unblock,urgent}`.

## Historical Fundamental Intelligence (Sprint 14)

Transforma os snapshots históricos já coletados (TVL/Revenue/Fees desde o Sprint 3,
Price/Market Cap/Volume desde o Sprint 12) em análises temporais — Growth, Acceleration,
Fundamental Momentum, relação Market vs Fundamentals, Fundamental vs Price Divergence, Valuation
Ratios, Correlação e Leading/Lagging entre séries, e Fundamental Regime. Tudo calculado **sob
demanda** a partir do banco (`packages/research-engine/src/historical-intelligence.ts`), sem
tabela nova nem chamada externa adicional. Exposto em cada Project Report (seção "Inteligência
Fundamental Histórica") e na Home do Dashboard (`GET /api/dashboard/fundamental`).

**Fundamental Intelligence ≠ Trading Intelligence** — distinção deliberada, mantida em todos os
sprints:

|                              | Fundamental Intelligence (este Sprint)                                                     | Trading Intelligence (futuro, não implementado)                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Analisa                      | Fundamentos on-chain/financeiros (TVL, Revenue, Fees, Funding) e sua relação com valuation | Estrutura de preço, indicadores técnicos                                                 |
| Exemplos                     | Growth, Acceleration, Fundamental Momentum, Divergência Fundamentos×Preço, Regimes         | RSI, MACD, EMA/SMA, Bollinger, suporte/resistência, breakout                             |
| Saída                        | Classificações descritivas ("Fundamental Acceleration", "Positive Fundamental Divergence") | Sinais de trading, Pine Script, TradingView, backtesting                                 |
| Recomendação de investimento | Nunca                                                                                      | Fora de escopo de todo o projeto atual — nenhum sprint até aqui gera Buy/Sell/Long/Short |

API: `GET /api/projects/[slug]/historical-intelligence`, `GET /api/dashboard/fundamental`.

## Catalysts, Risks & Fundamental Context (Sprint 15)

Eventos factuais (Catalyst/Risk) relacionados a cada projeto — ver
`CATALYSTS_RISKS_ARCHITECTURE.md` para a investigação completa de fontes (8 candidatas
avaliadas com chamadas reais, só 2 implementadas). Fontes ativas hoje:

- **Risk `SECURITY_INCIDENT`** — DefiLlama `/hacks` (incidentes de segurança reais), casado por
  `defillamaId` exato — nunca por nome do projeto.
- **Catalyst `FUNDING`** — reclassificação dos `FundingRound` já persistidos (Sprint 6), zero
  coleta nova.

Todas as demais categorias da taxonomia (`ResearchEventCategory`, ~39 valores cobrindo Catalyst e
Risk) existem no schema, mas não têm fonte real conectada ainda — nunca populadas com dado
inventado.

**Fundamental Context** (`packages/research-engine/src/fundamental-context.ts`) reúne Historical
Intelligence + Catalysts + Risks + Tokenomics coverage + Capital numa visão única —
explicitamente **não é um Global Score**, só contexto estruturado e auditável.

API: `GET /api/projects/[slug]/catalysts`, `GET /api/projects/[slug]/risks`,
`GET /api/projects/[slug]/fundamental-context`. Catalysts/Risks também aparecem consolidados em
`GET /api/dashboard/fundamental` e na Home do Dashboard.

## Event Impact Analysis (Sprint 16)

Conecta os eventos reais do Sprint 15 (`FUNDING`/`SECURITY_INCIDENT`) às séries históricas já
coletadas (TVL/Revenue/Fees desde o Sprint 3, Price/Market Cap/Volume desde o Sprint 12) —
janelas de 7/14/30 dias antes e depois de cada `eventDate`, baseline = último valor real dentro
da janela (nunca extrapola de fora dela, nunca fabrica um valor).

**Regra central: associação temporal, nunca causalidade.** O sistema nunca escreve "o evento
causou X" — só "foi observada uma variação de Y% após o evento". Classificação estritamente
descritiva (`FUNDAMENTAL_EXPANSION_AFTER_EVENT`, `MARKET_DECLINE_AFTER_EVENT`, `MIXED`,
`NO_CLEAR_CHANGE`, `INSUFFICIENT_DATA`, `OVERLAPPING_EVENTS`) — nunca Bullish/Bearish/Buy/Sell.

Quando dois eventos do mesmo projeto caem dentro da mesma janela de 30 dias, o sistema classifica
como `OVERLAPPING_EVENTS` em vez de atribuir a mudança observada a um único evento — a
sobreposição sempre tem prioridade sobre qualquer outra classificação.

Fundamental Momentum/Regime before×after reaproveitam EXATAMENTE as funções do Sprint 14 (mesma
versão de modelo, nenhuma metodologia paralela nova). Agregação cross-event (média/mediana/min/
max por categoria) sinaliza explicitamente `insufficientSample` abaixo de 3 observações — nunca
tratada como previsão.

**Calculado inteiramente sob demanda, sem tabela nova** — mesma decisão arquitetural do Sprint
14, pela mesma razão (volume de eventos ainda pequeno, cálculo barato sobre séries de até ~365
pontos).

API: `GET /api/projects/[slug]/event-impacts`. Também exposto no Project Report ("## Impacto
Histórico de Eventos") e na Home do Dashboard ("Event Intelligence").

## Scripts

- `npm run dev` — sobe `apps/web`.
- `npm run worker:dev` — sobe o Research Worker (BullMQ, Sprint 4) — necessário para Research
  Runs processarem.
- `npm run scheduler:dev` — sobe o scheduler (Sprint 4), opcional.
- `npm run lint` / `npm run typecheck` / `npm test` — rodam em todos os workspaces (typecheck
  também cobre `infrastructure/workers`).
- `npm run build --workspace=apps/web` — build de produção do dashboard.
- `npm run prisma:migrate` — aplica migrations do `packages/database` (modo dev, cria novas
  migrations a partir de mudanças no schema).
- `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma` — aplica
  migrations existentes sem gerar novas (uso em CI/produção).

## Rodando os testes

`npm test` roda os testes de todos os workspaces, incluindo:

- `packages/shared` — testes de criptografia (AES-256-GCM: encrypt/decrypt, tampering,
  chave ausente/inválida, payload malformado). Não dependem de banco.
- `packages/defi-data` — testes do cliente HTTP (retry, timeout, 429/5xx/4xx, JSON
  inválido) e um teste de integração real contra `api.llama.fi` (pulado automaticamente se
  a máquina estiver offline).
- `packages/database` — testes de integração contra o Postgres do `docker-compose`
  (create/read/update/constraint de `api_connections`). Requer `docker compose up -d` e
  `DATABASE_URL` configurada — sem isso, esses testes falham (não usam mock de banco, por
  decisão de projeto).
- `apps/web` — smoke tests de auth/health + testes da Connections API (autenticação
  obrigatória, mascaramento de secret, test connection, delete).
- `packages/research-engine` — validator (valores negativos/futuros/suspeitos), metrics
  (growth 7d/30d/90d, N/A em vez de NaN/Infinity), testes de integração real de
  persistência/deduplicação de snapshots, e testes de orquestração dos callbacks de
  progresso/cancelamento usados pelo Worker.
- `packages/queue` (Sprint 4) — lock distribuído (aquisição/TTL/renovação/liberação) e
  enqueue idempotente, ambos testados contra o Redis real do `docker-compose`.
- Novos testes em `apps/web`/`packages/database` (Sprint 4) — API de Research Runs
  (autenticação, validação, criação, consulta, cancelamento) e transições de estado de
  `ResearchRun` contra o Postgres real.
- `packages/research-engine` (Sprint 7) — Kanban Pull System: WIP Limit rejeitando/aceitando
  Pull, Pull atômico contra corrida, Block/Unblock com Blocked Time, Urgent com política de
  limite por período, histórico de movimentações imutável, cálculo de capacidade/WIP e
  detecção de bottleneck — tudo contra o Postgres real do `docker-compose`.
