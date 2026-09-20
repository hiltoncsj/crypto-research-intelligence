# AUDIT AND REPAIR REPORT

Auditoria técnica pós-Sprint 23. Legenda de status: **PASS**, **PASS WITH LIMITATION**, **FAIL**,
**NOT VERIFIED**, **NOT IMPLEMENTED**. "Verified" = executado/observado; "Assumed" = inferido só
por leitura de código.

## 1. Executive Summary

Auditoria **parcial**: as áreas de maior risco foram cobertas (segurança de API, SSRF, look-ahead,
idempotência, isolamento de falha, paginação), mas várias seções da checklist original **não foram
auditadas** (ver seção 19). Foram encontrados 17 problemas: 2 P1 (ambos corrigidos), 10 P2 (5 corrigidos, 5 abertos) e 5 P3
(todos abertos). A correção A-04 (CI) ainda não foi confirmada por uma execução do CI.
Nenhuma feature nova foi implementada.

| Severidade | Encontrados | Corrigidos |
| ---------- | ----------- | ---------- |
| P0         | 0           | —          |
| P1         | 2           | 2          |
| P2         | 10          | 5          |
| P3         | 5           | 0          |

## 2. Audit Scope

Cobertas: autenticação/autorização das rotas (teste real), secrets versionados, criptografia
(parcial), SSRF/allowlist/redirects, Prisma (validate/migrate), idempotência de eventos e
snapshots, isolamento de falha por fonte, paginação GitHub/Snapshot, matemática de
`fundamental-intelligence.ts`, look-ahead e performance do Event Impact, `getEventIntelligenceOverview`, Score Engine
(pesos, percentil, confidence, agregação), rankings, criptografia (`decrypt`), workers/BullMQ,
Fundamental Context, Research Trace, CI.

**Não cobertas** (NOT VERIFIED): workers/BullMQ (só leitura de configuração), renderização do
dashboard, Research Trace, Fundamental Context, reprodutibilidade de scores, Classification
Engine (regressão Stargate reauditada só via Sprint 22), índices e demais N+1 fora do Event Impact,
rate limits, validação de input em rotas autenticadas, criptografia (`decrypt`), datas/timezone
além de `alignDailySeries`, consistência entre camadas.

## 3. Environment

Windows 10, Node local, Postgres 16 e Redis 7 em Docker (healthy), Next.js dev server para o teste
de rotas, dados reais (7 projetos; DefiLlama/CoinGecko/GitHub/Snapshot/Discourse reais).
CI: GitHub Actions.

## 4. Findings

