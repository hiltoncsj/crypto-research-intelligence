import { prisma } from "@crypto-research/database";
import {
  isValidDiscourseForumUrl,
  isValidGithubRepo,
  isValidSnapshotSpace,
} from "@crypto-research/defi-data";
import {
  calculateWindowMetrics,
  getLatestProjectProfile,
  getTokenMarkets,
  loadSeries,
  type TokenMarketView,
} from "@crypto-research/research-engine";

// Sprint 3 (Fase 21): camada de serviço para leitura de dados já persistidos — usada pelo
// dashboard. O disparo do pipeline em si passou a ser assíncrono a partir do Sprint 4
// (POST /api/research-runs cria uma ResearchRun + enfileira no BullMQ — ver
// apps/web/src/lib/research-runs.ts e infrastructure/workers/research-worker.ts). A função
// `runManualResearchPipeline` continua existindo em @crypto-research/research-engine e é
// chamada pelo Worker, não mais diretamente por uma rota HTTP síncrona.

// Sprint 10 (Perfil de Projeto — Identificação/Classificação/Tokenomics bruto): mesma query de
// `packages/research-engine/src/report.ts` (Identificação/Tokenomics), reaproveitada aqui em vez
// de duplicada — o report e o dashboard leem exatamente os mesmos relacionamentos Prisma.
export interface ProjectIdentification {
  sector: string;
  narrative: string | null; // sempre null hoje — Project.narrativeId nunca é escrito por nenhum repositório (ver DATA_DICTIONARY.md)
  chains: string[];
  discoveredAt: string | null;
  discoverySource: string | null;
  // Sprint 19 (External Identity Mapping): curadoria manual, nunca inferida — ver
  // EXTERNAL_IDENTITY_ARCHITECTURE.md. `null` = a fonte correspondente (GitHub Releases/
  // Snapshot Governance) nunca é chamada para este projeto.
  githubRepo: string | null;
  snapshotSpace: string | null;
  // Sprint 23 (Discourse Governance Intelligence): mesma filosofia — curadoria manual, nunca
  // inferida. `null` = Discourse nunca é chamado para este projeto.
  discourseForumUrl: string | null;
}

export interface ProjectClassification {
  // Emerging/Established: sempre null — critério ainda não implementado (não inferir).
  segment: null;
  researchPriority: { score: number; rank: number; selectionModelVersion: string } | null;
}

export interface ProjectTokenomicsRaw {
  marketCapUsd: number | null;
  // Sprint 11 (integração CoinGecko): deixa de ser sempre `null` — populado quando
  // `Project.coinGeckoId` é conhecido e a chamada teve sucesso.
  fdvUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  unlocks: Array<{ unlockDate: string; amount: number; allocationType: string }>;
}

// Sprint 13 (Perfil do Projeto + Onde é Negociado) — mesmas funções já usadas por
// packages/research-engine/src/report.ts, reaproveitadas aqui (nunca duplicadas) para exibir na
// página do projeto, não só no Markdown baixável.
export interface ProjectProfileView {
  descriptionEn: string | null;
  descriptionPt: string | null;
  categories: string[];
  platforms: string[];
  homepageUrl: string | null;
  retrievedAt: string;
}

export interface ProjectMarketView {
  exchangeName: string;
  baseSymbol: string;
  targetSymbol: string;
  marketType: string;
  tradeUrl: string | null;
  volumeUsd: number | null;
  retrievedAt: string;
}

export interface ProjectDashboardData {
  slug: string;
  name: string;
  tvl: Awaited<ReturnType<typeof calculateWindowMetrics>>;
  revenue: Awaited<ReturnType<typeof calculateWindowMetrics>>;
  fees: Awaited<ReturnType<typeof calculateWindowMetrics>>;
  tvlHistory: Array<{ sourceTimestamp: string; valueUsd: number }>;
  profile: ProjectProfileView | null;
  markets: ProjectMarketView[];
  lastUpdated: string | null;
  identification: ProjectIdentification;
  classification: ProjectClassification;
  tokenomics: ProjectTokenomicsRaw;
}

