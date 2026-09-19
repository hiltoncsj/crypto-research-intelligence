# Sprint 12 — Test Reliability + Historical Market Data Foundation

## Relatório de implementação

Data: 2026-09-18. Baseado em execução real dos comandos (não em suposição) — todas as evidências
abaixo vêm de rodar `npm test`/`typecheck`/`lint`/`build` de verdade neste ambiente Windows, e de
inspeção direta do código antes de qualquer mudança.

---

## 1. Resumo

Dois objetivos independentes, ambos concluídos:

- **Parte A**: `npm test` na raiz agora roda sem erro de `DATABASE_URL`, e os testes flaky
  conhecidos (mais dois problemas novos, só visíveis depois da correção) foram investigados e
  corrigidos na causa raiz, não com timeout maior ou testes desabilitados.
- **Parte B**: nova fundação de dados históricos de mercado (preço/market cap/volume diário),
  via CoinGecko real, persistida de forma imutável e idempotente, integrada ao pipeline existente.

Nenhum score existente foi recalibrado. `TokenUnlock`, Narrative, Catalysts, Risks, Second Brain,
Trading Intelligence, Backtesting, Opportunity Engine — nenhum tocado.

---

## 2. Problema dos testes

### Causa raiz do `DATABASE_URL not found`

Confirmado reproduzindo o erro (não assumido): rodando `unset DATABASE_URL && npm run test
--workspace=packages/research-engine` (e o mesmo para `packages/database` e `apps/web`), os três
falhavam com `PrismaClientInitializationError: Environment variable not found: DATABASE_URL`.
Causa: `next dev`/Prisma CLI carregam `.env` automaticamente (via `dotenv/config` explícito no
`next.config.mjs`, ou o próprio comportamento do Prisma CLI), mas o runtime do `@prisma/client`
sozinho, instanciado direto de dentro de um processo Vitest, não carrega `.env` nenhum. O
workspace `packages/queue` já tinha resolvido exatamente esse problema para `REDIS_URL` desde o
Sprint 4 (`tests/setup.ts` com `dotenv.config({ path: ... })` + `setupFiles` no
`vitest.config.ts`) — apliquei o MESMO padrão, sem inventar um novo, em:

- `packages/database/tests/setup.ts` + `vitest.config.ts`
- `packages/research-engine/tests/setup.ts` + `vitest.config.ts`
- `apps/web/tests/setup.ts` + `vitest.config.ts`

E adicionei `dotenv` como devDependency nos 3 `package.json` (já era dependência transitiva via
`packages/queue`, mas cada workspace deve declarar o que usa diretamente).

**Nenhum valor hardcoded, nenhuma credencial de produção, nenhum secret commitado** — os testes
continuam lendo o mesmo `.env` da raiz que já existia.

### Testes flaky — investigação e correções

