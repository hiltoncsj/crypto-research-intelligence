-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "discovered_at" TIMESTAMP(3),
ADD COLUMN     "discovery_filter_version" TEXT,
ADD COLUMN     "discovery_source" TEXT;

-- CreateTable
CREATE TABLE "research_run_selections" (
    "id" TEXT NOT NULL,
    "research_run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "priority_score" DECIMAL(6,2) NOT NULL,
    "global_score" DECIMAL(5,2),
    "growth_momentum" DECIMAL(6,4),
    "capital_momentum" DECIMAL(6,4),
    "selection_model_version" TEXT NOT NULL,
    "selection_reason" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_run_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_run_selections_research_run_id_rank_idx" ON "research_run_selections"("research_run_id", "rank");

-- CreateIndex
CREATE INDEX "research_run_selections_project_id_idx" ON "research_run_selections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_run_selections_research_run_id_project_id_key" ON "research_run_selections"("research_run_id", "project_id");

-- CreateIndex
CREATE INDEX "projects_discovered_at_idx" ON "projects"("discovered_at");

-- AddForeignKey
ALTER TABLE "research_run_selections" ADD CONSTRAINT "research_run_selections_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_run_selections" ADD CONSTRAINT "research_run_selections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
