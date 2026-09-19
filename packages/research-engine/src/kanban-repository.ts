import {
  prisma,
  KanbanCardStatus as PrismaKanbanCardStatus,
  KanbanColumnKey as PrismaKanbanColumnKey,
} from "@crypto-research/database";
import {
  KanbanActorType,
  KanbanCardStatus,
  KanbanColumnKey,
  KanbanSubcolumn,
} from "@crypto-research/shared";

import { logKanbanEvent } from "./logger";

// Sprint 7 — Kanban Pull System (seções 5, 9, 14, 26 do prompt de implementação).
//
// DECISÃO DE ARQUITETURA (documentada aqui porque não é óbvia lendo o código): existem DUAS
// formas de um card mudar de coluna, com regras diferentes de propósito:
//
// 1. `recordProjectDiscovered`/`advanceProjectCard`/`setCardBlocked` — chamadas pelo próprio
//    research-engine (pipeline.ts) e pelo Worker conforme o pipeline REAL avança. Estas nunca
//    bloqueiam o pipeline: o BullMQ/Worker já tem seu próprio controle de concorrência (lock
//    global — só uma Research Run por vez, seção 26: "BullMQ é infraestrutura de execução,
//    Kanban é gestão do fluxo") e negar o avanço aqui faria dados reais já coletados ficarem
//    "presos" fora do board. Se o WIP da coluna de destino já está no limite, registramos
//    `kanban.wip_violation` (visibilidade/gargalo, seção 22-24) mas o card avança do mesmo jeito
//    — ator sempre SYSTEM.
// 2. `pullCard` — a operação PULL explícita (seção 11), usada pela API/UI para um humano ou
//    agente puxar um card do buffer (`READY`) de uma etapa para a próxima. Esta SIM aplica o
//    WIP Limit de forma estrita no backend (seção 8: "o backend deve impedir isso") dentro de
//    uma transação com row lock (seção 48) — é o mecanismo real de "pull" do Pull System.
//
// As 6 colunas usam os nomes das etapas REAIS do research-engine (pipeline.ts) em vez dos
// genéricos "Analysis/Validation/Review" do fluxo inicial sugerido — seção 5 do Pull System:
// "começar com o que já existe", não forçar uma estrutura organizacional nova.

export const DEFAULT_BOARD_NAME = "Research Pipeline";

interface ColumnDef {
  key: KanbanColumnKey;
  name: string;
  position: number;
  wipLimit: number | null;
}

// Seção 9 do Pull System: "WIP ≈ capacidade disponível da etapa". O pipeline hoje processa
// projetos SEQUENCIALMENTE, um de cada vez, dentro de uma única Research Run (Fase 19 do
// Sprint 3: "evitar rajada de chamadas simultâneas à DefiLlama") — a capacidade real de
// qualquer etapa de execução é 1. BACKLOG (fila de entrada) e PUBLISHED (estado terminal) não
// são etapas de processamento, então ficam sem limite. Ajustável depois via
// `KanbanColumn.wipLimit`, nunca recalculado automaticamente a partir do código.
const COLUMN_DEFS: ColumnDef[] = [
  { key: KanbanColumnKey.BACKLOG, name: "Backlog", position: 0, wipLimit: null },
  { key: KanbanColumnKey.DISCOVERY, name: "Discovery", position: 1, wipLimit: 1 },
  { key: KanbanColumnKey.DATA_COLLECTION, name: "Data Collection", position: 2, wipLimit: 1 },
  {
    key: KanbanColumnKey.FUNDAMENTAL_ANALYSIS,
    name: "Fundamental Analysis",
    position: 3,
    wipLimit: 1,
  },
  { key: KanbanColumnKey.SCORING, name: "Scoring", position: 4, wipLimit: 1 },
  { key: KanbanColumnKey.PUBLISHED, name: "Published", position: 5, wipLimit: null },
];

type BoardWithColumns = Awaited<ReturnType<typeof loadBoardWithColumns>>;

async function loadBoardWithColumns() {
  return prisma.kanbanBoard.findUniqueOrThrow({
    where: { name: DEFAULT_BOARD_NAME },
    include: { columns: { orderBy: { position: "asc" } } },
  });
}

