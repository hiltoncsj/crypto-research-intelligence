import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { KanbanActorType, KanbanCardStatus, KanbanColumnKey } from "@crypto-research/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  advanceProjectCard,
  createBacklogCard,
  ensureDefaultBoard,
  getBoardView,
  KanbanPullError,
  markCardUrgent,
  pullCard,
  recordProjectDiscovered,
  setCardBlockedById,
  unblockCard,
} from "../src/kanban-repository";
import { getBoardMetrics } from "../src/kanban-metrics";

// Sprint 7 (seção 40 do Pull System): WIP, Pull, Blocked, Urgent, Movement History, Research
// Run association, Capacity e Bottleneck — integração real contra o Postgres do docker-compose.

describe("kanban-repository (Prisma, integração real)", () => {
  const sectorName = `kanban-test-sector-${randomUUID()}`;
  let sectorId: string;
  const projectIds: string[] = [];
  const cardIds: string[] = [];
  let researchRunId: string;

  async function seedProject(): Promise<string> {
    const slug = `kanban-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { slug, name: slug, defillamaId: slug, sectorId },
    });
    projectIds.push(project.id);
    return project.id;
  }

  beforeAll(async () => {
    const sector = await prisma.sector.create({ data: { name: sectorName } });
    sectorId = sector.id;
    const run = await prisma.researchRun.create({ data: { mode: "FULL", trigger: "MANUAL" } });
    researchRunId = run.id;
    await ensureDefaultBoard();
  });

  afterAll(async () => {
    // Sprint 7 (seção 41 do Pull System): KanbanCard usa onDelete SetNull para project/research
    // run (decisão documentada em schema.prisma) — não há risco de FK quebrando o cleanup
    // abaixo, mas ainda assim limpamos os cards/movements criados por este arquivo para não
    // acumular lixo entre execuções de teste.
    await prisma.kanbanCardMovement.deleteMany({ where: { cardId: { in: cardIds } } });
    await prisma.kanbanCard.deleteMany({ where: { id: { in: cardIds } } });
    for (const id of projectIds) {
      await prisma.project.delete({ where: { id } });
    }
    await prisma.researchRun.delete({ where: { id: researchRunId } });
    await prisma.sector.delete({ where: { id: sectorId } });
  });

  it("recordProjectDiscovered cria um card em DISCOVERY associado ao projeto e à research run", async () => {
    const projectId = await seedProject();
    await recordProjectDiscovered(projectId, "Projeto Teste", researchRunId);

    const board = await ensureDefaultBoard();
    const card = await prisma.kanbanCard.findFirstOrThrow({
      where: { boardId: board.id, projectId },
    });
    cardIds.push(card.id);

    const discoveryColumn = board.columns.find((c) => c.key === KanbanColumnKey.DISCOVERY);
    expect(card.columnId).toBe(discoveryColumn?.id);
    expect(card.researchRunId).toBe(researchRunId);
    expect(card.cardStatus).toBe(KanbanCardStatus.IN_PROGRESS);
  });

  it("advanceProjectCard registra uma KanbanCardMovement a cada troca de coluna (histórico imutável)", async () => {
    // Timeout maior que o default de 5s: cada `advanceProjectCard`/`ensureDefaultBoard` faz
    // vários round-trips reais ao Postgres (upsert do board + 6 colunas + card + movement), e
    // este teste encadeia duas chamadas seguidas.
    const projectId = await seedProject();
    await recordProjectDiscovered(projectId, "Projeto Movimentação", researchRunId);
    const board = await ensureDefaultBoard();
    const card = await prisma.kanbanCard.findFirstOrThrow({
      where: { boardId: board.id, projectId },
    });
    cardIds.push(card.id);

    await advanceProjectCard(projectId, KanbanColumnKey.DATA_COLLECTION, {
      researchRunId,
      reason: "TEST_ADVANCE",
    });
    await advanceProjectCard(projectId, KanbanColumnKey.FUNDAMENTAL_ANALYSIS, {
      researchRunId,
      reason: "TEST_ADVANCE",
    });

    const movements = await prisma.kanbanCardMovement.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: "asc" },
    });

    // 1 na criação (DISCOVERY) + 2 avanços = 3 entradas, nunca sobrescritas.
    expect(movements.length).toBe(3);
    expect(movements[0]?.toColumnId).not.toBe(movements[2]?.toColumnId);
  }, 15000);

  it("advanceProjectCard nunca avança um card BLOCKED, e o desbloqueio calcula Blocked Time", async () => {
    const projectId = await seedProject();
    await recordProjectDiscovered(projectId, "Projeto Bloqueado", researchRunId);
    const board = await ensureDefaultBoard();
    const card = await prisma.kanbanCard.findFirstOrThrow({
      where: { boardId: board.id, projectId },
    });
    cardIds.push(card.id);

    await setCardBlockedById(card.id, "Falha simulada na coleta", KanbanActorType.SYSTEM);
    const blocked = await prisma.kanbanCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(blocked.cardStatus).toBe(KanbanCardStatus.BLOCKED);
    expect(blocked.blockedReason).toBe("Falha simulada na coleta");
    expect(blocked.blockedAt).not.toBeNull();

    const notAdvanced = await advanceProjectCard(projectId, KanbanColumnKey.DATA_COLLECTION, {
      researchRunId,
      reason: "SHOULD_NOT_MOVE",
    });
    expect(notAdvanced?.columnId).toBe(blocked.columnId); // permanece na mesma coluna

    const unblocked = await unblockCard(card.id, KanbanActorType.HUMAN, "tester@example.com");
    expect(unblocked.cardStatus).toBe(KanbanCardStatus.IN_PROGRESS);
    expect(unblocked.unblockedAt).not.toBeNull();
  });

  it("pullCard rejeita quando a coluna de destino está no WIP Limit", async () => {
    // DISCOVERY tem wipLimit=1 (seção 9 do Pull System) — dois projetos simultâneos em
    // DISCOVERY devem estourar o limite.
    const projectA = await seedProject();
    const projectB = await seedProject();
    await recordProjectDiscovered(projectA, "Projeto A", researchRunId);
    const board = await ensureDefaultBoard();
    const cardA = await prisma.kanbanCard.findFirstOrThrow({
      where: { boardId: board.id, projectId: projectA },
    });
    cardIds.push(cardA.id);

    // Segundo card criado manualmente já dentro de DISCOVERY, em estado READY (buffer), para
    // testar o PULL explícito.
    const discoveryColumn = board.columns.find((c) => c.key === KanbanColumnKey.DISCOVERY)!;
    const cardB = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG)!.id,
        projectId: projectB,
        title: "Projeto B",
        cardStatus: KanbanCardStatus.READY,
      },
    });
    cardIds.push(cardB.id);

    await expect(
      pullCard({
        cardId: cardB.id,
        toColumnKey: KanbanColumnKey.DISCOVERY,
        actorType: KanbanActorType.HUMAN,
      }),
    ).rejects.toThrow(KanbanPullError);

    const stillInBacklog = await prisma.kanbanCard.findUniqueOrThrow({ where: { id: cardB.id } });
    expect(stillInBacklog.columnId).not.toBe(discoveryColumn.id);
  });

  it("pullCard move o card quando há capacidade e registra a movimentação", async () => {
    const projectId = await seedProject();
    const board = await ensureDefaultBoard();
    const backlogColumn = board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG)!;
    const dataCollectionColumn = board.columns.find(
      (c) => c.key === KanbanColumnKey.DATA_COLLECTION,
    )!;

    const card = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: backlogColumn.id,
        projectId,
        title: "Projeto Pull OK",
        cardStatus: KanbanCardStatus.READY,
      },
    });
    cardIds.push(card.id);

    const pulled = await pullCard({
      cardId: card.id,
      toColumnKey: KanbanColumnKey.DATA_COLLECTION,
      actorType: KanbanActorType.AGENT,
      actorId: "agent-1",
    });

    expect(pulled.columnId).toBe(dataCollectionColumn.id);
    expect(pulled.cardStatus).toBe(KanbanCardStatus.IN_PROGRESS);

    const movement = await prisma.kanbanCardMovement.findFirstOrThrow({
      where: { cardId: card.id },
      orderBy: { createdAt: "desc" },
    });
    expect(movement.actorType).toBe(KanbanActorType.AGENT);
    expect(movement.fromColumnId).toBe(backlogColumn.id);
    expect(movement.toColumnId).toBe(dataCollectionColumn.id);
  });

  it("pullCard rejeita um card que não está READY (ex.: já IN_PROGRESS)", async () => {
    const projectId = await seedProject();
    const board = await ensureDefaultBoard();
    const card = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG)!.id,
        projectId,
        title: "Projeto já em progresso",
        cardStatus: KanbanCardStatus.IN_PROGRESS,
      },
    });
    cardIds.push(card.id);

    await expect(
      pullCard({
        cardId: card.id,
        toColumnKey: KanbanColumnKey.DATA_COLLECTION,
        actorType: KanbanActorType.HUMAN,
      }),
    ).rejects.toThrow(KanbanPullError);
  });

  it("createBacklogCard cria um card manual sem projeto associado, no estado READY", async () => {
    const card = await createBacklogCard({ title: "Item manual de backlog", priority: 5 });
    cardIds.push(card.id);

    expect(card.projectId).toBeNull();
    expect(card.cardStatus).toBe(KanbanCardStatus.READY);
    expect(card.priority).toBe(5);
  });

  it("markCardUrgent exige justificativa e aplica a política de limite por período", async () => {
    const board = await ensureDefaultBoard();
    // Reseta a política para este teste não depender de urgências criadas por outros arquivos.
    await prisma.kanbanPolicy.upsert({
      where: { boardId_key: { boardId: board.id, key: "urgent_policy" } },
      update: { value: { maxUrgentItems: 1, periodDays: 7 } },
      create: {
        boardId: board.id,
        key: "urgent_policy",
        value: { maxUrgentItems: 1, periodDays: 7 },
      },
    });

    const cardA = await createBacklogCard({ title: "Urgente A" });
    const cardB = await createBacklogCard({ title: "Urgente B" });
    cardIds.push(cardA.id, cardB.id);

    const marked = await markCardUrgent(
      cardA.id,
      "Cliente bloqueado em produção",
      KanbanActorType.HUMAN,
      "ana@example.com",
    );
    expect(marked.urgent).toBe(true);
    expect(marked.urgentReason).toBe("Cliente bloqueado em produção");

    await expect(
      markCardUrgent(cardB.id, "Segundo pedido urgente na mesma semana", KanbanActorType.HUMAN),
    ).rejects.toThrow(KanbanPullError);

    await prisma.kanbanPolicy.deleteMany({ where: { boardId: board.id, key: "urgent_policy" } });
  });

  it("getBoardView calcula WIP/capacidade por coluna e getBoardMetrics detecta bottleneck", async () => {
    const projectId = await seedProject();
    await recordProjectDiscovered(projectId, "Projeto Capacidade", researchRunId);
    const board = await ensureDefaultBoard();
    const card = await prisma.kanbanCard.findFirstOrThrow({
      where: { boardId: board.id, projectId },
    });
    cardIds.push(card.id);

    const view = await getBoardView();
    const discoveryView = view.columns.find((c) => c.key === KanbanColumnKey.DISCOVERY)!;
    expect(discoveryView.wip).toBeGreaterThanOrEqual(1);
    expect(discoveryView.wipLimit).toBe(1);
    // WIP >= limite (1) => bottleneck determinístico (seção 24 do Pull System).
    expect(discoveryView.bottleneck).toBe(true);

    const metrics = await getBoardMetrics();
    expect(metrics.bottlenecks).toContain(KanbanColumnKey.DISCOVERY);
  });

  it("card BLOCKED continua contando como WIP (não libera vaga para outro card entrar)", async () => {
    // Seção 33 do Pull System: "Blocked ≠ free slot" — bug corrigido no Sprint 7. Usa SCORING
    // (wipLimit=1): um card bloqueado nela deve, sozinho, saturar o WIP.
    //
    // O card é criado DIRETO na coluna (via Prisma), em vez de usar `pullCard`, porque a
    // suíte não isola WIP entre `it`s (outros testes deixam cards ativos em várias colunas de
    // propósito, para testar histórico/avanço real) — usar `pullCard` aqui faria este teste
    // depender da coluna estar exatamente vazia no momento em que ele roda, o que não é
    // garantido pela ordem de execução dos testes anteriores.
    const projectId = await seedProject();
    const board = await ensureDefaultBoard();
    const backlogColumn = board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG)!;
    const scoringColumn = board.columns.find((c) => c.key === KanbanColumnKey.SCORING)!;

    const card = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: scoringColumn.id,
        projectId,
        title: "Projeto Bloqueado em Scoring",
        cardStatus: KanbanCardStatus.IN_PROGRESS,
      },
    });
    cardIds.push(card.id);
    await setCardBlockedById(card.id, "Falha simulada", KanbanActorType.SYSTEM);

    const view = await getBoardView();
    const columnView = view.columns.find((c) => c.key === KanbanColumnKey.SCORING)!;
    expect(columnView.wip).toBeGreaterThanOrEqual(1);
    expect(columnView.availableCapacity).toBe(0);

    // Um segundo card tentando ser puxado para a mesma coluna deve ser rejeitado — a vaga
    // continua ocupada pelo card bloqueado.
    const projectId2 = await seedProject();
    const card2 = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: backlogColumn.id,
        projectId: projectId2,
        title: "Segundo projeto tentando entrar",
        cardStatus: KanbanCardStatus.READY,
      },
    });
    cardIds.push(card2.id);

    await expect(
      pullCard({
        cardId: card2.id,
        toColumnKey: KanbanColumnKey.SCORING,
        actorType: KanbanActorType.HUMAN,
      }),
    ).rejects.toThrow(KanbanPullError);

    await unblockCard(card.id, KanbanActorType.HUMAN, "tester@example.com");
    // Move o card para fora de SCORING para não interferir no teste de concorrência seguinte,
    // que exige a coluna vazia no início.
    await prisma.kanbanCard.update({
      where: { id: card.id },
      data: { cardStatus: KanbanCardStatus.DONE },
    });
  });

  it("pullCard concorrente: dois Pulls simultâneos para uma coluna com WIP=1 só permitem um sucesso", async () => {
    // Seção 37/48 do Pull System: a linha da coluna de destino é bloqueada (`FOR UPDATE`) dentro
    // da transação, serializando pulls concorrentes — este teste dispara dois `pullCard` em
    // paralelo (`Promise.allSettled`) contra a mesma coluna com WIP Limit=1 e exige exatamente
    // um sucesso e uma rejeição por WIP_LIMIT_REACHED.
    //
    // Usa SCORING (não DISCOVERY) de propósito: nenhum outro teste deste arquivo avança um card
    // até SCORING, então a coluna chega neste teste garantidamente vazia — necessário para o
    // resultado determinístico "exatamente 1 sucesso" independente da ordem de execução dos
    // testes anteriores.
    const board = await ensureDefaultBoard();
    const backlogColumn = board.columns.find((c) => c.key === KanbanColumnKey.BACKLOG)!;
    const scoringColumn = board.columns.find((c) => c.key === KanbanColumnKey.SCORING)!;

    const preExistingWip = await prisma.kanbanCard.count({
      where: {
        columnId: scoringColumn.id,
        cardStatus: {
          in: [KanbanCardStatus.READY, KanbanCardStatus.IN_PROGRESS, KanbanCardStatus.BLOCKED],
        },
      },
    });
    expect(preExistingWip).toBe(0);

    const projectIdA = await seedProject();
    const projectIdB = await seedProject();
    const cardA = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: backlogColumn.id,
        projectId: projectIdA,
        title: "Concorrência A",
        cardStatus: KanbanCardStatus.READY,
      },
    });
    const cardB = await prisma.kanbanCard.create({
      data: {
        boardId: board.id,
        columnId: backlogColumn.id,
        projectId: projectIdB,
        title: "Concorrência B",
        cardStatus: KanbanCardStatus.READY,
      },
    });
    cardIds.push(cardA.id, cardB.id);

    const results = await Promise.allSettled([
      pullCard({
        cardId: cardA.id,
        toColumnKey: KanbanColumnKey.SCORING,
        actorType: KanbanActorType.AGENT,
        actorId: "agent-a",
      }),
      pullCard({
        cardId: cardB.id,
        toColumnKey: KanbanColumnKey.SCORING,
        actorType: KanbanActorType.AGENT,
        actorId: "agent-b",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(KanbanPullError);
      expect((rejected[0].reason as InstanceType<typeof KanbanPullError>).code).toBe(
        "WIP_LIMIT_REACHED",
      );
    }

    const finalWip = await prisma.kanbanCard.count({
      where: {
        columnId: scoringColumn.id,
        cardStatus: {
          in: [KanbanCardStatus.READY, KanbanCardStatus.IN_PROGRESS, KanbanCardStatus.BLOCKED],
        },
      },
    });
    expect(finalWip).toBe(1);
  }, 15000);
});
