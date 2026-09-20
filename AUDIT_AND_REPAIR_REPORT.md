# AUDIT AND REPAIR REPORT

Auditoria técnica pós-Sprint 23. Legenda de status: **PASS**, **PASS WITH LIMITATION**, **FAIL**,
**NOT VERIFIED**, **NOT IMPLEMENTED**. "Verified" = executado/observado; "Assumed" = inferido só
por leitura de código.

## 1. Executive Summary

Auditoria **parcial**: as áreas de maior risco foram cobertas (segurança de API, SSRF, look-ahead,
idempotência, isolamento de falha, paginação), mas várias seções da checklist original **não foram
auditadas** (ver seção 19). Foram encontrados 11 problemas: 1 P1 (corrigido), 6 P2 (3 corrigidos, 3 abertos) e 4 P3 (todos
abertos). A correção A-04 (CI) ainda não foi confirmada por uma execução do CI.
Nenhuma feature nova foi implementada.

| Severidade | Encontrados | Corrigidos |
| ---------- | ----------- | ---------- |
| P0         | 0           | —          |
| P1         | 1           | 1          |
| P2         | 6           | 3          |
| P3         | 4           | 0          |

## 2. Audit Scope

Cobertas: autenticação/autorização das rotas (teste real), secrets versionados, criptografia
(parcial), SSRF/allowlist/redirects, Prisma (validate/migrate), idempotência de eventos e
snapshots, isolamento de falha por fonte, paginação GitHub/Snapshot, matemática de
`fundamental-intelligence.ts`, look-ahead no Event Impact, CI.

**Não cobertas** (NOT VERIFIED): workers/BullMQ (só leitura de configuração), dashboard e
`getEventIntelligenceOverview`, Research Trace, Fundamental Context, Score Engine (pesos,
normalização), Classification Engine (regressão Stargate reauditada só via Sprint 22), N+1 e
índices, rate limits, validação de input em rotas autenticadas, criptografia (`decrypt`), datas/
timezone além de `alignDailySeries`, consistência entre camadas.

## 3. Environment

Windows 10, Node local, Postgres 16 e Redis 7 em Docker (healthy), Next.js dev server para o teste
de rotas, dados reais (7 projetos; DefiLlama/CoinGecko/GitHub/Snapshot/Discourse reais).
CI: GitHub Actions.

## 4. Findings

| ID   | Sev | Área                    | Problema                                                                                                                     | Causa raiz                                                                                 | Correção                                                                                              | Teste                                                                                 |
| ---- | --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A-01 | P1  | Event Impact / métricas | Look-ahead bias: momentum e regime "antes/depois" do evento usavam o valor **mais recente da série inteira** como "atual"    | `calculateGrowthForWindow`/`calculateGrowthWindowPair` ignoravam `asOf` para o valor atual | Valor atual = último ponto ≤ `asOf` (`metrics.ts`, commit `d11cbb0`)                                  | `metrics.test.ts` (4 novos; **falham sem a correção**, verificado)                    |
| A-02 | P2  | Segurança / SSRF        | `fetch` seguia redirects; allowlist só valia para a URL inicial                                                              | `redirect` padrão do `fetch`                                                               | Redirects manuais (máx. 3), cada salto revalidado (`http-client.ts`, `02edaa0`)                       | `http-client.redirect.test.ts` (4, servidor HTTP real)                                |
| A-03 | P2  | Observabilidade         | Falha de fonte (GitHub/Snapshot/Discourse) virava `events.*_collected, created: 0`; erro real nunca logado                   | Pipeline chamava `collect*` com `normalized === null`                                      | Loga `events.*_failed` com `httpStatus`/`error` e não chama a persistência (`pipeline.ts`, `6422415`) | **Sem teste automatizado** — validado manualmente contra falha real (GitHub HTTP 404) |
| A-04 | P2  | CI                      | CI nunca rodou em push (`main` inexistente) e falhava: faltava `prisma generate` e serviço Redis                             | Workflow incompleto                                                                        | `branches: [master]`, passo `prisma:generate`, serviço `redis:7-alpine` + `REDIS_URL`                 | Execução do CI (Redis: ver seção 17)                                                  |
| A-05 | P2  | Dados / paginação       | Snapshot de `aave-v3` e `balancer-v2` com **exatamente 500** propostas = teto de paginação; histórico truncado sem indicador | `MAX_PAGES=5 × 100` sem sinalização de truncamento                                         | **Aberto**                                                                                            | —                                                                                     |
| A-06 | P2  | Métricas                | Série parada há 100 dias devolve crescimento **0**, não `N/A` (confirmado empiricamente)                                     | Sem checagem de defasagem do último ponto                                                  | **Aberto** (exige decidir limite de staleness)                                                        | —                                                                                     |
| A-07 | P2  | Métricas                | Correlação/Lead-Lag usam **níveis** (preço, TVL, market cap), não retornos: correlação espúria em séries com tendência       | Decisão de modelo v1                                                                       | **Aberto** (mudar = novo `modelVersion`)                                                              | —                                                                                     |
| A-08 | P3  | Métricas                | `computeCorrelation` com `NaN`/`Infinity` cairia em `STRONG_POSITIVE`                                                        | Sem guarda de finitude                                                                     | **Aberto**                                                                                            | —                                                                                     |
| A-09 | P3  | Métricas                | MC/Revenue e FDV/Revenue usam receita **diária** do último ponto (DefiLlama `dailyRevenue`), não anualizada                  | Definição do ratio                                                                         | **Aberto** (documentar/rotular)                                                                       | —                                                                                     |
| A-10 | P3  | Fonte                   | `snapshotSpace` inexistente devolve HTTP 200 com lista vazia: mapping inválido indistinguível de "sem propostas"             | Comportamento da API Snapshot                                                              | **Aberto** (limitação da fonte)                                                                       | —                                                                                     |
| A-11 | P3  | Cripto                  | `Buffer.from(raw, "hex")` não lança em hex inválido; o `catch` é código morto (o check de tamanho ainda protege)             | Semântica do Node                                                                          | **Aberto**                                                                                            | —                                                                                     |

