# DATA_DICTIONARY.md

> Referência campo a campo dos dados que o sistema coleta e calcula. Fonte de verdade sobre
> **estado real** de cada campo (populado sempre / às vezes / nunca hoje) — nunca assumir que um
> campo existente no schema tem dado real por trás. Gerado a partir de
> `packages/database/prisma/schema.prisma` + código de scoring/coleta, não de suposição.
> Atualizar sempre que um campo novo for adicionado ou uma fonte mudar.

Legenda de **Estado**: 🟢 sempre populado quando disponível na fonte · 🟡 populado parcialmente
(depende do protocolo) · 🔴 modelado no schema mas hoje sempre `null` (sem fonte conectada).

---

## Métricas de atividade on-chain

| Campo                        | Descrição                              | Fonte                      | Periodicidade                | Unidade | Como interpretar                             | Limitações                                            | Estado |
| ---------------------------- | -------------------------------------- | -------------------------- | ---------------------------- | ------- | -------------------------------------------- | ----------------------------------------------------- | ------ |
| `TvlSnapshot.tvlUsd`         | Total Value Locked no protocolo        | DefiLlama (`api.llama.fi`) | Coletado a cada Research Run | USD     | Ver crescimento 7/30/90d, não valor absoluto | Depende de metodologia de cada protocolo reportar TVL | 🟢     |
| `RevenueSnapshot.revenueUsd` | Receita que fica com o protocolo/token | DefiLlama                  | Por Research Run             | USD     | Sinal de monetização real                    | Nem todo protocolo reporta separado de Fees           | 🟡     |
| `FeeSnapshot.feesUsd`        | Total pago por usuários ao protocolo   | DefiLlama                  | Por Research Run             | USD     | Volume de uso pago                           | Pode incluir fees redistribuídos a terceiros (LPs)    | 🟡     |

Todas as três tabelas acima são **append-only**: `@@unique([projectId, source,
sourceTimestamp])` funciona como chave de dedupe, não de upsert — duplicatas são puladas
(`skippedDuplicate`), nunca sobrescrevem um valor já gravado. Histórico real de série temporal
por projeto já existe estruturalmente.

## Detalhamento por métrica (Sprint 10)

Complementa as tabelas acima com Categoria/Definição/O que representa/Por que coletamos/Exemplo/
Relação com outras métricas — só para as métricas que **existem de verdade** no sistema hoje
(ver tabelas acima para Fonte/Periodicidade/Unidade/Como interpretar/Limitações/Estado, que não
são repetidos aqui).

**TVL** — Categoria: Fundamental. Definição: soma em USD dos ativos depositados no protocolo no
momento da coleta. O que representa: quantidade de capital "estacionado" no protocolo. Exemplo:
TVL passou de $100M para $125M em 30 dias (+25%). Relação: usado como denominador de
Revenue/TVL e como base de `TVL Growth` (7/30/90/180d, ver `HISTORY_WINDOW_DAYS`).

**Revenue** — Categoria: Fundamental. Definição: parte das fees que fica com o
protocolo/treasury. O que representa: monetização real do protocolo, distinta de volume bruto.
Exemplo: Revenue de $50K/mês indica algum nível de captura de valor. Relação: Revenue/TVL mede
eficiência; Revenue growth alimenta o Fundamental Score.

**Fees** — Categoria: Fundamental. Definição: total pago pelos usuários ao usar o protocolo,
antes de qualquer divisão entre LPs/protocolo. O que representa: volume de atividade econômica
bruta. Relação: Fees >> Revenue pode indicar que o protocolo captura pouco valor da atividade
que gera (ver Value Capture, hoje `N/A`).

**Market Cap** — Categoria: Valuation. Definição: `circulatingSupply × preço`, obtido direto da
DefiLlama (`Token.marketCapUsd`). O que representa: valor de mercado do supply em circulação
hoje. Relação: numerador de MC/FDV.

**FDV / MC-FDV** (Sprint 11) — Categoria: Valuation. Definição: proporção entre valor de mercado
circulante e valor total diluído. Fonte: CoinGecko (`/coins/{id}`), só quando
`Project.coinGeckoId` é conhecido (vínculo vindo do `gecko_id` que a própria DefiLlama já
retorna — nunca inferido por nome/símbolo). Por que coletamos: ajuda a estimar diluição futura
pendente. Como interpretar: próximo de 1 = pouca diluição futura. Limitações: projetos cujo
protocolo a DefiLlama não associa a um `gecko_id` continuam `N/A`.

