-- Ranking de market cap da CoinGecko (GET /coins/{id}.market_cap_rank), exibido no card
-- Published do Kanban.
ALTER TABLE "tokens" ADD COLUMN "market_cap_rank" INTEGER;