Erro de processo desta auditoria: um commit intermediário (`6597421`) foi criado com o índice
quase vazio e apagava 258 arquivos da árvore. Foi detectado **antes de qualquer push**, desfeito
localmente com `git reset --mixed` e refeito (`d11cbb0`); a árvore do HEAD foi conferida
(260 arquivos). Nada chegou ao `origin`.

## 5. Security Findings

- **Autenticação — PASS (Verified):** 31 rotas testadas contra o servidor real **sem sessão**:
  todas 401 (GET e escritas, incluindo `DELETE /api/connections/[id]`); `/dashboard` redireciona
  para `/login` (307); cookie de sessão forjado → 401; slug com path traversal → 401.
  `/api/health` é público por desenho e expõe só app/db/redis.
- **Middleware:** cobre só `/dashboard/*`; a proteção das APIs depende de cada rota checar a
  sessão (verificado pelo teste acima, mas é um ponto de falha se uma rota nova esquecer).
- **Secrets — PASS (Verified):** só `.env.example` rastreado; nenhum padrão de key no código.
- **Criptografia — PASS WITH LIMITATION:** AES-256-GCM, IV de 12 bytes aleatório por chamada,
  authTag, payload versionado (lido). `decrypt` completo e rotação de chave: NOT VERIFIED.
- **SSRF — PASS WITH LIMITATION:** todos os clientes de servidor usam allowlist; redirects agora
  revalidados (A-02). Para o Discourse (host dinâmico) a validação de URL rejeita IP literal/
  localhost/userinfo, mas **não resolve DNS**: um domínio que resolva para IP interno passaria
  (mitigado por a curadoria ser manual e autenticada). NOT VERIFIED: DNS rebinding.
- **Autorização/validação de input em rotas autenticadas:** NOT VERIFIED (sem credencial de
  sessão para teste).

## 6. Data Integrity Findings

- **Idempotência — PASS WITH LIMITATION (Verified):** após reexecutar o `balancer-v2`, contagens
  de eventos idênticas; 0 duplicados de `(projectId, source, sourceId)`; 0 snapshots TVL
  duplicados; existe unique constraint `research_event_dedupe`. Limitação: só um projeto foi
  reexecutado, não uma Research Run completa.
- **Truncamento (A-05):** aave-v3 e balancer-v2 em exatamente 500 propostas Snapshot.
- **Stale = 0% (A-06).**
- Eventos Discourse (240) classificados como `GOVERNANCE`/`STRUCTURED_SOURCE`; a Classification
  Engine foi retirada desse caminho no Sprint 23 por ~50% de falsos positivos.

## 7. Mathematical Validation

Revisadas `classifyAcceleration`, `computeFundamentalMomentum`, `compareGrowth`,
`classifyFundamentalPriceDivergence`, `computeValuationRatio`, `computeCorrelation`,
`detectLeadLag`, `classifyFundamentalRegime`, `calculateGrowth`.

- Divisão por zero: `calculateGrowth` (previous 0 → N/A) e `computeValuationRatio`
  (denominador ≤ 0 → null): PASS.
- Ausência de dados tratada como `N/A`/`null`, nunca 0 (exceto A-06): PASS WITH LIMITATION.
- Pearson e cross-correlation: implementação correta; ressalvas A-07 e A-08.
- Lead/Lag escolhe o lag por |correlação|, então correlação negativa forte também vira "A liderou
  B": descritivo, sem causalidade explícita no código.
- Fundamental Score, pesos, percentiles e confidence: **NOT VERIFIED**.

## 8. Pipeline Validation

Fluxo `Discovery → coleta → persistência → score` exercitado em execução real com 7 projetos.
Trace completo até Report/Dashboard: NOT VERIFIED. Durante a auditoria uma run manual foi cortada
por timeout, deixando um card preso em Data Collection (WIP 1/1) e um projeto sem score; foi
completada re-rodando o projeto com a mesma `researchRunId` (gotcha registrado em `CLAUDE.md`).

