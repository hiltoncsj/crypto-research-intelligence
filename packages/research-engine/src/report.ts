import { prisma } from "@crypto-research/database";

import type { ChangelogEntry } from "./diff";
import { diffResearchRuns } from "./diff";
import { getEventImpactsForProject } from "./event-impact-engine";
import { getCatalysts, getRisks } from "./events-repository";
import { computeFundingAggregates, loadFundingRounds } from "./funding-repository";
import type { ProjectHistory } from "./history";
import { getProjectHistory } from "./history";
import { computeFundamentalHistoricalIntelligence } from "./historical-intelligence";
import { logReportEvent } from "./logger";
import { getLatestProjectProfile, getTokenMarkets } from "./profile-repository";

// Sprint 9 — Project Report (ver PROJECT_REPORT_SPEC.md). Gerado SOB DEMANDA a partir do banco
// (seção 21/39: "o banco é a fonte de verdade", "não realizar novas chamadas DefiLlama ao gerar
// o relatório") — nenhum arquivo estático é a fonte primária. Formato: Markdown (seção 22).
//
// Regra central (seção 50): Database → Structured Research Data → History → Diff → Markdown.
// Nunca "LLM → texto inventado" — toda frase do relatório é montada a partir de um valor real
// já persistido; quando o dado não existe, a seção mostra `N/A` explicitamente (seção 26/38).

export const REPORT_MODEL_VERSION = "report-v1";

