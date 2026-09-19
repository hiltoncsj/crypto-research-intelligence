// Sprint 2 (Fase 12): modelo normalizado, independente do formato específico da resposta
// da API DefiLlama. O pipeline completo de métricas/scoring (Sprint 3+) consome isto, não
// o formato bruto do provider.

export interface NormalizedProtocolSummary {
  source: "DEFILLAMA";
  retrievedAt: string; // ISO timestamp da coleta
  defillamaId: string;
  name: string;
  slug: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvlUsd: number | null;
  // Sprint 11 (integração CoinGecko): vem do campo `gecko_id` que a própria DefiLlama já
  // devolve — vínculo autoritativo, nunca inferido por nome/símbolo. `null` quando a DefiLlama
  // não conhece o gecko_id daquele protocolo.
  coinGeckoId: string | null;
}

// Formato bruto (parcial) retornado por GET /protocols e GET /protocol/{name} — apenas os
// campos que de fato usamos, para não acoplar o código a todo o schema do DefiLlama.
//
// Sprint 3 (Fase 4): GET /protocol/{name} também retorna `tvl: Array<{date, totalLiquidityUSD}>`
// — uma série histórica diária (`date` em unix seconds), em vez de um número só. É essa série
// que alimenta os tvl_snapshots (em vez de fazer polling diário do zero, aproveitamos o
// histórico que a própria API já devolve numa única chamada).
export interface RawDefiLlamaProtocol {
  id: string;
  name: string;
  slug?: string;
  symbol?: string | null;
  category?: string | null;
  chains?: string[];
  tvl?: number | RawDefiLlamaTvlPoint[] | null;
  // Sprint 6: campos adicionais do MESMO payload de /protocol/{name} (já buscado por
  // getProtocolTvlHistory) — reutilizados sem chamada HTTP extra (Fase 18 do Sprint 6:
  // "evitar chamadas externas duplicadas"). `mcap` é um número real calculado pela DefiLlama
  // (preço via gecko_id × supply reportado por ela); `raises` é a lista de rounds de captação
  // conhecidos pela DefiLlama para o protocolo — confirmado por chamada real: GET
  // /protocol/aave retorna `raises` com date/round/amount/leadInvestors/otherInvestors/
  // valuation. Isto está disponível de graça; os endpoints dedicados /raises e /emissions/*
  // exigem plano pago (retornam HTTP 402) — por isso Token Unlocks/Emissions e supply/FDV
  // continuam UNAVAILABLE nesta sprint (ver README de tokenomics-score).
  address?: string | null;
  mcap?: number | null;
  raises?: RawDefiLlamaRaise[] | null;
  // Sprint 11: id do CoinGecko para este protocolo, quando a DefiLlama o conhece — vínculo
  // autoritativo da própria fonte (nunca inferido por nós), usado para enriquecer FDV/supplies
  // via CoinGecko sem heurística de matching por nome/símbolo.
  gecko_id?: string | null;
}

/** Sprint 6: um round de captação, exatamente como a DefiLlama devolve embutido em
 * /protocol/{name} (`amount` vem em MILHÕES de USD, não em USD — confirmado observando dados
 * reais: Aave "Strategic" round = 25, correspondendo a $25M). */
export interface RawDefiLlamaRaise {
  date: number; // unix seconds
  round?: string | null;
  amount?: number | null; // em milhões de USD
  leadInvestors?: string[];
  otherInvestors?: string[];
  valuation?: number | null;
  source?: string | null;
}

export interface RawDefiLlamaTvlPoint {
  date: number; // unix timestamp em segundos (granularidade diária)
  totalLiquidityUSD: number;
}

/** Um ponto normalizado de série histórica (TVL, Fees ou Revenue). */
export interface NormalizedTimeSeriesPoint {
  /** Timestamp original da fonte, em ISO 8601, granularidade diária. */
  sourceTimestamp: string;
  valueUsd: number;
}

export interface NormalizedProtocolTvlHistory {
  source: "DEFILLAMA";
  retrievedAt: string;
  defillamaId: string;
  slug: string;
  points: NormalizedTimeSeriesPoint[];
}

// GET /summary/fees/{protocol}[?dataType=dailyRevenue] — mesma estrutura de resposta para
// Fees (default) e Revenue (dataType=dailyRevenue); DefiLlama trata os dois como "summary de
// fees" com um parâmetro de query diferenciando a métrica. `totalDataChart` é um array de
// tuplas `[unixSeconds, valueUsd]` (não objetos, ao contrário de /protocol/{name}).
export interface RawDefiLlamaFeesSummary {
  totalDataChart?: Array<[number, number]>;
}

