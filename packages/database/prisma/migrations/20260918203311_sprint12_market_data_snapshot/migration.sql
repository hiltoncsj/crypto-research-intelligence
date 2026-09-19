-- CreateTable
CREATE TABLE "market_data_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "price_usd" DECIMAL(30,10),
    "market_cap_usd" DECIMAL(30,2),
    "volume_usd" DECIMAL(30,2),
    "source" "SnapshotSource" NOT NULL DEFAULT 'COINGECKO',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "quality" "DataQuality" NOT NULL DEFAULT 'VALID',
    "quality_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_data_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_data_snapshots_project_id_source_timestamp_idx" ON "market_data_snapshots"("project_id", "source_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "market_data_snapshots_project_id_source_source_timestamp_key" ON "market_data_snapshots"("project_id", "source", "source_timestamp");

-- AddForeignKey
ALTER TABLE "market_data_snapshots" ADD CONSTRAINT "market_data_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
