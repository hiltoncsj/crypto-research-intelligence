import { prisma } from "@crypto-research/database";

import { logDiffEvent } from "./logger";
import { calculateGrowthForWindow, type TimeSeriesEntry } from "./metrics";
import { loadSeries } from "./snapshot-repository";

// Sprint 9 — Diff Engine + Changelog Automático (ver RESEARCH_HISTORY_SPEC.md). Compara os dois
// Research Runs mais recentes que produziram dado para um projeto e gera um changelog
// estruturado, mecanicamente derivado dos números — nunca texto narrativo inventado (seção 12:
// "não permitir que o modelo simplesmente invente explicações").

export const DIFF_MODEL_VERSION = "diff-v1";

// Seção 15: thresholds documentados e versionados, nunca números mágicos espalhados pelo
// código. "IMPORTANT"/"CRITICAL" descrevem magnitude da mudança nos dados monitorados — nunca
// uma opinião sobre o projeto ser bom/ruim (seção 14).
const METRIC_CHANGE_IMPORTANT_PCT = 10;
const METRIC_CHANGE_CRITICAL_PCT = 30;
const SCORE_CHANGE_IMPORTANT_POINTS = 5;
const SCORE_CHANGE_CRITICAL_POINTS = 15;
const PRIORITY_CHANGE_IMPORTANT_POINTS = 10;

export type ChangelogEntryType =
  | "METRIC_CHANGED"
  | "SCORE_CHANGED"
  | "FUNDING_ADDED"
  | "RANKING_CHANGED"
  | "TOP10_ENTERED"
  | "TOP10_EXITED"
  | "PRIORITY_CHANGED";

export type ChangelogSeverity = "INFO" | "IMPORTANT" | "CRITICAL";

export interface ChangelogEntry {
  type: ChangelogEntryType;
  severity: ChangelogSeverity;
  message: string;
  data: Record<string, unknown>;
}

export interface RunRef {
  id: string;
  createdAt: string;
}

export interface ResearchRunDiff {
  projectId: string;
  modelVersion: string;
  hasPreviousRun: boolean;
  latestRun: RunRef | null;
  previousRun: RunRef | null;
  entries: ChangelogEntry[];
}

function severityForPct(absPct: number): ChangelogSeverity {
  if (absPct >= METRIC_CHANGE_CRITICAL_PCT) return "CRITICAL";
  if (absPct >= METRIC_CHANGE_IMPORTANT_PCT) return "IMPORTANT";
  return "INFO";
}

function severityForScorePoints(absPoints: number): ChangelogSeverity {
  if (absPoints >= SCORE_CHANGE_CRITICAL_POINTS) return "CRITICAL";
  if (absPoints >= SCORE_CHANGE_IMPORTANT_POINTS) return "IMPORTANT";
  return "INFO";
}

/** Runs (distintos) que produziram QUALQUER dado persistido para este projeto — união de Score
 * (3 engines) + Selection, porque nem toda run produz os três scores nem uma seleção (seção 10
 * do Sprint 8: `advanceProjectCard` não bloqueia por WIP; algum engine pode falhar
 * independentemente — Sprint 6, "cada score é independente"). Ordenado do mais recente ao mais
 * antigo. */
async function getRecentRunsForProject(projectId: string): Promise<RunRef[]> {
  const [fundamental, tokenomics, capital, selections] = await Promise.all([
    prisma.fundamentalScore.findMany({
      where: { projectId },
      select: { researchRunId: true, createdAt: true },
    }),
    prisma.tokenomicsScore.findMany({
      where: { projectId },
      select: { researchRunId: true, createdAt: true },
    }),
    prisma.institutionalCapitalScore.findMany({
      where: { projectId },
      select: { researchRunId: true, createdAt: true },
    }),
    prisma.researchRunSelection.findMany({
      where: { projectId },
      select: { researchRunId: true, createdAt: true },
    }),
  ]);

  const byRunId = new Map<string, Date>();
  for (const row of [...fundamental, ...tokenomics, ...capital, ...selections]) {
    const existing = byRunId.get(row.researchRunId);
    if (!existing || row.createdAt < existing) byRunId.set(row.researchRunId, row.createdAt);
  }

  return [...byRunId.entries()]
    .map(([id, createdAt]) => ({ id, createdAt }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString() }));
}