export interface NormalizedProtocolMetricHistory {
  source: "DEFILLAMA";
  retrievedAt: string;
  slug: string;
  metric: "FEES" | "REVENUE";
  points: NormalizedTimeSeriesPoint[];
}

// Sprint 6 (Parte 2): resumo do token vindo da DefiLlama — `marketCapUsd` é real (`mcap`).
// circulatingSupply/totalSupply/maxSupply/fdvUsd NÃO existem aqui de propósito: a DefiLlama
// não os expõe nos endpoints gratuitos — ver `NormalizedTokenSupply` abaixo (Sprint 11,
// integração CoinGecko) para esses campos, persistidos separadamente.
export interface NormalizedTokenSummary {
  source: "DEFILLAMA";
  retrievedAt: string;
  defillamaId: string;
  slug: string;
  symbol: string | null;
  contractAddress: string | null;
  marketCapUsd: number | null;
}

// Sprint 11 (integração CoinGecko): formato bruto (parcial) de GET /coins/{id} — só os campos
// que de fato usamos. `market_data` pode vir ausente/incompleto para tokens pouco cobertos
// pela CoinGecko; cada subcampo é tratado como opcional.
//
// Sprint 13 (Parte B — Perfil + Mercados): a MESMA resposta (nenhuma chamada HTTP extra) também
// carrega `description`/`categories`/`platforms`/`links` (perfil do projeto) e, com
// `tickers=true` na query, `tickers` (mercados reais onde o token é negociado) — confirmado por
// chamada real: GET /coins/aave?tickers=true devolveu 100 tickers reais com
// exchange/par/volume/URL de negociação.
export interface RawCoinGeckoMarketData {
  id: string;
  market_cap_rank?: number | null;
  market_data?: {
    fully_diluted_valuation?: { usd?: number | null } | null;
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
  } | null;
  description?: { en?: string | null } | null;
  categories?: (string | null)[] | null;
  // Chaves são nomes de chain (ex.: "ethereum", "arbitrum-one"); a chave "" (root, contrato
  // nativo/sem endereço EVM) é ignorada na normalização — não é uma blockchain.
  platforms?: Record<string, string | null> | null;
  links?: { homepage?: (string | null)[] | null } | null;
  tickers?: RawCoinGeckoTicker[] | null;
}

// Sprint 13: um ticker de mercado, exatamente como a CoinGecko devolve embutido em
// GET /coins/{id}?tickers=true. `market.identifier` é o id estável da exchange na CoinGecko
// (usado como `exchangeId`); `converted_volume`/`converted_last` em USD já vêm calculados pela
// própria fonte — nunca convertidos por nós.
export interface RawCoinGeckoTicker {
  base?: string | null;
  target?: string | null;
  market?: { name?: string | null; identifier?: string | null } | null;
  trade_url?: string | null;
  timestamp?: string | null;
  converted_volume?: { usd?: number | null } | null;
  converted_last?: { usd?: number | null } | null;
}

// Sprint 13 (Perfil do Projeto): campos factuais vindos da CoinGecko — descrição curta (texto da
// própria fonte, nunca reescrita/inventada), categorias, blockchains onde o token existe
// (multi-chain preservado, seção 19), homepage. Cada campo individualmente `null` quando ausente
// — nunca inferido.
export interface NormalizedProjectProfile {
  source: "COINGECKO";
  retrievedAt: string;
  coinGeckoId: string;
  descriptionEn: string | null;
  categories: string[];
  platforms: string[];
  homepageUrl: string | null;
}

// Sprint 13 (Onde o Token é Negociado): um mercado real observado na última coleta. `marketType`
// é sempre "SPOT" nesta sprint (CoinGecko `/coins/{id}` só lista mercados spot; perpetuals ficam
// fora de escopo, seção 22 do prompt do sprint: "Perpetual, se futuramente suportado").
export interface NormalizedMarketTicker {
  source: "COINGECKO";
  retrievedAt: string;
  coinGeckoId: string;
  exchangeId: string;
  exchangeName: string;
  baseSymbol: string;
  targetSymbol: string;
  marketType: "SPOT";
  tradeUrl: string | null;
  volumeUsd: number | null;
  lastPriceUsd: number | null;
  sourceTimestamp: string;
}

