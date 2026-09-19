-- CreateEnum
CREATE TYPE "UnlockAllocationType" AS ENUM ('TEAM', 'INVESTORS', 'ADVISORS', 'TREASURY', 'ECOSYSTEM', 'COMMUNITY', 'MARKETING', 'LIQUIDITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FundingRoundType" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'STRATEGIC', 'PRIVATE', 'PUBLIC', 'ICO', 'OTHER');

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "symbol" TEXT,
    "contract_address" TEXT,
    "market_cap_usd" DECIMAL(30,2),
    "circulating_supply" DECIMAL(38,8),
    "total_supply" DECIMAL(38,8),
    "max_supply" DECIMAL(38,8),
    "fdv_usd" DECIMAL(30,2),
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_unlocks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "unlock_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "percentage" DECIMAL(5,2),
    "allocation_type" "UnlockAllocationType" NOT NULL DEFAULT 'OTHER',
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_rounds" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "round_type" "FundingRoundType" NOT NULL DEFAULT 'OTHER',
    "round_label" TEXT,
    "amount_usd" DECIMAL(20,2),
    "valuation_usd" DECIMAL(20,2),
    "raised_at" TIMESTAMP(3) NOT NULL,
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_round_investors" (
    "funding_round_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "funding_round_investors_pkey" PRIMARY KEY ("funding_round_id","investor_id")
);

-- CreateTable
CREATE TABLE "tokenomics_scores" (
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

    CONSTRAINT "tokenomics_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_capital_scores" (
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

    CONSTRAINT "institutional_capital_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_project_id_key" ON "tokens"("project_id");

-- CreateIndex
CREATE INDEX "token_unlocks_project_id_unlock_date_idx" ON "token_unlocks"("project_id", "unlock_date");

-- CreateIndex
CREATE INDEX "funding_rounds_project_id_raised_at_idx" ON "funding_rounds"("project_id", "raised_at");

-- CreateIndex
CREATE UNIQUE INDEX "funding_rounds_project_id_source_timestamp_round_label_key" ON "funding_rounds"("project_id", "source_timestamp", "round_label");

-- CreateIndex
CREATE UNIQUE INDEX "investors_name_key" ON "investors"("name");

-- CreateIndex
CREATE INDEX "tokenomics_scores_project_id_created_at_idx" ON "tokenomics_scores"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "tokenomics_scores_research_run_id_idx" ON "tokenomics_scores"("research_run_id");

-- CreateIndex
CREATE INDEX "institutional_capital_scores_project_id_created_at_idx" ON "institutional_capital_scores"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "institutional_capital_scores_research_run_id_idx" ON "institutional_capital_scores"("research_run_id");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_unlocks" ADD CONSTRAINT "token_unlocks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_round_investors" ADD CONSTRAINT "funding_round_investors_funding_round_id_fkey" FOREIGN KEY ("funding_round_id") REFERENCES "funding_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_round_investors" ADD CONSTRAINT "funding_round_investors_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenomics_scores" ADD CONSTRAINT "tokenomics_scores_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenomics_scores" ADD CONSTRAINT "tokenomics_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_capital_scores" ADD CONSTRAINT "institutional_capital_scores_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_capital_scores" ADD CONSTRAINT "institutional_capital_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
