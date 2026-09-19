# packages/database

Client Prisma compartilhado. Schema do Sprint 1: `projects`, `sectors`, `chains` apenas
(seção 7 do plano de implementação).

## Gerar a migration inicial

```bash
docker compose -f ../../infrastructure/docker-compose.yml up -d
cp ../../.env.example ../../.env   # e ajuste DATABASE_URL se necessário
npx prisma migrate dev --name init --schema packages/database/prisma/schema.prisma
```

A migration fica versionada em `prisma/migrations/` e deve ser commitada.
