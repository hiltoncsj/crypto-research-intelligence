# Sprint 14 — Historical Fundamental Intelligence + Live Home Dashboard

## Relatório de implementação

Data: 2026-09-18/19. Todas as evidências vêm de execução real dos comandos e testes de
integração contra o Postgres real do docker-compose nesta sessão.

---

## 1. Executive Summary

Construída a camada de **Fundamental Historical Intelligence**: transforma os snapshots já
persistidos (TVL/Revenue/Fees desde o Sprint 3, Price/Market Cap/Volume desde o Sprint 12) em
Growth, Acceleration, Fundamental Momentum, relações Fundamentos×Valuation, Divergência
Fundamentos×Preço, Valuation Ratios, Correlação e Leading/Lagging, e Fundamental Regime —
**tudo calculado sob demanda, sem nenhuma tabela nova**. A Home do Dashboard deixou de ser um
menu estático e agora mostra dados reais (Research, Data Health, Fundamental Movement,
Divergences). Nenhum indicador técnico, sinal de trading ou recomendação foi criado — regra
explícita do sprint, verificada em cada classificação implementada.

---

## 2. Estado antes do Sprint

Confirmado por leitura direta do código antes de qualquer mudança:

- `history.ts`/`metrics.ts` já calculavam growth de janela (7/30/90/180d) para TVL/Revenue/Fees,
  mas só isso — sem aceleração, sem momentum composto, sem nenhuma relação entre séries.
- `MarketDataSnapshot` (Sprint 12) tinha coleta e persistência, mas **nenhum consumidor** —
  nenhuma função lia essa tabela para cálculo algum.
- `dashboard/page.tsx` era um menu estático de 4 links, sem nenhum dado do banco.
- Nenhuma rota de API expunha inteligência histórica ou visão agregada do dashboard.

---

## 3. Estado depois do Sprint

- Camada de matemática pura testável isoladamente (`fundamental-intelligence.ts`).
- Camada de integração real que lê os snapshots e produz um resultado completo por projeto
  (`historical-intelligence.ts`).
- Camada de agregação para a Home (`dashboard-intelligence.ts`).
- Project Report com nova seção completa.
- Home do Dashboard com dados reais.
- 2 rotas de API novas.

---

## 4. Dados históricos utilizados

| Série                   | Fonte                                      | Desde     | Usada neste Sprint                                                                                                                       |
| ----------------------- | ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TVL                     | DefiLlama (`TvlSnapshot`)                  | Sprint 3  | Growth, Acceleration, Momentum, Regime, correlação/lead-lag vs Market Cap                                                                |
| Revenue                 | DefiLlama (`RevenueSnapshot`)              | Sprint 3  | Growth, Momentum, Revenue vs TVL, Regime                                                                                                 |
| Fees                    | DefiLlama (`FeeSnapshot`)                  | Sprint 3  | Growth, Momentum                                                                                                                         |
| Price/Market Cap/Volume | CoinGecko (`MarketDataSnapshot`)           | Sprint 12 | Growth, Momentum (volume), Market vs Fundamentals, Divergência, Ratios, Correlação, Lead/Lag — **primeiro consumidor real desta tabela** |
| FDV                     | CoinGecko (`Token.fdvUsd`, snapshot atual) | Sprint 11 | FDV/Revenue ratio — **nunca histórico** (fonte não expõe série histórica de FDV, ver Sprint 12)                                          |

---

## 5. Métricas implementadas

Growth (7/30/90/180/365d) · Acceleration (TVL, Revenue) · Fundamental Momentum (composto
TVL/Revenue/Fees/Volume Growth 30d) · Market Cap vs TVL · Market Cap vs Revenue · Revenue vs TVL
· Fundamental vs Price Divergence · Valuation Ratios (MC/TVL, MC/Revenue, FDV/Revenue, MC/Fees) ·
Correlação (Market Cap×TVL, Market Cap×Revenue, Price×TVL, Volume×TVL) · Leading/Lagging
(TVL vs Market Cap) · Fundamental Regime.

---

## 6. Fórmulas utilizadas

- **Growth**: `(current/previous - 1) × 100`, reaproveitando `calculateGrowth`/
  `calculateGrowthForWindow` já existentes (Sprint 3/9) — nenhuma duplicação de lógica.
- **Acceleration**: `growthAtual - growthDaJanelaComparávelAnterior` (nova função
  `calculateGrowthWindowPair`, `metrics.ts`); classificado ACCELERATING/DECELERATING/STABLE com
  limiar de 5pp para não tratar ruído como sinal.
- **Fundamental Momentum**: média dos componentes disponíveis, cada um normalizado via clamp
  ±50% → 0-100 (mesmo método de `priority.ts`, Sprint 8) — nunca penaliza ausência de
  componente.
- **Comparação de growth (Market vs Fundamentals, Revenue vs TVL)**: diferença em pontos
  percentuais, limiar de 5pp para "co-movido" (alinhado).
- **Fundamental vs Price Divergence**: diferença entre Fundamental Momentum (0-100) e Price
  Growth normalizado (mesmo clamp), limiar de 10 pontos.
