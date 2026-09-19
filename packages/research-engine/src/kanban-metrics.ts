import { prisma } from "@crypto-research/database";
import { KanbanCardStatus } from "@crypto-research/shared";

import { logKanbanEvent } from "./logger";
import {
  DEFAULT_BOARD_NAME,
  RUN_CANCELLED_MOVEMENT_REASON,
  WIP_ACTIVE_STATUSES,
  classifyRisk,
  getDataCollectionMetricBaseline,
  type KanbanRiskLevel,
} from "./kanban-repository";

// Sprint 7 (seção 22/23 do Pull System): base determinística de métricas de fluxo, a partir do
// histórico imutável de `KanbanCardMovement` (seção 21: "esse histórico será fundamental para
// Cycle Time/Lead Time/Waiting Time/Throughput/Bottleneck Detection"). Nenhuma métrica é
// inventada: tudo deriva de timestamps reais já persistidos (createdAt do card,
// blockedAt/unblockedAt, completedAt, created_at das movimentações).

export interface ColumnMetric {
  columnKey: string;
  columnName: string;
  wip: number;
  wipLimit: number | null;
  wipUtilization: number | null; // wip / wipLimit, null se sem limite
  avgCycleTimeHours: number | null; // tempo médio dentro desta coluna para cards que já saíram dela
  avgWaitingTimeHours: number | null; // tempo médio em subcolumn READY (buffer) antes de ser puxado
  bufferCount: number; // cards em READY nesta coluna agora (seção 9/10 do Pull System)
  oldestBufferAgeHours: number | null; // idade do card mais antigo no buffer desta coluna
  riskLevel: KanbanRiskLevel; // NORMAL | WATCH | BOTTLENECK | CRITICAL (seção 27)
}

export interface BoardMetrics {
  throughputLast7Days: number; // cards que chegaram a PUBLISHED nos últimos 7 dias
  avgLeadTimeHours: number | null; // createdAt -> completedAt, cards PUBLISHED
  avgBlockedTimeHours: number | null; // soma de intervalos blockedAt->unblockedAt (ou agora, se ainda bloqueado)
  oldestOpenCardAgeHours: number | null; // seção 22 (Aging): há quanto tempo o card mais antigo ainda aberto foi criado
  columns: ColumnMetric[];
  bottlenecks: string[]; // columnKey das colunas com riskLevel BOTTLENECK ou CRITICAL
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60));
}

