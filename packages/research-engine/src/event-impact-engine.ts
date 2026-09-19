import {
  classifyAcceleration,
  classifyEventImpact,
  classifyFundamentalRegime,
  classifyMetricDirection,
  compareRegimes,
  computeAggregateStats,
  computeFundamentalMomentum,
  computeMomentumDelta,
  computeWindowValues,
  detectOverlap,
  EVENT_IMPACT_MODEL_VERSION,
  summarizeCoverage,
  type AggregateStats,
  type EventImpactClassification,
  type EventImpactCoverage,
  type FundamentalRegime,
  type RegimeTransition,
  type WindowValues,
} from "@crypto-research/scoring-engine";

import { getAllEvents, getEventById } from "./events-repository";
import { toMarketCapSeries, toPriceSeries, toVolumeSeries } from "./historical-intelligence";
import { loadMarketDataSeries } from "./market-data-repository";
import {
  calculateGrowthForWindow,
  calculateGrowthWindowPair,
  getLastValueInRange,
  type TimeSeriesEntry,
} from "./metrics";
import { loadSeries } from "./snapshot-repository";

// Sprint 16 — Event Impact Analysis + Historical Event Intelligence. Camada conectada ao banco:
// carrega as séries REAIS já persistidas (TVL/Revenue/Fees desde o Sprint 3, Price/MarketCap/
// Volume desde o Sprint 12) e delega toda a matemática/classificação para
// packages/scoring-engine/src/event-impact.ts (pura, testada isoladamente). Nenhuma fonte
// externa nova (seção 31: "reutilizar os dados existentes").
//
// DECISÃO ARQUITETURAL (seção 30 do Sprint 16 — "pergunte: esse resultado precisa ser
// persistido?"): Event Impact é calculado INTEIRAMENTE SOB DEMANDA, sem tabela nova — mesma
// decisão e mesma justificativa do Sprint 14 (Historical Fundamental Intelligence): o volume de
// eventos hoje é pequeno (2 categorias reais, Sprint 15), o cálculo é O(n) sobre séries de até
// ~365 pontos, e persistir duplicaria dado já existente sem benefício de consulta real. Se o
// volume de eventos crescer o suficiente para isso pesar, cachear/persistir é a próxima
// otimização óbvia — não implementada agora por falta de evidência de necessidade (seção 29:
// "não otimizar prematuramente").
//
// NOTA (seção 6): "Volume" como métrica FUNDAMENTAL não tem série própria no sistema — TVL/
// Revenue/Fees são as únicas séries fundamentais reais (Sprint 3). O volume de mercado
// (CoinGecko, Sprint 12) já cobre "volume" na seção 7 (métricas de mercado); criar uma segunda
// série de "volume fundamental" idêntica seria redundante/fabricado. Omitido deliberadamente.

const WINDOW_DAYS = { "7d": 7, "14d": 14, "30d": 30 } as const;
type WindowKey = keyof typeof WINDOW_DAYS;

export interface EventImpactMetricWindows {
  "7d": WindowValues;
  "14d": WindowValues;
  "30d": WindowValues;
}

export interface EventImpactMomentum {
  before: number | null;
  after: number | null;
  delta: number | null;
}

export interface EventImpactSummary {
  eventId: string;
  projectId: string;
  eventType: string; // ResearchEvent.category
  eventKind: "CATALYST" | "RISK";
  eventStatus: string;
  eventDate: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  confidence: string;
  modelVersion: string;
  analysisStatus: "OK" | "INSUFFICIENT_DATA" | "NO_EVENT_DATE";
  metrics: {
    tvl: EventImpactMetricWindows;
    revenue: EventImpactMetricWindows;
    fees: EventImpactMetricWindows;
    price: EventImpactMetricWindows;
    marketCap: EventImpactMetricWindows;
    marketVolume: EventImpactMetricWindows;
  };
  momentum: EventImpactMomentum;
  regime: RegimeTransition | null;
  coverage: ReturnType<typeof summarizeCoverage>;
  classification: EventImpactClassification;
  overlappingEvents: Array<{ id: string; category: string; eventDate: string | null }>;
}

function emptyWindowValues(): WindowValues {
  return { before: null, after: null, delta: null, changePercent: null };
}

function emptyMetricWindows(): EventImpactMetricWindows {
  return { "7d": emptyWindowValues(), "14d": emptyWindowValues(), "30d": emptyWindowValues() };
}

/**
 * Calcula before/after/delta/changePercent para UMA série, nas 3 janelas (7/14/30d) ao redor de
 * `eventDate` (seção 4/5/8). Baseline = último valor dentro da janela (seção 5) — `null` quando a
 * série não tem NENHUM ponto dentro da janela (nunca extrapola).
 */
function computeMetricWindows(
  series: TimeSeriesEntry[],
  eventDate: Date,
): EventImpactMetricWindows {
  const dayMs = 24 * 60 * 60 * 1000;
  const result = emptyMetricWindows();

  for (const key of Object.keys(WINDOW_DAYS) as WindowKey[]) {
    const days = WINDOW_DAYS[key];
    const before = getLastValueInRange(
      series,
      new Date(eventDate.getTime() - days * dayMs),
      eventDate,
    );
    const after = getLastValueInRange(
      series,
      eventDate,
      new Date(eventDate.getTime() + days * dayMs),
    );
    result[key] = computeWindowValues(before, after);
  }

  return result;
}

