-- CreateEnum
CREATE TYPE "ResearchEventKind" AS ENUM ('CATALYST', 'RISK');

-- CreateEnum
CREATE TYPE "ResearchEventCategory" AS ENUM ('MAINNET', 'TESTNET', 'PROTOCOL_UPGRADE', 'GOVERNANCE', 'INTEGRATION', 'PARTNERSHIP', 'LISTING', 'DELISTING', 'TOKEN_LAUNCH', 'TOKEN_MIGRATION', 'TOKEN_UNLOCK', 'TOKEN_BURN', 'TOKEN_BUYBACK', 'STAKING', 'REVENUE_SHARE', 'NEW_CHAIN', 'ECOSYSTEM_EXPANSION', 'INSTITUTIONAL_ADOPTION', 'FUNDING', 'PRODUCT_LAUNCH', 'REGULATORY', 'HIGH_INFLATION', 'LOW_VALUE_CAPTURE', 'CENTRALIZATION', 'CONCENTRATION', 'LIQUIDITY', 'SMART_CONTRACT', 'BRIDGE', 'ORACLE', 'COMPETITION', 'INCENTIVE_DEPENDENCE', 'REVENUE_CONCENTRATION', 'TVL_DECLINE', 'USER_DECLINE', 'VOLUME_DECLINE', 'SECURITY_INCIDENT', 'PROTOCOL_DEPENDENCY', 'CHAIN_DEPENDENCY', 'MARKET_STRUCTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResearchEventStatus" AS ENUM ('ANNOUNCED', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResearchEventConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ResearchEventImpactDimension" AS ENUM ('FUNDAMENTAL', 'MARKET', 'TOKENOMICS', 'ECOSYSTEM', 'GOVERNANCE', 'REGULATORY', 'SECURITY');

-- CreateTable
CREATE TABLE "research_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" "ResearchEventKind" NOT NULL,
    "category" "ResearchEventCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "source_id" TEXT NOT NULL,
    "impact" "ResearchEventImpactDimension" NOT NULL,
    "status" "ResearchEventStatus" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" "ResearchEventConfidence" NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_events_project_id_kind_idx" ON "research_events"("project_id", "kind");

-- CreateIndex
CREATE INDEX "research_events_project_id_event_date_idx" ON "research_events"("project_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "research_events_project_id_source_source_id_key" ON "research_events"("project_id", "source", "source_id");

-- AddForeignKey
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

