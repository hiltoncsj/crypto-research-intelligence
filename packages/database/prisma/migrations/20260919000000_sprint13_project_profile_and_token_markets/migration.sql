-- CreateTable
CREATE TABLE "project_profile_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "description_en" TEXT,
    "categories" TEXT[],
    "platforms" TEXT[],
    "homepage_url" TEXT,
    "source" "SnapshotSource" NOT NULL DEFAULT 'COINGECKO',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_markets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "exchange_id" TEXT NOT NULL,
    "exchange_name" TEXT NOT NULL,
    "base_symbol" TEXT NOT NULL,
    "target_symbol" TEXT NOT NULL,
    "market_type" TEXT NOT NULL DEFAULT 'SPOT',
    "trade_url" TEXT,
    "volume_usd" DECIMAL(30,2),
    "last_price_usd" DECIMAL(30,10),
    "source" "SnapshotSource" NOT NULL DEFAULT 'COINGECKO',
    "source_timestamp" TIMESTAMP(3) NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_markets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_profile_snapshots_project_id_created_at_idx" ON "project_profile_snapshots"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "token_markets_project_id_retrieved_at_idx" ON "token_markets"("project_id", "retrieved_at");

-- CreateIndex
CREATE UNIQUE INDEX "token_markets_project_id_exchange_id_base_symbol_target_sym_key" ON "token_markets"("project_id", "exchange_id", "base_symbol", "target_symbol");

-- AddForeignKey
ALTER TABLE "project_profile_snapshots" ADD CONSTRAINT "project_profile_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_markets" ADD CONSTRAINT "token_markets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

