import { prisma } from "@crypto-research/database";
import {
  computeFundingAggregates,
  getCapitalRanking,
  getFundamentalRanking,
  getFundamentalScoreHistory,
  getGrowthRanking,
  getLatestCapitalScore,
  getLatestFundamentalScore,
  getLatestTokenomicsScore,
  loadFundingRounds,
  type FundingAggregates,
} from "@crypto-research/research-engine";

// Sprint 5 (Fase 19/20): camada de serviço para leitura do Fundamental Score já persistido —
// mesmo padrão de apps/web/src/lib/research.ts e connections.ts (rota HTTP fina, lógica aqui).
// Nunca dispara cálculo sob demanda: o Score só é calculado dentro de uma Research Run
// (Worker), esta camada só lê o que já foi persistido.

export interface FundamentalScoreView {
  id: string;
  researchRunId: string;
  scoreModelVersion: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  breakdown: unknown;
  createdAt: string;
}

function toView(row: {
  id: string;
  researchRunId: string;
  scoreModelVersion: string;
  totalScore: unknown;
  maxScore: unknown;
  confidence: unknown;
  partial: boolean;
  breakdown: unknown;
  createdAt: Date;
}): FundamentalScoreView {
  return {
    id: row.id,
    researchRunId: row.researchRunId,
    scoreModelVersion: row.scoreModelVersion,
    totalScore: Number(row.totalScore),
    maxScore: Number(row.maxScore),
    confidence: Number(row.confidence),
    partial: row.partial,
    breakdown: row.breakdown,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getProjectScoreData(
  slug: string,
): Promise<{ latest: FundamentalScoreView | null; history: FundamentalScoreView[] } | null> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;

  const [latest, history] = await Promise.all([
    getLatestFundamentalScore(project.id),
    getFundamentalScoreHistory(project.id),
  ]);

  return {
    latest: latest ? toView(latest) : null,
    history: history.map(toView),
  };
}

export async function getFundamentalRankingView() {
  // Fase 20/21: "Fundamental Ranking" — nunca chamado de "Best Investment"/"Buy" em nenhuma
  // camada (regra inegociável da Fase 21).
  return getFundamentalRanking();
}

/** Capital Ranking (TUTORIAL.md seção 16) — mesma regra do Fundamental Ranking: nunca chamado
 * de "Best Investment"/"Buy" em nenhuma camada. */
export async function getCapitalRankingView() {
  return getCapitalRanking();
}

/** Growth Ranking (TUTORIAL.md seção 16) — idem. */
export async function getGrowthRankingView() {
  return getGrowthRanking();
}

// Sprint 6: mesmo shape genérico de FundamentalScoreView, reaproveitado para Tokenomics e
// Institutional Capital — só a fonte (tabela) muda.
export interface GenericScoreView {
  id: string;
  researchRunId: string;
  scoreModelVersion: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  partial: boolean;
  breakdown: unknown;
  createdAt: string;
}

function toGenericView(row: {
  id: string;
  researchRunId: string;
  scoreModelVersion: string;
  totalScore: unknown;
  maxScore: unknown;
  confidence: unknown;
  partial: boolean;
  breakdown: unknown;
  createdAt: Date;
}): GenericScoreView {
  return toView(row);
}

export async function getProjectTokenomicsScoreData(
  slug: string,
): Promise<GenericScoreView | null> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;
  const latest = await getLatestTokenomicsScore(project.id);
  return latest ? toGenericView(latest) : null;
}

export async function getProjectCapitalScoreData(slug: string): Promise<GenericScoreView | null> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;
  const latest = await getLatestCapitalScore(project.id);
  return latest ? toGenericView(latest) : null;
}

export interface FundingRoundView {
  id: string;
  roundType: string;
  roundLabel: string | null;
  amountUsd: number | null;
  valuationUsd: number | null;
  raisedAt: string;
  leadInvestors: string[];
  otherInvestors: string[];
}

export interface ProjectFundingData {
  rounds: FundingRoundView[];
  // Sprint 10: agregados já calculados por `computeFundingAggregates` (usados internamente pelo
  // Institutional Capital Score desde o Sprint 6) — nunca exibidos antes na UI/no report.
  aggregates: FundingAggregates;
}

/** Sprint 6 (Parte 15): lista os funding rounds conhecidos de um projeto — dado bruto (não
 * um score), para a UI mostrar "Known Investors/Known Capital/Known Rounds" objetivamente. */
export async function getProjectFundingData(slug: string): Promise<ProjectFundingData | null> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;
  const [rounds, aggregates] = await Promise.all([
    loadFundingRounds(project.id),
    computeFundingAggregates(project.id, new Date()),
  ]);
  return {
    rounds: rounds.map((r) => ({
      id: r.id,
      roundType: r.roundType,
      roundLabel: r.roundLabel,
      amountUsd: r.amountUsd,
      valuationUsd: r.valuationUsd,
      raisedAt: r.raisedAt.toISOString(),
      leadInvestors: r.leadInvestors,
      otherInvestors: r.otherInvestors,
    })),
    aggregates,
  };
}
