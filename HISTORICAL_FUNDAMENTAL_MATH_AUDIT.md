# Historical Fundamental Intelligence — Auditoria Matemática

Data: 2026-09-22. Escopo: as 15 métricas do Historical Fundamental Intelligence (Sprint 14),
implementadas em `packages/scoring-engine/src/fundamental-intelligence.ts` (matemática pura) e
`packages/research-engine/src/historical-intelligence.ts` (integração com snapshots reais).
Nenhuma feature nova foi implementada; nenhum módulo fora de escopo (Second Brain, Trading
Intelligence, Token Unlock, Event Impact como produto) foi alterado — Event Impact
(`event-impact-engine.ts`) só é mencionado porque compartilha as funções auditadas de
`metrics.ts`, nunca modificado em sua própria lógica.

## Tabela executiva

| Métrica                        | Fórmula                                                                                                                                       | Implementação                                             | Testada                           | Look-ahead                                                          | Estado                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Growth 7d                      | `(current/previous - 1) × 100`                                                                                                                | `calculateGrowthForWindow` (metrics.ts)                   | Sim (nova+existente)              | Corrigido nesta auditoria                                           | PASS                                      |
| Growth 30d                     | idem                                                                                                                                          | idem                                                      | Sim                               | Corrigido                                                           | PASS                                      |
| Growth 90d                     | idem                                                                                                                                          | idem                                                      | Sim                               | Corrigido                                                           | PASS                                      |
| Growth 180d                    | idem                                                                                                                                          | idem                                                      | Sim                               | Corrigido                                                           | PASS                                      |
| Growth 365d                    | idem                                                                                                                                          | idem                                                      | Sim                               | Corrigido                                                           | PASS                                      |
| Acceleration                   | `growthAtual − growthJanelaAnteriorComparável` (pp)                                                                                           | `classifyAcceleration` + `calculateGrowthWindowPair`      | Sim (+boundary novo)              | Corrigido (via calculateGrowthWindowPair)                           | PASS                                      |
| Fundamental Momentum           | média dos componentes disponíveis, cada um normalizado clamp ±50%→0-100                                                                       | `computeFundamentalMomentum`                              | Sim                               | N/A (matemática pura, sem timestamp próprio)                        | PASS                                      |
| Market Cap × TVL               | duas formas distintas: (a) razão MC/TVL (`valuationRatios.marketCapToTvl`), (b) comparação de growths (`marketVsFundamentals.marketCapVsTvl`) | `computeValuationRatio` / `compareGrowth`                 | Sim                               | Ratio usa só valor atual (ok); comparação usa growth90d (herda fix) | PASS WITH LIMITATION (ver Time Alignment) |
| Market Cap × Revenue           | idem (razão e comparação de growth)                                                                                                           | idem                                                      | Sim                               | idem                                                                | PASS WITH LIMITATION                      |
| Revenue × TVL                  | comparação de growth 90d (não é razão nem produto)                                                                                            | `compareGrowth(growth.revenue["90d"], growth.tvl["90d"])` | Sim                               | herda fix                                                           | PASS                                      |
| Fundamental × Price Divergence | `FundamentalMomentum(0-100) − priceGrowthNormalizado(0-100)`                                                                                  | `classifyFundamentalPriceDivergence`                      | Sim (+boundary novo)              | herda fix (via growth.price)                                        | PASS                                      |
| Historical Valuation           | 4 razões: MC/TVL, MC/Revenue, FDV/Revenue, MC/Fees — sempre snapshot ATUAL, nunca série histórica                                             | `computeValuationRatio`                                   | Sim                               | N/A (não há série histórica de FDV)                                 | PASS WITH LIMITATION                      |
| Correlation                    | Pearson, mín. 5 observações pareadas por dia                                                                                                  | `computeCorrelation`                                      | Sim (+testes independentes novos) | N/A (correlação não usa "current"; alinhamento por dia real)        | PASS                                      |
| Leading/Lagging                | cross-correlation em lags de −30 a +30d, maior \|correlação\|                                                                                 | `detectLeadLag`                                           | Sim                               | N/A (mesma base de correlação)                                      | PASS                                      |
| Fundamental Regime             | regra sobre growth 30d TVL/Revenue + aceleração TVL                                                                                           | `classifyFundamentalRegime`                               | Sim (+boundary novo)              | herda fix (via growth30d/acceleration)                              | PASS                                      |

Legenda "herda fix": a métrica depende de `calculateGrowthForWindow`/`calculateGrowthWindowPair`
(`packages/research-engine/src/metrics.ts`), cujo bug de look-ahead bias foi corrigido nesta
auditoria (ver seção 15). Para todo consumidor **dentro do escopo** (Historical Fundamental
Intelligence, chamado sempre com `asOf = new Date()`), o bug nunca se manifestava na prática — a
correção é preventiva/estrutural, não uma correção de um resultado incorreto já exibido ao
usuário.

---

## 1. Executive Summary

As 15 métricas do Historical Fundamental Intelligence foram auditadas matematicamente:
especificação (Sprint 14 report + comentários de código, únicas fontes formais existentes),
fórmula esperada derivada à mão, implementação real lida integralmente (não só grep), e testes
adicionados para cada lacuna encontrada. **Um bug real foi confirmado e corrigido**: as funções
`calculateGrowthForWindow`/`calculateGrowthWindowPair` (`packages/research-engine/src/metrics.ts`)
usavam sempre o **último ponto de toda a série** como "current", ignorando o parâmetro `asOf` —
um look-ahead bias real para qualquer chamador com `asOf` no passado. Para o Historical
Fundamental Intelligence em si (Sprint 14), esse bug nunca se manifestou em produção porque todo
consumidor interno chama com `asOf = new Date()` (agora) — mas a correção é necessária porque (a)
contradizia a própria documentação da função ("growth da janela [asOf-days, asOf]"), e (b) a
mesma função é reutilizada por Event Impact (Sprint 16, `event-impact-engine.ts`), onde `asOf` É
histórico (`eventDate`, no passado) — ali o bug **era ativo e silenciosamente inflava/distorcia
"momentum antes do evento"** ao usar o valor mais recente já persistido em vez do valor na data
do evento. A correção foi feita de forma cirúrgica em `metrics.ts` (sem tocar
`event-impact-engine.ts`, fora do escopo desta auditoria) e é comportamentalmente idêntica para
todo `asOf = now` (nenhuma regressão nos consumidores em escopo).

