-- Sprint 12: `SnapshotSource` foi declarado no schema.prisma com `DEFILLAMA` e `COINGECKO` desde
-- o Sprint 3 (comentário: "o enum já evita strings soltas quando um segundo provider aparecer"),
-- mas nenhuma migration anterior de fato adicionou o valor `COINGECKO` ao tipo no Postgres — só
-- `DEFILLAMA` existia (drift entre schema.prisma e o banco real, nunca detectado porque nenhum
-- código chegou a persistir `source: COINGECKO` até agora). Corrigido aqui, em sua própria
-- migration/transação: o Postgres não permite usar um valor de enum recém-adicionado na MESMA
-- transação que o adiciona (erro 55P04), por isso a tabela que usa `COINGECKO` como default
-- (market_data_snapshots) vem numa migration separada e posterior.
ALTER TYPE "SnapshotSource" ADD VALUE 'COINGECKO';
