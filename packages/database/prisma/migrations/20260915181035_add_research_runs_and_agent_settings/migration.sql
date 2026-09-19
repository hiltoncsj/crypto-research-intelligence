-- CreateEnum
CREATE TYPE "ResearchRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResearchRunMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "ResearchRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgentFrequency" AS ENUM ('MANUAL', 'DAILY', 'EVERY_12_HOURS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "research_runs" (
    "id" TEXT NOT NULL,
    "status" "ResearchRunStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "ResearchRunMode" NOT NULL,
    "trigger" "ResearchRunTrigger" NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "requested_by" TEXT,
    "total_projects" INTEGER NOT NULL DEFAULT 0,
    "processed_projects" INTEGER NOT NULL DEFAULT 0,
    "successful_projects" INTEGER NOT NULL DEFAULT 0,
    "failed_projects" INTEGER NOT NULL DEFAULT 0,
    "suspicious_projects" INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_settings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "AgentFrequency" NOT NULL DEFAULT 'MANUAL',
    "mode" "ResearchRunMode" NOT NULL DEFAULT 'FULL',
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_runs_status_idx" ON "research_runs"("status");

-- CreateIndex
CREATE INDEX "research_runs_created_at_idx" ON "research_runs"("created_at");
