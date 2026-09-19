"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  {
    href: "/dashboard/research",
    label: "Execuções de Pesquisa",
    desc: "Disparar coleta e acompanhar execuções",
  },
  {
    href: "/dashboard/rankings",
    label: "Ranking Fundamental",
    desc: "Projetos ordenados por força fundamental",
  },
  { href: "/dashboard/kanban", label: "Kanban", desc: "Sistema Pull operacional do pipeline" },
  { href: "/dashboard/settings", label: "Configurações", desc: "APIs e Fontes de Dados" },
];

// Sprint 14 (Parte 18-21) — Home real: cards com dados reais de
// GET /api/dashboard/fundamental (research-engine/dashboard-intelligence.ts), substituindo o
// menu puramente estático. Mantém o menu de navegação original (LINKS acima) intocado —
// "preservar o que já funciona" — só adiciona as seções novas abaixo dele.

interface ResearchOverview {
  projectsResearched: number;
  researchRunsTotal: number;
  lastResearchRun: {
    id: string;
    status: string;
    mode: string;
    startedAt: string | null;
    finishedAt: string | null;
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
  } | null;
}

interface DataHealthOverview {
  projectsResearched: number;
  tvlCoverage: { count: number; percentage: number };
  marketDataCoverage: { count: number; percentage: number };
  revenueCoverage: { count: number; percentage: number };
  feesCoverage: { count: number; percentage: number };
  lastSuccessfulCollection: string | null;
  lastFailedCollection: string | null;
}

interface MovementEntry {
  slug: string;
  name: string;
  fundamentalMomentum: number | null;
  tvlGrowth30d: number | "N/A";
  revenueGrowth30d: number | "N/A";
  marketCapGrowth30d: number | "N/A";
  divergence: string;
}

interface DivergenceOverview {
  entries: Array<{
    slug: string;
    name: string;
    classification: string;
    tvlGrowth90d: number | "N/A";
    marketCapGrowth90d: number | "N/A";
  }>;
  counts: Record<string, number>;
}

interface CatalystsOverview {
  upcoming: number;
  recent: number;
  completed: number;
}

interface RisksOverview {
  identified: number;
  withHistoricalEvidence: number;
}

interface RecentEventEntry {
  slug: string;
  name: string;
  eventType: string;
  eventKind: "CATALYST" | "RISK";
  eventDate: string | null;
  classification: string;
  fundamentalChange30d: number | "N/D";
  marketChange30d: number | "N/D";
  coveragePercent: number;
}

interface EventCategoryAggregation {
  category: string;
  sampleSize: number;
  tvlChange30d: { mean: number | null; median: number | null; insufficientSample: boolean };
  priceChange30d: { mean: number | null; median: number | null; insufficientSample: boolean };
}

interface EventIntelligenceOverview {
  recentEvents: RecentEventEntry[];
  analyzedCount: number;
  insufficientDataCount: number;
  aggregations: EventCategoryAggregation[];
}

interface DashboardFundamentalView {
  research: ResearchOverview;
  dataHealth: DataHealthOverview;
  movement: MovementEntry[];
  divergence: DivergenceOverview;
  catalysts: CatalystsOverview;
  risks: RisksOverview;
  eventIntelligence: EventIntelligenceOverview;
}

function fmtPct(v: number | "N/A" | "N/D" | null): string {
  if (v === null || v === "N/A" || v === "N/D") return "N/D";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("pt-BR");
}

const DIVERGENCE_LABEL: Record<string, string> = {
  POSITIVE_FUNDAMENTAL_DIVERGENCE: "Fundamentos > Mercado",
  NEGATIVE_FUNDAMENTAL_DIVERGENCE: "Mercado > Fundamentos",
  ALIGNED: "Alinhado",
  INSUFFICIENT_DATA: "Dados Insuficientes",
};

// Sprint 15/16 — labels em PT-BR para os valores brutos de categoria/status/classificação
// (enums do Prisma/scoring-engine), exibidos nas tabelas de Catalysts/Risks/Event Intelligence.
const EVENT_CATEGORY_LABEL: Record<string, string> = {
  FUNDING: "Captação (Funding)",
  SECURITY_INCIDENT: "Incidente de Segurança",
};