| Teste                                                                                                                        | Diagnóstico real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Correção                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discovery.integration.test.ts` (achado NOVO, só visível após corrigir DATABASE_URL)                                         | `afterAll` limpa centenas/milhares de `Project` reais criados pela primeira execução contra `api.llama.fi` (rodando agora: 8301 protocolos escaneados, 679 elegíveis, 678 criados) — o `hookTimeout` padrão do Vitest (10s) é insuficiente para esse volume de `deleteMany` sequenciais. Não é bug de lógica: o código de cleanup está correto, só é lento em escala real.                                                                                                                                                               | `hookTimeout: 60_000` / `testTimeout: 60_000` em `packages/research-engine/vitest.config.ts`.                                                                                                                                                                                                                                                                                                                                                                              |
| `kanban-repository.integration.test.ts` (documentado)                                                                        | Causa raiz confirmada por leitura do código: `DEFAULT_BOARD_NAME` (`kanban-repository.ts:37`) é um board singleton real ("board único do MVP", decisão documentada no schema), usado por ~10 funções exportadas sem parametrização de board. Quando o Vitest roda arquivos de teste em paralelo (padrão), dois arquivos que tocam Kanban disputam a MESMA linha de coluna com WIP Limit=1 real. Não é race condition no código de produção — o lock `FOR UPDATE` em `pullCard` está correto (o teste "pullCard concorrente" prova isso). | `fileParallelism: false` em `packages/research-engine/vitest.config.ts` — serializa os arquivos de teste deste workspace. Isolar por board exigiria parametrizar ~10 funções de produção do `kanban-repository.ts` — mudança de arquitetura fora do escopo de uma correção de flakiness.                                                                                                                                                                                   |
| `funding-and-capital.integration.test.ts` (documentado no CLAUDE.md/STATUS_PROJETO.md como bug de ordem de FK no `afterAll`) | **Não reproduzido.** Lendo o código atual (`tests/funding-and-capital.integration.test.ts:108-138`), a ordem de cleanup já está correta: `fundingRoundInvestor` → `fundingRound` → `token`/`project` (por projeto) → `researchRun` → `sector` → `investor` (global, com `.catch(() => {})` best-effort). Rodei a suíte isolada 3x e dentro do `npm test` completo 1x — os 5 testes e o cleanup passaram limpos em todas. Não foi possível confirmar a causa original do bug histórico; ver seção "Limitações".                           | Nenhuma mudança de código necessária — apenas revalidado e documentado (CLAUDE.md/STATUS_PROJETO.md atualizados para refletir isso, com aviso para reinvestigar se reaparecer).                                                                                                                                                                                                                                                                                            |
| `selection.integration.test.ts` (achado NOVO, quebrou ao rodar a suíte completa pela primeira vez)                           | Teste de idempotência comparava `researchRunSelection.count({ where: { researchRunId } })` entre duas chamadas de `selectTopProjects(runId, 5000)` — mas `buildCandidatePool()` varre a tabela `projects` INTEIRA sem filtro (comentário no topo do próprio arquivo já alertava para esse risco), e com `topN=5000` a seleção captura efetivamente TODA a tabela. Observado na prática: 657 → 681 linhas entre as duas chamadas, porque outro arquivo do mesmo run (`discovery.integration.test.ts`) altera o total global de projetos.  | Reescrevi a asserção (`tests/selection.integration.test.ts`) para verificar idempotência real — ausência de linha duplicada por `projectId` e estabilidade da linha do PRÓPRIO projeto seedado pelo teste — em vez de contagem global bruta. Não é enfraquecimento do teste: a versão nova detecta duplicação de verdade (o que "idempotente" realmente significa) e é imune a ruído de outros arquivos, consistente com o princípio já declarado no cabeçalho do arquivo. |

Nenhum teste foi removido, ignorado (`.skip`) ou convertido de integração para unitário.

---

## 3. Market Data

- **Fonte**: CoinGecko real (já integrada desde o Sprint 11, reaproveitado o mesmo `http-client.ts`/allowlist anti-SSRF/retry).
- **Endpoint**: `GET /coins/{id}/market_chart?vs_currency=usd&days=365` (confirmado no código, `packages/defi-data/src/coingecko-client.ts:getCoinMarketChart`) — endpoint público (sem key) ou pro (com key configurada em Settings), mesmo mecanismo condicional já usado por `getCoinMarketData`.
- **Estrutura**: model único `MarketDataSnapshot` (não 3 tabelas separadas) — decisão arquitetural documentada inline no `schema.prisma`: os 3 valores (preço/market cap/volume) vêm atomicamente da mesma resposta, no mesmo timestamp, e qualquer consulta futura de "valuation acompanha fundamentos" precisa dos três juntos por data.
- **Campos**: `priceUsd`, `marketCapUsd`, `volumeUsd` (cada um independentemente `Decimal?` — nulo quando a fonte não devolveu aquele array para o dia, nunca `0`), `source` (`COINGECKO`), `sourceTimestamp`, `retrievedAt`, `quality`/`qualityReason` (mesmo padrão `VALID`/`SUSPICIOUS` de TVL/Revenue/Fees).
- **Granularidade**: diária, forçada solicitando sempre `days > 90` (365) — único jeito de garantir granularidade diária automática da CoinGecko sem plano Enterprise pago (que permitiria o parâmetro `interval` explícito). Documentado em `MARKET_DATA_HISTORY_DAYS` (`coingecko-client.ts`).
- **Sem OHLC**: `market_chart` devolve um preço por ponto, não um candle — nenhum campo open/high/low/close foi fabricado a partir dele (documentado em `NormalizedMarketDataPoint`, `packages/defi-data/src/types.ts`).
- **Política histórica**: INSERT-only, nunca `UPDATE`/`DELETE` de um ponto já persistido (testado explicitamente: `market-data-repository.integration.test.ts`, "nunca sobrescreve um ponto já persistido").
- **Idempotência**: dedupe por `(projectId, source, sourceTimestamp)`, mesma constraint única de TVL/Revenue/Fees. Full e Incremental usam a MESMA janela de 365 dias (decisão deliberada de simplicidade, documentada em código) — refazer a mesma janela nunca duplica (idempotência garante isso), só custa mais chamadas de API do que um `since` real economizaria; dado o volume do Top 10 por Research Run, aceitável (ver seção "Limitações").
- **FDV histórico**: continua indisponível — a CoinGecko não expõe isso no endpoint gratuito de série histórica, só no snapshot atual (`Token.fdvUsd`, Sprint 11). Documentado explicitamente no schema, não estimado com fórmula alguma.

---

## 4. Banco

### Migrations aplicadas (2 novas, nesta ordem, confirmadas com `npx prisma migrate deploy`)

1. `20260918203300_sprint12_snapshot_source_coingecko_enum` — `ALTER TYPE "SnapshotSource" ADD VALUE 'COINGECKO'`.

   **Drift pré-existente corrigido de passagem**: o enum `SnapshotSource` já tinha `COINGECKO` no `schema.prisma` desde o Sprint 3 (comentário: "o enum já evita strings soltas quando um segundo provider aparecer"), mas nenhuma migration anterior de fato adicionou esse valor no Postgres real — só `DEFILLAMA` existia no banco (confirmado lendo `packages/database/prisma/migrations/20260915164259_add_snapshots_and_project_chains/migration.sql:2`: `CREATE TYPE "SnapshotSource" AS ENUM ('DEFILLAMA')`). Isso nunca quebrou nada porque nenhum código chegou a persistir `source: COINGECKO` até este sprint. Descoberto ao tentar aplicar a migration original (erro Postgres `55P04: unsafe use of new value`), corrigido separando em duas migrations (Postgres exige que um valor de enum novo seja commitado antes de ser usado — não pode estar na mesma transação).

2. `20260918203311_sprint12_market_data_snapshot` — `CREATE TABLE market_data_snapshots` (colunas, índices, unique constraint, FK).

### Índices

- `@@index([projectId, sourceTimestamp])` — mesma consulta de série temporal por projeto usada por TVL/Revenue/Fees.
- `@@unique([projectId, source, sourceTimestamp])` — dedupe/idempotência.

Nenhum índice extra especulativo foi criado.

### Validação

```
npx prisma validate --schema packages/database/prisma/schema.prisma
→ The schema at packages\database\prisma\schema.prisma is valid 🚀

npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
→ 14 migrations found in prisma/migrations
→ Applying migration `20260918203300_sprint12_snapshot_source_coingecko_enum`
→ Applying migration `20260918203311_sprint12_market_data_snapshot`
→ All migrations have been successfully applied.

npx prisma generate (via npm run prisma:generate)
→ ✔ Generated Prisma Client (v5.22.0)
```

(A primeira tentativa de `prisma generate` falhou com `EPERM` — gotcha Windows já documentado no
CLAUDE.md, processo `node.exe` órfão segurando o binário; resolvido encerrando os 4 processos
órfãos com autorização explícita do usuário antes de prosseguir.)

---

## 5. Pipeline

```
Research Run
    ↓
Discovery / Selection (inalterados)
    ↓
runPipelineForProject (pipeline.ts)
    ↓
    ├── TVL/Fees/Revenue/Funding (DefiLlama, inalterado)
    ├── FDV/supplies (CoinGecko, Sprint 11, inalterado)
    └── Market Data (Sprint 12, NOVO) ── collectMarketDataForProject
                                              ↓
                                    getCoinMarketChart (CoinGecko)
                                              ↓
                                    normalizeCoinGeckoMarketChart (adapter)
                                              ↓
                                    validateMarketDataPoint (validator)
                                              ↓
                                    persistMarketDataSeries → MarketDataSnapshot
```

Inserido em `pipeline.ts` logo após o bloco de enriquecimento de FDV (mesmo gate condicional:
`if (project.coinGeckoId)` — na prática dentro de `collectMarketDataForProject`, que já trata
`coinGeckoId: null` como skip explícito, não como erro). Mesma garantia de isolamento do resto do
pipeline: `collectMarketDataForProject` nunca lança — testado explicitamente com erro HTTP 500 e
com exceção de rede (`market-data-repository.integration.test.ts`), retornando sempre um
`MarketDataCollectionOutcome` tipado (`SKIPPED_NO_COINGECKO_ID` | `FAILED` | `COLLECTED`).

---

## 6. Testes

### Resultado real (comandos executados neste ambiente, não estimado)

```
npm test (raiz, workspaces completos, DATABASE_URL NÃO exportada manualmente)
→ research-engine:   11 arquivos / 85 testes — todos passando
→ scoring-engine:     7 arquivos / 47 testes — todos passando
→ shared:             1 arquivo  / 10 testes — todos passando
→ (database/defi-data/queue/apps-web também rodaram como parte do mesmo comando composto,
   exit code final do `npm test` = 0 → todos os workspaces passaram)