- **Valuation Ratios**: divisão simples, `null` se denominador ausente/≤0.
- **Correlação**: Pearson padrão, mínimo de 5 observações pareadas por dia; série constante
  (variância zero) retorna `N/A`, nunca 0 fabricado.
- **Leading/Lagging**: cross-correlation em defasagens de -30 a +30 dias, escolhe a defasagem
  com maior |correlação|; abaixo de 0.5 de correlação, "sem relação temporal clara" — nunca
  afirma causalidade.
- **Fundamental Regime**: regra determinística sobre os growths disponíveis + estado de
  aceleração do TVL (EXPANSION/ACCELERATION/DECELERATION/CONTRACTION/MIXED/INSUFFICIENT_DATA).

---

## 7. Arquivos criados

- `packages/scoring-engine/src/fundamental-intelligence.ts` (matemática pura)
- `packages/scoring-engine/tests/fundamental-intelligence.test.ts` (34 testes)
- `packages/research-engine/src/historical-intelligence.ts` (integração com snapshots reais)
- `packages/research-engine/tests/historical-intelligence.integration.test.ts` (9 testes)
- `packages/research-engine/src/dashboard-intelligence.ts` (agregação para a Home)
- `packages/research-engine/tests/dashboard-intelligence.integration.test.ts` (6 testes)
- `apps/web/src/lib/dashboard.ts`
- `apps/web/src/app/api/dashboard/fundamental/route.ts`
- `apps/web/src/app/api/projects/[slug]/historical-intelligence/route.ts`

## 8. Arquivos modificados

- `packages/research-engine/src/metrics.ts` (+`calculateGrowthWindowPair`)
- `packages/research-engine/src/market-data-repository.ts` (+`loadMarketDataSeries`)
- `packages/research-engine/src/report.ts` (nova seção + Research Trace estendido)
- `packages/research-engine/src/logger.ts` (+`HistoricalIntelligenceEvent`)
- `packages/scoring-engine/src/index.ts`, `packages/research-engine/src/index.ts` (exports)
- `apps/web/src/app/dashboard/page.tsx` (reescrita — menu original preservado + seções novas)
- `CLAUDE.md`, `STATUS_PROJETO.md`, `README.md`

---

## 9. Database changes

**Nenhuma migration.** Decisão arquitetural explícita (seção 15 do prompt do sprint —
"verificar se pode ser calculado on-demand... se persistência não trouxer benefício claro, NÃO
criar tabela"): todo o cálculo é derivado dos snapshots já existentes a cada chamada. Justificado
em comentário no topo de `historical-intelligence.ts`. `npx prisma migrate status` confirmado sem
drift antes de começar (schema já sincronizado desde o Sprint 13).

---

## 10. API changes

- `GET /api/projects/[slug]/historical-intelligence` — retorna `FundamentalHistoricalIntelligence`
  completo para um projeto.
- `GET /api/dashboard/fundamental` — retorna Research Overview + Data Health + Fundamental
  Movement (top 10) + Divergence Overview numa resposta só.

Ambas seguem exatamente o padrão de camadas já estabelecido (rota fina + sessão + zod quando
aplicável, lógica em `research-engine`/`lib`).

---

## 11. Dashboard changes

`apps/web/src/app/dashboard/page.tsx`: menu de navegação original preservado; adicionadas 4
seções com dados reais de `GET /api/dashboard/fundamental` — Research (cards), Qualidade dos
Dados (cobertura TVL/Market Data/Revenue/Fees + última coleta bem-sucedida/falha), Movimento
Fundamental (tabela, nunca "Top Buys"/"Best Coins"), Divergências Fundamentos×Mercado (contadores

- tabela). Estados de carregamento/erro tratados explicitamente (nunca tela em branco silenciosa).

---

## 12. Research Report changes

Nova seção "## Inteligência Fundamental Histórica" em `report.ts`, inserida entre "Fundamental
Metrics" e "Score" (posição mais próxima possível da ordem sugerida no prompt do sprint, seção
22, sem reestruturar o report inteiro — "preservar o que já funciona"). Sub-seções: Cobertura
histórica, Crescimento (tabela 7/30/90/180/365d), Momentum Fundamental, Relação
Fundamentos×Valuation, Preço×Fundamentos, Correlação, Temporal Relationship, Regime.

---

## 13. Research Trace

Seção "## Sources" do report estendida com duas novas entradas quando há dado suficiente:
"Inteligência Fundamental Histórica — TVL Growth/Acceleration — janela {oldest}→{newest} —
fórmula (current/previous - 1) × 100 — modelo {version}" e o equivalente para Market Data. Cada
métrica no corpo do report é rastreável até a janela temporal e o modelo que a gerou.

---

## 14. Tests

**44 testes novos** (34 unitários + 9 + 6 de integração real), somados aos já existentes.

```
new tests:
  packages/scoring-engine/tests/fundamental-intelligence.test.ts        34 tests
  packages/research-engine/tests/historical-intelligence.integration.test.ts   9 tests
  packages/research-engine/tests/dashboard-intelligence.integration.test.ts    6 tests
  total novos: 49 tests, 3 files

existing tests: todos revalidados, nenhum alterado/removido/skipado
```

