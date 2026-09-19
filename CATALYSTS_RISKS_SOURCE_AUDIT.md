# Auditoria de Fontes — Catalysts & Risks (extensão de cobertura)

Documento de pesquisa (read-only, nenhum código alterado). Estende
`CATALYSTS_RISKS_ARCHITECTURE.md` (Sprint 15) sem repetir a investigação já feita lá — este
documento cobre as categorias que ainda faltam (18 de 20 Catalysts, 19 de 20 Risks hoje sem
fonte real) e reavalia fontes com dados atualizados de 2026-09.

## 1. Objetivo

Mapear, para cada uma das 20 categorias de Catalyst e 20 categorias de Risk já definidas no enum
`ResearchEventCategory` (`packages/database/prisma/schema.prisma`), se existe hoje uma fonte
real, gratuita ou de custo conhecido, automatizável e capaz de identificar o projeto sem
heurística de nome — e, quando existir, deixar pronta a matriz de decisão para uma sprint futura
de implementação (este documento não implementa nada).

## 2. Arquitetura atual (achados da Fase 1)

### `ResearchEvent` (schema.prisma, linha 612)

Campos suportados hoje: `id`, `projectId` (FK para `Project`), `kind`
(`ResearchEventKind`: `CATALYST`/`RISK`), `category` (`ResearchEventCategory`, 20+20 valores +
`OTHER`), `title`, `description` (opcional), `eventDate` (opcional), `publishedAt` (opcional),
`source` (string livre, ex. `"DEFILLAMA"`), `sourceUrl` (opcional), `sourceId` (string estável
construída pelo coletor), `impact` (`ResearchEventImpactDimension`: FUNDAMENTAL/MARKET/
TOKENOMICS/ECOSYSTEM/GOVERNANCE/REGULATORY/SECURITY), `status` (`ResearchEventStatus`:
ANNOUNCED/SCHEDULED/ONGOING/COMPLETED/CANCELLED/UNKNOWN — sem versionamento de transição,
decisão documentada explicitamente no schema), `confidence` (`ResearchEventConfidence`:
HIGH/MEDIUM/LOW), `retrievedAt`, `createdAt`, `updatedAt`.

**Dedup key**: unique constraint `(projectId, source, sourceId)` (`@@unique(...,
name: "research_event_dedupe")`). `sourceId` é sempre construído de forma estável pelo coletor —
nunca aleatório, nunca por nome. Hoje: `FundingRound.id` (já estável) para `FUNDING`, e
`sha256(defillamaId|eventDate|name)` truncado para `SECURITY_INCIDENT` (a API de hacks não
fornece ID próprio). Qualquer fonte nova só precisa gerar um `sourceId` estável equivalente.

**Confidence**: hoje só `HIGH` está em uso (as 2 fontes ativas são estruturadas/primárias). A
metodologia documentada (Sprint 15) já reserva `MEDIUM` para fontes secundárias de qualidade
(grandes veículos de notícia) e `LOW` para conteúdo não verificado — nenhuma fonte MEDIUM/LOW
está implementada, mas o campo já suporta.

### `event-impact.ts` / `event-impact-engine.ts` — confirmação de genericidade

Confirmado por leitura direta: `event-impact-engine.ts` trata `category` como `string` puro em
toda a pipeline (`eventType: event.category`, `eventType: string; // ResearchEvent.category`) —
não há nenhum `if (category === "FUNDING")` ou branch por categoria específica. A análise de
janelas 7/14/30d, detecção de overlap (`OVERLAPPING_EVENTS`) e agregação cross-event operam sobre
qualquer `ResearchEvent`, independente de `kind`/`category`. **Confirmado: nenhuma mudança é
necessária no Event Impact Engine para consumir novas categorias** — plugar uma fonte nova é
estritamente um trabalho de coleta + persistência (`events-repository.ts`), consistente com o
"Como adicionar uma nova fonte" já documentado em `CATALYSTS_RISKS_ARCHITECTURE.md`.

