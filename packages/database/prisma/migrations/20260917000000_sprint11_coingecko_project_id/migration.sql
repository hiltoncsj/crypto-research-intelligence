-- Sprint 11 (integração CoinGecko): schema.prisma já declarava `Project.coinGeckoId` e
-- `Token.coinGeckoRetrievedAt`, mas a migration correspondente nunca foi gerada — o código
-- (packages/defi-data/src/coingecko-client.ts) já assume essas colunas.
ALTER TABLE "projects" ADD COLUMN "coin_gecko_id" TEXT;
ALTER TABLE "tokens" ADD COLUMN "coin_gecko_retrieved_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "projects_coin_gecko_id_key" ON "projects"("coin_gecko_id");