const RESEARCH_RUN_STATUS_LABEL: Record<string, string> = {
  QUEUED: "Na fila",
  RUNNING: "Em execução",
  COMPLETED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const EVENT_IMPACT_CLASSIFICATION_LABEL: Record<string, string> = {
  FUNDAMENTAL_EXPANSION_AFTER_EVENT: "Expansão Fundamental Após o Evento",
  FUNDAMENTAL_CONTRACTION_AFTER_EVENT: "Contração Fundamental Após o Evento",
  MARKET_APPRECIATION_AFTER_EVENT: "Valorização de Mercado Após o Evento",
  MARKET_DECLINE_AFTER_EVENT: "Queda de Mercado Após o Evento",
  MIXED: "Misto",
  NO_CLEAR_CHANGE: "Sem Mudança Clara",
  INSUFFICIENT_DATA: "Dados Insuficientes",
  OVERLAPPING_EVENTS: "Eventos Sobrepostos",
};

const cardStyle = { height: "100%" } as const;

export default function DashboardPage() {
  const [view, setView] = useState<DashboardFundamentalView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/fundamental")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <div className="section-label">Início</div>
      <h1>Painel</h1>
      <p>Visão geral do Crypto Research Intelligence.</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{ textDecoration: "none", display: "block", height: "100%" }}
          >
            <div
              className="card"
              style={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <h3 style={{ marginBottom: 4 }}>{l.label}</h3>
              <p style={{ margin: 0, fontSize: 13 }}>{l.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {error && (
        <p style={{ marginTop: 24, color: "#c0392b" }}>
          Não foi possível carregar os dados reais do dashboard: {error}
        </p>
      )}

      {!view && !error && <p style={{ marginTop: 24, fontSize: 13 }}>Carregando dados reais...</p>}

      {view && (
        <>
          {/* Research */}
          <h2 style={{ marginTop: 32 }}>Pesquisa</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
              marginTop: 12,
            }}
          >
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Projetos Pesquisados</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>
                {view.research.projectsResearched}
              </div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Execuções de Pesquisa</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{view.research.researchRunsTotal}</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Última Execução de Pesquisa</div>
              {view.research.lastResearchRun ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {RESEARCH_RUN_STATUS_LABEL[view.research.lastResearchRun.status] ??
                      view.research.lastResearchRun.status}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {fmtDate(
                      view.research.lastResearchRun.finishedAt ??
                        view.research.lastResearchRun.startedAt,
                    )}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {view.research.lastResearchRun.successfulProjects}/
                    {view.research.lastResearchRun.totalProjects} sucesso
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13 }}>N/A — nenhuma Execução de Pesquisa ainda</div>
              )}
            </div>
          </div>

          {/* Data Quality */}
          <h2 style={{ marginTop: 32 }}>Qualidade dos Dados</h2>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Cobertura sobre os {view.dataHealth.projectsResearched} projetos já pesquisados (com
            pelo menos um Fundamental Score).
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            {[
              ["Cobertura de TVL", view.dataHealth.tvlCoverage],
              ["Cobertura de Dados de Mercado", view.dataHealth.marketDataCoverage],
              ["Cobertura de Revenue", view.dataHealth.revenueCoverage],
              ["Cobertura de Fees", view.dataHealth.feesCoverage],
            ].map(([label, c]) => {
              const coverage = c as { count: number; percentage: number };
              return (
                <div className="card" key={label as string} style={cardStyle}>
                  <div style={{ fontSize: 12 }}>{label as string}</div>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>
                    {coverage.percentage.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 12 }}>{coverage.count} projeto(s) com dado real</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, marginTop: 12 }}>
            Última coleta bem-sucedida: {fmtDate(view.dataHealth.lastSuccessfulCollection)} · Última
            coleta com falha/parcial: {fmtDate(view.dataHealth.lastFailedCollection)}
          </p>

          {/* Fundamental Movement */}
          <h2 style={{ marginTop: 32 }}>Movimento Fundamental</h2>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Dados e movimentos observados — não é ranking de investimento, nem recomendação.
          </p>
          {view.movement.length === 0 ? (
            <p style={{ fontSize: 13 }}>
              N/A — nenhum projeto com Fundamental Momentum calculável ainda.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Projeto</th>
                  <th>Momentum Fundamental</th>
                  <th>TVL 30d</th>
                  <th>Revenue 30d</th>
                  <th>Market Cap 30d</th>
                  <th>Divergência</th>
                </tr>
              </thead>
              <tbody>
                {view.movement.map((m) => (
                  <tr key={m.slug}>
                    <td>
                      <Link href={`/dashboard/projects/${m.slug}`}>{m.name}</Link>
                    </td>
                    <td>
                      {m.fundamentalMomentum !== null ? m.fundamentalMomentum.toFixed(1) : "N/A"}
                    </td>
                    <td>{fmtPct(m.tvlGrowth30d)}</td>
                    <td>{fmtPct(m.revenueGrowth30d)}</td>
                    <td>{fmtPct(m.marketCapGrowth30d)}</td>
                    <td>{DIVERGENCE_LABEL[m.divergence] ?? m.divergence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Divergences */}
          <h2 style={{ marginTop: 32 }}>Divergências Fundamentos × Mercado</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {Object.entries(view.divergence.counts).map(([key, count]) => (
              <div className="card" key={key} style={cardStyle}>
                <div style={{ fontSize: 12 }}>{DIVERGENCE_LABEL[key] ?? key}</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{count}</div>
              </div>
            ))}
          </div>
          {view.divergence.entries.filter((e) => e.classification !== "INSUFFICIENT_DATA")
            .length === 0 ? (
            <p style={{ fontSize: 13 }}>
              N/A — dados insuficientes para calcular divergências ainda.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Projeto</th>
                  <th>Classificação</th>
                  <th>TVL 90d</th>
                  <th>Market Cap 90d</th>
                </tr>
              </thead>
              <tbody>
                {view.divergence.entries
                  .filter((e) => e.classification !== "INSUFFICIENT_DATA")
                  .map((e) => (
                    <tr key={e.slug}>
                      <td>
                        <Link href={`/dashboard/projects/${e.slug}`}>{e.name}</Link>
                      </td>
                      <td>{DIVERGENCE_LABEL[e.classification] ?? e.classification}</td>
                      <td>{fmtPct(e.tvlGrowth90d)}</td>
                      <td>{fmtPct(e.marketCapGrowth90d)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {/* Catalysts (Sprint 15) — só contagens factuais, sem "melhor projeto" */}
          <h2 style={{ marginTop: 32 }}>Catalisadores</h2>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Eventos factuais com fonte verificável — ver limitações no Relatório do Projeto
            (cobertura hoje limitada a rodadas de captação, DefiLlama).
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Futuros</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{view.catalysts.upcoming}</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Recentes (30d)</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{view.catalysts.recent}</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Concluídos</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{view.catalysts.completed}</div>
            </div>
          </div>

          {/* Risks (Sprint 15) */}
          <h2 style={{ marginTop: 32 }}>Riscos</h2>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Riscos identificados por fonte verificável (cobertura hoje limitada a incidentes de
            segurança conhecidos pela DefiLlama).
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Riscos Identificados</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{view.risks.identified}</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Com Evidência Histórica</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {view.risks.withHistoricalEvidence}
              </div>
            </div>
          </div>

          {/* Event Intelligence (Sprint 16) — associação temporal observada, nunca causalidade */}
          <h2 style={{ marginTop: 32 }}>Inteligência de Eventos</h2>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Variação observada após o evento — associação temporal, não causalidade.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Eventos Analisados</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {view.eventIntelligence.analyzedCount}
              </div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: 12 }}>Dados Insuficientes</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {view.eventIntelligence.insufficientDataCount}
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 14 }}>Eventos Recentes (30d)</h3>
          {view.eventIntelligence.recentEvents.length === 0 ? (
            <p style={{ fontSize: 13 }}>N/A — nenhum evento recente com data confirmada.</p>
          ) : (
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}
            >
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Projeto</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Fundamental 30d</th>
                  <th>Market 30d</th>
                  <th>Cobertura</th>
                  <th>Classificação</th>
                </tr>
              </thead>
              <tbody>
                {view.eventIntelligence.recentEvents.map((e, i) => (
                  <tr key={`${e.slug}-${e.eventDate}-${i}`}>
                    <td>
                      <Link href={`/dashboard/projects/${e.slug}`}>{e.name}</Link>
                    </td>
                    <td>{EVENT_CATEGORY_LABEL[e.eventType] ?? e.eventType}</td>
                    <td>{fmtDate(e.eventDate)}</td>
                    <td>{fmtPct(e.fundamentalChange30d)}</td>
                    <td>{fmtPct(e.marketChange30d)}</td>
                    <td>{e.coveragePercent.toFixed(0)}%</td>
                    <td>
                      {EVENT_IMPACT_CLASSIFICATION_LABEL[e.classification] ?? e.classification}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ fontSize: 14 }}>Agregação Entre Eventos</h3>
          <p style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            Estatística descritiva sobre a amostra real observada — nunca previsão.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {view.eventIntelligence.aggregations.map((agg) => (
              <div className="card" key={agg.category} style={cardStyle}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  {EVENT_CATEGORY_LABEL[agg.category] ?? agg.category}
                </div>
                <div style={{ fontSize: 12 }}>Tamanho da amostra: {agg.sampleSize}</div>
                {agg.sampleSize === 0 ? (
                  <div style={{ fontSize: 12 }}>N/A — nenhum evento com dados suficientes.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12 }}>
                      TVL Δ30d (mediana): {fmtPct(agg.tvlChange30d.median)}
                      {agg.tvlChange30d.insufficientSample ? " (amostra pequena)" : ""}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      Price Δ30d (mediana): {fmtPct(agg.priceChange30d.median)}
                      {agg.priceChange30d.insufficientSample ? " (amostra pequena)" : ""}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