export async function getBoardMetrics(): Promise<BoardMetrics> {
  const board = await prisma.kanbanBoard.findUnique({
    where: { name: DEFAULT_BOARD_NAME },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  if (!board) {
    return {
      throughputLast7Days: 0,
      avgLeadTimeHours: null,
      avgBlockedTimeHours: null,
      oldestOpenCardAgeHours: null,
      columns: [],
      bottlenecks: [],
    };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [cards, movements, dataCollectionBaseline] = await Promise.all([
    prisma.kanbanCard.findMany({ where: { boardId: board.id } }),
    prisma.kanbanCardMovement.findMany({
      where: { card: { boardId: board.id } },
      orderBy: { createdAt: "asc" },
    }),
    getDataCollectionMetricBaseline(),
  ]);
  const dataCollectionColumnId = board.columns.find((c) => c.key === "DATA_COLLECTION")?.id;

  // Throughput: cards concluídos (completedAt setado, seção 22 "Throughput = cards concluídos
  // por período") nos últimos 7 dias.
  const throughputLast7Days = cards.filter(
    (c) => c.completedAt && c.completedAt >= sevenDaysAgo,
  ).length;

  // Lead Time: createdAt -> completedAt, só para cards já concluídos.
  const leadTimes = cards
    .filter((c) => c.completedAt)
    .map((c) => hoursBetween(c.createdAt, c.completedAt as Date));
  const avgLeadTimeHours =
    leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

  // Blocked Time: intervalos blockedAt -> unblockedAt (ou agora, se ainda bloqueado).
  const now = new Date();
  const blockedIntervals: number[] = [];
  for (const c of cards) {
    if (c.blockedAt) {
      const end = c.unblockedAt && c.unblockedAt > c.blockedAt ? c.unblockedAt : now;
      blockedIntervals.push(hoursBetween(c.blockedAt, end));
    }
  }
  const avgBlockedTimeHours =
    blockedIntervals.length > 0
      ? blockedIntervals.reduce((a, b) => a + b, 0) / blockedIntervals.length
      : null;

  // Aging (seção 22): há quanto tempo o card mais antigo ainda ABERTO (sem completedAt) está no
  // sistema, contado desde a criação — sinaliza itens "esquecidos" mesmo que não estejam bloqueados.
  const openCards = cards.filter((c) => !c.completedAt);
  const oldestOpenCardAgeHours =
    openCards.length > 0 ? Math.max(...openCards.map((c) => hoursBetween(c.createdAt, now))) : null;

  // Cycle Time por coluna: para cada movimentação de SAÍDA de uma coluna, tempo entre a
  // movimentação de ENTRADA anterior naquela coluna (mesmo card) e esta saída.
  const movementsByCard = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = movementsByCard.get(m.cardId) ?? [];
    list.push(m);
    movementsByCard.set(m.cardId, list);
  }

  const cycleTimesByColumn = new Map<string, number[]>();
  // Waiting Time (seção 20/60): tempo em que o card ficou parado no buffer (subcolumn READY)
  // desta coluna antes de ser puxado (READY -> IN_PROGRESS) para a mesma coluna — distinto do
  // Cycle Time, que mistura espera + execução.
  const waitingTimesByColumn = new Map<string, number[]>();
  for (const [, cardMovements] of movementsByCard) {
    for (let i = 0; i < cardMovements.length; i++) {
      const move = cardMovements[i];
      if (!move) continue;

      if (
        move.fromStatus === KanbanCardStatus.READY &&
        move.toStatus === KanbanCardStatus.IN_PROGRESS &&
        move.fromColumnId === move.toColumnId &&
        move.fromColumnId
      ) {
        // PULL dentro da mesma coluna: a movimentação anterior que trouxe o card para READY
        // marca o início da espera no buffer.
        const enteredReady = [...cardMovements.slice(0, i)]
          .reverse()
          .find(
            (m2) => m2.toColumnId === move.fromColumnId && m2.toStatus === KanbanCardStatus.READY,
          );
        const enterTime = enteredReady ? enteredReady.createdAt : cardMovements[0]?.createdAt;
        if (enterTime) {
          const hours = hoursBetween(enterTime, move.createdAt);
          const list = waitingTimesByColumn.get(move.fromColumnId) ?? [];
          list.push(hours);
          waitingTimesByColumn.set(move.fromColumnId, list);
        }
      }

      const leftColumnId = move.fromColumnId;
      if (!leftColumnId || leftColumnId === move.toColumnId) continue; // não é troca de coluna
      // Movimento gerado por cancelamento de Research Run (revertRunCardsToBacklog): a tarefa
      // foi abortada, não concluída — não conta como um Cycle Time real (puxaria a média para
      // baixo artificialmente).
      if (move.reason === RUN_CANCELLED_MOVEMENT_REASON) continue;
      // Baseline da métrica de Data Collection (resetDataCollectionMetricBaseline): ciclos que
      // saíram dessa coluna antes do reset não contam para a média — ela recomeça do zero a
      // partir do momento do reset, sem apagar o histórico real de movimentos.
      if (
        leftColumnId === dataCollectionColumnId &&
        dataCollectionBaseline &&
        move.createdAt < dataCollectionBaseline
      ) {
        continue;
      }
      // Acha a movimentação anterior que trouxe o card PARA `leftColumnId`.
      const enteredAt = [...cardMovements.slice(0, i)]
        .reverse()
        .find((m2) => m2.toColumnId === leftColumnId);
      const enterTime = enteredAt ? enteredAt.createdAt : cardMovements[0]?.createdAt;
      if (!enterTime) continue;
      const hours = hoursBetween(enterTime, move.createdAt);
      const list = cycleTimesByColumn.get(leftColumnId) ?? [];
      list.push(hours);
      cycleTimesByColumn.set(leftColumnId, list);
    }
  }

  const bottlenecks: string[] = [];
  const columns: ColumnMetric[] = board.columns.map((column) => {
    const cardsInColumn = cards.filter((c) => c.columnId === column.id);
    const wip = cardsInColumn.filter((c) =>
      (WIP_ACTIVE_STATUSES as readonly string[]).includes(c.cardStatus),
    ).length;
    const wipUtilization = column.wipLimit ? wip / column.wipLimit : null;
    const cycleTimes = cycleTimesByColumn.get(column.id) ?? [];
    const avgCycleTimeHours =
      cycleTimes.length > 0 ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : null;
    const waitingTimes = waitingTimesByColumn.get(column.id) ?? [];
    const avgWaitingTimeHours =
      waitingTimes.length > 0
        ? waitingTimes.reduce((a, b) => a + b, 0) / waitingTimes.length
        : null;

    const bufferCards = cardsInColumn.filter((c) => c.cardStatus === KanbanCardStatus.READY);
    const bufferCount = bufferCards.length;
    const oldestBufferAgeHours =
      bufferCount > 0
        ? Math.max(...bufferCards.map((c) => hoursBetween(c.enteredColumnAt, now)))
        : null;
    const blockedCount = cardsInColumn.filter(
      (c) => c.cardStatus === KanbanCardStatus.BLOCKED,
    ).length;

    const riskLevel = classifyRisk({
      wip,
      wipLimit: column.wipLimit,
      bufferCount,
      oldestBufferAgeHours,
      blockedCount,
    });
    if (riskLevel === "BOTTLENECK" || riskLevel === "CRITICAL") {
      bottlenecks.push(column.key);
    }

    return {
      columnKey: column.key,
      columnName: column.name,
      wip,
      wipLimit: column.wipLimit,
      wipUtilization,
      avgCycleTimeHours,
      avgWaitingTimeHours,
      bufferCount,
      oldestBufferAgeHours,
      riskLevel,
    };
  });

  if (bottlenecks.length > 0) {
    logKanbanEvent("kanban.bottleneck_detected", { columns: bottlenecks });
  }

  return {
    throughputLast7Days,
    avgLeadTimeHours,
    avgBlockedTimeHours,
    oldestOpenCardAgeHours,
    columns,
    bottlenecks,
  };
}