function momentumAt(
  tvlSeries: TimeSeriesEntry[],
  revenueSeries: TimeSeriesEntry[],
  feesSeries: TimeSeriesEntry[],
  volumeSeries: TimeSeriesEntry[],
  asOf: Date,
): number | null {
  const momentum = computeFundamentalMomentum({
    tvlGrowth30d: calculateGrowthForWindow(tvlSeries, 30, asOf),
    revenueGrowth30d: calculateGrowthForWindow(revenueSeries, 30, asOf),
    feesGrowth30d: calculateGrowthForWindow(feesSeries, 30, asOf),
    volumeGrowth30d: calculateGrowthForWindow(volumeSeries, 30, asOf),
  });
  return momentum.score;
}

function regimeAt(
  tvlSeries: TimeSeriesEntry[],
  revenueSeries: TimeSeriesEntry[],
  asOf: Date,
): FundamentalRegime {
  const tvlGrowth30d = calculateGrowthForWindow(tvlSeries, 30, asOf);
  const revenueGrowth30d = calculateGrowthForWindow(revenueSeries, 30, asOf);
  const accelerationPair = calculateGrowthWindowPair(tvlSeries, 30, asOf);
  const acceleration = classifyAcceleration(
    accelerationPair.current,
    accelerationPair.previousComparable,
  );
  return classifyFundamentalRegime(tvlGrowth30d, acceleration.regime, revenueGrowth30d);
}

/**
 * Calcula o Event Impact completo de UM evento. Nunca lança — evento sem `eventDate` (ex.: um
 * evento futuro `ANNOUNCED` sem data confirmada) retorna `analysisStatus: "NO_EVENT_DATE"` com
 * tudo vazio, nunca uma exceção.
 */