// As 6 colunas são constantes de código (COLUMN_DEFS), não editáveis em runtime — não há
// necessidade de reconferir/reupsertar o board a cada chamada do pipeline. `advanceProjectCard`
// é chamado várias vezes por projeto dentro de uma única Research Run (seção 26 do Pull
// System aplicada também a performance: o pipeline já sofreu um bug real de latência do
// Postgres no Sprint 6 — infrastructure/workers/research-worker.ts — então round-trips
// redundantes por chamada importam). Memoizado em processo; um restart do Worker/Next.js
// já revalida na próxima chamada.
let cachedBoard: BoardWithColumns | null = null;

/** Idempotente: cria o board singleton e as 6 colunas fixas do MVP na primeira chamada do
 * processo; chamadas seguintes reaproveitam o cache em memória (nunca duplica, nunca refaz
 * os upserts sem necessidade). */
export async function ensureDefaultBoard(): Promise<BoardWithColumns> {
  if (cachedBoard) return cachedBoard;

  const board = await prisma.kanbanBoard.upsert({
    where: { name: DEFAULT_BOARD_NAME },
    update: {},
    create: { name: DEFAULT_BOARD_NAME },
  });

  for (const def of COLUMN_DEFS) {
    await prisma.kanbanColumn.upsert({
      where: { boardId_key: { boardId: board.id, key: def.key } },
      update: { name: def.name, position: def.position },
      create: {
        boardId: board.id,
        key: def.key,
        name: def.name,
        position: def.position,
        wipLimit: def.wipLimit,
      },
    });
  }

  cachedBoard = await loadBoardWithColumns();
  return cachedBoard;
}

// Seção 33 do Pull System: "Blocked ≠ WIP livre" — um card BLOCKED continua ocupando a vaga de
// WIP da coluna (ele só sai do WIP quando concluído/DONE ou movido para fora da coluna). Contar
// só READY/IN_PROGRESS mascarava gargalos reais atrás de bloqueios (bug encontrado na auditoria
// do Sprint 7). WIP_ACTIVE_STATUSES é a lista canônica usada por todo o cálculo de WIP do board.
export const WIP_ACTIVE_STATUSES = [
  KanbanCardStatus.READY,
  KanbanCardStatus.IN_PROGRESS,
  KanbanCardStatus.BLOCKED,
] as const;

async function countActiveCardsInColumn(columnId: string, excludeCardId?: string): Promise<number> {
  return prisma.kanbanCard.count({
    where: {
      columnId,
      cardStatus: { in: [...WIP_ACTIVE_STATUSES] },
      ...(excludeCardId ? { id: { not: excludeCardId } } : {}),
    },
  });
}

/** Chamada pelo pipeline (pipeline.ts) quando um projeto é descoberto/upsertado pela primeira
 * vez numa Research Run (seção 14 do plano original / seção 6 do Pull System: "Research Run
 * cria/atualiza card em DISCOVERY quando um projeto novo é descoberto"). Se o card já existe
 * (o projeto já tinha sido pesquisado antes), apenas o traz de volta para DISCOVERY. */
export async function recordProjectDiscovered(
  projectId: string,
  projectTitle: string,
  researchRunId?: string,
  // Sprint 8 (seção 12): diferencia a origem do card sem criar um mecanismo novo — reaproveita
  // o campo `KanbanCard.type`, já existente e antes só com o valor constante "RESEARCH".
  // "DISCOVERY_AUTO" identifica cards nascidos do mecanismo de descoberta automática
  // (discovery.ts); "RESEARCH" (default) preserva o comportamento already-existing da pesquisa
  // manual/pipeline — nada muda para quem já chamava esta função sem o novo argumento.
  cardType: "RESEARCH" | "DISCOVERY_AUTO" = "RESEARCH",
): Promise<void> {
  const board = await ensureDefaultBoard();
  const existing = await prisma.kanbanCard.findFirst({ where: { boardId: board.id, projectId } });

  if (existing) {
    await advanceProjectCard(projectId, KanbanColumnKey.DISCOVERY, {
      researchRunId,
      reason: "PROJECT_REDISCOVERED",
    });
    return;
  }

  const discoveryColumn = board.columns.find((c) => c.key === KanbanColumnKey.DISCOVERY);
  if (!discoveryColumn) throw new Error("Coluna DISCOVERY não encontrada no board padrão.");

  const card = await prisma.kanbanCard.create({
    data: {
      boardId: board.id,
      columnId: discoveryColumn.id,
      projectId,
      researchRunId: researchRunId ?? null,
      title: projectTitle,
      type: cardType,
      cardStatus: KanbanCardStatus.IN_PROGRESS,
      subcolumn: KanbanSubcolumn.IN_PROGRESS,
      assigneeType: KanbanActorType.SYSTEM,
      startedAt: new Date(),
    },
  });

  await prisma.kanbanCardMovement.create({
    data: {
      cardId: card.id,
      toColumnId: discoveryColumn.id,
      toStatus: KanbanCardStatus.IN_PROGRESS,
      actorType: KanbanActorType.SYSTEM,
      reason: "PROJECT_DISCOVERED",
    },
  });

  logKanbanEvent("kanban.card_created", {
    cardId: card.id,
    projectId,
    column: discoveryColumn.key,
  });
}