### Superfície no produto

- Project Report (`packages/research-engine/src/report.ts`): consome `getCatalysts`/`getRisks`
  via seção dedicada.
- Dashboard (`dashboard-intelligence.ts` + `apps/web/src/app/dashboard/page.tsx`): "Event
  Intelligence", escopado a projetos já pesquisados.
- `GET /api/projects/[slug]/event-impacts`: expõe a análise de impacto por evento.
- Research Trace / logging: segue o padrão `logEventsEvent` (`logger.ts`), um `console.log`
  JSON estruturado por operação de coleta — nenhum novo mecanismo de provenance seria necessário;
  uma fonte nova só precisa de um `collect*`/`persist*` seguindo o padrão existente.

## 3. Fontes investigadas nesta sessão

Além das já testadas em `CATALYSTS_RISKS_ARCHITECTURE.md` (DefiLlama `/hacks` — implementado,
`FundingRound`/raises — implementado, CoinGecko `status_updates` — rejeitado/vazio, GitHub
Releases — real mas sem mapeamento projeto→repo, Snapshot.org — real mas sem mapeamento
projeto→space, CryptoPanic/CoinDesk/Messari — pagos/sem key):

| Fonte                                                                                              | O que foi testado                                                                        | Resultado                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DefiLlama `/protocols` (payload completo do protocolo)                                             | Fetch ao vivo, listagem de todos os campos do objeto `protocol`                          | Confirmado: **não há campos** de token unlock, protocol upgrade, mainnet, new chain ou governança — só `hallmarks` (marcos históricos curados manualmente pela própria DefiLlama, texto livre, não estruturado por categoria)                                                                                                                                                     |
| DefiLlama `/raises` (endpoint dedicado, distinto do campo `raises` de `/protocol/{name}` já usado) | Fetch ao vivo                                                                            | HTTP 402 (Payment Required) — o endpoint dedicado é Pro; o campo `raises` embutido em `/protocol/{name}` (já usado pelo sistema desde o Sprint 6) continua sendo o caminho gratuito e é o que já está implementado                                                                                                                                                                |
| DefiLlama Unlocks/Emissions (`/emissions/*`, dashboard `defillama.com/unlocks`)                    | Pesquisa de documentação + confirmação da tentativa já feita no Sprint 13                | Confirmado pago: a API Pro ($300/mês, `pro-api.llama.fi`) é que expõe os 38 endpoints incluindo unlocks; free tier não cobre. Consistente com o HTTP 402 já documentado em `STATUS_PROJETO.md`                                                                                                                                                                                    |
| Tokenomist.ai (ex-Token Unlocks) / `token.unlocks.app`                                             | Pesquisa de documentação pública                                                         | Sem API pública gratuita documentada; requer cadastro/API key (já apontado como bloqueado em `STATUS_PROJETO.md`, Sprint 13). Não testado ao vivo por exigir credencial                                                                                                                                                                                                           |
| Messari Token Unlocks API                                                                          | Pesquisa de documentação                                                                 | Endpoint dedicado existe mas é parte do plano pago da Messari — consistente com a rejeição já registrada                                                                                                                                                                                                                                                                          |
| CryptoRank.io Token Unlocks                                                                        | Pesquisa de documentação pública                                                         | Produto de dashboard, sem indicação de API pública gratuita documentada — não testado ao vivo (sem key)                                                                                                                                                                                                                                                                           |
| Binance Announcements (listagem/delisting)                                                         | Pesquisa de documentação oficial + comunidade dev                                        | **Sem API pública oficial.** O endpoint não-oficial (`bapi/composite/.../catalog/list`) usado por terceiros passou a retornar 403 — não é destinado a uso público e pode quebrar/ser bloqueado a qualquer momento. Serviços terceiros (WebSocket "cryptolisting.ws") são scraping/wrapping não oficial, fora do padrão de fonte primária verificável exigido por este repositório |
| CoinGecko `/coins/list` + `/exchanges/{id}/tickers`                                                | Já usados indiretamente (Sprint 11/13 — `TokenMarket`, tickers do payload `/coins/{id}`) | Não há endpoint de "novo listing" dedicado; mas o `TokenMarket` (UPSERT "estado atual", já implementado no Sprint 13) permitiria, em teoria, DERIVAR um evento LISTING/DELISTING comparando o conjunto de mercados entre duas Research Runs consecutivas — ver seção 7                                                                                                            |
| CoinGecko `status_updates` / "Events" endpoint legado                                              | Reconfirmação — mesmo campo já testado no Sprint 15 (vazio em 5 projetos)                | Sem mudança: continua vazio/abandonado. Nenhum endpoint "Events" dedicado e ativo foi encontrado na documentação atual da CoinGecko v3                                                                                                                                                                                                                                            |
| Snapshot.org GraphQL                                                                               | Reconfirmação do já testado no Sprint 15                                                 | Continua real e funcional, mas sem mapeamento projeto→space automático — mesma barreira documentada                                                                                                                                                                                                                                                                               |
| GitHub Releases API                                                                                | Reconfirmação do já testado no Sprint 15                                                 | Continua real e funcional (60 req/hr sem auth), mas sem mapeamento projeto→repositório automático — mesma barreira documentada                                                                                                                                                                                                                                                    |