| ID   | Sev | Área                    | Problema                                                                                                                                                                                                          | Causa raiz                                                                                                             | Correção                                                                                                                    | Teste                                                                                                                                  |
| ---- | --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | P1  | Event Impact / métricas | Look-ahead bias: momentum e regime "antes/depois" do evento usavam o valor **mais recente da série inteira** como "atual"                                                                                         | `calculateGrowthForWindow`/`calculateGrowthWindowPair` ignoravam `asOf` para o valor atual                             | Valor atual = último ponto ≤ `asOf` (`metrics.ts`, commit `d11cbb0`)                                                        | `metrics.test.ts` (4 novos; **falham sem a correção**, verificado)                                                                     |
| A-02 | P2  | Segurança / SSRF        | `fetch` seguia redirects; allowlist só valia para a URL inicial                                                                                                                                                   | `redirect` padrão do `fetch`                                                                                           | Redirects manuais (máx. 3), cada salto revalidado (`http-client.ts`, `02edaa0`)                                             | `http-client.redirect.test.ts` (4, servidor HTTP real)                                                                                 |
| A-03 | P2  | Observabilidade         | Falha de fonte (GitHub/Snapshot/Discourse) virava `events.*_collected, created: 0`; erro real nunca logado                                                                                                        | Pipeline chamava `collect*` com `normalized === null`                                                                  | Loga `events.*_failed` com `httpStatus`/`error` e não chama a persistência (`pipeline.ts`, `6422415`)                       | **Sem teste automatizado** — validado manualmente contra falha real (GitHub HTTP 404)                                                  |
| A-04 | P2  | CI                      | CI nunca rodou em push (`main` inexistente) e falhava: faltava `prisma generate` e serviço Redis                                                                                                                  | Workflow incompleto                                                                                                    | `branches: [master]`, passo `prisma:generate`, serviço `redis:7-alpine` + `REDIS_URL`                                       | Execução do CI (Redis: ver seção 17)                                                                                                   |
| A-05 | P2  | Dados / paginação       | Snapshot de `aave-v3` e `balancer-v2` com **exatamente 500** propostas = teto de paginação; histórico truncado sem indicador                                                                                      | `MAX_PAGES=5 × 100` sem sinalização de truncamento                                                                     | **Aberto**                                                                                                                  | —                                                                                                                                      |
| A-06 | P2  | Métricas                | Série parada há 100 dias devolve crescimento **0**, não `N/A` (confirmado empiricamente)                                                                                                                          | Sem checagem de defasagem do último ponto                                                                              | **Aberto** (exige decidir limite de staleness)                                                                              | —                                                                                                                                      |
| A-07 | P2  | Métricas                | Correlação/Lead-Lag usam **níveis** (preço, TVL, market cap), não retornos: correlação espúria em séries com tendência                                                                                            | Decisão de modelo v1                                                                                                   | **Aberto** (mudar = novo `modelVersion`)                                                                                    | —                                                                                                                                      |
| A-08 | P3  | Métricas                | `computeCorrelation` com `NaN`/`Infinity` cairia em `STRONG_POSITIVE`                                                                                                                                             | Sem guarda de finitude                                                                                                 | **Aberto**                                                                                                                  | —                                                                                                                                      |
| A-09 | P3  | Métricas                | MC/Revenue e FDV/Revenue usam receita **diária** do último ponto (DefiLlama `dailyRevenue`), não anualizada                                                                                                       | Definição do ratio                                                                                                     | **Aberto** (documentar/rotular)                                                                                             | —                                                                                                                                      |
| A-10 | P3  | Fonte                   | `snapshotSpace` inexistente devolve HTTP 200 com lista vazia: mapping inválido indistinguível de "sem propostas"                                                                                                  | Comportamento da API Snapshot                                                                                          | **Aberto** (limitação da fonte)                                                                                             | —                                                                                                                                      |
| A-11 | P3  | Cripto                  | `Buffer.from(raw, "hex")` não lança em hex inválido; o `catch` é código morto (o check de tamanho ainda protege)                                                                                                  | Semântica do Node                                                                                                      | **Aberto**                                                                                                                  | —                                                                                                                                      |
| A-12 | P1  | Performance / dashboard | `getEventIntelligenceOverview` (Home) levaria ~34 min com os dados reais: medido 784 ms/evento × 2.583 eventos; a medição de 280 s não terminou                                                                   | N+1: `computeEventImpact` recarregava 5 séries (~2.000 linhas cada) + todos os eventos do projeto **para cada evento** | Contexto do projeto carregado uma vez e reutilizado (`event-impact-engine.ts`, `571867e`); Lido 511 eventos: ~400 s → 8,9 s | Equivalência: **75/75 eventos reais idênticos** ao código anterior; suíte do research-engine 177/177. Sem teste automatizado de tempo  |
| A-13 | P2  | Score / rankings        | Rankings ordenam por `totalScore` e um score **parcial** (grupo ausente conta 0) compete direto com um completo; a página de ranking mostra a badge de confidence mas não "parcial"                               | Decisão v1: grupo `null` contribui 0 ao total                                                                          | **Aberto** (decisão de produto: normalizar pelo máximo disponível, excluir parciais ou marcar)                              | —                                                                                                                                      |
| A-14 | P2  | Segurança / cripto      | `decrypt` aceitava `authTag` AES-GCM **truncada** (4/8/12/15 bytes confirmados no Node 22), enfraquecendo a autenticação                                                                                          | Só se rejeitava tag vazia; sem `authTagLength`                                                                         | Tag de exatamente 16 bytes + `authTagLength: 16` (`crypto.ts`, `53380f4`)                                                   | `crypto.test.ts` (+6; 4 falham sem a correção). Compatibilidade com segredos reais: **NOT VERIFIED** (não há conexões salvas no banco) |
| A-15 | P2  | Fundamental Context     | Catalysts com status `UNKNOWN` (todos os 240 tópicos Discourse) ou `CANCELLED` não caíam em nenhum grupo e **sumiam** do contexto                                                                                 | Só existiam os grupos active/upcoming/completed                                                                        | Novo grupo aditivo `other` (`fundamental-context.ts`, `78a7656`)                                                            | `fundamental-context.integration.test.ts` (+1, falha sem a correção)                                                                   |
| A-16 | P2  | Workers / scheduler     | 6 runs presas em `QUEUED` no banco; o scheduler **nunca cria run nova** se existir `QUEUED`/`RUNNING`, e não há expiração nem recuperação de runs órfãs (worker morto no meio deixa `RUNNING` para sempre)        | Sem reconciliação na inicialização; testes interrompidos pulam o `afterAll` e deixam runs no banco de dev              | **Aberto.** Impacto hoje só latente: `agent_settings` está vazio, então o agendador está inativo                            | —                                                                                                                                      |
| A-17 | P3  | Research Trace          | `pointsAwarded` é calculado **antes** da renormalização; com janela ausente, o Trace mostra menos pontos que a contribuição real do grupo (ex.: grupo de 10, só 7d com percentil 80: Trace 1,6 vs contribuição 8) | `computeTraceEntryPoints` documentado como "só para exibição"                                                          | **Aberto** (verificado por leitura do código, não executado)                                                                | —                                                                                                                                      |

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
  authTag e payload versionado; `decrypt` valida versão, algoritmo, tamanhos e autenticação. Achado
  A-14 (tag truncada aceita) corrigido. Sem versionamento de chave: rotação da
  `MASTER_ENCRYPTION_KEY` exigiria recriptografar tudo (não suportado). Compatibilidade com
  segredos reais já gravados: NOT VERIFIED (não há conexões no banco).
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
- **Score Engine (Verified por leitura + medição):**
  - Pesos somam corretamente: global 100 (30/20/15/15/10/10); Fundamental 10+10+5+5=30; janelas
    0,2+0,5+0,3=1; Tokenomics 5+5+4+6=20; Capital 5+4+3+3=15. PASS.
  - `percentileRank` é determinístico, ignora não-finitos e devolve `null` com menos de 3 pares. PASS.
  - Dentro de um grupo, janela ausente é excluída e os pesos são renormalizados (não penaliza
    dado faltante). PASS.
  - **Ressalva (A-13):** entre grupos, o ausente conta 0 no total, então `totalScore` de um
    projeto sem, por exemplo, Revenue fica limitado a 20/30. É sinalizado (`partial`,
    `missingGroups`, tela do projeto), mas o ranking não o distingue.
  - Tokenomics: Unlock Pressure, Distribution e Value Capture não têm fonte, então o máximo
    alcançável hoje é 5/20 e todo Tokenomics Score é `partial` (limitação conhecida e
    documentada, honesta: `N/A`, não dado sintético).
  - Confidence usa recência (3 dias = 1,0, 30 dias = 0), o que mitiga em parte A-06 no score, mas
    não no crescimento exibido.
  - Determinismo/`scoreModelVersion`: versão presente nos pesos (`fundamental-v1` etc.); não
    reexecutei um score para comparar reprodutibilidade (NOT VERIFIED).

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

