import {
  createBacklogCard,
  getBoardMetrics,
  getBoardView,
  markCardUrgent,
  pullCard,
  setCardBlockedById,
  unblockCard,
  KanbanPullError,
  type CreateCardInput,
} from "@crypto-research/research-engine";
import { KanbanActorType, KanbanColumnKey } from "@crypto-research/shared";

// Sprint 7: camada de serviço fina, mesmo padrão de research-runs.ts/scores.ts — a rota HTTP
// só valida payload e sessão, a lógica de domínio mora inteira em
// packages/research-engine/src/kanban-repository.ts.

export { KanbanPullError };

export async function getKanbanBoard() {
  return getBoardView();
}

export async function getKanbanMetrics() {
  return getBoardMetrics();
}

export async function createCard(input: CreateCardInput, actorEmail: string | null) {
  return createBacklogCard({
    ...input,
    assigneeType: input.assigneeType ?? KanbanActorType.HUMAN,
    assigneeId: input.assigneeId ?? actorEmail ?? undefined,
  });
}

export async function pullCardToColumn(
  cardId: string,
  toColumnKey: KanbanColumnKey,
  actorEmail: string | null,
) {
  return pullCard({
    cardId,
    toColumnKey,
    actorType: KanbanActorType.HUMAN,
    actorId: actorEmail ?? undefined,
  });
}

export async function blockCard(cardId: string, reason: string, actorEmail: string | null) {
  return setCardBlockedById(cardId, reason, KanbanActorType.HUMAN, actorEmail ?? undefined);
}

export async function unblockCardById(cardId: string, actorEmail: string | null, reason?: string) {
  return unblockCard(cardId, KanbanActorType.HUMAN, actorEmail ?? undefined, reason);
}

export async function markUrgent(cardId: string, reason: string, actorEmail: string | null) {
  return markCardUrgent(cardId, reason, KanbanActorType.HUMAN, actorEmail ?? undefined);
}
