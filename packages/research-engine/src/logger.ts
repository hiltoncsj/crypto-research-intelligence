// Sprint 3 (Fase 20): logging estruturado (JSON) para os eventos do pipeline. Nunca loga
// secrets — só slugs, contadores e mensagens de erro já sanitizadas (nunca payload bruto).

export type PipelineEvent =
  | "pipeline_started"
  | "project_processing_started"
  | "project_processed"
  | "snapshot_created"
  | "snapshot_skipped"
  | "validation_failed"
  | "metrics_calculated"
  | "pipeline_completed"
  // Sprint 11 (integração CoinGecko): sucesso/falha do enriquecimento de FDV/supplies —
  // nunca aborta o pipeline, só registra o resultado.
  | "token_supply_enriched";

export function logPipelineEvent(event: PipelineEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 5 (Fase 30): eventos do Scoring Engine. Nunca inclui secrets — só researchRunId,
// projectId, modelVersion e duração/erro.
export type ScoringEvent =
  | "scoring.started"
  | "scoring.project_started"
  | "scoring.project_completed"
  | "scoring.project_failed"
  | "scoring.completed"
  // Sprint 6 (Parte 30): eventos equivalentes para Tokenomics e Institutional Capital Score.
  | "scoring.tokenomics_started"
  | "scoring.tokenomics_completed"
  | "scoring.tokenomics_failed"
  | "scoring.capital_started"
  | "scoring.capital_completed"
  | "scoring.capital_failed";

export function logScoringEvent(event: ScoringEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 7 (seção 43 do Pull System): mesmo padrão de logging estruturado — nenhum Event Bus
// novo foi criado, "reutilizar o que existe" também vale para observabilidade.
import type { KanbanEvent } from "@crypto-research/shared";

export function logKanbanEvent(event: KanbanEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 8 (Project Discovery + Top 10 Selection): mesmo padrão — nenhum Event Bus novo.
export type DiscoveryEvent = "discovery.started" | "discovery.failed" | "discovery.completed";
export type SelectionEvent = "selection.started" | "selection.completed";

export function logDiscoveryEvent(event: DiscoveryEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export function logSelectionEvent(event: SelectionEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 9 (Research History + Diff Engine + Project Report): mesmo padrão — nenhum Event Bus
// novo. Nunca loga secrets — só slug/projectId/researchRunId, contadores e modelVersion.
export type HistoryEvent = "history.requested" | "history.completed" | "history.failed";
export type DiffEvent = "diff.requested" | "diff.completed" | "diff.failed";
export type ReportEvent =
  "report.requested" | "report.completed" | "report.failed" | "report.downloaded";

export function logHistoryEvent(event: HistoryEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export function logDiffEvent(event: DiffEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export function logReportEvent(event: ReportEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 12 (Historical Market Data): mesmo padrão — nenhum Event Bus novo. Nunca loga a API key
// da CoinGecko nem qualquer header de autenticação, só project/source/operation/contadores/erro
// já classificado (nunca o payload bruto da resposta).
export type MarketDataEvent =
  "market_data.skipped_no_coingecko_id" | "market_data.collected" | "market_data.failed";

export function logMarketDataEvent(
  event: MarketDataEvent,
  data: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 13 (Parte B — Perfil + Mercados): mesmo padrão — nenhum Event Bus novo, nenhum secret.
export type ProfileEvent =
  "profile.skipped_no_coingecko_id" | "profile.unchanged" | "profile.updated" | "profile.failed";

export function logProfileEvent(event: ProfileEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export type TokenMarketEvent =
  "token_markets.skipped_no_coingecko_id" | "token_markets.collected" | "token_markets.failed";

export function logTokenMarketEvent(
  event: TokenMarketEvent,
  data: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 14 (Historical Fundamental Intelligence): mesmo padrão — nenhum Event Bus novo.
export type HistoricalIntelligenceEvent =
  | "historical_intelligence.requested"
  | "historical_intelligence.completed"
  | "historical_intelligence.failed";

export function logHistoricalIntelligenceEvent(
  event: HistoricalIntelligenceEvent,
  data: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// Sprint 15 (Catalysts + Risks): mesmo padrão — nenhum Event Bus novo, nenhum secret.
export type EventsEvent =
  | "events.security_incidents_collected"
  | "events.security_incidents_failed"
  | "events.funding_catalysts_collected"
  | "events.funding_catalysts_failed"
  | "events.hacks_fetch_failed";

export function logEventsEvent(event: EventsEvent, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}