// Sprint 11: campos que a DefiLlama gratuita não expõe, preenchidos via CoinGecko quando
// `Project.coinGeckoId` é conhecido. Nunca inclui `marketCapUsd`/`symbol` — esses continuam
// vindo exclusivamente da DefiLlama (packages/research-engine/src/funding-repository.ts
// persiste os dois em funções separadas, um nunca sobrescreve o outro).
export interface NormalizedTokenSupply {
  source: "COINGECKO";
  retrievedAt: string;
  coinGeckoId: string;
  fdvUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  marketCapRank: number | null;
}

// Sprint 12 (Historical Market Data): formato bruto (parcial) de GET /coins/{id}/market_chart —
// três arrays paralelos de tuplas [unixMilliseconds, valor], cada um podendo estar ausente
// individualmente (a CoinGecko omite um array inteiro quando não tem aquele dado para o
// token, em vez de preencher com null ponto a ponto).
export interface RawCoinGeckoMarketChart {
  prices?: Array<[number, number]>;
  market_caps?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
}

// Sprint 12: um ponto de série histórica de mercado. Granularidade diária (ver
// coingecko-client.ts: sempre solicitamos `days` > 90, único jeito de garantir granularidade
// diária automática da CoinGecko sem depender do parâmetro `interval`, que exige plano Enterprise
// pago). Cada campo é `null` individualmente quando a fonte não devolveu aquele array para o
// timestamp — nunca 0, nunca inventado. Não há OHLC aqui: `market_chart` só devolve um preço por
// ponto (o "close" do intervalo, segundo a própria documentação da CoinGecko), não um candle
// completo — inventar open/high/low a partir de um único preço seria fabricar dado.
export interface NormalizedMarketDataPoint {
  source: "COINGECKO";
  retrievedAt: string;
  coinGeckoId: string;
  sourceTimestamp: string; // ISO 8601, granularidade diária (truncada para meia-noite UTC)
  priceUsd: number | null;
  marketCapUsd: number | null;
  volumeUsd: number | null;
}

// Sprint 6 (Parte 9): um round de captação normalizado — `amountUsd` já convertido de milhões
// para USD. `roundLabel` preserva o texto original da DefiLlama ("Private token sale", etc.)
// porque não mapeia 1:1 para o enum sugerido pela spec (Parte 9); `roundType` é a melhor
// tentativa de classificação nesse enum, com OTHER como fallback honesto.
export interface NormalizedFundingRound {
  source: "DEFILLAMA";
  retrievedAt: string;
  slug: string;
  date: string; // ISO
  roundLabel: string | null;
  amountUsd: number | null;
  leadInvestors: string[];
  otherInvestors: string[];
  valuationUsd: number | null;
}

// Sprint 15 (Catalysts + Risks): formato bruto (parcial) de GET /hacks — confirmado por chamada
// real (1273 incidentes reais). `defillamaId`, quando presente, é o MESMO id de
// `RawDefiLlamaProtocol.id`/`Project.defillamaId` (confirmado casando "Compound V2" -> id "114"
// contra /protocols) — mas nem todo incidente tem esse campo preenchido pela fonte.
export interface RawDefiLlamaHack {
  date: number; // unix seconds
  name: string;
  classification?: string | null;
  technique?: string | null;
  amount?: number | null; // USD
  chain?: string[] | null;
  source?: string | null;
  defillamaId?: string | null;
}

// Sprint 15: um incidente de segurança normalizado, casado por `defillamaId` — NUNCA por nome
// (evitaria colisões/atribuição incorreta entre protocolos com nomes parecidos, ex.: "Compound"
// vs "Compound V2" vs "Compound V3" são entidades DIFERENTES na DefiLlama). Incidentes sem
// `defillamaId` na fonte são descartados pelo normalizador (não têm como ser ligados a um
// `Project` sem inferência/heurística de nome, o que este projeto trata como "inventar dado").
export interface NormalizedSecurityIncident {
  source: "DEFILLAMA";
  retrievedAt: string;
  defillamaId: string;
  name: string;
  eventDate: string; // ISO
  classification: string | null;
  technique: string | null;
  amountUsd: number | null;
  chains: string[];
  sourceUrl: string | null;
}