**Fundamental Score** — Categoria: Research. Definição: nota 0-100 combinando TVL/Revenue/Fees
growth e eficiência, calculada uma vez por Research Run (nunca sobrescrita). Por que coletamos:
resume várias métricas de crescimento num número comparável entre projetos. Exemplo: Score subiu
de 82 para 87 entre duas Research Runs. Relação: alimenta `Research Priority` junto com Growth/
Capital Momentum.

**Confidence** — Categoria: Research. Definição: 0-100, mede confiabilidade da evidência por
trás de um Score (não a qualidade do projeto). Por que coletamos: permite diferenciar "Score
alto com poucos dados" de "Score alto bem evidenciado". Relação: calculado por
`packages/scoring-engine/src/confidence.ts` (completude + amostra + ausência de dado suspeito +
recência, 25% cada).

**Research Priority** — Categoria: Research. Definição: combina Fundamental Score + Growth
Momentum (TVL growth 30d normalizado) + Capital Momentum (recência da última captação). Por que
coletamos: decide quais projetos entram no Top 10 pesquisado a cada Research Run (Sprint 8). Como
interpretar: prioridade alta = sinais recentes relevantes, nunca recomendação de compra. Relação:
usado para popular `ResearchRunSelection.rank`.

**Total Known Capital** (Funding) — Categoria: Capital. Definição: soma dos valores conhecidos
de todas as rodadas de captação registradas (`computeFundingAggregates`). Por que coletamos: mede
capital institucional conhecido investido, sinal objetivo (não qualidade do investidor). Relação:
combinado com `distinctInvestorCount`/`daysSinceLastRaise` no Institutional Capital Score.

**Unlock (TokenUnlock)** — Categoria: Tokenomics. Definição: data e quantidade programada de
liberação de tokens previamente bloqueados. Por que coletamos: unlocks grandes podem aumentar
pressão de venda. Limitações: **modelo existe no schema mas está sempre vazio hoje** — o
endpoint dedicado da DefiLlama (`/emissions/*`) exige plano pago (retorna HTTP 402), então não é
usado; nenhuma outra fonte está conectada ainda. Candidato em avaliação: Tokenomist.ai
(`api.tokenomist.ai/v4/unlock-events/{tokenId}`), que também cobre "Unlock Pressure" e
"Distribution" (breakdown de alocação team/investors/community, que bate com o enum
`UnlockAllocationType` já existente) — integração em andamento, ver
`packages/defi-data` quando disponível.

## Tokenomics e Valuation

| Campo                                      | Descrição                                         | Fonte                                                               | Como interpretar                        | Limitações                                                                                                                                                                | Estado |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `Token.marketCapUsd`                       | Market Cap atual                                  | DefiLlama (`mcap`)                                                  | Valor de mercado do supply circulante   | —                                                                                                                                                                         | 🟢     |
| `Token.fdvUsd`                             | Fully Diluted Valuation                           | CoinGecko (`/coins/{id}`, Sprint 11)                                | Indicaria diluição futura pendente      | Só populado quando `Project.coinGeckoId` é conhecido (vem do `gecko_id` que a DefiLlama já retorna) e a chamada à CoinGecko teve sucesso — caso contrário `N/A`, nunca 0. | 🟡     |
| MC/FDV                                     | Proxy de pressão de diluição futura               | Calculado a partir de MC (DefiLlama) e FDV (CoinGecko)              | Quanto menor, maior a diluição pendente | Depende de `fdvUsd` — mesma limitação acima                                                                                                                               | 🟡     |
| `TokenomicsScore` → dimensão Value Capture | Se o token captura valor via staking/buyback/burn | Modelado como peso no score (`weights.ts`)                          | —                                       | **Sem fonte de dado real conectada — sempre `null` hoje**                                                                                                                 | 🔴     |
| `TokenUnlock`                              | Cronograma de desbloqueio de tokens               | Nenhuma ainda (DefiLlama `/emissions/*` exige plano pago, HTTP 402) | Pressão de venda futura                 | Tabela sempre vazia hoje. Candidato: Tokenomist.ai (integração em andamento)                                                                                              | 🔴     |

## Perfil do Projeto e Mercados (Sprint 13)

