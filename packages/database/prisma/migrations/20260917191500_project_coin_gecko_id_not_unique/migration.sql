-- `coin_gecko_id` não pode ser único: múltiplas listagens de protocolo da DefiLlama (versões/
-- forks, ex. "aave" e "aave-v2") legitimamente compartilham o mesmo token/gecko_id — bug real
-- encontrado em produção (2026-09-17), upsert de "aave" colidindo com "aave-v2".
DROP INDEX "projects_coin_gecko_id_key";
CREATE INDEX "projects_coin_gecko_id_idx" ON "projects"("coin_gecko_id");