async function scoreDiffEntries(
  projectId: string,
  label: "Fundamental" | "Tokenomics" | "Institutional Capital",
  model: "fundamentalScore" | "tokenomicsScore" | "institutionalCapitalScore",
  latestRunId: string,
  previousRunId: string,
): Promise<ChangelogEntry[]> {
  // `model` seleciona qual delegate do Prisma Client usar — cada um tem o mesmo shape mínimo
  // (projectId, researchRunId, totalScore, confidence), então um único caminho serve os três.
  const delegate = prisma[model] as unknown as {
    findFirst: (args: { where: { projectId: string; researchRunId: string } }) => Promise<{
      totalScore: unknown;
      confidence: unknown;
    } | null>;
  };

  const [latest, previous] = await Promise.all([
    delegate.findFirst({ where: { projectId, researchRunId: latestRunId } }),
    delegate.findFirst({ where: { projectId, researchRunId: previousRunId } }),
  ]);

  if (!latest || !previous) return [];

  const latestScore = Number(latest.totalScore);
  const previousScore = Number(previous.totalScore);
  const delta = Math.round((latestScore - previousScore) * 100) / 100;
  if (delta === 0) return [];

  return [
    {
      type: "SCORE_CHANGED",
      severity: severityForScorePoints(Math.abs(delta)),
      message: `${label} Score: ${previousScore.toFixed(1)} → ${latestScore.toFixed(1)}`,
      data: { label, previousScore, latestScore, delta },
    },
  ];
}

function metricDiffEntry(
  label: "TVL" | "Revenue" | "Fees",
  changePct: number | "N/A",
): ChangelogEntry | null {
  if (changePct === "N/A") return null;
  // Sprint 9 (seção 8): 0 real (nenhuma variação) não vira entrada de changelog — só mudanças
  // reais geram ruído; abaixo de meio ponto percentual é tratado como estável.
  if (Math.abs(changePct) < 0.5) return null;
  const sign = changePct >= 0 ? "+" : "";
  return {
    type: "METRIC_CHANGED",
    severity: severityForPct(Math.abs(changePct)),
    message: `${label}: ${sign}${changePct.toFixed(1)}%`,
    data: { label, changePct },
  };
}