| Campo                                  | Descrição                                                                                 | Fonte                                                                                                                       | Como interpretar                                                                      | Limitações                                                                                                                                                                                                                                                    | Estado |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `ProjectProfileSnapshot.descriptionEn` | Descrição factual curta do projeto, texto original da fonte                               | CoinGecko (`/coins/{id}`, campo `description.en` — mesmo payload já buscado para FDV/supplies, nenhuma chamada extra)       | Contexto factual do que o projeto faz — nunca recomendação                            | Texto em inglês (fonte não fornece PT-BR); pode faltar para tokens pouco cobertos                                                                                                                                                                             | 🟡     |
| `ProjectProfileSnapshot.categories`    | Categoria(s) do projeto (ex.: "DeFi", "Lending/Borrowing")                                | CoinGecko                                                                                                                   | Classificação da própria fonte, não uma avaliação nossa                               | Taxonomia definida pela CoinGecko, não pelo projeto                                                                                                                                                                                                           | 🟡     |
| `ProjectProfileSnapshot.platforms`     | Blockchain(s) onde o token existe (multi-chain preservado)                                | CoinGecko (`platforms`)                                                                                                     | Onde o contrato do token está implantado                                              | Só reflete o que a CoinGecko conhece, pode não cobrir deployments muito recentes                                                                                                                                                                              | 🟡     |
| `ProjectProfileSnapshot.homepageUrl`   | Site oficial do projeto                                                                   | CoinGecko (`links.homepage`)                                                                                                | —                                                                                     | —                                                                                                                                                                                                                                                             | 🟢     |
| Histórico do Perfil                    | Cada linha em `ProjectProfileSnapshot` é um estado real observado no passado              | Dedupe por CONTEÚDO (não por timestamp) — só insere linha nova quando descrição/categoria/blockchain/homepage de fato mudam | Permite ver quando um perfil mudou, sem acumular linhas idênticas a cada Research Run | Não captura mudanças fora do que a CoinGecko expõe                                                                                                                                                                                                            | 🟢     |
| `TokenMarket`                          | Mercados (exchange/par/tipo/volume) onde o token é negociado, observados na última coleta | CoinGecko (`/coins/{id}?tickers=true`, mesmo payload)                                                                       | Dado factual observado — **nunca** ranking/recomendação de exchange                   | Lista muda com o tempo; sempre apresentada como "na última coleta em `retrievedAt`", nunca como fato permanente. Só mercados SPOT (perpetuals fora de escopo). Estado é UPSERT (não histórico linha-a-linha) — a "história" é o próprio `retrievedAt` visível | 🟡     |

## Funding e Capital Institucional

| Campo                               | Descrição                                          | Fonte                                         | Como interpretar                                        | Estado                                               |
| ----------------------------------- | -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| `FundingRound`                      | Rodada de captação (valor, data, estágio)          | Fonte real conforme integração ativa          | Interesse de capital especializado                      | 🟡                                                   |
| `Investor` / `FundingRoundInvestor` | Investidores e seu papel na rodada (lead ou não)   | idem                                          | Qualidade/reputação do capital, não garantia de sucesso | 🟡                                                   |
| `InstitutionalCapitalScore`         | Score dedicado à dimensão de capital institucional | Calculado, versionado por `scoreModelVersion` | Combinar com Fundamental Score, nunca isolado           | 🟢 (cálculo), 🟡 (depende de dados de funding reais) |

Quando não houver dado de funding para um projeto: `N/A` — nunca omitir silenciosamente nem
tratar como "sem captação confirmada" (que seria uma afirmação, não uma ausência de dado).

## Score e Confidence

| Campo                             | Descrição                                                            | Cálculo                                                                                        | Estado                  |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- |
| `FundamentalScore.score`          | Nota 0-100 combinando dimensões fundamentalistas                     | `packages/scoring-engine/src/fundamental-score.ts`                                             | 🟢                      |
| `TokenomicsScore.score`           | Nota 0-100 focada em tokenomics                                      | `tokenomics-score.ts` — inclui dimensões hoje sempre `null` (Value Capture)                    | 🟡 (dimensões parciais) |
| `InstitutionalCapitalScore.score` | Nota 0-100 focada em capital institucional                           | `capital-score.ts`                                                                             | 🟡                      |
| `*.confidence`                    | 0-100, mede confiabilidade da evidência (não a qualidade do projeto) | `confidence.ts`: 25% completude + 25% amostra + 25% ausência de dados suspeitos + 25% recência | 🟢                      |
| `*.scoreModelVersion`             | Versão do modelo de score usado                                      | Constante versionada no código                                                                 | 🟢                      |
| `*.researchRunId`                 | Run que gerou esta linha de score                                    | FK obrigatória — cada run gera uma linha nova, nunca sobrescreve a anterior                    | 🟢                      |

