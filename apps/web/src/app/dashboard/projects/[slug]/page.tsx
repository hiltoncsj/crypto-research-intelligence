"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InfoTooltip, type InfoTooltipContent } from "@/components/InfoTooltip";

type GrowthResult = number | "N/A";

interface WindowMetrics {
  current: number | null;
  growth7d: GrowthResult;
  growth30d: GrowthResult;
  growth90d: GrowthResult;
}

// Sprint 10 (Perfil de Projeto — Identificação/Classificação/Tokenomics bruto). Shape espelha
// apps/web/src/lib/research.ts (`ProjectIdentification`/`ProjectClassification`/
// `ProjectTokenomicsRaw`).
interface ProjectIdentification {
  sector: string;
  narrative: string | null;
  chains: string[];
  discoveredAt: string | null;
  discoverySource: string | null;
}

interface ProjectClassification {
  segment: null;
  researchPriority: { score: number; rank: number; selectionModelVersion: string } | null;
}

interface ProjectTokenomicsRaw {
  marketCapUsd: number | null;
  // Sprint 11 (integração CoinGecko): deixa de ser sempre null.
  fdvUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  unlocks: Array<{ unlockDate: string; amount: number; allocationType: string }>;
}

// Sprint 13 (Perfil do Projeto + Onde é Negociado) — shape espelha
// apps/web/src/lib/research.ts (`ProjectProfileView`/`ProjectMarketView`).
interface ProjectProfileView {
  descriptionEn: string | null;
  categories: string[];
  platforms: string[];
  homepageUrl: string | null;
  retrievedAt: string;
}

interface ProjectMarketView {
  exchangeName: string;
  baseSymbol: string;
  targetSymbol: string;
  marketType: string;
  tradeUrl: string | null;
  volumeUsd: number | null;
  retrievedAt: string;
}

interface ProjectData {
  slug: string;
  name: string;
  tvl: WindowMetrics;
  revenue: WindowMetrics;
  fees: WindowMetrics;
  tvlHistory: Array<{ sourceTimestamp: string; valueUsd: number }>;
  lastUpdated: string | null;
  profile: ProjectProfileView | null;
  markets: ProjectMarketView[];
  identification: ProjectIdentification;
  classification: ProjectClassification;
  tokenomics: ProjectTokenomicsRaw;
}

function formatUsd(value: number | null): string {
  if (value === null) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
}

