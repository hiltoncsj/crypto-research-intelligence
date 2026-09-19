# Catalysts & Risks Architecture

Sprint 15. Documenta a investigação de fontes e a arquitetura resultante — leia isto antes de
adicionar uma nova fonte de Catalyst/Risk.

**Atualização (Sprint 16)**: os eventos reais documentados aqui (`FUNDING`/`SECURITY_INCIDENT`)
agora alimentam a camada de Event Impact Analysis (`packages/research-engine/src/
event-impact-engine.ts`) — cada evento novo integrado aqui automaticamente ganha análise de
antes/depois sobre TVL/Revenue/Fees/Price/Market Cap/Volume, sem trabalho adicional. Ver
`SPRINT_16_IMPLEMENTATION_REPORT.md`.

## Regra central

Não inventar dados. Uma fonte só é integrada se: (1) for real e verificável ao vivo; (2) permitir
casar o evento a um `Project` existente **sem inferência/heurística** (por um ID já conhecido,
não por matching de nome); (3) não exigir curadoria manual por projeto.

## Source Investigation

| Fonte                                                       | Tipo                               | API                                                                                                                                                                             | Auth                        | Histórico            | Custo                      | Escalabilidade                                             | Decisão                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------- | -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DefiLlama `/hacks`                                          | Primária (agregador)               | Sim, real, testada ao vivo (`GET https://api.llama.fi/hacks` → 200, 1273 incidentes)                                                                                            | Nenhuma                     | Sim, desde 2011+     | Grátis                     | Alta — 1 chamada cobre TODOS os protocolos, cache-friendly | **IMPLEMENTADO** — casado por `defillamaId` exato (mesmo espaço de IDs de `Project.defillamaId`, confirmado casando "Compound V2" → id "114" contra `/protocols`)                                                                                                                                                                             |
| `FundingRound` (já persistido, Sprint 6)                    | Primária (DefiLlama `raises`)      | Já integrada                                                                                                                                                                    | Nenhuma                     | Sim                  | Grátis (zero chamada nova) | Alta                                                       | **IMPLEMENTADO** — reclassificado como Catalyst `FUNDING`, nenhuma coleta nova                                                                                                                                                                                                                                                                |
| CoinGecko `status_updates`                                  | Primária (self-reported)           | Sim, campo do payload já buscado (`GET /coins/{id}?status_updates=true`)                                                                                                        | Nenhuma (endpoint gratuito) | N/A                  | Grátis                     | Alta (zero chamada extra)                                  | **REJEITADO** — testado em 5 projetos reais (bitcoin, uniswap, aave, lido-dao, compound-governance-token), sempre `status_updates: []`. Campo parece abandonado/deprecated pela fonte.                                                                                                                                                        |
| GitHub Releases                                             | Primária                           | Sim, real, testada ao vivo (`GET api.github.com/repos/aave/aave-v3-core/releases` → 200, dados reais)                                                                           | Não (60 req/hr sem auth)    | Sim                  | Grátis                     | Alta por chamada, mas...                                   | **NÃO IMPLEMENTADO** — Reason: no suitable automatic project→repository mapping available. Nenhum campo hoje (CoinGecko nem DefiLlama) informa o repositório GitHub de um projeto; inferir por nome seria heurística não confiável, e mapear manualmente por projeto seria curadoria manual, fora do modelo de coleta em massa deste sistema. |
| Snapshot.org (governance)                                   | Primária                           | Sim, real, testada ao vivo (GraphQL `hub.snapshot.org/graphql`, proposals reais confirmadas)                                                                                    | Nenhuma                     | Sim                  | Grátis                     | Alta por chamada, mas...                                   | **NÃO IMPLEMENTADO** — mesmo motivo do GitHub: exige o "space" de cada projeto, sem mapeamento automático disponível hoje.                                                                                                                                                                                                                    |
| CryptoPanic                                                 | Secundária (agregador de notícias) | Retornou HTTP 403 sem API key (testado ao vivo)                                                                                                                                 | Exige API key/cadastro      | Desconhecido sem key | Desconhecido               | Desconhecida                                               | **REJEITADO** — sem acesso sem key, não obtida nesta sessão.                                                                                                                                                                                                                                                                                  |
| CoinDesk / The Block / Decrypt / Blockworks / Cointelegraph | Secundária                         | Nenhuma delas expõe API pública gratuita sem cadastro/key (conhecimento consolidado do setor, não testado individualmente por não haver endpoint gratuito documentado a testar) | Exige key/parceria          | N/A                  | Desconhecido               | N/A                                                        | **REJEITADO** — sem fonte acessível nesta sessão.                                                                                                                                                                                                                                                                                             |
| Messari                                                     | Secundária/dados estruturados      | Maior parte requer API key paga                                                                                                                                                 | Exige key                   | N/A                  | Pago (maior parte)         | N/A                                                        | **REJEITADO** — sem key disponível.                                                                                                                                                                                                                                                                                                           |