export interface AdvanceCardOptions {
  researchRunId?: string;
  reason: string;
  status?: KanbanCardStatus;
}

/** Avança automaticamente o card de um projeto para `columnKey` — usada pelo pipeline conforme
 * ele progride de verdade (coleta concluída, score calculado, run finalizada). Nunca bloqueia o
 * pipeline por causa de WIP (ver nota de arquitetura no topo do arquivo); registra
 * `kanban.wip_violation` para visibilidade quando o limite já está estourado. */
export async function advanceProjectCard(
  projectId: string,
  columnKey: KanbanColumnKey,
  opts: AdvanceCardOptions,
) {
  const board = await ensureDefaultBoard();
  const column = board.columns.find((c) => c.key === columnKey);
  if (!column) throw new Error(`Coluna ${columnKey} não encontrada no board padrão.`);

  const card = await prisma.kanbanCard.findFirst({ where: { boardId: board.id, projectId } });
  // Nenhum card ainda (chamada fora de ordem, ex.: teste isolado sem discovery prévio) — não é
  // um erro fatal do pipeline, só não há o que atualizar no Kanban.
  if (!card) return null;

  if (card.cardStatus === KanbanCardStatus.BLOCKED) {
    // Seção 17: card bloqueado não avança nem regride automaticamente — só via unblock explícito.
    return card;
  }

  const wip = await countActiveCardsInColumn(column.id, card.id);
  if (column.wipLimit !== null && wip >= column.wipLimit && card.columnId !== column.id) {
    logKanbanEvent("kanban.wip_violation", {
      projectId,
      cardId: card.id,
      column: column.key,
      wip,
      wipLimit: column.wipLimit,
    });
  }

  const status = opts.status ?? KanbanCardStatus.IN_PROGRESS;
  const movedColumn = card.columnId !== column.id;

  const updated = await prisma.kanbanCard.update({
    where: { id: card.id },
    data: {
      columnId: column.id,
      cardStatus: status,
      subcolumn:
        status === KanbanCardStatus.READY ? KanbanSubcolumn.READY : KanbanSubcolumn.IN_PROGRESS,
      researchRunId: opts.researchRunId ?? card.researchRunId,
      enteredColumnAt: movedColumn ? new Date() : card.enteredColumnAt,
      completedAt: columnKey === KanbanColumnKey.PUBLISHED ? new Date() : card.completedAt,
    },
  });

  if (movedColumn || card.cardStatus !== status) {
    await prisma.kanbanCardMovement.create({
      data: {
        cardId: card.id,
        fromColumnId: card.columnId,
        toColumnId: column.id,
        fromStatus: card.cardStatus,
        toStatus: status,
        actorType: KanbanActorType.SYSTEM,
        reason: opts.reason,
      },
    });
    logKanbanEvent("kanban.card_moved", {
      cardId: card.id,
      projectId,
      from: card.columnId,
      to: column.id,
      toKey: column.key,
    });
  }

  return updated;
}

// Motivo de movimento usado exclusivamente por `revertRunCardsToBacklog` — string reaproveitando
// o campo `reason` já existente em `KanbanCardMovement` (nenhum campo novo), usada por
// `kanban-metrics.ts` para excluir esses movimentos do cálculo de Cycle Time médio: uma tarefa
// abortada por cancelamento não é um ciclo real concluído, e não deve puxar a média para baixo.
export const RUN_CANCELLED_MOVEMENT_REASON = "RESEARCH_RUN_CANCELLED";