function formatGrowth(value: GrowthResult): string {
  if (value === "N/A") return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Sprint 3 (Fase 16): gráfico simples inline em SVG — sem biblioteca de charting. */
function Sparkline({ points }: { points: Array<{ sourceTimestamp: string; valueUsd: number }> }) {
  if (points.length < 2) return <p>Histórico insuficiente para gráfico.</p>;

  const width = 600;
  const height = 120;
  const values = points.map((p) => p.valueUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.valueUsd - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} role="img" aria-label="TVL over time">
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

// Sprint 5 (Fase 13/14): shape espelha packages/scoring-engine/src/trace.ts (TraceEntry) e o
// breakdown persistido em research-engine/score-repository.ts.
interface TraceEntry {
  component: string;
  metricLabel: string;
  value: number | "N/A";
  percentile: number | null;
  relativeWeight: number;
  pointsAwarded: number | null;
  source: string;
  sourceTimestamp: string | null;
  dataQuality: "VALID" | "SUSPICIOUS" | "INVALID_REJECTED" | "MISSING";
  note: string | null;
}

interface ScoreBreakdown {
  groups: {
    tvlGrowth: { maxWeight: number; score: number | null };
    revenueGrowth: { maxWeight: number; score: number | null };
    feesGrowth: { maxWeight: number; score: number | null };
    efficiency: { maxWeight: number; score: number | null };
  };
  missingGroups: string[];
  trace: TraceEntry[];
}

interface FundamentalScoreView {
  id: string;
  scoreModelVersion: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  breakdown: ScoreBreakdown;
  createdAt: string;
}

// Sprint 6 (Parte 8): Tokenomics/Capital têm um breakdown mais simples (grupos de valor único,
// sem sub-janelas 7d/30d/90d) — shape genérico o suficiente para os dois.
interface GenericGroupBreakdown {
  groups: Record<
    string,
    { maxWeight: number; score: number | null; percentile: number | null; note: string | null }
  >;
  missingGroups: string[];
}

interface GenericScoreView {
  scoreModelVersion: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  breakdown: GenericGroupBreakdown;
}

// Sprint 9 — Research History / Changelog (ver RESEARCH_HISTORY_SPEC.md). Shape espelha
// packages/research-engine/src/history.ts (`ProjectHistory`) e diff.ts (`ChangelogEntry`).
type WindowKey = "7d" | "30d" | "90d" | "180d";

interface HistoryWindowView {
  tvl: { changePct: number | "N/A" };
  revenue: { changePct: number | "N/A" };
  fees: { changePct: number | "N/A" };
  fundamentalScoreChange: number | null;
}

interface ProjectHistoryView {
  current: {
    tvl: { value: number | null; asOf: string | null };
    fundamentalScore: { totalScore: number; researchRunId: string; createdAt: string } | null;
  };
  windows: Record<WindowKey, HistoryWindowView>;
  series: { fundamentalScore: Array<{ observedAt: string; value: number; researchRunId: string }> };
}

interface ChangelogEntry {
  type: string;
  severity: "INFO" | "IMPORTANT" | "CRITICAL";
  message: string;
}

const SEVERITY_ICON: Record<ChangelogEntry["severity"], string> = {
  CRITICAL: "🔴",
  IMPORTANT: "🟡",
  INFO: "•",
};

function formatWindowPct(value: number | "N/A"): string {
  if (value === "N/A") return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function HistorySection({
  history,
  changelog,
}: {
  history: ProjectHistoryView | null;
  changelog: ChangelogEntry[] | null;
}) {
  if (!history) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Research History</h2>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid currentColor" }}>
            <th style={{ padding: "4px 8px" }}>Janela</th>
            <th style={{ padding: "4px 8px" }}>TVL</th>
            <th style={{ padding: "4px 8px" }}>Revenue</th>
            <th style={{ padding: "4px 8px" }}>Fees</th>
            <th style={{ padding: "4px 8px" }}>Fundamental Score Δ</th>
          </tr>
        </thead>
        <tbody>
          {(["7d", "30d", "90d", "180d"] as WindowKey[]).map((key) => {
            const w = history.windows[key];
            return (
              <tr key={key} style={{ borderBottom: "1px solid currentColor" }}>
                <td style={{ padding: "4px 8px" }}>{key}</td>
                <td style={{ padding: "4px 8px" }}>{formatWindowPct(w.tvl.changePct)}</td>
                <td style={{ padding: "4px 8px" }}>{formatWindowPct(w.revenue.changePct)}</td>
                <td style={{ padding: "4px 8px" }}>{formatWindowPct(w.fees.changePct)}</td>
                <td style={{ padding: "4px 8px" }}>
                  {w.fundamentalScoreChange === null ? "N/A" : w.fundamentalScoreChange.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>What Changed Since Last Research</h3>
      {!changelog ? (
        <p>Carregando…</p>
      ) : changelog.length === 0 ? (
        <p>
          Nenhuma mudança material desde a Research Run anterior (ou primeira análise deste
          projeto).
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {changelog.map((entry, i) => (
            <li key={i} style={{ padding: "2px 0" }}>
              {SEVERITY_ICON[entry.severity]} {entry.message}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 20 }}>Timeline (Fundamental Score)</h3>
      {history.series.fundamentalScore.length === 0 ? (
        <p>Sem histórico de Score suficiente ainda.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {history.series.fundamentalScore
            .slice()
            .reverse()
            .map((s) => (
              <li key={s.researchRunId} style={{ padding: "4px 0" }}>
                ● {new Date(s.observedAt).toLocaleDateString()} — Score {s.value.toFixed(1)} (Run{" "}
                {s.researchRunId.slice(0, 8)})
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

interface FundingRoundView {
  id: string;
  roundType: string;
  roundLabel: string | null;
  amountUsd: number | null;
  valuationUsd: number | null;
  raisedAt: string;
  leadInvestors: string[];
  otherInvestors: string[];
}

// Sprint 10: agregados já calculados pelo Institutional Capital Score (computeFundingAggregates),
// nunca exibidos antes na UI.
interface FundingAggregates {
  totalKnownCapitalUsd: number | null;
  distinctInvestorCount: number;
  daysSinceLastRaise: number | null;
  roundCount: number;
}

// Sprint 10 (Parte 12): conteúdo curto e fixo por métrica — ver DATA_DICTIONARY.md para a
// explicação completa. Não busca dinâmica, não gerado por LLM em tempo de execução.
const TOOLTIPS: Record<string, InfoTooltipContent> = {
  tvl: {
    oQueE: "Total Value Locked — valor total em ativos depositados no protocolo.",
    porQueColetamos: "Acompanha a quantidade de capital presente no protocolo ao longo do tempo.",
    comoInterpretar:
      "Observe crescimento, estabilidade e aceleração — não apenas o valor absoluto.",
    limitacoes:
      "TVL pode variar por causa do preço dos ativos, não só por entrada/saída real de capital.",
  },
  revenue: {
    oQueE: "Receita gerada pelo protocolo (parte das fees direcionada ao protocolo/treasury).",
    porQueColetamos: "Indica se o protocolo tem atividade econômica real, não só capital parado.",
    comoInterpretar: "Compare com TVL (Revenue/TVL) para avaliar eficiência de uso do capital.",
  },
  fees: {
    oQueE: "Total de taxas pagas pelos usuários ao usar o protocolo.",
    porQueColetamos:
      "Mede o volume de atividade econômica gerado, antes da divisão entre LPs e protocolo.",
    comoInterpretar:
      "Fees altas com Revenue baixa podem indicar que o protocolo captura pouco valor.",
  },
  fundamentalScore: {
    oQueE: "Pontuação agregada de crescimento e eficiência (TVL/Revenue/Fees growth).",
    porQueColetamos:
      "Resume várias métricas de crescimento fundamentalista num único número comparável.",
    comoInterpretar:
      "Não é recomendação de investimento — é um resumo objetivo de crescimento observado.",
    limitacoes: "Confidence baixa indica poucos dados disponíveis para o cálculo.",
  },
  researchPriority: {
    oQueE: "Prioridade de pesquisa atribuída ao projeto pelo sistema de seleção (Sprint 8).",
    porQueColetamos:
      "Combina Score, momentum de crescimento e momentum de capital para decidir o que pesquisar primeiro.",
    comoInterpretar:
      "Prioridade alta significa que o sistema encontrou sinais relevantes recentes, não que é uma recomendação de compra.",
  },
  mcFdv: {
    oQueE:
      "Market Cap sobre Fully Diluted Valuation — proporção entre valor de mercado circulante e total.",
    porQueColetamos: "Ajuda a entender quanto do supply total ainda pode diluir o preço no futuro.",
    comoInterpretar: "Valores próximos de 1 indicam pouca diluição futura pendente.",
    limitacoes:
      "Vem da CoinGecko — só disponível quando a DefiLlama conhece o gecko_id do projeto.",
  },
  fundingTotal: {
    oQueE: "Soma dos valores conhecidos de todas as rodadas de captação registradas.",
    porQueColetamos: "Mede o capital institucional conhecido investido no projeto.",
    comoInterpretar: "'Known Capital' é objetivo — não avalia a qualidade dos investidores.",
    limitacoes: "Só reflete rodadas divulgadas publicamente e capturadas pela fonte de dados.",
  },
  unlock: {
    oQueE: "Data e quantidade programada de liberação de tokens previamente bloqueados.",
    porQueColetamos: "Unlocks grandes podem aumentar a pressão de venda no mercado.",
    comoInterpretar: "Compare o tamanho do unlock com o volume diário negociado do token.",
  },
};

// Sprint 6 (Parte 8): tokens visuais extraídos de designer_system/design-system.html — SÓ os
// estáticos (cor de fundo escura, cartão, acento teal, radius). Deliberadamente NÃO usamos
// nada do arquivo original relacionado a cursor/mouse (cursor-dot, glow-card com tilt 3D no
// hover, spotlight, parallax) — isso é proibido pela regra visual do Sprint 6. `:hover`
// simples (mudar borda/sombra) é permitido e usado abaixo.
const theme = {
  bg: "#0b1620",
  card: "#142033",
  border: "rgba(255,255,255,0.08)",
  accent: "#14b8a6",
  accentSoft: "rgba(20,184,166,0.15)",
  text: "#e6edf3",
  textMuted: "#94a3b8",
};

function cardStyle(): CSSProperties {
  return {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    padding: 20,
    color: theme.text,
  };
}

function GenericScoreCard({ title, score }: { title: string; score: GenericScoreView | null }) {
  return (
    <div style={cardStyle()} className="score-card">
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>{title}</h3>
      {!score ? (
        <p style={{ color: theme.textMuted }}>Nenhum score calculado ainda.</p>
      ) : (
        <>
          <p style={{ fontSize: 28, margin: "8px 0 0", fontWeight: 600 }}>
            {score.totalScore.toFixed(1)}{" "}
            <span style={{ color: theme.textMuted, fontSize: 16 }}>/ {score.maxScore}</span>
          </p>
          <p style={{ color: theme.accent, margin: "4px 0 0", fontSize: 13 }}>
            Confidence {score.confidence.toFixed(0)}%{score.partial ? " · parcial" : ""}
          </p>
          {score.breakdown.missingGroups.length > 0 && (
            <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
              Sem dado: {score.breakdown.missingGroups.join(", ")}
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, fontSize: 13 }}>
            {Object.entries(score.breakdown.groups).map(([name, g]) => (
              <li
                key={name}
                style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}
              >
                <span style={{ color: theme.textMuted }}>{name}</span>
                <span>{g.score === null ? "N/A" : `${g.score.toFixed(1)} / ${g.maxWeight}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function formatUsdShort(value: number | null): string {
  if (value === null) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function FundingSection({
  rounds,
  aggregates,
}: {
  rounds: FundingRoundView[] | null;
  aggregates: FundingAggregates | null;
}) {
  if (!rounds || rounds.length === 0) {
    return (
      <div style={cardStyle()}>
        <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
          Funding
        </h3>
        <p style={{ color: theme.textMuted }}>
          Nenhum round de captação conhecido pela fonte de dados.
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Funding — {rounds.length} round(s) conhecido(s)
        <InfoTooltip content={TOOLTIPS.fundingTotal!} />
      </h3>
      {aggregates && (
        <div
          style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "10px 0 4px", fontSize: 13 }}
        >
          <span>
            <span style={{ color: theme.textMuted }}>Total Known Capital: </span>
            {formatUsdShort(aggregates.totalKnownCapitalUsd)}
          </span>
          <span>
            <span style={{ color: theme.textMuted }}>Investidores distintos: </span>
            {aggregates.distinctInvestorCount}
          </span>
          <span>
            <span style={{ color: theme.textMuted }}>Dias desde a última captação: </span>
            {aggregates.daysSinceLastRaise === null
              ? "N/A"
              : Math.round(aggregates.daysSinceLastRaise)}
          </span>
        </div>
      )}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <th style={{ padding: "4px 8px" }}>Round</th>
              <th style={{ padding: "4px 8px" }}>Data</th>
              <th style={{ padding: "4px 8px" }}>Valor</th>
              <th style={{ padding: "4px 8px" }}>Lead</th>
              <th style={{ padding: "4px 8px" }}>Outros investidores</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "6px 8px" }}>{r.roundLabel ?? r.roundType}</td>
                <td style={{ padding: "6px 8px" }}>{new Date(r.raisedAt).toLocaleDateString()}</td>
                <td style={{ padding: "6px 8px" }}>{formatUsdShort(r.amountUsd)}</td>
                <td style={{ padding: "6px 8px" }}>{r.leadInvestors.join(", ") || "—"}</td>
                <td style={{ padding: "6px 8px" }}>{r.otherInvestors.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
        "Known Investors/Known Capital/Known Rounds" — dados objetivos da fonte, sem avaliação de
        qualidade do investidor.
      </p>
    </div>
  );
}

// Sprint 13 (Parte B — Perfil do Projeto): contexto factual, nunca recomendação — mesmo texto/
// fonte já usados no Project Report (Markdown), agora também na página. Fonte: CoinGecko (mesmo
// payload já buscado para FDV/supplies, Sprint 11 — nenhuma chamada HTTP extra).
function ProfileSection({ profile }: { profile: ProjectProfileView | null }) {
  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Perfil do Projeto
      </h3>
      {!profile ? (
        <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>
          N/A — sem `coinGeckoId` conhecido para este projeto, ou a última coleta não retornou dados
          de perfil.
        </p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 10, fontSize: 13 }}>
            <li style={{ padding: "3px 0" }}>
              <span style={{ color: theme.textMuted }}>Categoria: </span>
              {profile.categories.length > 0 ? profile.categories.join(", ") : "N/A"}
            </li>
            <li style={{ padding: "3px 0" }}>
              <span style={{ color: theme.textMuted }}>Blockchain(s): </span>
              {profile.platforms.length > 0 ? profile.platforms.join(", ") : "N/A"}
            </li>
            <li style={{ padding: "3px 0" }}>
              <span style={{ color: theme.textMuted }}>Site oficial: </span>
              {profile.homepageUrl ? (
                <a href={profile.homepageUrl} target="_blank" rel="noreferrer noopener">
                  {profile.homepageUrl}
                </a>
              ) : (
                "N/A"
              )}
            </li>
          </ul>
          {profile.descriptionEn && (
            <p style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{profile.descriptionEn}</p>
          )}
          <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
            Fonte: CoinGecko — coletado em {new Date(profile.retrievedAt).toLocaleDateString()}.
          </p>
        </>
      )}
    </div>
  );
}

function formatVolumeUsd(value: number | null): string {
  if (value === null) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// Sprint 13 (Parte B — Onde o Token é Negociado): dado factual observado na última coleta,
// NUNCA ranking/recomendação de exchange (seção 17 do Sprint 13).
function MarketsSection({ markets }: { markets: ProjectMarketView[] }) {
  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Onde o Token é Negociado
      </h3>
      {markets.length === 0 ? (
        <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>
          Mercados identificados: N/A — não foram encontrados mercados verificáveis na última
          coleta.
        </p>
      ) : (
        <>
          <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
            Na última coleta ({new Date(markets[0]!.retrievedAt).toLocaleDateString()}) — apenas
            dados observados, sem recomendação.
          </p>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: theme.textMuted,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <th style={{ padding: "4px 8px" }}>Exchange</th>
                  <th style={{ padding: "4px 8px" }}>Par</th>
                  <th style={{ padding: "4px 8px" }}>Tipo</th>
                  <th style={{ padding: "4px 8px" }}>Volume observado</th>
                </tr>
              </thead>
              <tbody>
                {markets.slice(0, 20).map((m, i) => (
                  <tr
                    key={`${m.exchangeName}-${m.baseSymbol}-${m.targetSymbol}-${i}`}
                    style={{ borderBottom: `1px solid ${theme.border}` }}
                  >
                    <td style={{ padding: "6px 8px" }}>
                      {m.tradeUrl ? (
                        <a href={m.tradeUrl} target="_blank" rel="noreferrer noopener">
                          {m.exchangeName}
                        </a>
                      ) : (
                        m.exchangeName
                      )}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {m.baseSymbol}/{m.targetSymbol}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{m.marketType}</td>
                    <td style={{ padding: "6px 8px" }}>{formatVolumeUsd(m.volumeUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {markets.length > 20 && (
            <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
              +{markets.length - 20} outros mercados identificados, não listados acima.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Sprint 10 (Parte 5): Identificação — dados diretos do Project/Sector/ProjectChain, sem cálculo.
function IdentificationSection({ identification }: { identification: ProjectIdentification }) {
  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Identificação
      </h3>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 10, fontSize: 13 }}>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Setor: </span>
          {identification.sector}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Blockchain(s): </span>
          {identification.chains.length > 0 ? identification.chains.join(", ") : "N/A"}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Narrativa: </span>
          {identification.narrative ?? "N/A (sem entidade dedicada ainda — ver DATA_DICTIONARY.md)"}
        </li>
        {identification.discoveredAt && (
          <li style={{ padding: "3px 0" }}>
            <span style={{ color: theme.textMuted }}>Descoberto em: </span>
            {new Date(identification.discoveredAt).toLocaleDateString()} (fonte:{" "}
            {identification.discoverySource ?? "N/A"})
          </li>
        )}
      </ul>
    </div>
  );
}

// Sprint 10 (Parte 5): Classificação — nunca inventa Emerging/Established (critério não
// implementado); mostra Research Priority quando o projeto já passou por uma seleção Top 10.
function ClassificationSection({ classification }: { classification: ProjectClassification }) {
  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Classificação
      </h3>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 10, fontSize: 13 }}>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Emerging / Established: </span>
          N/A — critério ainda não implementado
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Research Priority: </span>
          <InfoTooltip content={TOOLTIPS.researchPriority!} />
          {classification.researchPriority
            ? ` ${classification.researchPriority.score.toFixed(1)} (#${classification.researchPriority.rank} no Top 10, modelo ${classification.researchPriority.selectionModelVersion})`
            : " N/A (projeto ainda não passou por uma seleção dinâmica de Top 10)"}
        </li>
      </ul>
    </div>
  );
}

function formatSupply(value: number | null): string {
  if (value === null) return "N/A";
  return value.toLocaleString("pt-BR");
}

// Sprint 10 (Parte 8): dados brutos de Tokenomics — mesmos campos que já aparecem no Project
// Report (Sprint 9), agora também na página, reaproveitando a mesma query.
function TokenomicsSection({ tokenomics }: { tokenomics: ProjectTokenomicsRaw }) {
  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
        Tokenomics
      </h3>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 10, fontSize: 13 }}>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Market Cap: </span>
          {formatUsdShort(tokenomics.marketCapUsd)}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>FDV: </span>
          {formatUsdShort(tokenomics.fdvUsd)}
          <InfoTooltip content={TOOLTIPS.mcFdv!} />
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>MC/FDV: </span>
          {tokenomics.fdvUsd && tokenomics.fdvUsd > 0 && tokenomics.marketCapUsd !== null
            ? (tokenomics.marketCapUsd / tokenomics.fdvUsd).toFixed(2)
            : "N/A"}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Circulating Supply: </span>
          {formatSupply(tokenomics.circulatingSupply)}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Total Supply: </span>
          {formatSupply(tokenomics.totalSupply)}
        </li>
        <li style={{ padding: "3px 0" }}>
          <span style={{ color: theme.textMuted }}>Max Supply: </span>
          {formatSupply(tokenomics.maxSupply)}
        </li>
      </ul>
      {tokenomics.unlocks.length > 0 ? (
        <>
          <h4
            style={{
              marginTop: 12,
              marginBottom: 4,
              fontSize: 13,
              color: theme.textMuted,
              fontWeight: 500,
            }}
          >
            Unlocks conhecidos
            <InfoTooltip content={TOOLTIPS.unlock!} />
          </h4>
          <ul style={{ listStyle: "none", padding: 0, fontSize: 13 }}>
            {tokenomics.unlocks.map((u, i) => (
              <li key={i} style={{ padding: "2px 0" }}>
                {new Date(u.unlockDate).toLocaleDateString()}: {u.amount.toLocaleString("pt-BR")} (
                {u.allocationType})
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
          Unlocks: N/A (sem fonte gratuita conectada — ver DATA_DICTIONARY.md)
        </p>
      )}
    </div>
  );
}

// Sprint 10 (Parte 9): nunca inventa catalyst/risco específico sem evidência real no sistema —
// hoje não há tabela/lógica de detecção (só um peso reservado no modelo de score), então a
// seção é sempre N/A explícito, igual ao Project Report (Sprint 9).
function CatalystsRisksSection() {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ ...cardStyle(), flex: "1 1 280px" }}>
        <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>
          Catalysts
        </h3>
        <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>
          N/A — não modelado ainda (peso reservado no score, sem detecção real implementada).
        </p>
      </div>
      <div style={{ ...cardStyle(), flex: "1 1 280px" }}>
        <h3 style={{ margin: 0, fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>Risks</h3>
        <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>
          N/A — não modelado ainda.
        </p>
      </div>
    </div>
  );
}

function formatGroupScore(group: { maxWeight: number; score: number | null }): string {
  return group.score === null
    ? `N/A / ${group.maxWeight}`
    : `${group.score.toFixed(1)} / ${group.maxWeight}`;
}

/** Sprint 5 (Fase 14/19): expande o Research Trace de um componente do Score sob demanda. */
function TraceRow({ entry }: { entry: TraceEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid currentColor", padding: "4px 0" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        {entry.metricLabel}: {entry.value === "N/A" ? "N/A" : `${entry.value.toFixed(2)}`}
        {entry.percentile !== null ? ` (percentile ${entry.percentile.toFixed(0)})` : ""}
        {entry.dataQuality !== "VALID" ? ` — ${entry.dataQuality}` : ""}
      </button>
      {open && (
        <ul>
          <li>Fonte: {entry.source}</li>
          <li>
            Timestamp do dado:{" "}
            {entry.sourceTimestamp ? new Date(entry.sourceTimestamp).toLocaleString() : "N/A"}
          </li>
          <li>Peso relativo no grupo: {entry.relativeWeight}</li>
          <li>
            Pontos atribuídos:{" "}
            {entry.pointsAwarded === null ? "N/A" : entry.pointsAwarded.toFixed(2)}
          </li>
          <li>Qualidade do dado: {entry.dataQuality}</li>
          {entry.note && <li>Nota: {entry.note}</li>}
        </ul>
      )}
    </div>
  );
}

// Sprint 6 (Parte 8): resumo lado a lado — Fundamental / Tokenomics / Institutional Capital.
function ScoreOverviewRow({
  fundamental,
  tokenomics,
  capital,
}: {
  fundamental: FundamentalScoreView | null;
  tokenomics: GenericScoreView | null;
  capital: GenericScoreView | null;
}) {
  function chip(
    label: string,
    s: { totalScore: number; maxScore: number; confidence: number } | null,
    tooltip?: InfoTooltipContent,
  ) {
    return (
      <div style={{ ...cardStyle(), flex: "1 1 200px" }} className="score-card">
        <h3 style={{ margin: 0, fontSize: 13, color: theme.textMuted, fontWeight: 500 }}>
          {label}
          {tooltip && <InfoTooltip content={tooltip} />}
        </h3>
        {s ? (
          <>
            <p style={{ fontSize: 24, margin: "6px 0 0", fontWeight: 600 }}>
              {s.totalScore.toFixed(1)}{" "}
              <span style={{ color: theme.textMuted, fontSize: 14 }}>/ {s.maxScore}</span>
            </p>
            <p style={{ color: theme.accent, margin: "2px 0 0", fontSize: 12 }}>
              Confidence {s.confidence.toFixed(0)}%
            </p>
          </>
        ) : (
          <p style={{ color: theme.textMuted, fontSize: 13 }}>Não calculado</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 24 }}>
      {chip("Fundamental", fundamental, TOOLTIPS.fundamentalScore)}
      {chip("Tokenomics", tokenomics)}
      {chip("Institutional Capital", capital)}
    </div>
  );
}

function ScoreSection({ score }: { score: FundamentalScoreView | null }) {
  if (!score) return <p>Nenhum Fundamental Score calculado ainda para este projeto.</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Fundamental Score ({score.scoreModelVersion})</h2>
      <p style={{ fontSize: 24 }}>
        {score.totalScore.toFixed(1)} / {score.maxScore}
        {score.partial && " (parcial)"}
      </p>
      <p>Confidence: {score.confidence.toFixed(0)}%</p>
      <p style={{ fontStyle: "italic" }}>Score não é recomendação financeira.</p>

      <h3>Breakdown</h3>
      <ul>
        <li>TVL Growth: {formatGroupScore(score.breakdown.groups.tvlGrowth)}</li>
        <li>Revenue Growth: {formatGroupScore(score.breakdown.groups.revenueGrowth)}</li>
        <li>Fees Growth: {formatGroupScore(score.breakdown.groups.feesGrowth)}</li>
        <li>Efficiency: {formatGroupScore(score.breakdown.groups.efficiency)}</li>
      </ul>
      {score.breakdown.missingGroups.length > 0 && (
        <p>Categorias sem dados suficientes: {score.breakdown.missingGroups.join(", ")}</p>
      )}

      <h3>Research Trace</h3>
      {score.breakdown.trace.map((entry) => (
        <TraceRow key={entry.component} entry={entry} />
      ))}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<ProjectData | null>(null);
  const [score, setScore] = useState<FundamentalScoreView | null>(null);
  const [tokenomicsScore, setTokenomicsScore] = useState<GenericScoreView | null>(null);
  const [capitalScore, setCapitalScore] = useState<GenericScoreView | null>(null);
  const [funding, setFunding] = useState<FundingRoundView[] | null>(null);
  const [fundingAggregates, setFundingAggregates] = useState<FundingAggregates | null>(null);
  const [history, setHistory] = useState<ProjectHistoryView | null>(null);
  const [changelog, setChangelog] = useState<ChangelogEntry[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.slug}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Erro ao carregar projeto.");
          return;
        }
        const body = await res.json();
        setData(body.project);
      })
      .catch(() => setError("Erro ao carregar projeto."));

    fetch(`/api/projects/${params.slug}/score`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        setScore(body.latest ?? null);
      })
      .catch(() => {});

    // Sprint 6 (Parte 8/19): Tokenomics + Institutional Capital ao lado do Fundamental.
    fetch(`/api/projects/${params.slug}/tokenomics-score`)
      .then(async (res) =>
        res.ok ? setTokenomicsScore((await res.json()).latest ?? null) : undefined,
      )
      .catch(() => {});

    fetch(`/api/projects/${params.slug}/capital-score`)
      .then(async (res) =>
        res.ok ? setCapitalScore((await res.json()).latest ?? null) : undefined,
      )
      .catch(() => {});

    fetch(`/api/projects/${params.slug}/funding`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        setFunding(body.rounds ?? null);
        setFundingAggregates(body.aggregates ?? null);
      })
      .catch(() => {});

    fetch(`/api/projects/${params.slug}/history`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        setHistory(body.history ?? null);
        setChangelog(body.changelog ?? []);
      })
      .catch(() => {});
  }, [params.slug]);

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/projects/${params.slug}/report`);
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${params.slug}-research-report.md`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  return (
    <section>
      {/* Sprint 6: hover estático simples via CSS puro (permitido) — sem JS de mouse tracking */}
      <style>{`.score-card { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .score-card:hover { border-color: ${theme.accent}; box-shadow: 0 0 0 1px ${theme.accentSoft}; }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{data.name}</h1>
        <button type="button" onClick={handleDownloadReport} disabled={downloading}>
          {downloading ? "Gerando…" : "Baixar análise"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <h2>
            TVL
            <InfoTooltip content={TOOLTIPS.tvl!} />
          </h2>
          <p>{formatUsd(data.tvl.current)}</p>
          <p>7d: {formatGrowth(data.tvl.growth7d)}</p>
          <p>30d: {formatGrowth(data.tvl.growth30d)}</p>
          <p>90d: {formatGrowth(data.tvl.growth90d)}</p>
        </div>
        <div>
          <h2>
            Revenue
            <InfoTooltip content={TOOLTIPS.revenue!} />
          </h2>
          <p>30d atual: {formatUsd(data.revenue.current)}</p>
          <p>30d: {formatGrowth(data.revenue.growth30d)}</p>
        </div>
        <div>
          <h2>
            Fees
            <InfoTooltip content={TOOLTIPS.fees!} />
          </h2>
          <p>30d atual: {formatUsd(data.fees.current)}</p>
          <p>30d: {formatGrowth(data.fees.growth30d)}</p>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>TVL over time</h2>
        <Sparkline points={data.tvlHistory} />
      </div>

      <div style={{ marginTop: 16 }}>
        <p>
          Data Source: DefiLlama
          <br />
          Last Updated: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : "N/A"}
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ flex: "1 1 280px" }}>
          <IdentificationSection identification={data.identification} />
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <ClassificationSection classification={data.classification} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <ProfileSection profile={data.profile} />
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <MarketsSection markets={data.markets} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <TokenomicsSection tokenomics={data.tokenomics} />
      </div>

      <ScoreOverviewRow fundamental={score} tokenomics={tokenomicsScore} capital={capitalScore} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <GenericScoreCard
            title={`Tokenomics (${tokenomicsScore?.scoreModelVersion ?? "tokenomics-v1"})`}
            score={tokenomicsScore}
          />
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <GenericScoreCard
            title={`Institutional Capital (${capitalScore?.scoreModelVersion ?? "institutional-capital-v1"})`}
            score={capitalScore}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <FundingSection rounds={funding} aggregates={fundingAggregates} />
      </div>

      <div style={{ marginTop: 16 }}>
        <CatalystsRisksSection />
      </div>

      <ScoreSection score={score} />

      <HistorySection history={history} changelog={changelog} />
    </section>
  );
}