Nenhuma outra métrica apresentou bug matemático confirmado. Duas limitações de especificação
(SPECIFICATION GAP) foram documentadas: consistência de snapshot entre séries diferentes (Market
Cap de um dia vs. TVL de outro dia dentro da mesma razão) não tem tolerância definida em nenhum
documento fonte; e o nome "Market Cap × TVL"/"Revenue × TVL" no report é ambíguo (mistura razão
ponto-a-ponto com comparação de crescimento) — resolvido factualmente lendo o código (nenhum dos
dois é "produto"), mas o nome no vocabulário do produto poderia confundir.

## 2. Audit Scope

Dentro do escopo: as 15 métricas listadas no prompt, `fundamental-intelligence.ts` (matemática
pura), `historical-intelligence.ts` (integração/persistência de leitura), `metrics.ts`
(`calculateGrowthForWindow`/`calculateGrowthWindowPair`, usadas diretamente pelo Sprint 14),
`snapshot-repository.ts`/`market-data-repository.ts` (fonte dos inputs), rota
`GET /api/projects/[slug]/historical-intelligence`, `fundamental-context.ts` (Sprint 15, consome
Historical Intelligence sem recalcular), `report.ts` (seção "Inteligência Fundamental
Histórica"), `dashboard-intelligence.ts` + `dashboard/page.tsx` (Home).

Fora do escopo (não implementado/não alterado, mesmo quando compartilham código): Event Impact
como produto (Sprint 16, `event-impact-engine.ts` — só mencionado como consumidor afetado
indiretamente pelo bugfix), Second Brain, Trading Intelligence/TradingView/Pine Script,
Backtesting, Token Unlock, Opportunity Engine, LLM classification, novos providers.

## 3. Source Specifications

Prioridade seguida: não existe uma "especificação formal" separada (nenhum
`HISTORICAL_FUNDAMENTAL_INTELLIGENCE_SPEC.md` na raiz) — a fonte mais próxima de uma
especificação formal é o próprio `SPRINT_14_IMPLEMENTATION_REPORT.md` (seções 5/6, "Métricas
implementadas"/"Fórmulas utilizadas"), seguido pelos comentários de arquitetura no topo de
`historical-intelligence.ts` e `fundamental-intelligence.ts`, e pelos comentários por função (cada
fórmula tem um comentário citando a seção do "Sprint 14" original que a define). `STATUS_PROJETO.md`
e `CLAUDE.md` só confirmam decisões duráveis (sem dado sintético, calculado sob demanda, nunca
Trading Intelligence) — não têm fórmulas. Nenhum conflito entre documentação e código foi
encontrado: o código implementa exatamente o que os comentários/relatório descrevem. Não havia
necessidade de "registrar conflito" nesta auditoria.

## 4. Metric Inventory

| #   | Métrica                        | Arquivo                                    | Função                                                         | Inputs                                                           | Período                          | Estado               |
| --- | ------------------------------ | ------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- | -------------------- |
| 1   | Growth 7/30/90/180/365d        | research-engine/metrics.ts                 | `calculateGrowthForWindow`                                     | série (TVL/Revenue/Fees/Price/MarketCap/Volume)                  | janela fixa em dias              | PASS                 |
| 2   | Acceleration                   | scoring-engine/fundamental-intelligence.ts | `classifyAcceleration`                                         | 2 GrowthResult (atual, comparável anterior)                      | 30d vs 30d anterior              | PASS                 |
| 3   | Fundamental Momentum           | scoring-engine/fundamental-intelligence.ts | `computeFundamentalMomentum`                                   | 4 growth30d (TVL/Revenue/Fees/Volume)                            | 30d                              | PASS                 |
| 4   | Market Cap × TVL               | scoring-engine/fundamental-intelligence.ts | `computeValuationRatio` (ratio) + `compareGrowth` (comparação) | MC atual/TVL atual; growth90d MC e TVL                           | pontual + 90d                    | PASS WITH LIMITATION |
| 5   | Market Cap × Revenue           | idem                                       | idem                                                           | MC atual/Revenue atual; growth90d                                | pontual + 90d                    | PASS WITH LIMITATION |
| 6   | Revenue × TVL                  | scoring-engine/fundamental-intelligence.ts | `compareGrowth`                                                | growth90d Revenue, growth90d TVL                                 | 90d                              | PASS                 |
| 7   | Fundamental × Price Divergence | scoring-engine/fundamental-intelligence.ts | `classifyFundamentalPriceDivergence`                           | Momentum(0-100), priceGrowth30d normalizado                      | 30d                              | PASS                 |
| 8   | Historical Valuation           | scoring-engine/fundamental-intelligence.ts | `computeValuationRatio` ×4                                     | MC/TVL/Revenue/Fees/FDV atuais                                   | pontual (snapshot atual)         | PASS WITH LIMITATION |
| 9   | Correlation                    | scoring-engine/fundamental-intelligence.ts | `computeCorrelation`                                           | séries alinhadas por dia (MC×TVL, MC×Rev, Price×TVL, Volume×TVL) | toda a série alinhada disponível | PASS                 |
| 10  | Leading/Lagging                | scoring-engine/fundamental-intelligence.ts | `detectLeadLag`                                                | TVL×MarketCap alinhadas por dia                                  | lags −30..+30d                   | PASS                 |
| 11  | Fundamental Regime             | scoring-engine/fundamental-intelligence.ts | `classifyFundamentalRegime`                                    | growth30d TVL, aceleração TVL, growth30d Revenue                 | 30d                              | PASS                 |

(11 linhas cobrindo as 15 métricas — Growth conta como 5 janelas de uma única função/fórmula.)

## 5. Mathematical Definitions

- **Growth(t, window)** = `(V(t) / V(t-window) − 1) × 100`, onde `V(t)` é o valor mais recente
  conhecido `≤ t` (nunca um valor futuro) e `V(t-window)` é o valor mais recente conhecido
  `≤ (t-window)`. `N/A` se qualquer um dos dois for indisponível ou se `V(t-window) = 0`.
- **Acceleration** = `Growth(t, 30d) − Growth(t-30d, 30d)` (o segundo termo é o growth da janela
  comparável imediatamente anterior), em pontos percentuais. Classificado `STABLE` se
  `|Δ| < 5pp`, senão `ACCELERATING`/`DECELERATING` pelo sinal.
- **Fundamental Momentum** = média aritmética dos componentes disponíveis dentre
  {`norm(TVLGrowth30d)`, `norm(RevenueGrowth30d)`, `norm(FeesGrowth30d)`, `norm(VolumeGrowth30d)`},
  onde `norm(g) = (clamp(g, −50, 50) + 50) / 100 × 100` (mapeia −50%→0, +50%→100, clamp fora da
  faixa). `null` se nenhum componente disponível — nunca 0.
- **Market/Revenue/TVL comparisons** = `GrowthA(90d) − GrowthB(90d)` em pontos percentuais,
  `CO_MOVED` se `|Δ| < 5pp`.
- **Fundamental × Price Divergence** = `Momentum(0-100) − norm(PriceGrowth30d)`, `ALIGNED` se
  `|Δ| < 10`.
- **Valuation ratio** = `numerador / denominador` se ambos não-nulos e denominador `> 0`, senão
  `null`.
- **Correlation** = Pearson padrão `Σ(a-ā)(b-b̄) / √(Σ(a-ā)²·Σ(b-b̄)²)`, `N/A` se `n < 5` ou
  variância zero em qualquer série.
- **Leading/Lagging** = `argmax_lag |Pearson(A, shift(B, lag))|` para `lag ∈ [-30, 30]`,
  `NO_CLEAR_RELATIONSHIP` se o melhor `|r| < 0.5`.
- **Fundamental Regime** = função determinística de {growth30d TVL, growth30d Revenue,
  aceleração TVL} — ver árvore de decisão na seção 13.

## 6. Growth Audit

**Metric**: Growth 7d/30d/90d/180d/365d
**Status**: PASS (após correção)
**Formula documented**: `(current/previous - 1) × 100` (SPRINT_14 seção 6; idêntica à
`calculateGrowth` já existente desde o Sprint 3/9).
**Formula implemented**: `calculateGrowth(current, valueAgo)` onde `current` (ANTES da correção)
era sempre `sorted[sorted.length-1]` (último ponto de TODA a série, ignorando `asOf`); `valueAgo`
sempre foi `findValueAt(sorted, asOf - window)` (correto, nunca futuro).
**Inputs**: `TimeSeriesEntry[]` (sourceTimestamp, valueUsd) + `days` + `asOf`.
**Units**: percentual (pp implícito, não fração).
**Time alignment**: `findValueAt` usa "último ponto `≤` data alvo" — nunca interpola, nunca usa
ponto futuro. Correto tanto antes quanto depois da correção para o termo `valueAgo`.
**Missing data**: série vazia ou sem ponto `≤` data alvo → `null` → `calculateGrowth` retorna
`N/A`. Nunca 0.
**Zero handling**: `previous === 0` → `N/A` explícito (não "infinito"). Correto — comentário no
código confirma a decisão deliberada.
**Negative handling**: sem tratamento especial — TVL/Revenue/Fees/Price/MarketCap/Volume são por
definição `≥ 0` nestes providers (DefiLlama/CoinGecko), então growth% tradicional é sempre
economicamente válido; não há caso real de "previous negativo" a tratar.
**Look-ahead risk**: **CONFIRMADO E CORRIGIDO** (ver seção 15) — `current` usava o último ponto de
toda a série, não o último ponto `≤ asOf`. Nunca se manifestou para os consumidores em escopo
(sempre `asOf = now`), mas era um bug real relativo à própria documentação da função e ativo em
Event Impact (fora de escopo, mas usa a mesma função).
**Edge cases testados**: série vazia, 1 ponto, gap (usa ponto mais próximo anterior), `asOf`
anterior a todos os pontos (N/A, nunca antecipa dado), ponto futuro presente na série (nunca usado
como current).
**Tests**: `packages/research-engine/tests/metrics.test.ts` (17 testes, +6 novos desta auditoria:
3 para `calculateGrowthForWindow`, 1 para `calculateGrowthWindowPair`, cobrindo look-ahead
explicitamente).
**Result**: PASS (a fórmula em si estava certa; o bug era na seleção do ponto "current", corrigido
sem alterar o resultado de nenhum consumidor em produção — `asOf` sempre `now` neste escopo).

## 7. Acceleration Audit

**Metric**: Acceleration (TVL, Revenue)
**Status**: PASS
**Formula documented**: "growth atual − growth da janela comparável anterior" (Sprint 14 seção 6),
limiar de 5pp para `STABLE`.
**Formula implemented**: `classifyAcceleration(current, previousComparable)` onde os dois growths
vêm de `calculateGrowthWindowPair` — `current = Growth([asOf-30d, asOf])`,
`previousComparable = Growth([asOf-60d, asOf-30d])`. Ambos os termos corrigidos pelo bugfix da
seção 6 (o `currentValue` interno também usava `getCurrentValue` global, mesmo problema).
**Inputs**: série completa + `days=30` + `asOf`.
**Units**: pontos percentuais (diferença entre dois valores já em %).
**Time alignment**: janelas comparáveis não se sobrepõem (`[t-60d,t-30d]` e `[t-30d,t]`) —
correto, nenhuma reutilização de ponto entre as duas janelas além da borda compartilhada
`t-30d`.
**Missing data**: qualquer lado `N/A` → `INSUFFICIENT_DATA`, nunca 0.
**Zero handling**: N/A não aplicável (aceleração é diferença de dois growths já tratados).
**Negative handling**: aceleração negativa (desaceleração) é semanticamente válida e testada.
**Look-ahead risk**: herdava o bug de `calculateGrowthWindowPair` (mesma raiz), corrigido.
**Edge cases testados** (novos nesta auditoria): boundary exatamente 5pp (não é STABLE — o limiar
é `< 5`, não `≤ 5`) e 4.99pp (é STABLE).
**Tests**: `fundamental-intelligence.test.ts` (existentes: 4; +2 boundary novos).
**Result**: PASS.

## 8. Momentum Audit

**Metric**: Fundamental Momentum
**Status**: PASS
**Formula documented**: "média dos componentes disponíveis, cada um normalizado via clamp
±50%→0-100... nunca penaliza ausência de componente" (Sprint 14 seção 6).
**Formula implemented**: reconstrução independente confirma: `normalizeGrowthComponent` faz
`clamp(-50,50)` seguido de mapeamento linear `[-50,50] → [0,100]`; `score` = média aritmética
simples só dos componentes não-nulos (não ponderada — os 4 componentes têm peso igual quando
presentes). `coverage`/`confidence` = `availableComponents / totalPossibleComponents × 100`
(idênticos por design v1, comentário explícito de que podem divergir em versões futuras).
**Inputs**: 4× `GrowthResult` (TVL/Revenue/Fees/Volume, todos growth30d).
**Units**: score 0-100 (não é %, é índice normalizado).
**Time alignment**: todos os 4 componentes usam a MESMA janela (30d) e o mesmo `asOf` — sem
mistura de períodos.
**Missing data**: componente `null`/`N/A` é excluído do denominador da média, nunca vira 0 (testado:
"nenhum componente disponível" → `score: null`, não 0).
**Zero handling**: `growth = 0` normaliza para `50` (ponto médio do clamp) — matematicamente
correto (`(0+50)/100×100=50`), não testado explicitamente antes desta auditoria mas a lógica é
trivial o suficiente para não exigir novo teste dedicado (coberto indiretamente pelo teste de
"tudo positivo"=50%→100 e cálculo de fronteira do clamp).
**Negative handling**: growth muito negativo (`< -50%`) é clampado em `-50` → normaliza para `0`
— nunca `< 0`. Testado indiretamente (clamp simétrico ao positivo, mesma função).
**Look-ahead risk**: não aplicável diretamente — a função é matemática pura sobre `GrowthResult`
já calculado; o look-ahead relevante é herdado da camada Growth (seção 6), não introduzido aqui.
**Edge cases testados**: 4/4 disponíveis, 1/4, 0/4, tudo no clamp máximo (100).
**Tests**: `fundamental-intelligence.test.ts`, `describe("computeFundamentalMomentum")`, 5 testes
existentes — considerados suficientes, nenhum novo necessário.
**Result**: PASS.

## 9. Valuation Audit

**Metric**: Market Cap×TVL, Market Cap×Revenue, Historical Valuation (MC/TVL, MC/Revenue,
FDV/Revenue, MC/Fees)
**Status**: PASS WITH LIMITATION
**Formula documented**: "divisão simples, `null` se denominador ausente/≤0" (Sprint 14 seção 6). O
nome "Market Cap × TVL" no vocabulário do produto é enganoso — **não é produto (×), é usado de
duas formas distintas no código**: (a) razão pontual `MC/TVL` em `valuationRatios.marketCapToTvl`
(seção "Historical Valuation" do report), e (b) comparação de CRESCIMENTOS (não de níveis) em
`marketVsFundamentals.marketCapVsTvl` (`compareGrowth`, seção "Relação Fundamentos×Valuation" do
report). As duas coexistem e não devem ser confundidas — confirmado lendo o código, nunca
assumido pelo nome.
**Formula implemented**: `computeValuationRatio(numerator, denominator)` = `numerator/denominator`
se ambos não-nulos e `denominator > 0`, senão `null`. Usa sempre o valor ATUAL (último ponto da
série), nunca uma série histórica de razão — `fdvToRevenue` usa `Token.fdvUsd` (snapshot atual,
CoinGecko, sem série histórica — limitação de fonte documentada desde o Sprint 12).
**Inputs**: `currentMarketCap`, `currentTvl`, `currentRevenue`, `currentFees`, `currentFdv` — cada
um o último ponto da respectiva série (ou `Token.fdvUsd` para FDV).
**Units**: ratio adimensional (ex.: MC/TVL = 5 significa "Market Cap é 5× o TVL").
**Time alignment**: **SPECIFICATION GAP confirmado** — `currentMarketCap` e `currentTvl` vêm de
séries INDEPENDENTES (`MarketDataSnapshot` via CoinGecko, `TvlSnapshot` via DefiLlama), cada uma
com sua própria frequência/cadência de coleta. O código pega "o último ponto de cada série"
sem verificar se as datas coincidem — é possível (não testado com dados reais, mas
matematicamente possível) que `marketCapToTvl` combine Market Cap de 22/09 com TVL de 20/09 se as
duas fontes tiverem cadências de coleta diferentes. **Current implementation**: usa o último ponto
de cada série independentemente, sem checagem de proximidade temporal. **Possible
interpretations**: (1) aceitar a mistura (assume-se "recente o suficiente", já que ambas são
atualizadas ao menos diariamente pelo pipeline); (2) exigir uma tolerância máxima (ex.: ±1 dia)
entre os dois timestamps, retornando `null` se excedida; (3) expor os dois timestamps junto do
ratio para o consumidor decidir. **Required product decision**: nenhuma tolerância foi
especificada em nenhum documento fonte (Sprint 14 report, comentários) — não corrigido nesta
auditoria (regra: "SPECIFICATION GAP → não corrija sem decisão de produto").
**Missing data**: `null` se numerador ou denominador ausente.
**Zero handling**: `denominator <= 0` → `null` (testado: 0 e negativo).
**Negative handling**: não aplicável — MC/TVL/Revenue/Fees são sempre `≥ 0` na prática.
**Look-ahead risk**: nenhum — usa sempre o ÚLTIMO ponto conhecido, nunca um `asOf` futuro
(diferente de Growth, esta métrica não tem noção de janela temporal).
**Edge cases testados**: denominador 0/negativo, qualquer lado ausente (testes existentes, 3
testes).
**Tests**: `fundamental-intelligence.test.ts`, `describe("computeValuationRatio")`.
**Result**: PASS WITH LIMITATION — matemática correta; consistência temporal entre as duas séries
usadas em cada ratio é uma lacuna de especificação, registrada, não corrigida.

## 10. Divergence Audit

**Metric**: Fundamental × Price Divergence
**Status**: PASS
**Formula documented**: "diferença entre Fundamental Momentum (0-100) e Price Growth normalizado
(mesmo clamp), limiar de 10 pontos" (Sprint 14 seção 6).
**Formula implemented**: exatamente isso — `classifyFundamentalPriceDivergence(momentum,
priceGrowth30d)` reaplica `normalizeGrowthComponent` ao price growth para colocar na MESMA escala
0-100 do Momentum antes de subtrair. Confirmado: não é `fundamentalGrowth - priceGrowth` cru (que
misturaria % com índice 0-100) — é `Momentum(0-100) - normalize(priceGrowth)(0-100)`, escalas
compatíveis.
**Inputs**: `fundamentalMomentum.score` (0-100), `growth.price["30d"]` (GrowthResult, %).
**Units**: pontos (na escala 0-100), não percentual.
**Time alignment**: usa Momentum (baseado em growth30d de TVL/Revenue/Fees/Volume) contra
priceGrowth30d — MESMA janela (30d) para os dois lados, sem mistura de períodos.
**Missing data**: qualquer lado `null`/`N/A` → `INSUFFICIENT_DATA`.
**Zero handling**: `priceGrowth = 0` normaliza para 50, comparável ao momentum diretamente.
**Negative handling**: momentum baixo (perto de 0, "fundamentos fracos") vs. price growth alto
("preço subiu") corretamente classifica `NEGATIVE_FUNDAMENTAL_DIVERGENCE`.
**Look-ahead risk**: herdado de `growth.price["30d"]` (camada Growth, seção 6) — corrigido.
**Edge cases testados**: fundamentos>preço, preço>fundamentos, qualquer lado ausente (existentes);
+1 novo nesta auditoria: boundary exatamente 10 pontos (não é `ALIGNED`).
**Tests**: `fundamental-intelligence.test.ts`, 4 existentes + 1 boundary novo.
**Result**: PASS.

## 11. Correlation Audit

**Metric**: Correlation (Market Cap×TVL, Market Cap×Revenue, Price×TVL, Volume×TVL)
**Status**: PASS
**Formula documented**: "Pearson padrão, mínimo de 5 observações pareadas por dia; série constante
(variância zero) retorna N/A, nunca 0 fabricado" (Sprint 14 seção 6).
**Formula implemented**: Pearson clássico (`Σ(da·db) / √(Σda²·Σdb²)`), confirmado
matematicamente correto por reconstrução independente. `n < MIN_CORRELATION_OBSERVATIONS(5)` →
`INSUFFICIENT_DATA`. Variância zero em QUALQUER uma das duas séries → `INSUFFICIENT_DATA` (não 0)
— decisão correta e documentada explicitamente no código ("0 implicaria 'sem relação', diferente
de 'não calculável'").
**Inputs**: duas séries JÁ ALINHADAS por dia (`alignDailySeries`, UTC truncado, só dias presentes
em AMBAS as séries).
**Units**: coeficiente adimensional `[-1, 1]`.
**Time alignment**: `alignDailySeries` usa `toISOString().slice(0,10)` (dia UTC) como chave —
correto para agrupar por dia independente de horário exato de coleta; se duas séries tiverem
timestamps de horários diferentes no mesmo dia UTC, ainda alinham corretamente. **Edge case não
coberto por teste**: se uma série tiver DOIS pontos no mesmo dia UTC (não deveria acontecer dado
o dedupe por `sourceTimestamp` exato na persistência, mas nenhuma garantia explícita impede
timestamps diferentes no mesmo dia), o `Map.set` mantém só o ÚLTIMO processado (ordem de
iteração do array de entrada, não necessariamente cronológica) — registrado como TECHNICAL DEBT,
não uma falha ativa (não há evidência de que o pipeline gere 2 pontos/dia).
**Missing data**: `INSUFFICIENT_DATA` com `< 5` pares.
**Zero handling**: variância zero → `INSUFFICIENT_DATA` (nunca 0 fabricado, testado).
**Negative handling**: coeficientes negativos classificados corretamente (`NEGATIVE`).
**Look-ahead risk**: nenhum — correlação usa toda a série alinhada disponível, sem noção de
"corte" temporal em relação a um evento; não há como "vazar futuro" numa correlação sobre uma
série já fechada.
**Invariante `∈[-1,1]`**: testado com 20 trials aleatórios nesta auditoria.
**Determinismo**: testado nesta auditoria (mesma entrada → mesmo resultado, sem `Math.random`
interno).
**Edge cases testados** (novos nesta auditoria): correlação perfeita positiva
`[1,2,3,4,5]×[2,4,6,8,10] = +1` exato, perfeita negativa `[1,2,3,4,5]×[10,8,6,4,2] = -1` exato
(valores calculáveis à mão, conforme exigido pelo prompt).
**Tests**: `fundamental-intelligence.test.ts`, 5 existentes + 4 novos (perfeita positiva/negativa,
invariante, determinismo).
**Result**: PASS.

## 12. Leading/Lagging Audit

**Metric**: Leading/Lagging (TVL vs Market Cap)
**Status**: PASS
**Formula documented**: "cross-correlation em defasagens de -30 a +30 dias, escolhe a defasagem
com maior |correlação|; abaixo de 0.5 de correlação, 'sem relação temporal clara'" (Sprint 14
seção 6).
**Formula implemented**: confirmado — `detectLeadLag` itera `lag ∈ [-30,30]`, desloca A em relação
a B, recalcula Pearson em cada deslocamento (reaproveitando `computeCorrelation`, nunca duplica a
matemática), escolhe `argmax|r|`. **Threshold e tratamento de empate**: se dois lags tiverem
exatamente o mesmo `|r|`, o laço mantém o PRIMEIRO encontrado (`abs > bestAbsCorrelation`, não
`>=`) — como o laço percorre de `-maxLagDays` a `+maxLagDays` em ordem crescente, um empate
resolve a favor do lag MAIS NEGATIVO (viés sistemático para "B liderou A" em empates exatos).
Registrado como TECHNICAL DEBT (não um bug — o comportamento é determinístico e documentável, só
não está descrito explicitamente na spec); não corrigido por não haver evidência de que empates
exatos ocorram com dados reais (ponto flutuante raramente produz empate exato).
**Inputs**: duas séries diárias já alinhadas (`alignedA`, `alignedB`), `maxLagDays=30`.
**Units**: `bestLagDays` em dias; `bestCorrelation` adimensional `[-1,1]`.
**Time alignment**: reaproveita `alignDailySeries` (mesma base de Correlation, seção 11).
**Missing data**: `n < MIN_CORRELATION_OBSERVATIONS + maxLagDays (35)` → `INSUFFICIENT_DATA`
direto, sem nem tentar os lags.
**Look-ahead risk**: nenhum ativo — a "defasagem" é uma comparação INTERNA entre as duas séries já
fechadas (não é uma previsão para o futuro; é uma observação sobre a relação histórica completa).
Nenhuma leitura usa dado além do que já está nas duas séries de entrada.
**Edge cases testados**: A lidera B (deslocamento conhecido, testado com `bestLagDays=3` exato),
séries curtas → `INSUFFICIENT_DATA`, ruído aleatório → sempre uma das 4 classificações válidas
(invariante).
**Tests**: `fundamental-intelligence.test.ts`, 3 existentes, considerados suficientes.
**Result**: PASS.

## 13. Regime Audit

**Metric**: Fundamental Regime
**Status**: PASS
**Regimes reais no código** (não assumidos): `FUNDAMENTAL_EXPANSION`, `FUNDAMENTAL_ACCELERATION`,
`FUNDAMENTAL_DECELERATION`, `FUNDAMENTAL_CONTRACTION`, `MIXED_FUNDAMENTALS`,
`INSUFFICIENT_DATA`.
**Árvore de decisão implementada** (`classifyFundamentalRegime`):

1. Filtra growths disponíveis entre {TVL growth30d, Revenue growth30d}. Se nenhum disponível →
   `INSUFFICIENT_DATA`.
2. Se TODOS os disponíveis são `< 0` → `FUNDAMENTAL_CONTRACTION`.
3. Se NEM TODOS são `> 0` (ou seja, existe pelo menos um `≤ 0` mas não são todos `< 0` —
   cobre o caso misto E o caso de um growth exatamente 0) → `MIXED_FUNDAMENTALS`.
4. Daqui em diante, todos os disponíveis são estritamente `> 0`: se aceleração TVL
   `ACCELERATING` → `FUNDAMENTAL_ACCELERATION`; se `DECELERATING` → `FUNDAMENTAL_DECELERATION`;
   senão (`STABLE` ou `INSUFFICIENT_DATA` de aceleração) → `FUNDAMENTAL_EXPANSION`.
   **Inputs/pesos/precedência**: sem pesos — é uma árvore de decisão determinística, não uma soma
   ponderada. Só usa aceleração de TVL (não de Revenue) para diferenciar
   ACCELERATION/DECELERATION/EXPANSION — decisão de design explícita no Sprint 14 (Revenue não tem
   aceleração calculada em `historical-intelligence.ts`, só TVL). Não é um bug: a spec (seção 5/6 do
   Sprint 14) só define Acceleration para TVL e Revenue, mas o Regime usa deliberadamente só a de
   TVL.
   **Empate**: growth exatamente `0` cai no passo 3 (`MIXED_FUNDAMENTALS`), nunca em
   CONTRACTION nem em "positivo" — testado nesta auditoria (`growth=0` → `MIXED_FUNDAMENTALS`,
   boundary explícito, comportamento correto e agora coberto por teste).
   **Missing data**: só um growth disponível ainda classifica normalmente (testado nesta auditoria —
   `classifyFundamentalRegime(20, "ACCELERATING", "N/A")` → `FUNDAMENTAL_ACCELERATION`, correto: a
   função já filtra `N/A` antes de aplicar `every`/`allPositive`/`allNegative`).
   **Look-ahead risk**: herdado das entradas (`growth.tvl["30d"]`, `acceleration.tvl.regime`,
   `growth.revenue["30d"]`) — corrigido pela mesma correção da seção 6/15.
   **Boundary tests** (novos nesta auditoria): growth exatamente 0 (`threshold-ε`/`threshold`
   equivalente para este caso), um lado `N/A`.
   **Tests**: `fundamental-intelligence.test.ts`, 6 existentes + 2 novos.
   **Result**: PASS.

## 14. Time Alignment

Resumo cruzado (detalhe por métrica já nas seções 6-13):

- **Growth**: alinhamento correto AGORA (após correção) — `current` e `valueAgo` ambos respeitam
  `asOf`, nunca usam ponto posterior a `asOf`.
- **Correlation/Leading-Lagging**: alinhamento por dia UTC via `alignDailySeries`, só pontos
  presentes em AMBAS as séries — nunca interpola, nunca inventa um dia ausente.
- **Valuation ratios**: **SPECIFICATION GAP** — usa o último ponto de cada série
  independentemente, sem checar proximidade temporal entre elas (seção 9). Duas séries de fontes
  diferentes (CoinGecko vs. DefiLlama) podem ter cadências de atualização ligeiramente diferentes;
  o sistema não expõe nem valida essa diferença.
- **eventTimestamp vs publishedAt vs fetchedAt**: não aplicável ao Historical Fundamental
  Intelligence em si (não lida com eventos) — só relevante para Event Impact (fora de escopo).
  `sourceTimestamp` (o campo econômico real usado por TODA a matemática de Growth/Correlation) é
  sempre distinto de `retrievedAt` (quando o dado foi coletado) nos models `TvlSnapshot`/
  `RevenueSnapshot`/`FeeSnapshot`/`MarketDataSnapshot` — confirmado que `sourceTimestamp`, nunca
  `retrievedAt`, é o campo usado em `snapshot-repository.ts`/`market-data-repository.ts` para
  construir as séries (`TimeSeriesEntry.sourceTimestamp = p.sourceTimestamp`). Nenhuma confusão
  entre os dois encontrada.

## 15. Look-Ahead Bias

**BUG CONFIRMADO E CORRIGIDO.** `calculateGrowthForWindow` e `calculateGrowthWindowPair`
(`packages/research-engine/src/metrics.ts`) calculavam o valor "current" como o ÚLTIMO PONTO DE
TODA A SÉRIE (`sorted[sorted.length-1]` / `getCurrentValue(sorted)`), **ignorando completamente o
parâmetro `asOf`** para esse lado do cálculo (só o usavam para achar `valueAgo`). Teste que
demonstra o problema (adicionado nesta auditoria,
`packages/research-engine/tests/metrics.test.ts`, `describe("calculateGrowthForWindow — look-ahead
bias")`): uma série com pontos em `asOf-30d` (100), `asOf` (120), `asOf+10d` (500 — FUTURO) e
`asOf+90d` (999 — FUTURO); ANTES da correção, `calculateGrowthForWindow(series, 30, asOf)` teria
retornado `(999-100)/100×100 = 899%` (usando o ponto mais futuro da série); DEPOIS da correção,
retorna corretamente `(120-100)/100×100 = 20%`.

**Impacto real em produção**: NENHUM para o Historical Fundamental Intelligence em si — toda
chamada em escopo (`historical-intelligence.ts`, `fundamental-context.ts`, `report.ts`) usa
`asOf = new Date()` (agora), e como não existem snapshots com `sourceTimestamp` no futuro em
relação a "agora" (impossível dado como os dados são coletados), `sorted[sorted.length-1]` e
`findValueAt(sorted, now)` sempre coincidiam. **Impacto real em Event Impact** (Sprint 16, fora de
escopo desta auditoria mas usa a MESMA função): `momentumAt`/`regimeAt`
(`event-impact-engine.ts`) chamam `calculateGrowthForWindow(series, 30, eventDate)` com
`eventDate` no PASSADO — ali, "momentum ANTES do evento" estava, antes desta correção, usando o
valor MAIS RECENTE já persistido (podendo ser meses/anos depois do evento) como se fosse o valor
na data do evento. Isso **silenciosamente distorcia toda a análise de Event Impact já em
produção** (P0 se fosse escopo desta auditoria) — como benefício colateral da correção cirúrgica
em `metrics.ts` (sem tocar `event-impact-engine.ts`), esse problema também deixa de ocorrer, mas
NÃO foi validado com testes de Event Impact nesta auditoria (fora de escopo explícito do prompt).
**Recomendação registrada, não executada**: revisar `event-impact-engine.ts` com o mesmo rigor
desta auditoria num sprint dedicado a Event Impact, e adicionar testes de regressão específicos
lá também.

Nenhum outro look-ahead bias foi encontrado: `findValueAt` (usado para todo "valor há N dias") já
usava corretamente "último ponto `≤` data alvo, nunca posterior"; `alignDailySeries` não usa
nenhuma noção de "asOf" (compara séries fechadas inteiras); `computeValuationRatio` usa sempre o
último ponto conhecido de cada série (sem noção temporal de corte, não há como "vazar futuro").

## 16. Missing Data

Auditado por métrica nas seções 6-13. Resumo: toda ausência de dado (`null` de entrada, série
vazia, denominador zero/negativo, variância zero, amostra `< 5`) propaga para `null`/`"N/A"`/
`INSUFFICIENT_DATA` explícitos — nenhum caso de "missing virando 0" encontrado em nenhuma das 15
métricas (verificado por teste existente ou novo em cada seção).

## 17. Numerical Stability

Nenhum caso de `NaN`/`Infinity` chegando ao resultado final foi encontrado:

- Divisão por zero: `calculateGrowth` trata `previous === 0` explicitamente (`N/A`);
  `computeValuationRatio` trata `denominator <= 0` explicitamente (`null`); `computeCorrelation`
  trata `varA === 0 || varB === 0` explicitamente (`N/A`).
- Todos os arredondamentos usam `Math.round(x * 100) / 100` (2 casas) ou `* 10000/10000` (4 casas
  para correlação) — sem introduzir imprecisão perceptível para os ranges de valor reais (USD de
  TVL/Revenue/MC, tipicamente `10^3` a `10^12`).
- Não foram encontrados clamps arbitrários fora dos já documentados (`±50%` do Momentum, `0-100`
  do score) — nenhuma mudança de "toda a matemática para Decimal" foi feita nem é necessária: os
  valores em jogo (USD, percentuais, coeficientes `[-1,1]`) estão muito longe dos limites de
  precisão do `number` do JavaScript (`Number.MAX_SAFE_INTEGER ≈ 9×10^15`) para qualquer TVL/
  Market Cap realista.
- Overflow/extremos (`10^12`, `0.0000001`): não testados com valores sintéticos extremos nesta
  auditoria por ausência de evidência de que isso ocorra com os providers reais (DefiLlama/
  CoinGecko não retornam TVL/Revenue negativos ou com essa magnitude) — MATHEMATICALLY seria
  seguro (aritmética simples, sem produtos/potências que amplifiquem erro), mas não foi
  REAL DATA VERIFIED.

## 18. Unit Consistency

- Growth: sempre percentual (`%`, não fração) — confirmado pela fórmula `×100`.
- Acceleration/Comparisons/Divergence: pontos percentuais (diferença entre dois percentuais).
- Momentum/Divergence (lado normalizado): escala 0-100 (índice, não percentual) — Divergence
  corretamente normaliza AMBOS os lados para 0-100 antes de subtrair (não mistura % com índice).
- Valuation ratios: adimensional (razão).
- Correlation/Lead-Lag: adimensional `[-1,1]`.
- Nenhum caso de "revenue diário × market cap anual sem normalização" encontrado — todas as
  comparações de growth usam a MESMA janela nos dois lados (90d vs 90d, 30d vs 30d), nunca
  períodos incompatíveis.

## 19. API Consistency

`GET /api/projects/[slug]/historical-intelligence` (`apps/web/src/app/api/projects/[slug]/
historical-intelligence/route.ts`) retorna exatamente o objeto de
`computeFundamentalHistoricalIntelligence`, sem nenhuma transformação/arredondamento/conversão —
confirmado lendo a rota inteira (23 linhas, rota fina conforme padrão do projeto).
`GET /api/dashboard/fundamental` (via `dashboard-intelligence.ts`) também repassa os campos de
`FundamentalHistoricalIntelligence` sem transformação adicional além de agregação (top N por
`fundamentalMomentum.score`, contagem por `divergence.classification`) — nenhuma conversão
`null → 0` encontrada (`getFundamentalMovementOverview` usa `?? 0` só dentro do `.sort`, código
morto porque a lista já foi filtrada para excluir `null` antes — não afeta nenhum resultado
exposto).

## 20. Dashboard Consistency

`apps/web/src/app/dashboard/page.tsx`: renderiza `fundamentalMomentum` com
`.toFixed(1)`/`"N/A"` explícito (nunca esconde `null`); `divergence` mapeado por um dicionário de
labels (`DIVERGENCE_LABEL`), com fallback para o valor cru se a chave não existir — nunca perde
informação silenciosamente. Nenhuma alteração de frontend foi feita (fora do escopo desta
auditoria; nenhum bug ligado à fórmula foi encontrado que exigisse correção de UI).

## 21. Report Consistency

`packages/research-engine/src/report.ts`, seção "## Inteligência Fundamental Histórica": usa
`fmtPct`/`toFixed` sobre os MESMOS campos do objeto retornado por
`computeFundamentalHistoricalIntelligence` (`hi.growth`, `hi.acceleration`,
`hi.fundamentalMomentum`, `hi.regime`, etc.) — mesma fonte que a API e o Dashboard, nenhuma
divergência Engine=X/Report=Y/Dashboard=Z encontrada.

## 22. Test Coverage

Matriz Métrica × [normal, edge, boundary, missing, zero, look-ahead] — X = já existia,
**X** = adicionado nesta auditoria:

| Métrica                          | Normal | Edge | Boundary | Missing | Zero      | Look-ahead          |
| -------------------------------- | ------ | ---- | -------- | ------- | --------- | ------------------- |
| Growth (todas janelas)           | X      | X    | X        | X       | X         | **X**               |
| Acceleration                     | X      | X    | **X**    | X       | —         | **X** (herdado)     |
| Momentum                         | X      | X    | —        | X       | (coberto) | n/a                 |
| Comparisons (MC×TVL/Rev/Rev×TVL) | X      | X    | **X**    | X       | n/a       | **X** (herdado)     |
| Divergence                       | X      | X    | **X**    | X       | (coberto) | **X** (herdado)     |
| Valuation ratios                 | X      | X    | n/a      | X       | X         | n/a                 |
| Correlation                      | X      | X    | n/a      | X       | X         | n/a (não aplicável) |
| Leading/Lagging                  | X      | X    | n/a      | X       | n/a       | n/a (não aplicável) |
| Regime                           | X      | X    | **X**    | **X**   | **X**     | **X** (herdado)     |

## 23. Findings

- **[P0 → corrigido]** `calculateGrowthForWindow`/`calculateGrowthWindowPair` ignoravam `asOf`
  para o valor "current", usando sempre o último ponto de TODA a série — look-ahead bias real,
  latente para o Historical Fundamental Intelligence (nunca exercitado em produção porque
  `asOf` sempre é "agora" lá), mas ATIVO em Event Impact (fora de escopo, mesma função
  compartilhada). Corrigido em `metrics.ts`.
- **[P2, SPECIFICATION GAP]** Consistência de snapshot entre séries de fontes diferentes
  (Market Cap/CoinGecko vs. TVL/DefiLlama) nas 4 valuation ratios: sem tolerância de
  proximidade temporal definida em nenhuma documentação fonte. Não corrigido — decisão de
  produto necessária.
- **[P3, TECHNICAL DEBT]** `detectLeadLag`: em caso de empate exato de `|correlação|` entre dois
  lags, o critério `>` (não `>=`) favorece sistematicamente o lag mais negativo (primeiro
  encontrado na iteração crescente). Sem evidência de que ocorra com dados reais (ponto
  flutuante raramente empata exatamente); registrado, não corrigido.
- **[P3, TECHNICAL DEBT]** `alignDailySeries`: se uma série tiver dois pontos no mesmo dia UTC
  (não deveria acontecer dado o dedupe de persistência, mas não há garantia explícita no
  alinhamento), o `Map` mantém só o último processado na ordem do array, não necessariamente o
  cronologicamente mais recente daquele dia. Sem evidência de ocorrência real.
- **[P3, nomenclatura]** "Market Cap × TVL" (nome usado no report/Sprint 14) é ambíguo: não é
  produto, e no código há DUAS métricas distintas com esse rótulo informal (razão pontual vs.
  comparação de crescimento). Resolvido nesta auditoria lendo o código; nenhuma correção de
  nome foi feita (fora de escopo — mudança de nomenclatura do produto não é um bug matemático).

## 24. Corrections Made

Uma correção, em um único arquivo de produção:

- `packages/research-engine/src/metrics.ts`: `calculateGrowthForWindow` e
  `calculateGrowthWindowPair` agora calculam `current`/`currentValue` via
  `findValueAt(sorted, asOf)` (último ponto `≤ asOf`), em vez de sempre o último ponto de toda a
  série. `getCurrentValue` (função exportada, usada por `history.ts` com semântica intencionalmente
  diferente — "valor mais recente conhecido, independente de `asOf`") **não foi alterada**, para
  não regredir `history.ts` (Research History/Sprint 9, fora de escopo desta auditoria).

Nenhuma mudança de fórmula, nenhuma mudança de threshold, nenhuma mudança de schema/migration.

## 25. Regression Tests

Adicionados:

- `packages/research-engine/tests/metrics.test.ts`: +6 testes (`describe("calculateGrowthForWindow
— look-ahead bias")` com 3 testes incluindo um caso "nunca usa ponto posterior a asOf" com
  valores calculáveis à mão; +1 teste de uso real (`asOf = now`); +1 teste "`asOf` anterior a
  todos os pontos → N/A"; `describe("calculateGrowthWindowPair — look-ahead bias")` com 1 teste).
- `packages/scoring-engine/tests/fundamental-intelligence.test.ts`: +10 testes (2 boundary de
  Regime incluindo `growth=0`; 2 boundary de Acceleration exatamente no limiar de 5pp; 1 boundary
  de `compareGrowth`; 1 boundary de Divergence exatamente em 10 pontos; 4 de Correlation —
  correlação perfeita positiva/negativa com valores calculáveis à mão, invariante `[-1,1]` com 20
  trials aleatórios, determinismo).

Resultado da execução real (nesta sessão, contra Postgres real):

- `packages/scoring-engine`: 10 arquivos, **152/152 testes passando** (44 no arquivo auditado, 34
  pré-existentes + 10 novos).
- `packages/research-engine`: 17 arquivos, **177/177 testes passando** (incluindo
  `historical-intelligence.integration.test.ts` e `fundamental-context.integration.test.ts`
  revalidados contra dados reais, sem nenhuma regressão).

## 26. Specification Gaps

1. **Tolerância de alinhamento temporal entre séries de fontes diferentes** (Market Cap/CoinGecko
   vs. TVL-Revenue-Fees/DefiLlama) nas valuation ratios — não especificada em nenhum documento
   fonte. Current implementation: usa o último ponto de cada série, sem checagem cruzada.
   Possible interpretations: aceitar como está / definir tolerância máxima (ex. ±24h) / expor os
   dois timestamps ao consumidor. Required product decision: qual tolerância (se alguma) é
   aceitável antes de invalidar o ratio.
2. **Nomenclatura "Market Cap × TVL"** mistura, no vocabulário do produto (report/Sprint 14), duas
   métricas matematicamente distintas (razão pontual vs. comparação de crescimento). Current
   implementation: ambas existem e são corretas isoladamente, distinguidas só pelo campo
   (`valuationRatios.marketCapToTvl` vs. `marketVsFundamentals.marketCapVsTvl`). Required product
   decision: se vale a pena renomear um dos dois campos/rótulos do report para eliminar a
   ambiguidade — não é um bug matemático, é comunicação.

## 27. Remaining Limitations

- FDV histórico continua indisponível (limitação de fonte, não desta auditoria) — `fdvToRevenue`
  sempre usa o snapshot atual.
- `event-impact-engine.ts` (Sprint 16) não foi re-testado nesta auditoria apesar de compartilhar
  a função corrigida — recomendação registrada na seção 15/23 para um sprint dedicado.
- Extremos numéricos (`10^12`, `10^-7`, overflow) foram avaliados como MATHEMATICALLY VERIFIED
  (a aritmética não amplifica erro) mas não são REAL DATA VERIFIED contra um provider real
  nesses extremos.
- Nenhuma mudança de frontend foi feita — a auditoria de Dashboard/Report foi só de leitura
  (seções 20/21), sem necessidade de correção.

## 28. Final Verdict

Das 15 métricas auditadas, 11 receberam PASS direto e 3 (Market Cap×TVL, Market Cap×Revenue,
Historical Valuation) receberam PASS WITH LIMITATION por causa de um SPECIFICATION GAP real
(consistência temporal entre séries de fontes diferentes), documentado e não corrigido por falta
de decisão de produto. Nenhuma métrica falhou (FAIL) e nenhuma ficou sem verificação (NOT
VERIFIED). Um bug de look-ahead bias real foi encontrado e corrigido na camada compartilhada de
cálculo de growth (`metrics.ts`) — sem impacto em nenhum resultado já exibido pelo Historical
Fundamental Intelligence em produção (porque `asOf` sempre foi "agora" nesse escopo), mas
estruturalmente necessário e com benefício colateral (não validado nesta auditoria) para Event
Impact. O sistema NÃO fabrica dado sintético em nenhum caso testado: toda ausência propaga
honestamente como `null`/`N/A`/`INSUFFICIENT_DATA`. Nenhuma migration foi necessária.
**Veredito**: o Historical Fundamental Intelligence está matematicamente correto para todos os
caminhos de produção reais (asOf sempre "agora"), com uma correção estrutural aplicada por rigor
e prevenção, e duas lacunas de especificação (não bugs) registradas para decisão de produto
futura.