## 4. Matriz de fontes

| Categoria (Catalyst/Risk)                                                                                                                                                                                                                                                                   | Fonte candidata                                                                                                            | Primária? | API?               | Gratuita?          | ID de projeto confiável?                                                | Data confiável                                      | Histórico                                                              | Escalabilidade                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------ | ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Risk `SECURITY_INCIDENT`                                                                                                                                                                                                                                                                    | DefiLlama `/hacks`                                                                                                         | Sim       | Sim                | Sim                | Sim (`defillamaId` exato)                                               | Sim                                                 | Sim (2011+)                                                            | Alta (1 call cobre todos)         | **EXISTENTE**                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Catalyst `FUNDING`                                                                                                                                                                                                                                                                          | `FundingRound` (campo `raises` de `/protocol/{name}`)                                                                      | Sim       | Sim (já integrada) | Sim                | Sim (`Project.id` direto)                                               | Sim                                                 | Sim                                                                    | Alta                              | **EXISTENTE**                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Risk `TOKEN_UNLOCK`                                                                                                                                                                                                                                                                         | DefiLlama Unlocks (Pro), Tokenomist.ai, Messari                                                                            | Sim       | Sim                | **Não** (paga)     | Provável (mas não testado sem key)                                      | Provável                                            | Provável                                                               | Desconhecida                      | **PRONTO, NÃO ATIVADO** (código implementado no Sprint 18, gatilho = key em Settings; paywall)                                                                                                                                                                                                                                                                                                                                                                     |
| Catalyst `TOKEN_UNLOCK`                                                                                                                                                                                                                                                                     | idem acima                                                                                                                 | —         | —                  | Não                | —                                                                       | —                                                   | —                                                                      | —                                 | **NOT_IMPLEMENTED** (classificado só como Risk no Sprint 18, não Catalyst — ver events-repository.ts)                                                                                                                                                                                                                                                                                                                                                              |
| Catalyst `PROTOCOL_UPGRADE` / `MAINNET` / `TESTNET`                                                                                                                                                                                                                                         | GitHub Releases                                                                                                            | Sim       | Sim                | Sim (60 req/hr)    | **Sim, desde o Sprint 19** — `Project.githubRepo` curado manualmente    | Sim                                                 | Sim                                                                    | Alta por chamada                  | **IMPLEMENTADO (Sprint 20)**: a Auditable Event Classification Engine (`packages/scoring-engine/src/event-classification.ts`) classifica releases reais como `MAINNET`/`TESTNET`/`PROTOCOL_UPGRADE`/etc. quando o título/corpo contém evidência textual explícita (ex.: "mainnet is now live"), regras determinísticas e conservadoras — nunca por palavra-chave isolada. Sem evidência suficiente, permanece `OTHER`. Ver `EVENT_CLASSIFICATION_ARCHITECTURE.md`. |
| Catalyst `GOVERNANCE` / Risk `GOVERNANCE`                                                                                                                                                                                                                                                   | Snapshot.org GraphQL                                                                                                       | Sim       | Sim                | Sim                | **Sim, desde o Sprint 19** — `Project.snapshotSpace` curado manualmente | Sim                                                 | Sim                                                                    | Alta por chamada                  | **IMPLEMENTADO (Sprint 19)** — Catalyst `GOVERNANCE`, confidence HIGH, status mapeado de `state`. Ver `EXTERNAL_IDENTITY_ARCHITECTURE.md`.                                                                                                                                                                                                                                                                                                                         |
| Catalyst `LISTING` / `DELISTING`                                                                                                                                                                                                                                                            | CoinGecko `/coins/{id}` tickers (já buscado)                                                                               | Sim       | Sim (já integrada) | Sim                | Sim (`coinGeckoId`, já usado por `TokenMarket`)                         | Parcial (via diff de runs, não timestamp de evento) | Só a partir de quando começarmos a rastrear (sem histórico retroativo) | Alta (zero chamada nova)          | **CANDIDATA** (derivada, ver seção 7)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Catalyst `LISTING` (anúncio oficial de exchange)                                                                                                                                                                                                                                            | Binance Announcements                                                                                                      | Sim       | **Não oficial**    | Sim (mas instável) | Não (matching de texto/nome)                                            | Sim                                                 | Não documentado                                                        | Baixa (endpoint quebra sem aviso) | **NOT_IMPLEMENTED** (sem API oficial)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Catalyst `INTEGRATION` / `PARTNERSHIP` / `TOKEN_LAUNCH` / `TOKEN_MIGRATION` / `TOKEN_BURN` / `TOKEN_BUYBACK` / `STAKING` / `REVENUE_SHARE` / `NEW_CHAIN` / `ECOSYSTEM_EXPANSION` / `INSTITUTIONAL_ADOPTION` / `PRODUCT_LAUNCH` / `REGULATORY`                                               | Nenhuma fonte estruturada e auto-identificável encontrada                                                                  | —         | —                  | —                  | —                                                                       | —                                                   | —                                                                      | —                                 | **NOT_IMPLEMENTED**                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Risk `HIGH_INFLATION` / `LOW_VALUE_CAPTURE` / `CENTRALIZATION` / `CONCENTRATION` / `LIQUIDITY` / `SMART_CONTRACT` / `BRIDGE` / `ORACLE` / `REGULATORY` / `COMPETITION` / `INCENTIVE_DEPENDENCE` / `REVENUE_CONCENTRATION` / `PROTOCOL_DEPENDENCY` / `CHAIN_DEPENDENCY` / `MARKET_STRUCTURE` | Nenhuma fonte de EVENTO externo — são naturezas estruturais/contínuas, não "fatos pontuais"                                | —         | —                  | —                  | —                                                                       | —                                                   | —                                                                      | —                                 | **NOT_IMPLEMENTED** (natureza estrutural, não evento)                                                                                                                                                                                                                                                                                                                                                                                                              |
| Risk `TVL_DECLINE` / `USER_DECLINE` / `VOLUME_DECLINE`                                                                                                                                                                                                                                      | Dado já existente (Historical Fundamental Intelligence, Sprint 14) — não é fonte externa, é métrica interna reclassificada | Interna   | Já calculada       | Sim                | Sim (`Project.id` direto)                                               | Sim                                                 | Sim                                                                    | Alta (zero chamada nova)          | **CANDIDATA** (decisão de produto, não de fonte — ver seção 7)                                                                                                                                                                                                                                                                                                                                                                                                     |