/**
 * Lê os dados já persistidos (não dispara nenhuma chamada externa) para exibição no
 * dashboard (Fase 15/16). Se o pipeline manual nunca rodou para o projeto, `project` é null.
 */
export async function getProjectDashboardData(slug: string): Promise<ProjectDashboardData | null> {
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

  const [tvlSeries, revenueSeries, feesSeries, latestSelection, profile, markets] =
    await Promise.all([
      loadSeries("TVL", project.id),
      loadSeries("REVENUE", project.id),
      loadSeries("FEES", project.id),
      prisma.researchRunSelection.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
      }),
      getLatestProjectProfile(project.id),
      getTokenMarkets(project.id),
    ]);

  const lastTvlSnapshot = await prisma.tvlSnapshot.findFirst({
    where: { projectId: project.id },
    orderBy: { retrievedAt: "desc" },
  });

  return {
    slug: project.slug,
    name: project.name,
    tvl: calculateWindowMetrics(tvlSeries),
    revenue: calculateWindowMetrics(revenueSeries),
    fees: calculateWindowMetrics(feesSeries),
    tvlHistory: tvlSeries.map((point) => ({
      sourceTimestamp: point.sourceTimestamp.toISOString(),
      valueUsd: point.valueUsd,
    })),
    lastUpdated: lastTvlSnapshot?.retrievedAt.toISOString() ?? null,
    profile: profile
      ? {
          descriptionEn: profile.descriptionEn,
          descriptionPt: profile.descriptionPt,
          categories: profile.categories,
          platforms: profile.platforms,
          homepageUrl: profile.homepageUrl,
          retrievedAt: profile.retrievedAt.toISOString(),
        }
      : null,
    markets: markets.map((m: TokenMarketView) => ({
      exchangeName: m.exchangeName,
      baseSymbol: m.baseSymbol,
      targetSymbol: m.targetSymbol,
      marketType: m.marketType,
      tradeUrl: m.tradeUrl,
      volumeUsd: m.volumeUsd,
      retrievedAt: m.retrievedAt.toISOString(),
    })),
    identification: {
      sector: project.sector.name,
      narrative: project.narrativeId,
      chains: project.projectChains.map((pc) => pc.chain.name),
      discoveredAt: project.discoveredAt?.toISOString() ?? null,
      discoverySource: project.discoverySource,
      githubRepo: project.githubRepo,
      snapshotSpace: project.snapshotSpace,
      discourseForumUrl: project.discourseForumUrl,
    },
    classification: {
      segment: null,
      researchPriority: latestSelection
        ? {
            score: Number(latestSelection.priorityScore),
            rank: latestSelection.rank,
            selectionModelVersion: latestSelection.selectionModelVersion,
          }
        : null,
    },
    tokenomics: {
      marketCapUsd: project.token?.marketCapUsd ? Number(project.token.marketCapUsd) : null,
      fdvUsd: project.token?.fdvUsd ? Number(project.token.fdvUsd) : null,
      circulatingSupply: project.token?.circulatingSupply
        ? Number(project.token.circulatingSupply)
        : null,
      totalSupply: project.token?.totalSupply ? Number(project.token.totalSupply) : null,
      maxSupply: project.token?.maxSupply ? Number(project.token.maxSupply) : null,
      unlocks: project.tokenUnlocks.map((u) => ({
        unlockDate: u.unlockDate.toISOString(),
        amount: Number(u.amount),
        allocationType: u.allocationType,
      })),
    },
  };
}

export interface ProjectWithDataItem {
  slug: string;
  name: string;
  /** Data do Fundamental Score mais recente — quando os dados do projeto foram atualizados pela
   * última vez (o score só é gravado ao fim de uma pesquisa concluída). */
  lastUpdatedAt: string;
  /** Seleção mais recente em alguma Research Run, se houver (projeto pesquisado por run manual
   * com slugs explícitos, ou cujo histórico de seleção se perdeu, não tem). */
  lastSelection: { rank: number; priorityScore: number } | null;
}

