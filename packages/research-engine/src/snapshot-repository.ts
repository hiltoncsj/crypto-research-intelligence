import {
  DataQuality as PrismaDataQuality,
  prisma,
  SnapshotSource as PrismaSnapshotSource,
} from "@crypto-research/database";
import type { NormalizedTimeSeriesPoint } from "@crypto-research/defi-data";

import type { ValidationOutcome } from "./validator";
import { validatePoint } from "./validator";

// Sprint 3 (Fase 13/14): repository — a única camada que fala com o Prisma para snapshots.
// Normalizer/Validator/Metrics permanecem puramente funcionais; isto isola o acesso a banco.
//
// Implementado com um branch explícito por `kind` (em vez de despachar dinamicamente pelo
// nome do model Prisma) para manter tipagem forte sem `any` — TVL/Revenue/Fees têm nomes de
// campo de valor diferentes (`valueUsd`/`revenueUsd`/`feesUsd`), então o Prisma Client gera
// tipos de input distintos para cada `create`/`findUnique`.

export type SnapshotKind = "TVL" | "REVENUE" | "FEES";

export interface PersistPointResult {
  outcome: "created" | "skipped_duplicate" | "rejected_invalid" | "skipped_missing";
  validation: ValidationOutcome;
}

export interface PersistedPoint {
  sourceTimestamp: Date;
  valueUsd: number;
}

async function findExistingTvl(projectId: string, sourceTimestamp: Date) {
  return prisma.tvlSnapshot.findUnique({
    where: {
      tvl_snapshot_dedupe: { projectId, source: PrismaSnapshotSource.DEFILLAMA, sourceTimestamp },
    },
  });
}

async function findExistingRevenue(projectId: string, sourceTimestamp: Date) {
  return prisma.revenueSnapshot.findUnique({
    where: {
      revenue_snapshot_dedupe: {
        projectId,
        source: PrismaSnapshotSource.DEFILLAMA,
        sourceTimestamp,
      },
    },
  });
}

async function findExistingFees(projectId: string, sourceTimestamp: Date) {
  return prisma.feeSnapshot.findUnique({
    where: {
      fee_snapshot_dedupe: { projectId, source: PrismaSnapshotSource.DEFILLAMA, sourceTimestamp },
    },
  });
}

async function createSnapshot(
  kind: SnapshotKind,
  projectId: string,
  point: NormalizedTimeSeriesPoint,
  sourceTimestamp: Date,
  retrievedAt: string,
  quality: PrismaDataQuality,
  qualityReason: string | null,
): Promise<void> {
  const base = {
    projectId,
    source: PrismaSnapshotSource.DEFILLAMA,
    sourceTimestamp,
    retrievedAt: new Date(retrievedAt),
    quality,
    qualityReason,
  };

  if (kind === "TVL") {
    await prisma.tvlSnapshot.create({ data: { ...base, valueUsd: point.valueUsd } });
    return;
  }
  if (kind === "REVENUE") {
    await prisma.revenueSnapshot.create({ data: { ...base, revenueUsd: point.valueUsd } });
    return;
  }
  await prisma.feeSnapshot.create({ data: { ...base, feesUsd: point.valueUsd } });
}

async function findExisting(kind: SnapshotKind, projectId: string, sourceTimestamp: Date) {
  if (kind === "TVL") return findExistingTvl(projectId, sourceTimestamp);
  if (kind === "REVENUE") return findExistingRevenue(projectId, sourceTimestamp);
  return findExistingFees(projectId, sourceTimestamp);
}

/**
 * Persiste um único ponto de série temporal, aplicando o Validator (Fase 5/6) e a
 * deduplicação por (projectId, source, sourceTimestamp) (Fase 3/11). Idempotente: rodar duas
 * vezes com o mesmo ponto não cria duplicata — a segunda chamada retorna `skipped_duplicate`.
 */
export async function persistSnapshotPoint(
  kind: SnapshotKind,
  projectId: string,
  point: NormalizedTimeSeriesPoint | undefined,
  previousValueUsd: number | null,
  retrievedAt: string,
): Promise<PersistPointResult> {
  const validation = validatePoint(point, previousValueUsd);

  if (validation.status === "MISSING") {
    return { outcome: "skipped_missing", validation };
  }
  if (validation.status === "INVALID") {
    return { outcome: "rejected_invalid", validation };
  }

  // A partir daqui, `point` é garantidamente definido (VALID ou SUSPICIOUS).
  const p = point as NormalizedTimeSeriesPoint;
  const sourceTimestamp = new Date(p.sourceTimestamp);

  const existing = await findExisting(kind, projectId, sourceTimestamp);
  if (existing) {
    return { outcome: "skipped_duplicate", validation };
  }

  const quality =
    validation.status === "VALID" ? PrismaDataQuality.VALID : PrismaDataQuality.SUSPICIOUS;
  const qualityReason = validation.status === "SUSPICIOUS" ? validation.reason : null;

  await createSnapshot(kind, projectId, p, sourceTimestamp, retrievedAt, quality, qualityReason);

  return { outcome: "created", validation };
}