## 5. Categorias cobertas (candidatas viáveis para implementação futura)

1. **`LISTING`/`DELISTING`** (Catalyst) via diff de `TokenMarket` entre Research Runs
   consecutivas — zero chamada HTTP nova, usa dado já coletado desde o Sprint 13, identificação
   por `coinGeckoId` já confiável. Limitação: não tem "data do evento" real, só "data em que
   percebemos a mudança" (a granularidade é o intervalo entre Research Runs, não o momento real
   do anúncio da exchange) — precisa ficar explícito no `ResearchEvent.eventDate` vs.
   `retrievedAt` para não fabricar precisão que não existe.
2. **`TVL_DECLINE`/`USER_DECLINE`/`VOLUME_DECLINE`** (Risk) via reclassificação de Historical
   Fundamental Intelligence (Sprint 14) — mesma filosofia do que já foi feito com `FUNDING`
   (dado interno já existente, zero coleta nova). Não é uma "fonte" no sentido de fonte externa,
   é uma decisão de produto (transformar métrica derivada em `ResearchEvent`) — mencionada aqui
   porque tecnicamente viável e zero-custo, mas fora do escopo de "investigação de fonte externa"
   que motivou este documento.

## 6. Categorias sem fonte adequada (NOT_IMPLEMENTED)