export async function diffResearchRuns(projectId: string): Promise<ResearchRunDiff> {
  logDiffEvent("diff.requested", { projectId });

  const runs = await getRecentRunsForProject(projectId);
  const latestRun = runs[0] ?? null;
  const previousRun = runs[1] ?? null;

  if (!latestRun || !previousRun) {
    logDiffEvent("diff.completed", { projectId, hasPreviousRun: false, entryCount: 0 });
    return {
      projectId,
      modelVersion: DIFF_MODEL_VERSION,
      hasPreviousRun: false,
      latestRun,
      previousRun: null,
      entries: [],
    };
  }

  const entries: ChangelogEntry[] = [];

  const [tvlPoints, revenuePoints, feesPoints] = await Promise.all([
    loadSeries("TVL", projectId),
    loadSeries("REVENUE", projectId),
    loadSeries("FEES", projectId),
  ]);
  const toEntries = (points: { sourceTimestamp: Date; valueUsd: number }[]): TimeSeriesEntry[] =>
    points.map((p) => ({ sourceTimestamp: p.sourceTimestamp, valueUsd: p.valueUsd }));

  const latestCreatedAt = new Date(latestRun.createdAt);
  const previousCreatedAt = new Date(previousRun.createdAt);
  const daysBetween = Math.max(
    1,
    Math.round((latestCreatedAt.getTime() - previousCreatedAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const tvlEntry = metricDiffEntry(
    "TVL",
    calculateGrowthForWindow(toEntries(tvlPoints), daysBetween, latestCreatedAt),
  );
  const revenueEntry = metricDiffEntry(
    "Revenue",
    calculateGrowthForWindow(toEntries(revenuePoints), daysBetween, latestCreatedAt),
  );
  const feesEntry = metricDiffEntry(
    "Fees",
    calculateGrowthForWindow(toEntries(feesPoints), daysBetween, latestCreatedAt),
  );
  for (const e of [tvlEntry, revenueEntry, feesEntry]) if (e) entries.push(e);

  const [fundamentalEntries, tokenomicsEntries, capitalEntries] = await Promise.all([
    scoreDiffEntries(projectId, "Fundamental", "fundamentalScore", latestRun.id, previousRun.id),
    scoreDiffEntries(projectId, "Tokenomics", "tokenomicsScore", latestRun.id, previousRun.id),
    scoreDiffEntries(
      projectId,
      "Institutional Capital",
      "institutionalCapitalScore",
      latestRun.id,
      previousRun.id,
    ),
  ]);
  entries.push(...fundamentalEntries, ...tokenomicsEntries, ...capitalEntries);

  // Funding: rodadas cujo REGISTRO (createdAt, não raisedAt — seção 7: "não confundir data da
  // métrica com data da coleta") aconteceu entre as duas runs — sinal de "novo dado conhecido
  // desde a última análise", não necessariamente "captação nova no mercado".
  const newFundingCount = await prisma.fundingRound.count({
    where: { projectId, createdAt: { gt: previousCreatedAt, lte: latestCreatedAt } },
  });
  if (newFundingCount > 0) {
    entries.push({
      type: "FUNDING_ADDED",
      severity: "IMPORTANT",
      message: `Funding: ${newFundingCount} nova(s) rodada(s) identificada(s)`,
      data: { newFundingCount },
    });
  }

  // Top 10 / Priority.
  const [latestSelection, previousSelection] = await Promise.all([
    prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: latestRun.id, projectId } },
    }),
    prisma.researchRunSelection.findUnique({
      where: { researchRunId_projectId: { researchRunId: previousRun.id, projectId } },
    }),
  ]);

  if (latestSelection && !previousSelection) {
    entries.push({
      type: "TOP10_ENTERED",
      severity: "IMPORTANT",
      message: `Top 10: entrou na posição #${latestSelection.rank}`,
      data: { rank: latestSelection.rank },
    });
  } else if (!latestSelection && previousSelection) {
    entries.push({
      type: "TOP10_EXITED",
      severity: "INFO",
      message: `Top 10: saiu (estava na posição #${previousSelection.rank})`,
      data: { previousRank: previousSelection.rank },
    });
  } else if (latestSelection && previousSelection) {
    if (latestSelection.rank !== previousSelection.rank) {
      entries.push({
        type: "RANKING_CHANGED",
        severity: "INFO",
        message: `Top 10: posição #${previousSelection.rank} → #${latestSelection.rank}`,
        data: { previousRank: previousSelection.rank, latestRank: latestSelection.rank },
      });
    }
    const priorityDelta =
      Math.round(
        (Number(latestSelection.priorityScore) - Number(previousSelection.priorityScore)) * 100,
      ) / 100;
    if (priorityDelta !== 0) {
      entries.push({
        type: "PRIORITY_CHANGED",
        severity:
          Math.abs(priorityDelta) >= PRIORITY_CHANGE_IMPORTANT_POINTS ? "IMPORTANT" : "INFO",
        message: `Priority: ${Number(previousSelection.priorityScore).toFixed(1)} → ${Number(latestSelection.priorityScore).toFixed(1)}`,
        data: {
          previousPriority: Number(previousSelection.priorityScore),
          latestPriority: Number(latestSelection.priorityScore),
          delta: priorityDelta,
        },
      });
    }
  }

  logDiffEvent("diff.completed", {
    projectId,
    latestResearchRunId: latestRun.id,
    previousResearchRunId: previousRun.id,
    hasPreviousRun: true,
    entryCount: entries.length,
    categories: [...new Set(entries.map((e) => e.type))],
  });

  return {
    projectId,
    modelVersion: DIFF_MODEL_VERSION,
    hasPreviousRun: true,
    latestRun,
    previousRun,
    entries,
  };
}