// "Projetos com dados" = todo projeto já pesquisado ao menos uma vez (tem Fundamental Score),
// não só o Top 10 da run mais recente. Projeto selecionado de novo tem os dados atualizados pelo
// pipeline; os demais mantêm os dados da última pesquisa (nada é apagado quando um projeto sai
// do Top 10). Antes a lista vinha do histórico de `ResearchRunSelection` — sumia quando esse
// histórico se perdia (2026-10-01) e marcava como "atualizado" projeto selecionado cuja
// pesquisa falhou. Ordenado pela última atualização desc.
export async function listProjectsWithData(): Promise<ProjectWithDataItem[]> {
  const latestScores = await prisma.fundamentalScore.groupBy({
    by: ["projectId"],
    _max: { createdAt: true },
  });
  const projectIds = latestScores.map((s) => s.projectId);
  if (projectIds.length === 0) return [];

  const [projects, selections] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, slug: true, name: true },
    }),
    prisma.researchRunSelection.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, rank: true, priorityScore: true },
      orderBy: { researchRun: { createdAt: "desc" } },
      distinct: ["projectId"],
    }),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const selectionByProject = new Map(selections.map((s) => [s.projectId, s]));

  const items: ProjectWithDataItem[] = [];
  for (const score of latestScores) {
    const project = projectById.get(score.projectId);
    const lastUpdatedAt = score._max.createdAt;
    if (!project || !lastUpdatedAt) continue;
    const selection = selectionByProject.get(score.projectId);
    items.push({
      slug: project.slug,
      name: project.name,
      lastUpdatedAt: lastUpdatedAt.toISOString(),
      lastSelection: selection
        ? { rank: selection.rank, priorityScore: Number(selection.priorityScore) }
        : null,
    });
  }

  return items.sort((a, b) => {
    const dateDiff = new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
    return dateDiff !== 0 ? dateDiff : a.name.localeCompare(b.name);
  });
}

// Sprint 19 (External Identity Mapping): único caminho de escrita para githubRepo/
// snapshotSpace — curadoria manual, nunca inferida por nome (ver
// EXTERNAL_IDENTITY_ARCHITECTURE.md). Reaproveita os MESMOS validadores anti-SSRF que os
// clients de packages/defi-data usam antes de montar uma URL — defesa em profundidade, não
// confiamos apenas na validação daqui.
export class InvalidExternalIdentityError extends Error {}
export class ProjectNotFoundError extends Error {}

export async function updateProjectExternalIdentity(
  slug: string,
  input: {
    githubRepo?: string | null;
    snapshotSpace?: string | null;
    discourseForumUrl?: string | null;
  },
): Promise<void> {
  const data: {
    githubRepo?: string | null;
    snapshotSpace?: string | null;
    discourseForumUrl?: string | null;
  } = {};

  if (input.githubRepo !== undefined) {
    if (input.githubRepo !== null && !isValidGithubRepo(input.githubRepo)) {
      throw new InvalidExternalIdentityError(
        'githubRepo inválido — formato esperado "owner/repo" (sem URL/protocolo).',
      );
    }
    data.githubRepo = input.githubRepo;
  }

  if (input.snapshotSpace !== undefined) {
    if (input.snapshotSpace !== null && !isValidSnapshotSpace(input.snapshotSpace)) {
      throw new InvalidExternalIdentityError(
        'snapshotSpace inválido — formato esperado de slug simples (ex.: "ens.eth"), sem URL.',
      );
    }
    data.snapshotSpace = input.snapshotSpace;
  }

  if (input.discourseForumUrl !== undefined) {
    if (input.discourseForumUrl !== null && !isValidDiscourseForumUrl(input.discourseForumUrl)) {
      throw new InvalidExternalIdentityError(
        "discourseForumUrl inválido — exige https://, sem IP privado/localhost, sem credenciais na URL.",
      );
    }
    data.discourseForumUrl = input.discourseForumUrl;
  }

  try {
    await prisma.project.update({ where: { slug }, data });
  } catch {
    throw new ProjectNotFoundError(`Projeto "${slug}" não encontrado.`);
  }
}
