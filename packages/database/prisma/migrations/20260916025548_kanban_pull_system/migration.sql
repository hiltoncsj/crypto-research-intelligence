-- CreateEnum
CREATE TYPE "KanbanColumnKey" AS ENUM ('BACKLOG', 'DISCOVERY', 'DATA_COLLECTION', 'FUNDAMENTAL_ANALYSIS', 'SCORING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "KanbanCardStatus" AS ENUM ('READY', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "KanbanSubcolumn" AS ENUM ('IN_PROGRESS', 'READY');

-- CreateEnum
CREATE TYPE "KanbanActorType" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "kanban_boards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_columns" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "key" "KanbanColumnKey" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wip_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_cards" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "column_id" TEXT NOT NULL,
    "subcolumn" "KanbanSubcolumn" NOT NULL DEFAULT 'IN_PROGRESS',
    "card_status" "KanbanCardStatus" NOT NULL DEFAULT 'READY',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "swimlane" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RESEARCH',
    "assignee_type" "KanbanActorType",
    "assignee_id" TEXT,
    "project_id" TEXT,
    "research_run_id" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "urgent_reason" TEXT,
    "urgent_by" TEXT,
    "urgent_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "blocked_by" TEXT,
    "unblocked_at" TIMESTAMP(3),
    "unblocked_by" TEXT,
    "due_date" TIMESTAMP(3),
    "tags" JSONB,
    "entered_column_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_card_movements" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "from_column_id" TEXT,
    "to_column_id" TEXT NOT NULL,
    "from_status" "KanbanCardStatus",
    "to_status" "KanbanCardStatus" NOT NULL,
    "actor_type" "KanbanActorType" NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kanban_card_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_policies" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kanban_boards_name_key" ON "kanban_boards"("name");

-- CreateIndex
CREATE INDEX "kanban_columns_board_id_position_idx" ON "kanban_columns"("board_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "kanban_columns_board_id_key_key" ON "kanban_columns"("board_id", "key");

-- CreateIndex
CREATE INDEX "kanban_cards_board_id_column_id_idx" ON "kanban_cards"("board_id", "column_id");

-- CreateIndex
CREATE INDEX "kanban_cards_column_id_card_status_idx" ON "kanban_cards"("column_id", "card_status");

-- CreateIndex
CREATE INDEX "kanban_cards_project_id_idx" ON "kanban_cards"("project_id");

-- CreateIndex
CREATE INDEX "kanban_cards_research_run_id_idx" ON "kanban_cards"("research_run_id");

-- CreateIndex
CREATE INDEX "kanban_card_movements_card_id_created_at_idx" ON "kanban_card_movements"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "kanban_card_movements_to_column_id_created_at_idx" ON "kanban_card_movements"("to_column_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "kanban_policies_board_id_key_key" ON "kanban_policies"("board_id", "key");

-- AddForeignKey
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "kanban_columns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_card_movements" ADD CONSTRAINT "kanban_card_movements_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_policies" ADD CONSTRAINT "kanban_policies_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
