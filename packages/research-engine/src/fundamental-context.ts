import { prisma } from "@crypto-research/database";

import { getCatalysts, getRisks, type ResearchEventView } from "./events-repository";
import { computeFundingAggregates } from "./funding-repository";
import {
  computeFundamentalHistoricalIntelligence,
  type FundamentalHistoricalIntelligence,
} from "./historical-intelligence";
import { getLatestTokenomicsScore } from "./tokenomics-score-repository";

// Sprint 15 (Parte 12) — Fundamental Context: reúne Historical Fundamentals + Catalysts + Risks
// + Tokenomics disponível + Capital + Market relationship + Data coverage numa visão única.
// NUNCA um score/número final — é "structured context" (Parte 34), explicitamente não um Global
// Score. Toda peça já existe (History/Sprint 14, Tokenomics/Sprint 6, Capital/Sprint 6, Events/
// Sprint 15) — esta camada só monta, não recalcula nada novo.

export interface FundamentalContext {
  generatedAt: string;
  historicalIntelligence: FundamentalHistoricalIntelligence;
  catalysts: {
    active: ResearchEventView[]; // ANNOUNCED/ONGOING
    upcoming: ResearchEventView[]; // SCHEDULED
    completed: ResearchEventView[];
    // Auditoria: status UNKNOWN (ex.: todo tópico Discourse) e CANCELLED não pertencem a nenhum dos
    // três grupos acima e sumiam do contexto. Invariante: todo catalyst aparece em algum grupo.
    other: ResearchEventView[];
  };
  risks: {
    identified: ResearchEventView[];
  };
  tokenomics: {
    coverage: "NONE" | "PARTIAL" | "FULL";
    scoreModelVersion: string | null;
  };
  capital: {
    totalKnownCapitalUsd: number | null;
    distinctInvestorCount: number;
    daysSinceLastRaise: number | null;
  };
}

function classifyTokenomicsCoverage(
  score: { partial: boolean } | null,
): FundamentalContext["tokenomics"]["coverage"] {
  if (!score) return "NONE";
  return score.partial ? "PARTIAL" : "FULL";
}

export async function computeFundamentalContext(
  projectId: string,
  slug: string,
): Promise<FundamentalContext> {
  const asOf = new Date();

  const [historicalIntelligence, catalysts, risks, tokenomicsScore, fundingAggregates] =
    await Promise.all([
      computeFundamentalHistoricalIntelligence(projectId, slug, asOf),
      getCatalysts(projectId),
      getRisks(projectId),
      getLatestTokenomicsScore(projectId),
      computeFundingAggregates(projectId, asOf),
    ]);

  return {
    generatedAt: asOf.toISOString(),
    historicalIntelligence,
    catalysts: {
      active: catalysts.filter((c) => c.status === "ANNOUNCED" || c.status === "ONGOING"),
      upcoming: catalysts.filter((c) => c.status === "SCHEDULED"),
      completed: catalysts.filter((c) => c.status === "COMPLETED"),
      other: catalysts.filter((c) => c.status === "UNKNOWN" || c.status === "CANCELLED"),
    },
    risks: {
      identified: risks,
    },
    tokenomics: {
      coverage: classifyTokenomicsCoverage(tokenomicsScore),
      scoreModelVersion: tokenomicsScore?.scoreModelVersion ?? null,
    },
    capital: {
      totalKnownCapitalUsd: fundingAggregates.totalKnownCapitalUsd,
      distinctInvestorCount: fundingAggregates.distinctInvestorCount,
      daysSinceLastRaise: fundingAggregates.daysSinceLastRaise,
    },
  };
}

/** Usado só para checar existência do projeto antes de montar o contexto (rota HTTP). */
export async function projectExists(slug: string): Promise<string | null> {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  return project?.id ?? null;
}