### Resultado real (comandos executados nesta sessão)

```
npm test (raiz, workspaces completos)
→ research-engine:   14 arquivos / 114 testes — todos passando
→ scoring-engine:      8 arquivos /  81 testes — todos passando
→ shared:              1 arquivo  /  10 testes — todos passando
→ demais workspaces (database/defi-data/queue/apps-web) no mesmo comando composto;
  exit code final do `npm test` = 0 → todos passaram
→ research-engine revalidado isoladamente após adicionar dashboard-intelligence.integration.test.ts:
  14/14 arquivos, 114/114 testes, confirmando o novo arquivo incluído e verde
```

Nenhum teste foi desabilitado, `.skip`, removido, ou teve timeout aumentado arbitrariamente.

---

## 15. Typecheck

`npm run typecheck` (raiz) — todos os 7 workspaces + `infrastructure/workers/tsconfig.json`,
exit code 0.

## 16. Lint

`eslint .` — sem erros/warnings, exit code 0.

## 17. Build

`next build` — "✓ Compiled successfully", 20/20 páginas estáticas (era 19 no Sprint 13; +1 pela
nova rota de dashboard), exit code 0. As duas rotas novas (`/api/dashboard/fundamental`,
`/api/projects/[slug]/historical-intelligence`) aparecem na listagem de rotas geradas.

---

## 18. Security Audit

Nenhuma mudança na camada de segurança — AES-256-GCM, API keys criptografadas, autenticação via
NextAuth continuam intocadas. Ambas as rotas novas exigem `getServerSession` (401 sem sessão),
mesmo padrão de todas as outras rotas de `/api/projects/[slug]/*` e `/api/dashboard/*`. Nenhum
secret é logado pelos novos eventos estruturados (`historical_intelligence.*`) — só
slug/projectId/contadores/regime, mesmo padrão do resto do sistema.

---

## 19. Data Quality

O sistema distingue corretamente, em toda a camada nova:

- Ausência de dado (`null`/`"N/A"`) vs. dado real — nunca 0 fabricado (testado explicitamente em
  `computeFundamentalMomentum` "nenhum componente disponível" e em `computeCorrelation` "série
  constante").
- `INSUFFICIENT_DATA` (amostra pequena demais) vs. classificação real — nunca um coeficiente ou
  regime inventado para preencher a resposta.
- Cobertura histórica exibida explicitamente (dias/snapshots), nunca escondida do usuário.

---

## 20. Limitations

- Fundamental Momentum/Divergência/Regime dependem de pelo menos um growth calculável — projetos
  muito novos (menos de 30 dias de histórico) mostram `INSUFFICIENT_DATA` honestamente.
- Correlação/Leading-Lagging exigem séries de TVL e Market Data alinhadas por dia — projetos sem
  `coinGeckoId` (sem Market Data, Sprint 11/12) nunca terão essas métricas calculáveis.
- FDV histórico continua indisponível (limitação da fonte, não deste sprint) — `fdvToRevenue`
  ratio usa sempre o snapshot atual, nunca uma série.
- Fundamental Movement/Divergences na Home escopados aos projetos já pesquisados — não ao
  universo inteiro de Discovery (centenas/milhares de projetos), decisão de performance
  documentada.
- Sem cache/Redis para os cálculos da Home nesta primeira versão — aceitável para o volume atual
  (dezenas de projetos pesquisados), reavaliar se crescer significativamente.

---

## 21. Technical Debt Remaining

Idêntica à listada nos Sprints 12/13, nenhum item novo introduzido, nenhum resolvido:
`TokenUnlock` (schema-only) · Catalysts · Risks · `Project.narrativeId`/Narrative ·
Emerging/Established · Global Score · Second Brain · Trading Intelligence (RSI/MACD/sinais) ·
Backtesting · Opportunity Engine · multi-tenant/RBAC · Improvement Proposals automáticos.

---

## 22. Próximo Sprint recomendado

**Sprint 15 — Catalysts + Risks + Fundamental Context**, não Trading Intelligence ainda.
Justificativa: a fundação de Fundamental Intelligence agora está completa e consumida (Report +
Dashboard); Trading Intelligence (seção 32 do prompt, "arquitetura futura") depende de dados de
preço mais granulares e de uma decisão de produto sobre indicadores técnicos que não foi tomada
nesta sessão. Catalysts/Risks, por outro lado, são uma lacuna conhecida desde os Sprints 9-13
(sempre `N/A` no report) e agora têm um lugar natural para aparecer junto da Inteligência
Fundamental Histórica (ex.: um catalyst de "unlock event" cruzado com a série de preço). Ainda
assim, catalysts/risks exigem uma fonte real (curadoria manual ou API de notícias) — a mesma
regra "não inventar dado" que guiou este sprint se aplica lá também; o Sprint 15 precisaria
começar pela mesma investigação de fontes feita no Sprint 13 para tokenomics.