// Sprint 18 (Catalyst/Risk Source Audit): TOKEN_UNLOCK — deixado PRONTO, mas NÃO ativado
// (ver CATALYSTS_RISKS_SOURCE_AUDIT.md item "TOKEN_UNLOCK"). A única fonte estruturada real
// encontrada é a DefiLlama Pro API (pro-api.llama.fi, US$300/mês), documentada publicamente
// como `GET /{API_KEY}/api/emissions/{protocol}` — mas NUNCA testada ao vivo neste
// repositório (nenhuma key paga foi adquirida, consistente com a política do projeto de nunca
// pagar por uma fonte sem aprovação explícita do usuário). Este tipo e o normalizador
// correspondente (`normalizeTokenUnlocks`) são construídos a partir da estrutura documentada
// publicamente, não de uma resposta real observada — por isso são deliberadamente TOLERANTES
// (campos ausentes/tipos inesperados são descartados item a item, nunca lançam) e devem ser
// VALIDADOS contra um payload real antes de confiar cegamente no resultado, no dia em que uma
// API key for configurada em Settings.
export interface RawDefiLlamaUnlockEvent {
  timestamp?: number | null; // unix seconds, documentado
  noOfTokens?: number[] | number | null; // formato documentado varia (array por categoria ou total)
  category?: string | null;
  description?: string | null;
}

export interface RawDefiLlamaEmissions {
  events?: RawDefiLlamaUnlockEvent[] | null;
  documentedAllocation?: unknown;
}

export interface NormalizedTokenUnlockEvent {
  source: "DEFILLAMA_PRO";
  retrievedAt: string;
  defillamaId: string;
  eventDate: string; // ISO
  tokenAmount: number | null;
  category: string | null;
  description: string | null;
}

// Sprint 19 (External Identity Mapping & Governance Intelligence): GitHub Releases — confirmado
// ao vivo (GET /repos/aave/aave-v3-core/releases, 2026-09-19: id, tag_name, name, html_url,
// draft, prerelease, created_at, published_at, body todos presentes). Ao contrário de
// TOKEN_UNLOCK, esta estrutura foi VALIDADA contra uma resposta real, não só documentação.
export interface RawGithubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  body: string | null;
}

// Categoria NUNCA é inferida aqui (ver Parte 4 do documento de especificação do Sprint 19) —
// normalizeGithubReleases sempre marca `category: null`, deixando a decisão para o coletor
// (Risk/events-repository) mapear para `OTHER` sempre, de propósito conservador: um release
// pode ser qualquer coisa (patch, hotfix, doc release) — classificar como PROTOCOL_UPGRADE/
// MAINNET sem evidência textual explícita seria "inventar significado sem evidência".
export interface NormalizedGithubRelease {
  source: "GITHUB";
  retrievedAt: string;
  githubRepo: string; // "owner/repo", já validado antes de chegar aqui
  releaseId: number; // sourceId determinístico — nunca aleatório
  tagName: string;
  title: string;
  url: string;
  eventDate: string; // ISO — published_at, com fallback para created_at (ver normalizador)
  publishedAt: string | null; // null quando o release nunca foi "published" (só draft)
  draft: boolean;
  prerelease: boolean;
}

// Sprint 19: Snapshot GraphQL — confirmado ao vivo (POST hub.snapshot.org/graphql, space
// "ens.eth", 2026-09-19: id, title, body, choices, state, start, end, created, author, snapshot,
// link, space{id,name} todos presentes; state observado = "closed"; "active"/"pending" são
// documentados oficialmente para o mesmo campo).
export interface RawSnapshotProposal {
  id: string;
  title: string;
  body: string | null;
  state: string; // "pending" | "active" | "closed", conforme observado/documentado
  start: number; // unix seconds
  end: number; // unix seconds
  created: number; // unix seconds
  author: string | null;
  link: string | null;
  space?: { id: string; name?: string | null } | null;
}

export interface NormalizedSnapshotProposal {
  source: "SNAPSHOT";
  retrievedAt: string;
  snapshotSpace: string;
  proposalId: string; // sourceId determinístico — já um hash estável da própria fonte
  title: string;
  url: string | null;
  eventDate: string; // ISO — `created` (data de criação da proposta, sempre presente)
  startAt: string; // ISO — `start` (início da votação)
  endAt: string; // ISO — `end` (fim da votação)
  state: string; // repassado cru — o normalizador NUNCA inventa um estado
}