npm run typecheck (raiz)
→ web, database, defi-data, queue, research-engine, scoring-engine, shared: todos limpos
→ tsc --noEmit -p infrastructure/workers/tsconfig.json: limpo
→ exit code 0

npm run lint (raiz)
→ eslint . — sem erros, sem warnings
→ exit code 0

npm run build (raiz)
→ next build: "✓ Compiled successfully", 19/19 páginas estáticas geradas
→ 1 warning pré-existente (módulo opcional @valkey/valkey-glide do bullmq, não relacionado
  a nenhuma mudança deste sprint — bullmq tenta importar um client Valkey opcional que não
  está instalado; não afeta build nem runtime, o client Redis padrão é usado)
→ exit code 0
```

### Testes novos criados (Parte B)

- `packages/defi-data/tests/adapter.test.ts` — 5 novos casos para `normalizeCoinGeckoMarketChart` (merge por dia/não por posição, payload vazio/nulo/malformado, tuplas malformadas ignoradas, ordenação).
- `packages/defi-data/tests/coingecko-client.test.ts` (novo arquivo) — 5 casos: URL/params (endpoint público vs pro + header nunca logado), resposta válida, resposta vazia, erro HTTP.
- `packages/research-engine/tests/validator.test.ts` — 12 novos casos para `validateMarketDataPoint` (válido, campos independentes, MISSING com os 3 null, negativos individuais, timestamp inválido/futuro, salto suspeito, NaN).
- `packages/research-engine/tests/market-data-repository.integration.test.ts` (novo arquivo, Prisma real) — 10 casos: insert + idempotência, imutabilidade (nunca sobrescreve), rejeição de inválido sem derrubar os demais, null nunca vira 0, skip sem coinGeckoId (zero chamada de rede), sucesso completo, isolamento de falha HTTP, isolamento de exceção de rede, freshness (`getLastMarketDataAt`).

Todos os 4 arquivos rodados isolados e dentro da suíte completa — resultado incluído nos números acima.

---

## 7. Limitações

- **Ausência de dados**: coleta só ocorre para projetos com `coinGeckoId` conhecido (mesmo gate do Sprint 11) — projetos sem esse vínculo continuam sem nenhum dado de mercado, sem estimativa alguma.
- **FDV histórico**: indisponível na fonte gratuita atual; só o snapshot atual (`Token.fdvUsd`) existe.
- **Full vs Incremental usam a mesma janela (365 dias)**: decisão deliberada de simplicidade (ver seção 3) — funciona corretamente (idempotência garante nenhuma duplicação/reescrita), mas é mais caro em chamadas de API do que um `since` real seria. Se o volume de projetos no Top 10 crescer muito, vale revisitar.
- **Sem granularidade sub-diária**: por design (seção 11 do prompt do sprint — "não é uma exchange").
- **`funding-and-capital.integration.test.ts`**: o bug histórico de ordem de FK não foi reproduzido; não foi possível confirmar a causa raiz original porque o código atual já está correto. Se reaparecer, precisa de nova investigação — não assumir que está "definitivamente resolvido" só por não ter sido observado nesta rodada.
- **Sem consumidor de Market Data ainda**: só coleta/persiste — nenhum momentum, divergência ou indicador foi calculado (fora de escopo deste sprint, por instrução explícita).

---

## 8. Dívidas mantidas (nada disso foi tocado)

`TokenUnlock` (schema-only, sem write path real) · Catalysts · Risks · Value Capture · `Project.narrativeId`/Narrative · Emerging/Established · Global Score (cálculo agregado) · Second Brain · Trading Intelligence · Backtesting · Opportunity Engine · multi-tenant/RBAC · Improvement Proposals automáticos.

---

## 9. Próximo Sprint recomendado

**Consumir o Market Data recém-coletado para responder as perguntas de History que hoje retornam
"NÃO" no Gap Analysis**: "revenue acompanha crescimento?", "valuation acompanha fundamentos?",
"token captura valor?" (parcialmente). Concretamente: adicionar ao `history.ts`/`report.ts` uma
correlação simples entre a série de `MarketDataSnapshot.marketCapUsd` e a série de TVL/Revenue já
existente, exposta como mais uma seção do Project Report — sem exigir Trading Intelligence/
indicadores técnicos completos, só cruzar dados que agora já existem no banco.

Alternativa igualmente válida, se a prioridade de produto for outra: **Tokenomics Score completo**
(seção "Dívidas mantidas" acima) — mas essa depende de uma decisão de fonte externa nova
(Tokenomist.ai ou equivalente) que não estava no controle deste sprint, enquanto consumir o Market
Data já coletado não tem nenhuma dependência externa pendente.