Medido com dados reais (7 projetos, 2.583 eventos): ver A-12.

- **Antes:** ~784 ms por evento; o overview completo não terminou em 280 s (estimativa ~34 min).
- **Depois:** séries e eventos carregados uma vez por projeto; Lido (511 eventos) em 8,9 s, GMX
  (118) em 1,9 s, Compound (88) em 1,0 s.
- `EVENT_IMPACT_BATCH_SIZE` foi **removido** (não era um número a "otimizar": deixou de ter função,
  porque o cálculo por evento não faz mais queries). A proteção contra exaustão do pool passa a ser
  estrutural. O teste de regressão da Sprint 21 (projeto com muitos eventos) continua passando.
- Pico de memória (RSS) e tamanho da resposta do overview **não foram medidos** (a primeira
  medição foi interrompida por timeout). Tempo total do overview após a correção: NOT VERIFIED
  end-to-end (estimativa ~45 s pelos números por projeto).
- Ainda existe `Promise.all` entre projetos em `getEventIntelligenceOverview`; com uma query
  por projeto (não por evento) isso não esgota o pool, mas não foi medido sob carga.

## 12. Event Classification Validation

Não reexecutei a regressão Stargate nesta auditoria (NOT VERIFIED nesta rodada); os casos
existem em `packages/scoring-engine/tests` desde o Sprint 22. A auditoria sobre Discourse (Sprint 23) mostrou que as regras não generalizam para texto de fórum.

## 13. Event Impact Validation

Look-ahead corrigido (A-01) com regressão. Eventos sobrepostos, evento no início/fim da série,
evento futuro e duplicado: NOT VERIFIED nesta rodada (há testes de integração pré-existentes que
passam, mas não os li um a um).

## 14. Dashboard Validation

Parcial. Verificado: `getEventIntelligenceOverview` (backend da Home) — causa do problema
histórico de memória/lentidão identificada e corrigida (A-12). Verificado por leitura: telas do
projeto sinalizam score parcial e categorias sem dado; a página de rankings não (A-13).
NOT VERIFIED: renderização, estados de loading/erro/vazio, hidratação, polling, paginação de
listas grandes, gráficos.

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
| `npm test`                                   | PASS — 455 testes, 0 falhando (web 20, database 10, defi-data 81, queue 8, research-engine 178, scoring-engine 142, shared 16) |
| `npm run build`                              | PASS (20 páginas estáticas). Aviso não bloqueante: `@valkey/valkey-glide` não resolvido dentro do `bullmq` (módulo opcional)   |
| `npx prisma validate`                        | PASS                                                                                                                           |
| `npx prisma migrate status`                  | PASS (20 migrations, banco atualizado)                                                                                         |

Regressões adicionadas (15): 4 look-ahead (`metrics.test.ts`), 4 redirects (`http-client.redirect.test.ts`),
6 authTag (`crypto.test.ts`), 1 status de catalyst (`fundamental-context.integration.test.ts`).
A-03 e A-12 não têm teste automatizado (A-12 foi validada por equivalência 75/75 contra o código anterior).

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