- **`TOKEN_UNLOCK`** (Catalyst e Risk): toda fonte estruturada e correta encontrada
  (DefiLlama Pro, Tokenomist.ai, Messari) é paga. Nenhuma fonte gratuita com histórico e
  identificação confiável de projeto foi localizada. Requer aprovação explícita de custo (fora
  do escopo desta pesquisa) antes de reavaliar.
- **`PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET`**: GitHub Releases é uma API real, gratuita e com
  bom histórico, mas falta o campo `Project.githubRepo` (ou equivalente) para casar sem
  heurística — mesma barreira documentada no Sprint 15, reconfirmada aqui. Adicionar esse campo
  seria uma decisão de produto (curadoria manual por projeto) explicitamente fora do modelo de
  coleta em massa atual.
- **`GOVERNANCE`** (Catalyst e Risk): mesma barreira — Snapshot.org é real e gratuito, mas
  falta `Project.snapshotSpace`.
- **`LISTING` via anúncio oficial de exchange**: sem API pública oficial (Binance bapi não é
  destinada a uso público, retorna 403); soluções de terceiros seriam scraping não oficial —
  rejeitado por não ser fonte primária verificável e por risco de quebra sem aviso.
- **Todas as demais 12 categorias de Catalyst** (`INTEGRATION`, `PARTNERSHIP`, `TOKEN_LAUNCH`,
  `TOKEN_MIGRATION`, `TOKEN_BURN`, `TOKEN_BUYBACK`, `STAKING`, `REVENUE_SHARE`, `NEW_CHAIN`,
  `ECOSYSTEM_EXPANSION`, `INSTITUTIONAL_ADOPTION`, `PRODUCT_LAUNCH`, `REGULATORY`): nenhuma
  fonte estruturada, gratuita, com ID de projeto confiável e sem curadoria manual foi encontrada
  para nenhuma delas nesta sessão. São eventos tipicamente anunciados via blog posts/redes
  sociais/press release — exigiriam um agregador de notícias com API (todos pagos/sem key
  disponível, ver seção 3) ou curadoria manual.