function fmtUsd(value: number | null): string {
  if (value === null) return "N/A";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function fmtPct(value: number | "N/A"): string {
  if (value === "N/A") return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toISOString().slice(0, 10);
}

function severityLabel(severity: ChangelogEntry["severity"]): string {
  return severity === "CRITICAL" ? "🔴" : severity === "IMPORTANT" ? "🟡" : "•";
}

interface ProjectReportData {
  slug: string;
  markdown: string;
  generatedAt: string;
  modelVersion: string;
}

export async function generateProjectReport(slug: string): Promise<ProjectReportData | null> {
  logReportEvent("report.requested", { slug });

  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      sector: true,
      projectChains: { where: { active: true }, include: { chain: true } },
      token: true,
      tokenUnlocks: { orderBy: { unlockDate: "asc" } },
    },
  });
  if (!project) return null;

  const generatedAtDate = new Date();
  const [
    history,
    diff,
    fundingRounds,
    fundingAggregates,
    latestSelection,
    profile,
    markets,
    historicalIntelligence,
    catalysts,
    risks,
    eventImpacts,
  ] = await Promise.all([
    getProjectHistory(slug),
    diffResearchRuns(project.id),
    loadFundingRounds(project.id),
    computeFundingAggregates(project.id, generatedAtDate),
    prisma.researchRunSelection.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    }),
    getLatestProjectProfile(project.id),
    getTokenMarkets(project.id),
    computeFundamentalHistoricalIntelligence(project.id, slug, generatedAtDate),
    getCatalysts(project.id),
    getRisks(project.id),
    getEventImpactsForProject(project.id),
  ]);
  if (!history) return null; // já validamos que o projeto existe; history só é null se o slug não existir

  const generatedAt = generatedAtDate.toISOString();
  const lines: string[] = [];

  lines.push(`# ${project.name}${project.token?.symbol ? ` (${project.token.symbol})` : ""}`);
  lines.push("");
  lines.push(
    `_Análise gerada a partir de dados persistidos — não é recomendação financeira. Dados observados são` +
      ` distinguidos de interpretações; nenhuma seção abaixo prevê valorização/desvalorização._`,
  );
  lines.push("");

  // Data as of (seção 24)
  lines.push("## Metadados");
  lines.push("");
  lines.push(`- Data da análise: ${fmtDate(history.current.fundamentalScore?.createdAt ?? null)}`);
  lines.push(`- Research Run: ${history.current.fundamentalScore?.researchRunId ?? "N/A"}`);
  lines.push(`- Gerado em: ${generatedAt}`);
  lines.push(`- Report Model Version: ${REPORT_MODEL_VERSION}`);
  lines.push("");

  // Identificação (seção 5/6/26)
  lines.push("## Identificação");
  lines.push("");
  lines.push(`- Setor: ${project.sector.name}`);
  lines.push(`- Narrativa: N/A (sem entidade dedicada — ver DATA_DICTIONARY.md)`);
  lines.push(
    `- Blockchain(s): ${project.projectChains.length > 0 ? project.projectChains.map((pc) => pc.chain.name).join(", ") : "N/A"}`,
  );
  lines.push(`- Classificação (Consolidado/Emergente): N/A (framework ainda não implementado)`);
  if (project.discoveredAt) {
    lines.push(
      `- Descoberto em: ${fmtDate(project.discoveredAt.toISOString())} (fonte: ${project.discoverySource ?? "N/A"})`,
    );
  }
  lines.push("");

  // Perfil do Projeto (Sprint 13, seção 12) — contexto factual, nunca recomendação. Fonte:
  // CoinGecko (mesmo payload de FDV/supplies, Sprint 11), nunca inventado/resumido por heurística
  // própria (seção 2 do Sprint 13: "não inventar descrição/utilidade/blockchain").
  lines.push("## Perfil do Projeto");
  lines.push("");
  if (profile) {
    lines.push(
      `- Categoria: ${profile.categories.length > 0 ? profile.categories.join(", ") : "N/A"}`,
    );
    lines.push(
      `- Blockchain(s) (via CoinGecko): ${profile.platforms.length > 0 ? profile.platforms.join(", ") : "N/A"}`,
    );
    lines.push(`- Site oficial: ${profile.homepageUrl ?? "N/A"}`);
    lines.push(
      `- Estágio (Emerging/Established): N/A (framework ainda não implementado, ver STATUS_PROJETO.md)`,
    );
    lines.push("");
    lines.push(
      profile.descriptionEn ? profile.descriptionEn : "_Descrição: N/A (fonte não fornece)._",
    );
    lines.push("");
    lines.push(`_Fonte: CoinGecko — coletado em ${fmtDate(profile.retrievedAt.toISOString())}._`);
  } else {
    lines.push(
      "N/A — sem `coinGeckoId` conhecido para este projeto, ou a última coleta não retornou dados de perfil.",
    );
  }
  lines.push("");

  // Onde o Token é Negociado (Sprint 13, seção 14/17) — dado factual observado na última
  // coleta, NUNCA ranking/recomendação de exchange (seção 17: proibido dizer "melhor exchange").
  lines.push("## Onde o Token é Negociado");
  lines.push("");
  if (markets.length === 0) {
    lines.push("Mercados identificados: N/A");
    lines.push("");
    lines.push("Não foram encontrados mercados verificáveis na última coleta.");
  } else {
    const mostRecentRetrievedAt = markets[0]!.retrievedAt;
    lines.push(
      `_Na última coleta (${fmtDate(mostRecentRetrievedAt.toISOString())}), a fonte identificou os seguintes mercados — apenas dados observados, sem recomendação:_`,
    );
    lines.push("");
    lines.push("| Exchange | Par | Tipo | Volume observado |");
    lines.push("|---|---|---|---|");
    for (const m of markets.slice(0, 20)) {
      lines.push(
        `| ${m.exchangeName} | ${m.baseSymbol}/${m.targetSymbol} | ${m.marketType} | ${fmtUsd(m.volumeUsd)} |`,
      );
    }
    if (markets.length > 20) {
      lines.push("");
      lines.push(`_+${markets.length - 20} outros mercados identificados, não listados acima._`);
    }
  }
  lines.push("");

  // Fundamental Metrics (seção 29)
  lines.push("## Fundamental Metrics");
  lines.push("");
  lines.push("| Métrica | Atual | 7d | 30d | 90d | 180d |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(
    `| TVL | ${fmtUsd(history.current.tvl.value)} | ${fmtPct(history.windows["7d"].tvl.changePct)} | ${fmtPct(history.windows["30d"].tvl.changePct)} | ${fmtPct(history.windows["90d"].tvl.changePct)} | ${fmtPct(history.windows["180d"].tvl.changePct)} |`,
  );
  lines.push(
    `| Revenue | ${fmtUsd(history.current.revenue.value)} | ${fmtPct(history.windows["7d"].revenue.changePct)} | ${fmtPct(history.windows["30d"].revenue.changePct)} | ${fmtPct(history.windows["90d"].revenue.changePct)} | ${fmtPct(history.windows["180d"].revenue.changePct)} |`,
  );
  lines.push(
    `| Fees | ${fmtUsd(history.current.fees.value)} | ${fmtPct(history.windows["7d"].fees.changePct)} | ${fmtPct(history.windows["30d"].fees.changePct)} | ${fmtPct(history.windows["90d"].fees.changePct)} | ${fmtPct(history.windows["180d"].fees.changePct)} |`,
  );
  lines.push("");

  // Inteligência Fundamental Histórica (Sprint 14) — análise temporal derivada dos snapshots
  // já persistidos (TVL/Revenue/Fees desde o Sprint 3, Price/MarketCap/Volume desde o Sprint
  // 12). Nunca gera sinal de trading/recomendação (seção 9/28 do Sprint 14).
  lines.push("## Inteligência Fundamental Histórica");
  lines.push("");
  const hi = historicalIntelligence;
  lines.push("### Cobertura histórica");
  lines.push("");
  const fmtCoverage = (c: { snapshots: number; oldest: string | null; newest: string | null }) =>
    c.snapshots === 0
      ? "0 dias (sem dados)"
      : `${c.snapshots} snapshots — ${fmtDate(c.oldest)} → ${fmtDate(c.newest)}`;
  lines.push(`- TVL: ${fmtCoverage(hi.coverage.tvl)}`);
  lines.push(`- Revenue: ${fmtCoverage(hi.coverage.revenue)}`);
  lines.push(`- Fees: ${fmtCoverage(hi.coverage.fees)}`);
  lines.push(`- Market Data (Price/Market Cap/Volume): ${fmtCoverage(hi.coverage.marketData)}`);
  lines.push("");

  lines.push("### Crescimento");
  lines.push("");
  lines.push("| Métrica | 7d | 30d | 90d | 180d | 365d |");
  lines.push("|---|---|---|---|---|---|");
  const growthRow = (
    label: string,
    g: { "7d": unknown; "30d": unknown; "90d": unknown; "180d": unknown; "365d": unknown },
  ) =>
    `| ${label} | ${fmtPct(g["7d"] as number | "N/A")} | ${fmtPct(g["30d"] as number | "N/A")} | ${fmtPct(g["90d"] as number | "N/A")} | ${fmtPct(g["180d"] as number | "N/A")} | ${fmtPct(g["365d"] as number | "N/A")} |`;
  lines.push(growthRow("TVL", hi.growth.tvl));
  lines.push(growthRow("Revenue", hi.growth.revenue));
  lines.push(growthRow("Fees", hi.growth.fees));
  lines.push(growthRow("Price", hi.growth.price));
  lines.push(growthRow("Market Cap", hi.growth.marketCap));
  lines.push(growthRow("Volume", hi.growth.volume));
  lines.push("");

  const ACCEL_LABEL: Record<string, string> = {
    ACCELERATING: "Acelerando",
    DECELERATING: "Desacelerando",
    STABLE: "Estável",
    INSUFFICIENT_DATA: "N/A — dados insuficientes",
  };
  lines.push(
    `_Aceleração TVL (30d vs 30d anterior): ${ACCEL_LABEL[hi.acceleration.tvl.regime]}${hi.acceleration.tvl.accelerationPp !== "N/A" ? ` (${hi.acceleration.tvl.accelerationPp > 0 ? "+" : ""}${hi.acceleration.tvl.accelerationPp}pp)` : ""}._`,
  );
  lines.push("");

  lines.push("### Momentum Fundamental");
  lines.push("");
  if (hi.fundamentalMomentum.score !== null) {
    lines.push(
      `- Fundamental Momentum: ${hi.fundamentalMomentum.score.toFixed(1)} / 100 (modelo ${hi.fundamentalMomentum.modelVersion})`,
    );
    lines.push(
      `- Coverage: ${hi.fundamentalMomentum.coverage.toFixed(0)}% (${hi.fundamentalMomentum.availableComponents}/${hi.fundamentalMomentum.totalPossibleComponents} componentes disponíveis) — Confidence: ${hi.fundamentalMomentum.confidence.toFixed(0)}%`,
    );
  } else {
    lines.push("- N/A — nenhum componente (TVL/Revenue/Fees/Volume Growth 30d) disponível.");
  }
  lines.push("");

  const COMPARISON_LABEL: Record<string, string> = {
    A_EXPANDED_FASTER: "expandiu mais rápido",
    B_EXPANDED_FASTER: "expandiu mais devagar",
    CO_MOVED: "moveram-se juntos",
    INSUFFICIENT_DATA: "N/A — dados insuficientes",
  };
  lines.push("### Relação Fundamentos × Valuation");
  lines.push("");
  lines.push(
    `- Market Cap vs TVL (90d): Market Cap ${COMPARISON_LABEL[hi.marketVsFundamentals.marketCapVsTvl.relation]}${hi.marketVsFundamentals.marketCapVsTvl.deltaPp !== "N/A" ? ` (Δ ${hi.marketVsFundamentals.marketCapVsTvl.deltaPp}pp)` : ""}`,
  );
  lines.push(
    `- Market Cap vs Revenue (90d): Market Cap ${COMPARISON_LABEL[hi.marketVsFundamentals.marketCapVsRevenue.relation]}${hi.marketVsFundamentals.marketCapVsRevenue.deltaPp !== "N/A" ? ` (Δ ${hi.marketVsFundamentals.marketCapVsRevenue.deltaPp}pp)` : ""}`,
  );
  lines.push(
    `- Revenue vs TVL (90d): Revenue ${COMPARISON_LABEL[hi.revenueVsTvl.relation]}${hi.revenueVsTvl.deltaPp !== "N/A" ? ` (Δ ${hi.revenueVsTvl.deltaPp}pp)` : ""}`,
  );
  lines.push("");
  lines.push(
    `- Market Cap / TVL: ${hi.valuationRatios.marketCapToTvl !== null ? hi.valuationRatios.marketCapToTvl.toFixed(2) : "N/A"}`,
  );
  lines.push(
    `- Market Cap / Revenue: ${hi.valuationRatios.marketCapToRevenue !== null ? hi.valuationRatios.marketCapToRevenue.toFixed(2) : "N/A"}`,
  );
  lines.push(
    `- FDV / Revenue: ${hi.valuationRatios.fdvToRevenue !== null ? hi.valuationRatios.fdvToRevenue.toFixed(2) : "N/A"}`,
  );
  lines.push(
    `- Market Cap / Fees: ${hi.valuationRatios.marketCapToFees !== null ? hi.valuationRatios.marketCapToFees.toFixed(2) : "N/A"}`,
  );
  lines.push("");

  const DIVERGENCE_LABEL: Record<string, string> = {
    POSITIVE_FUNDAMENTAL_DIVERGENCE:
      "Positive Fundamental Divergence — fundamentos mais fortes que o movimento de preço",
    NEGATIVE_FUNDAMENTAL_DIVERGENCE:
      "Negative Fundamental Divergence — movimento de preço mais forte que os fundamentos",
    ALIGNED: "Aligned — fundamentos e preço em movimento comparável",
    INSUFFICIENT_DATA: "N/A — dados insuficientes",
  };
  lines.push("### Preço × Fundamentos");
  lines.push("");
  lines.push(`- ${DIVERGENCE_LABEL[hi.fundamentalPriceDivergence.classification]}`);
  lines.push("");

  const CORR_LABEL: Record<string, string> = {
    STRONG_POSITIVE: "forte positiva",
    MODERATE_POSITIVE: "moderada positiva",
    WEAK_POSITIVE: "fraca positiva",
    NEUTRAL: "neutra",
    NEGATIVE: "negativa",
    INSUFFICIENT_DATA: "N/A — observações insuficientes",
  };
  lines.push("### Correlação");
  lines.push("");
  lines.push(
    `- Market Cap × TVL: ${hi.correlation.marketCapVsTvl.coefficient !== "N/A" ? hi.correlation.marketCapVsTvl.coefficient.toFixed(2) : "N/A"} (${CORR_LABEL[hi.correlation.marketCapVsTvl.classification]}, n=${hi.correlation.marketCapVsTvl.observations})`,
  );
  lines.push(
    `- Market Cap × Revenue: ${hi.correlation.marketCapVsRevenue.coefficient !== "N/A" ? hi.correlation.marketCapVsRevenue.coefficient.toFixed(2) : "N/A"} (${CORR_LABEL[hi.correlation.marketCapVsRevenue.classification]}, n=${hi.correlation.marketCapVsRevenue.observations})`,
  );
  lines.push(
    `- Price × TVL: ${hi.correlation.priceVsTvl.coefficient !== "N/A" ? hi.correlation.priceVsTvl.coefficient.toFixed(2) : "N/A"} (${CORR_LABEL[hi.correlation.priceVsTvl.classification]}, n=${hi.correlation.priceVsTvl.observations})`,
  );
  lines.push(
    `- Volume × TVL: ${hi.correlation.volumeVsTvl.coefficient !== "N/A" ? hi.correlation.volumeVsTvl.coefficient.toFixed(2) : "N/A"} (${CORR_LABEL[hi.correlation.volumeVsTvl.classification]}, n=${hi.correlation.volumeVsTvl.observations})`,
  );
  lines.push("");
  lines.push(
    "_Correlação não implica causalidade — é uma observação estatística sobre o movimento conjunto das séries, não uma previsão._",
  );
  lines.push("");

  const LEADLAG_TEXT: Record<string, string> = {
    A_LED_B: `TVL historicamente precedeu a aceleração do Market Cap em aproximadamente ${hi.leadLag.tvlVsMarketCap.bestLagDays} dia(s)`,
    B_LED_A: `Market Cap historicamente precedeu o movimento do TVL em aproximadamente ${Math.abs(hi.leadLag.tvlVsMarketCap.bestLagDays ?? 0)} dia(s)`,
    NO_CLEAR_RELATIONSHIP: "Sem relação temporal clara entre TVL e Market Cap nesta amostra",
    INSUFFICIENT_DATA: "N/A — dados insuficientes para análise de precedência temporal",
  };
  lines.push("### Temporal Relationship (Leading/Lagging)");
  lines.push("");
  lines.push(`- ${LEADLAG_TEXT[hi.leadLag.tvlVsMarketCap.relation]}.`);
  lines.push("");

  const REGIME_LABEL: Record<string, string> = {
    FUNDAMENTAL_EXPANSION: "Fundamental Expansion",
    FUNDAMENTAL_ACCELERATION: "Fundamental Acceleration",
    FUNDAMENTAL_DECELERATION: "Fundamental Deceleration",
    FUNDAMENTAL_CONTRACTION: "Fundamental Contraction",
    MIXED_FUNDAMENTALS: "Mixed Fundamentals",
    INSUFFICIENT_DATA: "N/A — insufficient historical data",
  };
  lines.push("### Regime");
  lines.push("");
  lines.push(`- ${REGIME_LABEL[hi.regime]}`);
  lines.push("");
  lines.push(
    `_Análise gerada pelo modelo \`${hi.modelVersion}\` em ${generatedAt} — puramente descritiva, não é recomendação de investimento (seção 37 do Sprint 14)._`,
  );
  lines.push("");

  // Score (seção 30)
  lines.push("## Score");
  lines.push("");
  const scoreRow = (label: string, s: ProjectHistory["current"]["fundamentalScore"]) =>
    s
      ? `- ${label}: ${s.totalScore.toFixed(1)} / ${s.maxScore} (Confidence ${s.confidence.toFixed(0)}%, modelo ${s.scoreModelVersion})`
      : `- ${label}: N/A (não calculado ainda)`;
  lines.push(scoreRow("Fundamental Score", history.current.fundamentalScore));
  lines.push(scoreRow("Tokenomics Score", history.current.tokenomicsScore));
  lines.push(scoreRow("Institutional Capital Score", history.current.capitalScore));
  lines.push("");

  // Priority / Top 10 (seção 31)
  lines.push("## Research Priority");
  lines.push("");
  if (latestSelection) {
    lines.push(
      `- Priority Score: ${Number(latestSelection.priorityScore).toFixed(1)} (modelo ${latestSelection.selectionModelVersion})`,
    );
    lines.push(`- Posição no Top 10 (última Research Run selecionada): #${latestSelection.rank}`);
    if (latestSelection.selectionReason.length > 0) {
      lines.push(`- Motivo: ${latestSelection.selectionReason.join(", ")}`);
    }
  } else {
    lines.push("- N/A (projeto ainda não passou por uma seleção dinâmica de Top 10)");
  }
  lines.push("");

  // Capital (seção 27)
  lines.push("## Capital");
  lines.push("");
  lines.push(`- Total Known Capital: ${fmtUsd(fundingAggregates.totalKnownCapitalUsd)}`);
  lines.push(`- Investidores distintos conhecidos: ${fundingAggregates.distinctInvestorCount}`);
  lines.push(
    `- Dias desde a última captação: ${fundingAggregates.daysSinceLastRaise === null ? "N/A" : Math.round(fundingAggregates.daysSinceLastRaise)}`,
  );
  lines.push("");
  if (fundingRounds.length === 0) {
    lines.push("Nenhum round de captação conhecido pela fonte de dados.");
  } else {
    lines.push("| Round | Data | Valor | Valuation | Lead | Outros investidores |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of fundingRounds) {
      lines.push(
        `| ${r.roundLabel ?? r.roundType} | ${fmtDate(r.raisedAt.toISOString())} | ${fmtUsd(r.amountUsd)} | ${fmtUsd(r.valuationUsd)} | ${r.leadInvestors.join(", ") || "N/A"} | ${r.otherInvestors.join(", ") || "N/A"} |`,
      );
    }
  }
  lines.push("");

  // Tokenomics (seção 28)
  lines.push("## Tokenomics");
  lines.push("");
  // Sprint 11 (integração CoinGecko): FDV/MC-FDV deixam de ser sempre N/A — populados quando
  // `Project.coinGeckoId` é conhecido e a chamada teve sucesso; continuam N/A caso contrário
  // (nunca 0, nunca adivinhado).
  const fdvUsd = project.token?.fdvUsd ? Number(project.token.fdvUsd) : null;
  const mcFdv =
    fdvUsd !== null && fdvUsd > 0 && history.current.marketCapUsd !== null
      ? history.current.marketCapUsd / fdvUsd
      : null;
  lines.push(`- Market Cap: ${fmtUsd(history.current.marketCapUsd)}`);
  lines.push(
    `- FDV: ${fdvUsd !== null ? fmtUsd(fdvUsd) : "N/A (sem coinGeckoId conhecido ou dado indisponível)"}`,
  );
  lines.push(`- MC/FDV: ${mcFdv !== null ? mcFdv.toFixed(2) : "N/A (depende de FDV)"}`);
  lines.push(
    `- Circulating Supply: ${project.token?.circulatingSupply ? Number(project.token.circulatingSupply).toLocaleString() : "N/A"}`,
  );
  lines.push(
    `- Total Supply: ${project.token?.totalSupply ? Number(project.token.totalSupply).toLocaleString() : "N/A"}`,
  );
  lines.push(
    `- Max Supply: ${project.token?.maxSupply ? Number(project.token.maxSupply).toLocaleString() : "N/A"}`,
  );
  lines.push(`- Value Capture: N/A (sem sinal real conectado hoje)`);
  if (project.tokenUnlocks.length > 0) {
    lines.push("");
    lines.push("Unlocks conhecidos:");
    for (const u of project.tokenUnlocks) {
      lines.push(
        `- ${fmtDate(u.unlockDate.toISOString())}: ${Number(u.amount).toLocaleString()} (${u.allocationType})`,
      );
    }
  } else {
    lines.push(`- Unlocks: N/A (sem fonte gratuita conectada — ver DATA_DICTIONARY.md)`);
  }
  lines.push("");

  // Catalysts / Risks (Sprint 15) — só eventos com fonte real (DefiLlama /hacks + FundingRound
  // já persistidos, ver SPRINT_15_IMPLEMENTATION_REPORT.md "Source Investigation"). Nunca
  // Bullish/Bearish/Buy/Sell (seção 17/44 do Sprint 15) — só fatos observados.
  lines.push("## Catalysts");
  lines.push("");
  if (catalysts.length === 0) {
    lines.push(
      "N/A — nenhum catalyst identificado por fonte verificável na última coleta (ver limitações no relatório do Sprint 15: cobertura hoje limitada a rodadas de captação).",
    );
  } else {
    lines.push("| Data | Evento | Categoria | Status | Confiança | Fonte |");
    lines.push("|---|---|---|---|---|---|");
    for (const c of catalysts) {
      lines.push(
        `| ${fmtDate(c.eventDate)} | ${c.title} | ${c.category} | ${c.status} | ${c.confidence} | ${c.source} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Risks");
  lines.push("");
  if (risks.length === 0) {
    lines.push(
      "N/A — nenhum risco identificado por fonte verificável na última coleta (ver limitações: cobertura hoje limitada a incidentes de segurança conhecidos pela DefiLlama).",
    );
  } else {
    lines.push("| Categoria | Evidência | Data | Fonte | Confiança |");
    lines.push("|---|---|---|---|---|");
    for (const r of risks) {
      lines.push(
        `| ${r.category} | ${r.title}${r.description ? ` — ${r.description}` : ""} | ${fmtDate(r.eventDate)} | ${r.source} | ${r.confidence} |`,
      );
    }
  }
  lines.push("");

  // Fundamental Context (Sprint 15, seção 12) — reúne o que já foi calculado acima; NUNCA um
  // score/número final (seção 34: "não é Global Score").
  lines.push("## Fundamental Context");
  lines.push("");
  lines.push(`- Fundamental Regime: ${hi.regime}`);
  lines.push(
    `- Fundamental Momentum: ${hi.fundamentalMomentum.score !== null ? hi.fundamentalMomentum.score.toFixed(1) : "N/A"}`,
  );
  lines.push(
    `- Market/Fundamental Relationship: ${hi.marketVsFundamentals.marketCapVsTvl.relation}`,
  );
  lines.push(
    `- Active Catalysts: ${catalysts.filter((c) => c.status === "ANNOUNCED" || c.status === "ONGOING").length}`,
  );
  lines.push(`- Upcoming Catalysts: ${catalysts.filter((c) => c.status === "SCHEDULED").length}`);
  lines.push(`- Completed Catalysts: ${catalysts.filter((c) => c.status === "COMPLETED").length}`);
  lines.push(`- Material Risks Identified: ${risks.length}`);
  lines.push(
    `- Tokenomics Coverage: ${history.current.tokenomicsScore ? "PARTIAL (ver seção Tokenomics acima — Supply Dilution real, demais grupos sem fonte)" : "NONE"}`,
  );
  lines.push(
    `- Data Coverage: TVL ${hi.coverage.tvl.snapshots} snapshots, Market Data ${hi.coverage.marketData.snapshots} snapshots, Revenue ${hi.coverage.revenue.snapshots} snapshots, Fees ${hi.coverage.fees.snapshots} snapshots`,
  );
  lines.push("");

  // Impacto Histórico de Eventos (Sprint 16) — ASSOCIAÇÃO TEMPORAL, nunca causalidade (regra
  // central do Sprint 16). Timeline + análise antes/depois por evento real (FUNDING/
  // SECURITY_INCIDENT, Sprint 15).
  lines.push("## Impacto Histórico de Eventos");
  lines.push("");
  if (eventImpacts.length === 0) {
    lines.push(
      "N/A — nenhum evento com fonte real identificado para este projeto (ver seção Catalysts/Risks acima).",
    );
  } else {
    lines.push(
      '_Associação temporal observada — nunca causalidade. "Após o evento" descreve o que foi observado, não o que o evento causou._',
    );
    lines.push("");
    for (const impact of eventImpacts) {
      lines.push(`### ${impact.eventType} — ${fmtDate(impact.eventDate)}`);
      lines.push("");
      lines.push(
        `- Status: ${impact.eventStatus} | Confiança: ${impact.confidence} | Fonte: ${impact.source}`,
      );
      lines.push(
        `- Modelo: \`${impact.modelVersion}\` | Status da análise: ${impact.analysisStatus}`,
      );
      lines.push("");

      if (impact.analysisStatus === "NO_EVENT_DATE") {
        lines.push("_Sem data de evento confirmada — análise de impacto não aplicável._");
        lines.push("");
        continue;
      }

      lines.push("| Métrica | Antes (30d) | Depois (30d) | Variação |");
      lines.push("|---|---|---|---|");
      const metricRow = (
        label: string,
        w: { before: number | null; after: number | null; changePercent: number | null },
      ) =>
        `| ${label} | ${w.before !== null ? w.before.toLocaleString("en-US") : "N/D"} | ${w.after !== null ? w.after.toLocaleString("en-US") : "N/D"} | ${w.changePercent !== null ? fmtPct(w.changePercent) : "N/D"} |`;
      lines.push(metricRow("TVL", impact.metrics.tvl["30d"]));
      lines.push(metricRow("Revenue", impact.metrics.revenue["30d"]));
      lines.push(metricRow("Fees", impact.metrics.fees["30d"]));
      lines.push(metricRow("Price", impact.metrics.price["30d"]));
      lines.push(metricRow("Market Cap", impact.metrics.marketCap["30d"]));
      lines.push(metricRow("Market Volume", impact.metrics.marketVolume["30d"]));
      lines.push("");
      lines.push(
        `- Fundamental Momentum: ${impact.momentum.before !== null ? impact.momentum.before.toFixed(1) : "N/D"} → ${impact.momentum.after !== null ? impact.momentum.after.toFixed(1) : "N/D"} (Δ ${impact.momentum.delta !== null ? impact.momentum.delta.toFixed(1) : "N/D"})`,
      );
      if (impact.regime) {
        lines.push(
          `- Fundamental Regime: ${impact.regime.before} → ${impact.regime.after}${impact.regime.changed ? " (mudou)" : " (sem mudança)"}`,
        );
      }
      lines.push(
        `- Cobertura: ${impact.coverage.availableCount}/${impact.coverage.totalCount} métricas disponíveis (${impact.coverage.coveragePercent.toFixed(0)}%)`,
      );
      if (impact.overlappingEvents.length > 0) {
        lines.push(
          `- ⚠️ Eventos sobrepostos na janela pós-evento (compromete a interpretação): ${impact.overlappingEvents.map((e) => `${e.category} (${fmtDate(e.eventDate)})`).join(", ")}`,
        );
      }
      lines.push(`- **Classificação descritiva: ${impact.classification}**`);
      lines.push("");
    }
  }
  lines.push("");

  // What Changed Since Last Research (seção 32)
  lines.push("## What Changed Since Last Research");
  lines.push("");
  if (!diff.hasPreviousRun) {
    lines.push("N/A — esta é a primeira Research Run com dados para este projeto.");
  } else if (diff.entries.length === 0) {
    lines.push("Nenhuma mudança material desde a Research Run anterior.");
  } else {
    for (const entry of diff.entries) {
      lines.push(`- ${severityLabel(entry.severity)} ${entry.message}`);
    }
  }
  lines.push("");

  // Research Trace (seção 33)
  lines.push("## Sources");
  lines.push("");
  const traceLines: string[] = [];
  if (history.current.tvl.asOf) traceLines.push(`- DefiLlama — TVL — ${history.current.tvl.asOf}`);
  if (history.current.revenue.asOf)
    traceLines.push(`- DefiLlama — Revenue — ${history.current.revenue.asOf}`);
  if (history.current.fees.asOf)
    traceLines.push(`- DefiLlama — Fees — ${history.current.fees.asOf}`);
  for (const r of fundingRounds) {
    traceLines.push(
      `- DefiLlama — Funding Round (${r.roundLabel ?? r.roundType}) — ${r.raisedAt.toISOString()}`,
    );
  }
  if (project.token?.coinGeckoRetrievedAt) {
    traceLines.push(
      `- CoinGecko — FDV/Supplies — ${project.token.coinGeckoRetrievedAt.toISOString()}`,
    );
  }
  if (profile) {
    traceLines.push(`- CoinGecko — Perfil do Projeto — ${profile.retrievedAt.toISOString()}`);
  }
  if (markets.length > 0) {
    traceLines.push(
      `- CoinGecko — Mercados (${markets.length} identificados) — ${markets[0]!.retrievedAt.toISOString()}`,
    );
  }
  if (hi.coverage.tvl.snapshots > 0) {
    traceLines.push(
      `- Inteligência Fundamental Histórica — TVL Growth/Acceleration — janela ${hi.coverage.tvl.oldest} → ${hi.coverage.tvl.newest} — fórmula (current/previous - 1) × 100 — modelo ${hi.modelVersion}`,
    );
  }
  if (hi.coverage.marketData.snapshots > 0) {
    traceLines.push(
      `- Inteligência Fundamental Histórica — Market Cap/Price/Volume Growth — janela ${hi.coverage.marketData.oldest} → ${hi.coverage.marketData.newest} — modelo ${hi.modelVersion}`,
    );
  }
  for (const c of catalysts) {
    traceLines.push(
      `- ${c.source} — Catalyst (${c.category}) — event ${c.eventDate ?? "N/A"} — retrieved ${c.retrievedAt}`,
    );
  }
  for (const r of risks) {
    traceLines.push(
      `- ${r.source} — Risk (${r.category}) — event ${r.eventDate ?? "N/A"} — retrieved ${r.retrievedAt}`,
    );
  }
  for (const impact of eventImpacts) {
    if (impact.analysisStatus === "NO_EVENT_DATE") continue;
    traceLines.push(
      `- Event Impact Analysis — ${impact.eventType} — event ${impact.eventDate} — pre-window/post-window 7d/14d/30d — baseline: último valor dentro da janela — fórmula (after/before - 1) × 100 — modelo ${impact.modelVersion} — resultado: ${impact.classification}`,
    );
  }
  lines.push(...(traceLines.length > 0 ? traceLines : ["N/A"]));
  lines.push("");

  logReportEvent("report.completed", {
    slug,
    projectId: project.id,
    researchRunId: history.current.fundamentalScore?.researchRunId ?? null,
    modelVersion: REPORT_MODEL_VERSION,
    format: "markdown",
    sectionCount: lines.filter((l) => l.startsWith("## ")).length,
  });

  return {
    slug: project.slug,
    markdown: lines.join("\n"),
    generatedAt,
    modelVersion: REPORT_MODEL_VERSION,
  };
}
