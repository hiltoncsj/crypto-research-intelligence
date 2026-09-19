-- CreateEnum
CREATE TYPE "SnapshotSource" AS ENUM ('DEFILLAMA');

-- CreateEnum
CREATE TYPE "DataQuality" AS ENUM ('VALID', 'SUSPICIOUS');

-- CreateTable
CREATE TABLE "tvl_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "value_usd" DECIMAL(30,2) NOT NULL,
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "quality" "DataQuality" NOT NULL DEFAULT 'VALID',
    "quality_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tvl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "revenue_usd" DECIMAL(30,2) NOT NULL,
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "quality" "DataQuality" NOT NULL DEFAULT 'VALID',
    "quality_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fees_usd" DECIMAL(30,2) NOT NULL,
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "quality" "DataQuality" NOT NULL DEFAULT 'VALID',
    "quality_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_chains" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "source" "SnapshotSource" NOT NULL DEFAULT 'DEFILLAMA',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_chains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tvl_snapshots_project_id_source_timestamp_idx" ON "tvl_snapshots"("project_id", "source_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "tvl_snapshots_project_id_source_source_timestamp_key" ON "tvl_snapshots"("project_id", "source", "source_timestamp");

-- CreateIndex
CREATE INDEX "revenue_snapshots_project_id_source_timestamp_idx" ON "revenue_snapshots"("project_id", "source_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_snapshots_project_id_source_source_timestamp_key" ON "revenue_snapshots"("project_id", "source", "source_timestamp");

-- CreateIndex
CREATE INDEX "fee_snapshots_project_id_source_timestamp_idx" ON "fee_snapshots"("project_id", "source_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "fee_snapshots_project_id_source_source_timestamp_key" ON "fee_snapshots"("project_id", "source", "source_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "project_chains_project_id_chain_id_key" ON "project_chains"("project_id", "chain_id");

-- AddForeignKey
ALTER TABLE "tvl_snapshots" ADD CONSTRAINT "tvl_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_snapshots" ADD CONSTRAINT "revenue_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_snapshots" ADD CONSTRAINT "fee_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_chains" ADD CONSTRAINT "project_chains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_chains" ADD CONSTRAINT "project_chains_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
