# Sprint 16 — Event Impact Analysis + Historical Event Intelligence

## Relatório de implementação

Data: 2026-09-19. Toda evidência abaixo vem de execução real dos comandos nesta sessão.

---

## 1. Resumo executivo

Conectada a camada de eventos reais (Sprint 15: `FUNDING`, `SECURITY_INCIDENT`) às séries
históricas já existentes (Sprint 3: TVL/Revenue/Fees; Sprint 12: Price/Market Cap/Volume),
produzindo uma análise quantitativa de antes/depois por evento — sempre como associação
temporal observada, nunca causalidade afirmada. Nenhuma fonte nova foi adicionada (reutiliza
exatamente as 2 fontes já reais do Sprint 15). Nenhuma tabela nova foi criada — tudo calculado
sob demanda, mesma decisão arquitetural do Sprint 14.

---

## 2. Auditoria inicial

Antes de escrever código, confirmado por leitura direta (não suposição): `historicalIntelligence
.ts` (Sprint 14) já expõe `computeFundamentalHistoricalIntelligence` com growth/acceleration/
momentum/regime, mas sempre relativo a "agora" (`asOf = new Date()`), nunca a uma data de evento
arbitrária — por isso `calculateGrowthForWindow` (já aceita um parâmetro `asOf`) pôde ser
reaproveitado diretamente, mas foi necessária uma nova função de "baseline dentro de uma janela
fixa" (`getLastValueInRange`, `metrics.ts`), já que `findValueAt` (usada por growth) aceita
qualquer ponto até a data alvo, mesmo bem antes dela — incompatível com "não extrapolar de fora
da janela" (seção 14 do Sprint 16). `events-repository.ts` (Sprint 15) tinha `getCatalysts`/
`getRisks` mas nenhuma forma de buscar um evento por id nem todos os eventos de um projeto juntos
— adicionados `getEventById`/`getAllEvents`. `toPriceSeries`/`toMarketCapSeries`/`toVolumeSeries`
existiam em `historical-intelligence.ts` mas eram privadas — exportadas para reaproveito, em vez
de duplicar a conversão de `MarketDataSnapshot` para séries.

---

## 3. Arquitetura utilizada

```
ResearchEvent (Sprint 15, já existe)
        ↓
event-impact-engine.ts (novo) — carrega TVL/Revenue/Fees (snapshot-repository) +
        │                        Price/MarketCap/Volume (market-data-repository) +
        │                        outros eventos do projeto (events-repository)
        ↓
event-impact.ts (novo, scoring-engine) — matemática pura: changePercent, direção,
        │                                 classificação, overlap, agregação
        ↓
Project Report / Dashboard / API / Research Trace
```

Camadas reaproveitadas sem duplicação: `calculateGrowthForWindow`/`calculateGrowthWindowPair`
(metrics.ts, Sprint 9/14), `computeFundamentalMomentum`/`classifyFundamentalRegime`/
`classifyAcceleration` (scoring-engine, Sprint 14 — MESMA versão de modelo, nunca reimplementada).

---

## 4. Event Impact Engine

`packages/research-engine/src/event-impact-engine.ts`: `computeEventImpact(eventId)` (um
evento), `getEventImpactsForProject(projectId)` (todos os eventos de um projeto),
`aggregateEventImpactsByCategory(category, impacts)` (cross-event). Nunca lança — evento
inexistente retorna `null`; evento sem `eventDate` retorna `analysisStatus: "NO_EVENT_DATE"` com
tudo vazio.

---

## 5. Métricas

Por evento, por janela (7/14/30d): TVL, Revenue, Fees, Price, Market Cap, Market Volume —
`before`/`after`/`delta`/`changePercent`. **"Volume" como métrica fundamental separada foi
deliberadamente omitida** (seção 6 do prompt permite "quando houver série compatível") — não
existe uma série de volume on-chain distinta de TVL/Revenue/Fees no sistema; o volume de mercado
(CoinGecko) já cobre isso na seção de métricas de mercado. Criar uma segunda série idêntica seria
redundante/fabricado.

Fundamental Momentum before×after (Sprint 14, mesma fórmula) e Fundamental Regime before×after
(idem) — sempre na janela de 30d (before = momentum/regime calculado com dados até `eventDate`;
after = calculado com dados até `eventDate + 30d`).