## Sector / Narrativa / Chain

| Campo                 | Descrição                                                                                                                                                     | Estado                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Project.sectorId`    | FK real para `Sector` (com hierarquia via `parentSectorId`)                                                                                                   | 🟢                                                      |
| `Project.narrativeId` | Coluna string solta, **sem FK, sem tabela `Narrative`** — comentário no schema confirma que isso é intencional até a tabela ser especificada em sprint futura | 🔴 (modelado como string livre, não como entidade real) |
| `ProjectChain`        | Presença multi-chain do projeto, com flag `active`                                                                                                            | 🟢                                                      |

## Catalysts, Risks e Event Impact (Sprint 15/16)

Ver `CATALYSTS_RISKS_ARCHITECTURE.md` para a investigação completa de fontes.

| Campo                                                   | Descrição                                                                                     | Fonte                                                                           | Estado                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ResearchEvent` (kind=CATALYST, category=FUNDING)       | Rodada de captação reclassificada como catalyst                                               | `FundingRound` já persistido (Sprint 6), zero coleta nova                       | 🟡 — real, mas só 1 das ~20 categorias de Catalyst tem fonte  |
| `ResearchEvent` (kind=RISK, category=SECURITY_INCIDENT) | Incidente de segurança real                                                                   | DefiLlama `/hacks`, casado por `defillamaId` exato                              | 🟡 — real, mas só 1 das ~20 categorias de Risk tem fonte      |
| Demais categorias de `ResearchEventCategory`            | Taxonomia completa definida no schema                                                         | Nenhuma fonte real conectada                                                    | 🔴 — nunca populadas com dado inventado                       |
| Event Impact (Sprint 16)                                | Análise antes/depois (7/14/30d) de cada evento sobre TVL/Revenue/Fees/Price/Market Cap/Volume | Calculado sob demanda a partir dos snapshots já existentes — sem tabela própria | 🟢 (cálculo), 🟡 (amostra pequena para agregação cross-event) |

**Regra permanente**: associação temporal, nunca causalidade. O sistema nunca escreve "o evento
causou X" — só "variação observada após o evento".

## Research Run e Rastreabilidade

| Campo                                                          | Descrição                                                                                                                     | Estado                                                                                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResearchRun.mode/trigger/totalProjects/processedProjects/...` | Metadados de execução do pipeline                                                                                             | 🟢                                                                                                                                                                                                   |
| Research Trace                                                 | Métrica → fonte/timestamp/Research Run, navegável                                                                             | 🟡 — implementado e exibido na UI só para o **Fundamental Score** (`TraceRow` em `dashboard/projects/[slug]/page.tsx`); Tokenomics/Capital ainda não têm trace por métrica, só o breakdown por grupo |
| Seleção de projetos por run (Top 10)                           | Implementada no Sprint 8 — `ResearchRunSelection` (rank, priorityScore, selectionModelVersion), ver `TOP10_SELECTION_SPEC.md` | 🟢                                                                                                                                                                                                   |

## Research Priority (Sprint 8)

| Campo                                | Descrição                                          | Cálculo                                                                                                                       | Estado |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| `ResearchRunSelection.priorityScore` | Combina Score + Growth Momentum + Capital Momentum | `packages/scoring-engine/src/priority.ts` (`priority-v1`) — média só dos componentes disponíveis, nunca trata ausência como 0 | 🟢     |
| `ResearchRunSelection.rank`          | Posição no Top 10 daquela Research Run             | Ordenação determinística (Score → Growth → Capital → slug)                                                                    | 🟢     |

## Métricas mencionadas em specs futuras, ainda AUSENTES no código (não confundir com N/A de um campo existente)

Estas não têm nenhum campo/modelo no schema hoje — citadas aqui só para deixar explícito que não
devem ser inventadas em nenhum relatório/UI até serem implementadas: **DEX Volume**, **Perpetual
Volume**, **Inflows**, **Outflows**, **Users/Activity** (contagem de usuários), **TVL
Acceleration** (segunda derivada de crescimento), **Unlock Pressure** (métrica derivada de
concentração de unlocks), **Token Holder Revenue** (distinto de `RevenueSnapshot`), **Protocol
Revenue** (idem).