## O que isso significa na prática

- **Risks hoje = só `SECURITY_INCIDENT`** (incidentes de segurança reais, históricos, via
  DefiLlama `/hacks`). As outras 20 categorias do enum `ResearchEventCategory` (TOKEN_UNLOCK,
  HIGH_INFLATION, CENTRALIZATION, LIQUIDITY, SMART_CONTRACT, BRIDGE, ORACLE, GOVERNANCE,
  REGULATORY, COMPETITION, INCENTIVE_DEPENDENCE, REVENUE_CONCENTRATION, TVL_DECLINE,
  USER_DECLINE, VOLUME_DECLINE, PROTOCOL_DEPENDENCY, CHAIN_DEPENDENCY, MARKET_STRUCTURE, OTHER)
  existem no schema (taxonomia completa, seção 2 do prompt do Sprint 15) mas **nunca são
  populadas hoje** — sem fonte real conectada. `TVL_DECLINE`/`USER_DECLINE`/`VOLUME_DECLINE`, em
  particular, PODERIAM ser derivadas dos dados já existentes (Historical Fundamental
  Intelligence, Sprint 14) em um sprint futuro — não implementado aqui porque o foco desta sprint
  foi encontrar fontes de EVENTO (fato externo), não reclassificar métricas internas como "risco"
  (isso seria uma decisão de produto separada, fora do escopo desta investigação).
- **Catalysts hoje = só `FUNDING`** (rodadas de captação). As outras 20 categorias
  (MAINNET, TESTNET, PROTOCOL_UPGRADE, GOVERNANCE, INTEGRATION, PARTNERSHIP, LISTING, DELISTING,
  TOKEN_LAUNCH, TOKEN_MIGRATION, TOKEN_UNLOCK, TOKEN_BURN, TOKEN_BUYBACK, STAKING, REVENUE_SHARE,
  NEW_CHAIN, ECOSYSTEM_EXPANSION, INSTITUTIONAL_ADOPTION, PRODUCT_LAUNCH, REGULATORY, OTHER)
  existem no schema, mas sem fonte real.

## Como adicionar uma nova fonte no futuro

1. Testar a API ao vivo — nunca assumir que existe ou que funciona como documentado.
2. Confirmar que existe um ID/campo JÁ conhecido pelo sistema (`defillamaId`, `coinGeckoId`, ou
   equivalente) que permite casar o evento ao `Project` sem inferência. Se a única forma de casar
   for por nome/heurística, **não implementar** — isso é fabricar uma atribuição, não uma
   inferência confiável.
3. Se a fonte exigir um identificador que o sistema não tem (repo do GitHub, space do Snapshot,
   etc.), avaliar se vale a pena adicionar um campo de curadoria manual em `Project` (decisão de
   produto explícita, fora do escopo de uma integração "automática") antes de integrar.
4. Seguir o padrão de `events-repository.ts`: `persist*` (idempotente, upsert por
   `(projectId, source, sourceId)`) + `collect*` (nunca lança, sempre loga).
5. Buscar a fonte **uma vez por Research Run** quando ela cobrir múltiplos projetos numa única
   chamada (como `/hacks`) — nunca uma chamada por projeto para uma fonte cross-protocolo.

## Metodologia de Confidence

| Fonte                                                                   | Confidence |
| ----------------------------------------------------------------------- | ---------- |
| DefiLlama `/hacks` (dado estruturado, agregador primário de incidentes) | HIGH       |
| `FundingRound` (dado estruturado, já vem de `raises` da DefiLlama)      | HIGH       |

Não há hoje nenhuma fonte MEDIUM/LOW implementada — ambas as fontes ativas são estruturadas e
primárias. A metodologia (seção 13 do Sprint 15) reserva MEDIUM para fontes secundárias de
qualidade (grandes veículos de notícia) e LOW/ignorar para posts não verificados em redes
sociais — nenhuma dessas classes está integrada hoje.

## Deduplicação

Unique constraint `(projectId, source, sourceId)`. `sourceId` é sempre construído de forma
estável pelo coletor — nunca aleatório, nunca por nome (evitaria colisões de grafia). Para
`FundingRound`, `sourceId = FundingRound.id` (já estável). Para incidentes de segurança,
`sourceId = sha256(defillamaId|eventDate|name)` (a API de hacks não fornece um ID próprio).

## Histórico de status

`ResearchEvent.status` pode mudar (ex.: `ANNOUNCED` → `COMPLETED`), mas isso não é versionado
linha a linha nesta sprint — decisão documentada no schema: "versionar cada transição de status
não se justifica ainda, sem nenhum consumidor real que precise disso". Reavaliar se um caso de
uso concreto exigir o histórico completo de transições.