/**
 * Persiste uma série inteira de pontos (ex: histórico completo de TVL de um projeto),
 * comparando cada ponto ao anterior DA PRÓPRIA SÉRIE para detecção de anomalia (Fase 6),
 * não ao último valor já persistido no banco — isso mantém a validação determinística e
 * independente de quantas vezes o pipeline já rodou antes.
 */
export async function persistSnapshotSeries(
  kind: SnapshotKind,
  projectId: string,
  points: NormalizedTimeSeriesPoint[],
  retrievedAt: string,
): Promise<{
  created: number;
  skippedDuplicate: number;
  rejectedInvalid: number;
  suspicious: number;
}> {
  let created = 0;
  let skippedDuplicate = 0;
  let rejectedInvalid = 0;
  let suspicious = 0;
  let previousValueUsd: number | null = null;

  for (const point of points) {
    const result = await persistSnapshotPoint(
      kind,
      projectId,
      point,
      previousValueUsd,
      retrievedAt,
    );
    if (result.outcome === "created") created += 1;
    if (result.outcome === "skipped_duplicate") skippedDuplicate += 1;
    if (result.outcome === "rejected_invalid") rejectedInvalid += 1;
    // Sprint 4 (Fase 1): contagem de pontos SUSPICIOUS desta série — usada pelo Worker para
    // preencher `research_runs.suspicious_projects` (Fase 1: projeto é "suspicious" se pelo
    // menos um snapshot seu nesta run caiu nesse caso, mesmo tendo sido persistido).
    if (result.validation.status === "SUSPICIOUS") suspicious += 1;
    previousValueUsd = point.valueUsd;
  }

  return { created, skippedDuplicate, rejectedInvalid, suspicious };
}

/**
 * Sprint 5 (Fase 6/28): carrega a série de vários projetos de uma vez (1 query por `kind`),
 * agrupando em memória — evita N+1 ao computar percentiles de pares do mesmo setor (Fase 28:
 * "evitar queries N+1 desnecessárias").
 */
export async function loadSeriesForProjects(
  kind: SnapshotKind,
  projectIds: readonly string[],
): Promise<Map<string, PersistedPoint[]>> {
  const result = new Map<string, PersistedPoint[]>();
  if (projectIds.length === 0) return result;

  if (kind === "TVL") {
    const rows = await prisma.tvlSnapshot.findMany({
      where: { projectId: { in: [...projectIds] } },
      orderBy: { sourceTimestamp: "asc" },
    });
    for (const row of rows) {
      const list = result.get(row.projectId) ?? [];
      list.push({ sourceTimestamp: row.sourceTimestamp, valueUsd: Number(row.valueUsd) });
      result.set(row.projectId, list);
    }
    return result;
  }

  if (kind === "REVENUE") {
    const rows = await prisma.revenueSnapshot.findMany({
      where: { projectId: { in: [...projectIds] } },
      orderBy: { sourceTimestamp: "asc" },
    });
    for (const row of rows) {
      const list = result.get(row.projectId) ?? [];
      list.push({ sourceTimestamp: row.sourceTimestamp, valueUsd: Number(row.revenueUsd) });
      result.set(row.projectId, list);
    }
    return result;
  }

  const rows = await prisma.feeSnapshot.findMany({
    where: { projectId: { in: [...projectIds] } },
    orderBy: { sourceTimestamp: "asc" },
  });
  for (const row of rows) {
    const list = result.get(row.projectId) ?? [];
    list.push({ sourceTimestamp: row.sourceTimestamp, valueUsd: Number(row.feesUsd) });
    result.set(row.projectId, list);
  }
  return result;
}

export async function loadSeries(kind: SnapshotKind, projectId: string): Promise<PersistedPoint[]> {
  if (kind === "TVL") {
    const rows = await prisma.tvlSnapshot.findMany({
      where: { projectId },
      orderBy: { sourceTimestamp: "asc" },
    });
    return rows.map((row) => ({
      sourceTimestamp: row.sourceTimestamp,
      valueUsd: Number(row.valueUsd),
    }));
  }
  if (kind === "REVENUE") {
    const rows = await prisma.revenueSnapshot.findMany({
      where: { projectId },
      orderBy: { sourceTimestamp: "asc" },
    });
    return rows.map((row) => ({
      sourceTimestamp: row.sourceTimestamp,
      valueUsd: Number(row.revenueUsd),
    }));
  }
  const rows = await prisma.feeSnapshot.findMany({
    where: { projectId },
    orderBy: { sourceTimestamp: "asc" },
  });
  return rows.map((row) => ({
    sourceTimestamp: row.sourceTimestamp,
    valueUsd: Number(row.feesUsd),
  }));
}