/** Chamada quando uma Research Run é cancelada (QUEUED→CANCELLED direto ou RUNNING→CANCELLED via
 * `cancelRequested`, ver research-runs.ts/research-worker.ts): os cards dessa run que ainda
 * estavam em etapas de processamento (Discovery/Data Collection/Fundamental Analysis/Scoring)
 * voltam para BACKLOG — nunca são apagados (histórico imutável, seção 21), só devolvidos à fila
 * para uma run futura decidir retomar. Cards já em PUBLISHED não são tocados (trabalho real já
 * entregue). Retorna quantos cards foram revertidos. */
export async function revertRunCardsToBacklog(researchRunId: string): Promise<number> {
  const board = await ensureDefaultBoard();
  const backlogColumn = board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG);
  if (!backlogColumn) throw new Error("Coluna BACKLOG não encontrada no board padrão.");

  const inFlightKeys: PrismaKanbanColumnKey[] = [
    PrismaKanbanColumnKey.DISCOVERY,
    PrismaKanbanColumnKey.DATA_COLLECTION,
    PrismaKanbanColumnKey.FUNDAMENTAL_ANALYSIS,
    PrismaKanbanColumnKey.SCORING,
  ];
  const inFlightColumnIds = board.columns
    .filter((c) => inFlightKeys.includes(c.key))
    .map((c) => c.id);

  const cards = await prisma.kanbanCard.findMany({
    where: { boardId: board.id, researchRunId, columnId: { in: inFlightColumnIds } },
  });

  for (const card of cards) {
    await prisma.kanbanCard.update({
      where: { id: card.id },
      data: {
        columnId: backlogColumn.id,
        cardStatus: KanbanCardStatus.READY,
        subcolumn: KanbanSubcolumn.READY,
        enteredColumnAt: new Date(),
      },
    });
    await prisma.kanbanCardMovement.create({
      data: {
        cardId: card.id,
        fromColumnId: card.columnId,
        toColumnId: backlogColumn.id,
        fromStatus: card.cardStatus,
        toStatus: KanbanCardStatus.READY,
        actorType: KanbanActorType.SYSTEM,
        reason: RUN_CANCELLED_MOVEMENT_REASON,
      },
    });
  }

  if (cards.length > 0) {
    logKanbanEvent("kanban.run_cancelled_cards_reverted", { researchRunId, count: cards.length });
  }

  return cards.length;
}

// Reaproveita `KanbanPolicy` (seção 27/28/29 do Pull System — chave/valor JSON por board, mesmo
// mecanismo do `urgent_policy`) para guardar a partir de qual instante o cronômetro/média de
// Data Collection passa a contar. Sem isso, o histórico de `KanbanCardMovement` anterior à
// existência dessa feature (ciclos que nunca foram medidos com esse propósito, alguns até
// contaminados por dados de teste) entraria no cálculo de `avgCycleTimeHours` como se fosse um
// dado real — nunca apagamos o histórico (seção 21), só marcamos a partir de onde ele passa a
// valer para esta métrica específica.
export const DATA_COLLECTION_METRIC_BASELINE_POLICY_KEY = "data_collection_metric_baseline";

export async function resetDataCollectionMetricBaseline(): Promise<Date> {
  const board = await ensureDefaultBoard();
  const since = new Date();
  await prisma.kanbanPolicy.upsert({
    where: { boardId_key: { boardId: board.id, key: DATA_COLLECTION_METRIC_BASELINE_POLICY_KEY } },
    create: {
      boardId: board.id,
      key: DATA_COLLECTION_METRIC_BASELINE_POLICY_KEY,
      value: { since: since.toISOString() },
    },
    update: { value: { since: since.toISOString() } },
  });
  logKanbanEvent("kanban.data_collection_baseline_reset", { since });
  return since;
}

export async function getDataCollectionMetricBaseline(): Promise<Date | null> {
  const board = await ensureDefaultBoard();
  const policyRow = await prisma.kanbanPolicy.findUnique({
    where: { boardId_key: { boardId: board.id, key: DATA_COLLECTION_METRIC_BASELINE_POLICY_KEY } },
  });
  const value = policyRow?.value as { since: string } | undefined;
  return value ? new Date(value.since) : null;
}