## 9. API Validation

Autenticação: ver seção 5. Input validation, códigos de status com sessão, paginação, rate
limiting: NOT VERIFIED.

## 10. Database Validation

`prisma validate` e `prisma migrate status` (20 migrations, banco atualizado): ver seção 17.
Índices, N+1, cascades, precisão numérica: NOT VERIFIED.

## 11. Performance Validation

Nenhuma medição de performance foi feita. `EVENT_IMPACT_BATCH_SIZE = 1` **não foi alterado**.
`getEventIntelligenceOverview` (histórico de estouro de memória): NOT VERIFIED.

## 12. Event Classification Validation

Não reexecutei a regressão Stargate nesta auditoria (NOT VERIFIED nesta rodada); os casos
existem em `packages/scoring-engine/tests` desde o Sprint 22. A auditoria sobre Discourse (Sprint 23) mostrou que as regras não generalizam para texto de fórum.

## 13. Event Impact Validation

Look-ahead corrigido (A-01) com regressão. Eventos sobrepostos, evento no início/fim da série,
evento futuro e duplicado: NOT VERIFIED nesta rodada (há testes de integração pré-existentes que
passam, mas não os li um a um).

## 14. Dashboard Validation

NOT VERIFIED.

## 15. Idempotency Validation

Ver seção 6.

## 16. Failure Isolation Validation

- **PASS (Verified por código + falha real):** GitHub, Snapshot e Discourse têm `try/catch`
  independente; uma fonte falhando não derruba a run. `curve-dex` já havia falhado isolado (Sprint
  22). Falha real de GitHub (repo inexistente → HTTP 404) devolve `normalized: null` com erro.
- **Corrigido (A-03):** o erro agora é logado.
- **Não testado com fonte real caindo:** CoinGecko, DefiLlama, HTTP 429/500, timeout.

## 17. Regression Tests

Suíte final (comandos executados na raiz após as correções):

| Comando                                      | Resultado                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                               | PASS                                                                                                                           |
| `npm run typecheck` (7 workspaces + workers) | PASS                                                                                                                           |
| `npm test`                                   | PASS — 448 testes, 0 falhando (web 20, database 10, defi-data 81, queue 8, research-engine 177, scoring-engine 142, shared 10) |
| `npm run build`                              | PASS (20 páginas estáticas). Aviso não bloqueante: `@valkey/valkey-glide` não resolvido dentro do `bullmq` (módulo opcional)   |
| `npx prisma validate`                        | PASS                                                                                                                           |
| `npx prisma migrate status`                  | PASS (20 migrations, banco atualizado)                                                                                         |

Regressões adicionadas: 4 (look-ahead, `metrics.test.ts`) + 4 (redirects, `http-client.redirect.test.ts`).
A correção A-03 não tem teste automatizado.

Ocorrência: uma execução intermediária de `npm test` teve 1 falha em
`discovery.integration.test.ts` (timeout de 29 s/75 s). Foi causada por duas execuções da suíte em
paralelo contra o mesmo banco (erro de processo desta auditoria, não bug); o teste passa isolado
(3/3) e a suíte completa, executada sozinha, passa inteira.

**CI (A-04):** o serviço Redis e o `prisma:generate` estão nos commits locais, mas **não foram
publicados** — o resultado do CI após essas correções é NOT VERIFIED.

## 18. Documentation Corrections

Aplicadas antes da auditoria (mesma sessão): `CLAUDE.md` condensado, `STATUS_PROJETO.md`
atualizado até o Sprint 23. **Ainda incorreto (não alterado):** `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`
(diz "Nenhum código foi modificado", "100% na Fase 0"); seções 2.1–2.9 e 3.x do
`STATUS_PROJETO.md` refletem o snapshot de 2026-09-16.

## 19. Remaining Known Limitations

Abertos: A-05, A-06, A-07, A-08, A-09, A-10, A-11. NOT VERIFIED: itens listados na seção 2.

NOT IMPLEMENTED (fora do escopo, sem fonte ou arquitetura): TOKEN_UNLOCK ativo (exige
DefiLlama Pro), Official Blog universal, GitHub Commits/Tags, Trading Intelligence, TradingView,
Pine Script, Backtesting, Opportunity Engine, classificação por LLM.

## 20. Recommended Next Steps

1. Publicar os commits (push) e conferir o CI; corrigir o que aparecer após o Redis.
2. Sinalizar truncamento de paginação (A-05) no cliente e nos logs.
3. Decidir a política de staleness (A-06) e a guarda de `NaN` (A-08).
4. Novo `modelVersion` de Correlation/Lead-Lag sobre retornos (A-07).
5. Auditar as áreas NOT VERIFIED, começando por Score Engine, Research Trace e
   `getEventIntelligenceOverview`.
