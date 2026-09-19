-- CreateTable
CREATE TABLE "fundamental_scores" (
    "id" TEXT NOT NULL,
    "research_run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "score_model_version" TEXT NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundamental_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fundamental_scores_project_id_created_at_idx" ON "fundamental_scores"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "fundamental_scores_research_run_id_idx" ON "fundamental_scores"("research_run_id");

-- AddForeignKey
ALTER TABLE "fundamental_scores" ADD CONSTRAINT "fundamental_scores_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundamental_scores" ADD CONSTRAINT "fundamental_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