// Tipado com o enum do Prisma Client (`PrismaKanbanCardStatus`), não o espelhado em
// `@crypto-research/shared` — `card` vem sempre de uma query Prisma, e os dois enums, embora
// com os mesmos valores string, são tipos nominais distintos para o TypeScript.
async function blockCardRecord(
  card: { id: string; columnId: string; cardStatus: PrismaKanbanCardStatus },
  blockedReason: string,
  actorType: KanbanActorType,
  actorId?: string,
) {
  if (card.cardStatus === KanbanCardStatus.BLOCKED)
    return prisma.kanbanCard.findUniqueOrThrow({ where: { id: card.id } }); // idempotente

  const updated = await prisma.kanbanCard.update({
    where: { id: card.id },
    data: {
      cardStatus: KanbanCardStatus.BLOCKED,
      blockedReason,
      blockedAt: new Date(),
      blockedBy: actorId ?? actorType,
    },
  });

  await prisma.kanbanCardMovement.create({
    data: {
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId: card.columnId,
      fromStatus: card.cardStatus,
      toStatus: KanbanCardStatus.BLOCKED,
      actorType,
      actorId,
      reason: blockedReason,
    },
  });

  logKanbanEvent("kanban.card_blocked", { cardId: card.id, reason: blockedReason });
  return updated;
}

/** Chamada pelo pipeline via `projectId` (nem sempre há um `cardId` à mão nesse ponto). */
export async function setCardBlocked(
  projectId: string,
  blockedReason: string,
  actorType: KanbanActorType = KanbanActorType.SYSTEM,
  actorId?: string,
) {
  const board = await ensureDefaultBoard();
  const card = await prisma.kanbanCard.findFirst({ where: { boardId: board.id, projectId } });
  if (!card) return null;
  return blockCardRecord(card, blockedReason, actorType, actorId);
}

/** Chamada pela API/UI (seção 17: bloqueio manual) diretamente pelo id do card. */
export async function setCardBlockedById(
  cardId: string,
  blockedReason: string,
  actorType: KanbanActorType,
  actorId?: string,
) {
  const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("Card não encontrado.");
  return blockCardRecord(card, blockedReason, actorType, actorId);
}

export async function unblockCard(
  cardId: string,
  actorType: KanbanActorType,
  actorId?: string,
  reason?: string,
) {
  const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("Card não encontrado.");
  if (card.cardStatus !== KanbanCardStatus.BLOCKED) return card;

  const updated = await prisma.kanbanCard.update({
    where: { id: card.id },
    data: {
      cardStatus: KanbanCardStatus.IN_PROGRESS,
      unblockedAt: new Date(),
      unblockedBy: actorId ?? actorType,
    },
  });

  await prisma.kanbanCardMovement.create({
    data: {
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId: card.columnId,
      fromStatus: KanbanCardStatus.BLOCKED,
      toStatus: KanbanCardStatus.IN_PROGRESS,
      actorType,
      actorId,
      reason: reason ?? "UNBLOCKED",
    },
  });

  logKanbanEvent("kanban.card_unblocked", { cardId: card.id, actorType, actorId });
  return updated;
}

export class KanbanPullError extends Error {
  code:
    "WIP_LIMIT_REACHED" | "CARD_NOT_FOUND" | "CARD_NOT_READY" | "COLUMN_NOT_FOUND" | "CARD_BLOCKED";

  constructor(code: KanbanPullError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "KanbanPullError";
  }
}

export interface PullCardInput {
  cardId: string;
  toColumnKey: KanbanColumnKey;
  actorType: KanbanActorType;
  actorId?: string;
  reason?: string;
}

/**
 * Seção 11/48 do Pull System: a operação PULL explícita. Diferente de `advanceProjectCard`,
 * esta APLICA o WIP Limit no backend, de forma atômica (seção 48 — dois agentes não podem
 * puxar o mesmo card, nem estourar o WIP de uma coluna por corrida): a linha da coluna de
 * destino é bloqueada (`SELECT ... FOR UPDATE`) dentro da transação antes de contar o WIP e
 * mover o card, serializando pulls concorrentes para a mesma coluna.
 */