---

## 6. Windows

7d, 14d, 30d, antes e depois de `eventDate`, conforme seção 4 do prompt. Limites inclusivos nos
dois extremos (testado: `getLastValueInRange` usa `>=`/`<=`).

---

## 7. Baselines

**Método: último valor dentro da janela** (não média) — decisão documentada explicitamente no
código (`getLastValueInRange`, `metrics.ts`) e no relatório: consistente com o método já usado
por `calculateGrowthForWindow`/`findValueAt` no resto do sistema desde o Sprint 3 (nunca médias
foram usadas para baseline em nenhuma parte já existente do código) — manter o mesmo método evita
introduzir uma segunda metodologia paralela sem necessidade real. Se a série não tiver NENHUM
ponto dentro da janela, o resultado é `null` — testado explicitamente ("janela sem NENHUM ponto
de dado: before/after null, nunca extrapola de fora da janela").

---

## 8. Overlapping Events

`detectOverlap(eventDate, 30, otherEventDates)`: um evento sobrepõe quando cai estritamente
depois de `eventDate` e até `eventDate + 30d`. `OVERLAPPING_EVENTS` tem prioridade máxima na
classificação final — testado explicitamente que vence mesmo com sinais fundamentais/mercado
claros. Eventos concorrentes retornados na resposta (`overlappingEvents`).

---

## 9. Cross-Event Analysis

`aggregateEventImpactsByCategory` — mean/median/min/max sobre a amostra real de eventos com
`analysisStatus: "OK"` de uma categoria. `insufficientSample: true` abaixo de 3 observações —
valores ainda calculados (são reais), só marcados como não confiáveis para conclusão agregada
(nunca omitidos silenciosamente).

---

## 10. Report

Nova seção "## Impacto Histórico de Eventos" em `report.ts`: timeline por evento (tipo, data,
status, confiança, fonte), tabela de métricas antes/depois (30d), Momentum/Regime before→after,
cobertura, eventos sobrepostos (quando existirem), classificação final em negrito. Texto de
abertura explícito: "Associação temporal observada — nunca causalidade."

---

## 11. Dashboard

Nova seção "Event Intelligence" na Home: cards de Events Analyzed/Insufficient Data, tabela de
eventos recentes (30d) com fundamental/market change e classificação, cards de Cross-Event
Aggregation por categoria (mediana + aviso de amostra pequena).

---

## 12. APIs

`GET /api/projects/[slug]/event-impacts` — lista os Event Impacts de todos os eventos do
projeto. Consolidado na resposta de `GET /api/dashboard/fundamental` (campo `eventIntelligence`)
em vez de uma rota `/api/dashboard/event-impacts` separada — mesma decisão de reaproveitamento
dos Sprints 14/15.

---

## 13. Research Trace

Seção "## Sources" do report estendida com uma linha por Event Impact calculado: evento, data,
janelas (7d/14d/30d), método de baseline, fórmula, modelo, resultado da classificação.

---

## 14. Banco de dados

**Nenhuma migration.** Decisão explícita documentada em código (`event-impact-engine.ts`, seção
"DECISÃO ARQUITETURAL"): mesma justificativa do Sprint 14 — volume de eventos pequeno hoje
(2 categorias), cálculo O(n) barato, persistir duplicaria dado já existente sem benefício de
consulta real hoje.

---

## 15. Testes

```
unit tests (packages/scoring-engine/tests/event-impact.test.ts):        38 tests
integration tests (packages/research-engine/tests/event-impact-engine.integration.test.ts): 11 tests
API tests: 0 (ver "Limitações" — sem precedente de teste de rota HTTP individual de projeto,
  mesma decisão já registrada nos relatórios dos Sprints 13/15)
dashboard tests: 0 (sem infraestrutura de teste de UI/dashboard no projeto, mesma situação de
  todos os sprints anteriores)

total novos: 49 tests, 2 files
```

### Resultado real

```
npm test (raiz) → research-engine: 17 arquivos / 140 testes — todos passando
                   scoring-engine:  9 arquivos / 119 testes — todos passando
                   shared:          1 arquivo  /  10 testes — todos passando
                   exit code final = 0 (todos os workspaces)
```

## 16. Typecheck

`npm run typecheck` (raiz) — exit code 0 real, confirmado.

## 17. Lint

`eslint .` (raiz) — exit code 0 real, confirmado, sem correções necessárias desta vez.

## 18. Build

`next build` — exit code 0 real, 20/20 páginas estáticas, rota `/api/projects/[slug]/
event-impacts` presente na listagem.

---

## 19. Security Audit

```
critical: 0
high: 0
medium: 0
low: 0
```

Nenhuma URL de usuário aceita/consultada (nenhuma fonte externa nova nesta sprint). Rota nova
exige `getServerSession` (401 sem sessão), mesmo padrão do resto do sistema. Nenhum secret
logado.

## 20. Performance

Event Impact de UM evento: 4 queries (TVL/Revenue/Fees/MarketData) + 1 query de outros eventos do
projeto, todas já paralelas (`Promise.all`). Dashboard "Event Intelligence": batch por PROJETO
(não por evento) — `getEventImpactsForProject` roda uma vez por projeto pesquisado, não uma vez
por evento, evitando N+1 (seção 29 do prompt). Sem cache/Redis — mesma decisão dos Sprints 14/15
(sem evidência de necessidade ainda com o volume atual).

---

## 21. Limitações

- Quantidade de eventos reais ainda pequena (2 categorias) — agregações cross-event quase sempre
  caem em `insufficientSample: true` na prática hoje.
- Cobertura histórica depende inteiramente do que os Sprints 3/12 já coletaram — projetos sem
  `coinGeckoId` não têm métricas de mercado no Event Impact.
- Granularidade diária (herdada do Sprint 12) — não há dado intraday para eventos que precisariam
  de janela mais fina que 1 dia.
- Overlap só detecta OUTROS eventos DO MESMO PROJETO — não detecta eventos de mercado amplo (ex.:
  uma queda geral do mercado cripto que não é um "evento" no sistema).
- Sem testes de API/dashboard nesta sprint — mesma decisão já registrada nos relatórios dos
  Sprints 13/15 (sem precedente de teste de rota individual/UI no projeto).
- Nunca há causalidade — apenas associação temporal, mesmo quando o padrão observado é forte e
  consistente entre eventos.

## 22. Technical Debt

Idêntica à listada nos Sprints 12-15 — nenhum item novo introduzido, nenhum resolvido.

## 23. Arquivos criados

- `packages/scoring-engine/src/event-impact.ts`
- `packages/scoring-engine/tests/event-impact.test.ts`
- `packages/research-engine/src/event-impact-engine.ts`
- `packages/research-engine/tests/event-impact-engine.integration.test.ts`
- `apps/web/src/app/api/projects/[slug]/event-impacts/route.ts`

## 24. Arquivos modificados

- `packages/research-engine/src/metrics.ts` (+`getLastValueInRange`)
- `packages/research-engine/src/historical-intelligence.ts` (exporta `toPriceSeries`/
  `toMarketCapSeries`/`toVolumeSeries`)
- `packages/research-engine/src/events-repository.ts` (+`getEventById`/`getAllEvents`, +`projectId` em `ResearchEventView`)
- `packages/research-engine/src/report.ts` (nova seção + Research Trace)
- `packages/research-engine/src/dashboard-intelligence.ts` (+Event Intelligence overview)
- `packages/scoring-engine/src/index.ts`, `packages/research-engine/src/index.ts` (exports)
- `apps/web/src/lib/dashboard.ts`, `apps/web/src/app/dashboard/page.tsx`
- `CLAUDE.md`, `STATUS_PROJETO.md`, `README.md`

## 25. Migrations

Nenhuma (ver seção 14).

## 26. Próximo Sprint recomendado

Expandir a cobertura de Catalysts/Risks (mais categorias com fonte real, ver
`CATALYSTS_RISKS_ARCHITECTURE.md`) — quanto mais eventos reais existirem, mais significativa fica
a agregação cross-event construída nesta sprint (hoje limitada pela amostra pequena). Alternativa:
se a prioridade for Trading Intelligence, esta é a fundação correta para isso (seção 45 do
prompt), mas não deve começar sem uma decisão de produto explícita sobre esse próximo estágio.