export async function computeEventImpact(eventId: string): Promise<EventImpactSummary | null> {
  const event = await getEventById(eventId);
  if (!event) return null;

  const [tvlPoints, revenuePoints, feesPoints, marketDataPoints, allEvents] = await Promise.all([
    loadSeries("TVL", event.projectId),
    loadSeries("REVENUE", event.projectId),
    loadSeries("FEES", event.projectId),
    loadMarketDataSeries(event.projectId),
    getAllEvents(event.projectId),
  ]);

  const tvlSeries: TimeSeriesEntry[] = tvlPoints.map((p) => ({
    sourceTimestamp: p.sourceTimestamp,
    valueUsd: p.valueUsd,
  }));
  const revenueSeries: TimeSeriesEntry[] = revenuePoints.map((p) => ({
    sourceTimestamp: p.sourceTimestamp,
    valueUsd: p.valueUsd,
  }));
  const feesSeries: TimeSeriesEntry[] = feesPoints.map((p) => ({
    sourceTimestamp: p.sourceTimestamp,
    valueUsd: p.valueUsd,
  }));
  const priceSeries = toPriceSeries(marketDataPoints);
  const marketCapSeries = toMarketCapSeries(marketDataPoints);
  const marketVolumeSeries = toVolumeSeries(marketDataPoints);

  const baseCoverage: EventImpactCoverage = {
    tvl: tvlSeries.length > 0,
    revenue: revenueSeries.length > 0,
    fees: feesSeries.length > 0,
    market: marketCapSeries.length > 0 || priceSeries.length > 0,
    volume: marketVolumeSeries.length > 0,
    momentum: tvlSeries.length > 0 || revenueSeries.length > 0 || feesSeries.length > 0,
    regime: tvlSeries.length > 0,
  };

  if (!event.eventDate) {
    return {
      eventId: event.id,
      projectId: event.projectId,
      eventType: event.category,
      eventKind: event.kind,
      eventStatus: event.status,
      eventDate: null,
      source: event.source,
      sourceUrl: event.sourceUrl,
      publishedAt: event.publishedAt,
      retrievedAt: event.retrievedAt,
      confidence: event.confidence,
      modelVersion: EVENT_IMPACT_MODEL_VERSION,
      analysisStatus: "NO_EVENT_DATE",
      metrics: {
        tvl: emptyMetricWindows(),
        revenue: emptyMetricWindows(),
        fees: emptyMetricWindows(),
        price: emptyMetricWindows(),
        marketCap: emptyMetricWindows(),
        marketVolume: emptyMetricWindows(),
      },
      momentum: { before: null, after: null, delta: null },
      regime: null,
      coverage: summarizeCoverage({
        tvl: false,
        revenue: false,
        fees: false,
        market: false,
        volume: false,
        momentum: false,
        regime: false,
      }),
      classification: "INSUFFICIENT_DATA",
      overlappingEvents: [],
    };
  }

  const eventDate = new Date(event.eventDate);

  const metrics = {
    tvl: computeMetricWindows(tvlSeries, eventDate),
    revenue: computeMetricWindows(revenueSeries, eventDate),
    fees: computeMetricWindows(feesSeries, eventDate),
    price: computeMetricWindows(priceSeries, eventDate),
    marketCap: computeMetricWindows(marketCapSeries, eventDate),
    marketVolume: computeMetricWindows(marketVolumeSeries, eventDate),
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const momentumBefore = momentumAt(
    tvlSeries,
    revenueSeries,
    feesSeries,
    marketVolumeSeries,
    eventDate,
  );
  const momentumAfter = momentumAt(
    tvlSeries,
    revenueSeries,
    feesSeries,
    marketVolumeSeries,
    new Date(eventDate.getTime() + 30 * dayMs),
  );
  const momentum: EventImpactMomentum = {
    before: momentumBefore,
    after: momentumAfter,
    delta: computeMomentumDelta(momentumBefore, momentumAfter),
  };

  const regime = baseCoverage.regime
    ? compareRegimes(
        regimeAt(tvlSeries, revenueSeries, eventDate),
        regimeAt(tvlSeries, revenueSeries, new Date(eventDate.getTime() + 30 * dayMs)),
      )
    : null;

  // Overlap (seção 15): outros eventos do MESMO projeto cuja data cai dentro da janela pós-evento
  // de 30d sendo analisada — compromete atribuir a mudança observada a ESTE evento.
  const otherEventDates = allEvents
    .filter((e) => e.id !== event.id && e.eventDate !== null)
    .map((e) => new Date(e.eventDate!));
  const hasOverlap = detectOverlap(eventDate, 30, otherEventDates);
  const overlappingEvents = allEvents
    .filter((e) => e.id !== event.id && e.eventDate !== null)
    .filter((e) => {
      const d = new Date(e.eventDate!);
      return d.getTime() > eventDate.getTime() && d.getTime() <= eventDate.getTime() + 30 * dayMs;
    })
    .map((e) => ({ id: e.id, category: e.category, eventDate: e.eventDate }));

  const fundamentalDirection = classifyMetricDirection(metrics.tvl["30d"].changePercent);
  const marketDirection = classifyMetricDirection(metrics.marketCap["30d"].changePercent);
  const classification = classifyEventImpact({ fundamentalDirection, marketDirection, hasOverlap });

  return {
    eventId: event.id,
    projectId: event.projectId,
    eventType: event.category,
    eventKind: event.kind,
    eventStatus: event.status,
    eventDate: event.eventDate,
    source: event.source,
    sourceUrl: event.sourceUrl,
    publishedAt: event.publishedAt,
    retrievedAt: event.retrievedAt,
    confidence: event.confidence,
    modelVersion: EVENT_IMPACT_MODEL_VERSION,
    analysisStatus: baseCoverage.tvl || baseCoverage.market ? "OK" : "INSUFFICIENT_DATA",
    metrics,
    momentum,
    regime,
    coverage: summarizeCoverage(baseCoverage),
    classification,
    overlappingEvents,
  };
}

export async function getEventImpactsForProject(projectId: string): Promise<EventImpactSummary[]> {
  const events = await getAllEvents(projectId);
  const impacts = await Promise.all(events.map((e) => computeEventImpact(e.id)));
  return impacts.filter((i): i is EventImpactSummary => i !== null);
}

// ------------------------------------------------------------------------------------------
// Cross-event aggregation (seção 21/22) — agrega TODOS os Event Impacts de UMA categoria
// (FUNDING ou SECURITY_INCIDENT) com cobertura suficiente. Nunca usado como previsão — só
// estatística descritiva sobre a amostra real observada.
// ------------------------------------------------------------------------------------------

export interface EventCategoryAggregation {
  category: string;
  sampleSize: number;
  tvlChange30d: AggregateStats & { insufficientSample: boolean };
  revenueChange30d: AggregateStats & { insufficientSample: boolean };
  priceChange30d: AggregateStats & { insufficientSample: boolean };
  marketCapChange30d: AggregateStats & { insufficientSample: boolean };
  momentumDelta: AggregateStats & { insufficientSample: boolean };
}

function collect(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null);
}

export function aggregateEventImpactsByCategory(
  category: string,
  impacts: EventImpactSummary[],
): EventCategoryAggregation {
  const relevant = impacts.filter((i) => i.eventType === category && i.analysisStatus === "OK");

  return {
    category,
    sampleSize: relevant.length,
    tvlChange30d: computeAggregateStats(
      collect(relevant.map((i) => i.metrics.tvl["30d"].changePercent)),
    ),
    revenueChange30d: computeAggregateStats(
      collect(relevant.map((i) => i.metrics.revenue["30d"].changePercent)),
    ),
    priceChange30d: computeAggregateStats(
      collect(relevant.map((i) => i.metrics.price["30d"].changePercent)),
    ),
    marketCapChange30d: computeAggregateStats(
      collect(relevant.map((i) => i.metrics.marketCap["30d"].changePercent)),
    ),
    momentumDelta: computeAggregateStats(collect(relevant.map((i) => i.momentum.delta))),
  };
}