export async function pullCard(input: PullCardInput) {
  return prisma.$transaction(async (tx) => {
    const board = await tx.kanbanBoard.findUniqueOrThrow({ where: { name: DEFAULT_BOARD_NAME } });
    const targetColumn = await tx.kanbanColumn.findUnique({
      where: { boardId_key: { boardId: board.id, key: input.toColumnKey } },
    });
    if (!targetColumn)
      throw new KanbanPullError("COLUMN_NOT_FOUND", "Coluna de destino não encontrada.");

    const lockedRows = await tx.$queryRaw<
      Array<{ id: string; wip_limit: number | null; name: string }>
    >`
      SELECT "id", "wip_limit", "name" FROM "kanban_columns" WHERE "id" = ${targetColumn.id} FOR UPDATE
    `;
    const locked = lockedRows[0];
    if (!locked) throw new KanbanPullError("COLUMN_NOT_FOUND", "Coluna de destino não encontrada.");

    const card = await tx.kanbanCard.findUnique({ where: { id: input.cardId } });
    if (!card) throw new KanbanPullError("CARD_NOT_FOUND", "Card não encontrado.");
    if (card.cardStatus === KanbanCardStatus.BLOCKED) {
      throw new KanbanPullError("CARD_BLOCKED", "Card bloqueado não pode ser puxado.");
    }
    if (card.cardStatus !== KanbanCardStatus.READY) {
      throw new KanbanPullError(
        "CARD_NOT_READY",
        "Só é possível puxar cards no estado READY (buffer da etapa anterior).",
      );
    }

    const wip = await tx.kanbanCard.count({
      where: { columnId: locked.id, cardStatus: { in: [...WIP_ACTIVE_STATUSES] } },
    });
    if (locked.wip_limit !== null && wip >= locked.wip_limit) {
      logKanbanEvent("kanban.card_pull_rejected", {
        cardId: card.id,
        toColumn: input.toColumnKey,
        wip,
        wipLimit: locked.wip_limit,
      });
      throw new KanbanPullError(
        "WIP_LIMIT_REACHED",
        `${locked.name} atingiu o WIP Limit (${wip}/${locked.wip_limit}). A etapa seguinte precisa liberar capacidade antes que este card seja puxado.`,
      );
    }

    const updated = await tx.kanbanCard.update({
      where: { id: card.id },
      data: {
        columnId: locked.id,
        cardStatus: KanbanCardStatus.IN_PROGRESS,
        subcolumn: KanbanSubcolumn.IN_PROGRESS,
        startedAt: card.startedAt ?? new Date(),
        enteredColumnAt: new Date(),
      },
    });

    await tx.kanbanCardMovement.create({
      data: {
        cardId: card.id,
        fromColumnId: card.columnId,
        toColumnId: locked.id,
        fromStatus: card.cardStatus,
        toStatus: KanbanCardStatus.IN_PROGRESS,
        actorType: input.actorType,
        actorId: input.actorId,
        reason: input.reason ?? "PULL",
      },
    });

    logKanbanEvent("kanban.card_pulled", {
      cardId: card.id,
      toColumn: input.toColumnKey,
      actorType: input.actorType,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------------------
// Leitura do board (seção 36 do Pull System: WIP/capacidade precisam ficar visíveis na UI).
// ---------------------------------------------------------------------------------------

// Seção 27 do Pull System: gargalo não é um booleano — é um sinal combinado (WIP no limite,
// buffer crescente, idade do card mais antigo em espera). Quatro níveis, sempre derivados de
// métricas reais, nunca atribuídos arbitrariamente.
export type KanbanRiskLevel = "NORMAL" | "WATCH" | "BOTTLENECK" | "CRITICAL";

export interface ColumnCapacityView {
  id: string;
  key: string;
  name: string;
  position: number;
  wipLimit: number | null;
  wip: number;
  availableCapacity: number | null;
  /** @deprecated mantido por compatibilidade — usar `riskLevel`. Equivale a riskLevel === "BOTTLENECK" || "CRITICAL". */
  bottleneck: boolean;
  riskLevel: KanbanRiskLevel;
  bufferCount: number; // cards em subcolumn READY na coluna (seção 9/10 do Pull System)
  oldestBufferAgeHours: number | null; // idade do card mais antigo no buffer desta coluna
}

export interface CardView {
  id: string;
  columnId: string;
  subcolumn: string;
  cardStatus: string;
  title: string;
  description: string | null;
  priority: number;
  swimlane: string | null;
  type: string;
  assigneeType: string | null;
  assigneeId: string | null;
  projectId: string | null;
  projectSlug: string | null;
  coinGeckoMarketCapRank: number | null;
  researchRunId: string | null;
  urgent: boolean;
  urgentReason: string | null;
  blockedReason: string | null;
  blockedAt: string | null;
  dueDate: string | null;
  tags: unknown;
  enteredColumnAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BoardView {
  boardId: string;
  boardName: string;
  columns: ColumnCapacityView[];
  cards: CardView[];
}

// Seção 27 do Pull System: BOTTLENECK/CRITICAL exigem WIP no limite (sem isso, não há restrição
// de fluxo sendo violada — no máximo um alerta antecipado via WATCH). CRITICAL soma a esse sinal
// evidência de que a fila não está apenas cheia, mas parada (buffer envelhecendo ou cards
// bloqueados presos dentro da própria coluna).
const BUFFER_AGE_CRITICAL_HOURS = 24;
const WIP_UTILIZATION_WATCH_THRESHOLD = 0.7;

export function classifyRisk(params: {
  wip: number;
  wipLimit: number | null;
  bufferCount: number;
  oldestBufferAgeHours: number | null;
  blockedCount: number;
}): KanbanRiskLevel {
  const { wip, wipLimit, bufferCount, oldestBufferAgeHours, blockedCount } = params;
  const atLimit = wipLimit !== null && wip >= wipLimit;

  if (atLimit && (blockedCount > 0 || (oldestBufferAgeHours ?? 0) >= BUFFER_AGE_CRITICAL_HOURS)) {
    return "CRITICAL";
  }
  if (atLimit) {
    return "BOTTLENECK";
  }
  const utilization = wipLimit ? wip / wipLimit : null;
  if (
    (utilization !== null && utilization >= WIP_UTILIZATION_WATCH_THRESHOLD) ||
    bufferCount >= 2
  ) {
    return "WATCH";
  }
  return "NORMAL";
}

export async function getBoardView(): Promise<BoardView> {
  const board = await ensureDefaultBoard();

  const cards = await prisma.kanbanCard.findMany({
    where: { boardId: board.id },
    include: { project: { select: { slug: true, token: { select: { marketCapRank: true } } } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const now = Date.now();
  const columns: ColumnCapacityView[] = board.columns.map((column) => {
    const cardsInColumn = cards.filter((c) => c.columnId === column.id);
    const wip = cardsInColumn.filter((c) =>
      (WIP_ACTIVE_STATUSES as readonly string[]).includes(c.cardStatus),
    ).length;
    const bufferCards = cardsInColumn.filter((c) => c.cardStatus === KanbanCardStatus.READY);
    const bufferCount = bufferCards.length;
    const oldestBufferAgeHours =
      bufferCount > 0
        ? Math.max(
            ...bufferCards.map((c) => (now - c.enteredColumnAt.getTime()) / (1000 * 60 * 60)),
          )
        : null;
    const blockedCount = cardsInColumn.filter(
      (c) => c.cardStatus === KanbanCardStatus.BLOCKED,
    ).length;
    const availableCapacity = column.wipLimit === null ? null : Math.max(column.wipLimit - wip, 0);
    return {
      id: column.id,
      key: column.key,
      name: column.name,
      position: column.position,
      wipLimit: column.wipLimit,
      wip,
      availableCapacity,
      riskLevel: classifyRisk({
        wip,
        wipLimit: column.wipLimit,
        bufferCount,
        oldestBufferAgeHours,
        blockedCount,
      }),
      bottleneck: column.wipLimit !== null && wip >= column.wipLimit,
      bufferCount,
      oldestBufferAgeHours,
    };
  });

  return {
    boardId: board.id,
    boardName: board.name,
    columns,
    cards: cards.map((c) => ({
      id: c.id,
      columnId: c.columnId,
      subcolumn: c.subcolumn,
      cardStatus: c.cardStatus,
      title: c.title,
      description: c.description,
      priority: c.priority,
      swimlane: c.swimlane,
      type: c.type,
      assigneeType: c.assigneeType,
      assigneeId: c.assigneeId,
      projectId: c.projectId,
      projectSlug: c.project?.slug ?? null,
      coinGeckoMarketCapRank: c.project?.token?.marketCapRank ?? null,
      researchRunId: c.researchRunId,
      urgent: c.urgent,
      urgentReason: c.urgentReason,
      blockedReason: c.blockedReason,
      blockedAt: c.blockedAt ? c.blockedAt.toISOString() : null,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      tags: c.tags,
      enteredColumnAt: c.enteredColumnAt.toISOString(),
      startedAt: c.startedAt ? c.startedAt.toISOString() : null,
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Criação manual de card (Backlog) e Urgent (seção 13/14 do Pull System).
// ---------------------------------------------------------------------------------------

export interface CreateCardInput {
  title: string;
  description?: string;
  priority?: number;
  swimlane?: string;
  assigneeType?: KanbanActorType;
  assigneeId?: string;
  tags?: unknown;
}

export async function createBacklogCard(input: CreateCardInput) {
  const board = await ensureDefaultBoard();
  const backlogColumn = board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG);
  if (!backlogColumn) throw new Error("Coluna BACKLOG não encontrada no board padrão.");

  const card = await prisma.kanbanCard.create({
    data: {
      boardId: board.id,
      columnId: backlogColumn.id,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 0,
      swimlane: input.swimlane,
      assigneeType: input.assigneeType,
      assigneeId: input.assigneeId,
      cardStatus: KanbanCardStatus.READY,
      subcolumn: KanbanSubcolumn.READY,
      tags: (input.tags ?? undefined) as never,
    },
  });

  await prisma.kanbanCardMovement.create({
    data: {
      cardId: card.id,
      toColumnId: backlogColumn.id,
      toStatus: KanbanCardStatus.READY,
      actorType: input.assigneeType ?? KanbanActorType.HUMAN,
      actorId: input.assigneeId,
      reason: "CARD_CREATED",
    },
  });

  logKanbanEvent("kanban.card_created", { cardId: card.id, column: backlogColumn.key });
  return card;
}

/**
 * Seção 14 do Pull System: urgente exige justificativa e respeita uma política explícita de
 * limite por período (`maxUrgentItems`/`periodDays`), armazenada em `KanbanPolicy` com a key
 * `urgent_policy`. Sem policy configurada, usa o default documentado (2 itens urgentes a cada
 * 7 dias — mesma ordem de grandeza do exemplo da seção 14).
 */
const DEFAULT_URGENT_POLICY = { maxUrgentItems: 2, periodDays: 7 };

export async function markCardUrgent(
  cardId: string,
  reason: string,
  actorType: KanbanActorType,
  actorId?: string,
) {
  const board = await ensureDefaultBoard();
  const policyRow = await prisma.kanbanPolicy.findUnique({
    where: { boardId_key: { boardId: board.id, key: "urgent_policy" } },
  });
  const policy =
    (policyRow?.value as typeof DEFAULT_URGENT_POLICY | undefined) ?? DEFAULT_URGENT_POLICY;

  const since = new Date(Date.now() - policy.periodDays * 24 * 60 * 60 * 1000);
  const recentUrgentCount = await prisma.kanbanCard.count({
    where: { boardId: board.id, urgent: true, urgentAt: { gte: since } },
  });

  if (recentUrgentCount >= policy.maxUrgentItems) {
    logKanbanEvent("kanban.urgent_rejected", { cardId, recentUrgentCount, policy });
    throw new KanbanPullError(
      "WIP_LIMIT_REACHED",
      `Limite de itens urgentes atingido (${recentUrgentCount}/${policy.maxUrgentItems} nos últimos ${policy.periodDays} dias).`,
    );
  }

  const card = await prisma.kanbanCard.update({
    where: { id: cardId },
    data: {
      urgent: true,
      urgentReason: reason,
      urgentBy: actorId ?? actorType,
      urgentAt: new Date(),
    },
  });

  logKanbanEvent("kanban.urgent_created", { cardId, actorType, actorId, reason });
  return card;
}