- **17 das 20 categorias de Risk** (todas exceto `SECURITY_INCIDENT`, `TOKEN_UNLOCK`,
  `TVL_DECLINE`/`USER_DECLINE`/`VOLUME_DECLINE`): a maioria (`HIGH_INFLATION`,
  `LOW_VALUE_CAPTURE`, `CENTRALIZATION`, `CONCENTRATION`, `LIQUIDITY`, `INCENTIVE_DEPENDENCE`,
  `REVENUE_CONCENTRATION`, `PROTOCOL_DEPENDENCY`, `CHAIN_DEPENDENCY`, `MARKET_STRUCTURE`) é de
  natureza estrutural/contínua (um estado, não um "fato pontual com data"), então não se encaixa
  no modelo de `ResearchEvent` sem uma decisão de produto separada sobre como discretizar um
  estado contínuo em "eventos". `SMART_CONTRACT`, `BRIDGE`, `ORACLE` dependeriam de uma fonte de
  auditoria/incidente estruturada por categoria técnica — não encontrada além do que já é
  coberto por `/hacks` (que já classifica alguns incidentes tecnicamente, mas sem categoria
  separada por vetor). `COMPETITION` e `REGULATORY` são inerentemente qualitativos/editoriais —
  exigiriam uma fonte de notícia curada, não disponível gratuitamente.

## 7. Recomendação técnica final

Priorizar, em ordem, apenas fontes que não exigem curadoria manual nem custo:

1. **`LISTING`/`DELISTING` via diff de `TokenMarket`** — maior prioridade. Zero chamada HTTP
   nova (reusa dado já coletado desde o Sprint 13), identificação por `coinGeckoId` já
   confiável e testada, complexidade de implementação baixa (comparar dois snapshots UPSERT
   consecutivos). Único cuidado: documentar explicitamente que `eventDate` reflete a Research
   Run, não a data real do anúncio — não fabricar precisão.
2. **`TVL_DECLINE`/`USER_DECLINE`/`VOLUME_DECLINE` via Historical Fundamental Intelligence** —
   mesma prioridade alta por ser zero-custo e já ter os cálculos prontos (Sprint 14); mas é uma
   decisão de PRODUTO (o que conta como "declínio" o suficiente para virar `ResearchEvent`?
   qual threshold?), não puramente técnica — recomenda-se validar com o usuário antes de
   implementar, não é um caso "óbvio" como o item 1.
3. **`PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET` via GitHub Releases** — terceira prioridade,
   condicional: só vale a pena SE o usuário aceitar adicionar curadoria manual de
   `Project.githubRepo` para um subconjunto de projetos (ex.: só o Top 10 dinâmico). A API em si
   é de altíssima qualidade (estruturada, gratuita, histórico completo) — o único obstáculo é de
   produto, não técnico.
4. **`GOVERNANCE` via Snapshot.org** — mesma lógica do item 3 (API excelente, obstáculo é
   `Project.snapshotSpace` manual); priorizado depois do GitHub porque menos projetos usam
   Snapshot que têm repositório público.
5. **`TOKEN_UNLOCK`** — única fonte adequada é paga (DefiLlama Pro, US$300/mês). **Atualização
   (Sprint 18, segunda parte da sprint)**: a pedido explícito do usuário ("deixar pronto, mas
   não irei usar agora"), o código de coleta/normalização/persistência foi implementado e
   conectado ao pipeline, porém **PRONTO E NÃO ATIVADO** — gatilho único é uma
   `ApiConnection(provider="DEFILLAMA_PRO")` com secret configurado em Settings; sem isso,
   `getTokenUnlocks` nunca é chamado, zero custo é incorrido. Ver `SPRINT_17_IMPLEMENTATION_REPORT.md`
   para os detalhes de implementação. Importante: a estrutura do payload (`RawDefiLlamaEmissions`
   em `packages/defi-data/src/types.ts`) foi construída a partir de documentação pública, NUNCA
   validada contra uma resposta real (nenhuma key paga foi adquirida) — deve ser conferida contra
   um payload real no dia em que uma key for configurada, antes de confiar cegamente no resultado.

Todas as demais categorias permanecem `NOT_IMPLEMENTED` por falta de fonte real, automatizável e
sem curadoria manual — consistente com o princípio já estabelecido neste projeto: "5 categorias
bem alimentadas > 20 com dados duvidosos". Não fabricar cobertura para completar o enum.
