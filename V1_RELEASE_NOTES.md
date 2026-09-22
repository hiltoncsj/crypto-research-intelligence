# V1.0 Release Notes — Crypto Research Intelligence

Documento técnico, não material de marketing. Reflete o estado real do código em
`590ece8` (master local, 2026-09-22).

## Release Status

READY WITH CONDITIONS. Ver `V1_FINAL_READINESS.md` para o gate completo e as condições
pendentes.

## Included Capabilities

Auth single-user (NextAuth Credentials), API Keys criptografadas (AES-256-GCM), integração real
DefiLlama (TVL/Fees/Revenue/Funding/Token summary) e CoinGecko (MC/FDV), Research Run assíncrona
via BullMQ, Scheduler opcional, Fundamental/Tokenomics/Institutional Capital Score (histórico
versionado, nunca sobrescrito), Research Trace, Rankings, Kanban Pull System (WIP, Pull atômico,
Blocked, Urgent, métricas de fluxo, bottleneck detection), Funding/Tokenomics/Investors, Project
Discovery + Top 10 Dinâmico, Research History + Diff Engine + Changelog + Timeline + Project
Report (Markdown, download), Knowledge Base (3 docs na raiz + ajuda contextual no dashboard),
Historical Fundamental Intelligence (15 métricas, calculadas sob demanda) e Event Impact
(associação temporal, nunca causalidade).

## Validated Components

Nesta sessão de hardening: suíte de testes completa (182+152+16 = 350 testes, 17+10+1 arquivos),
typecheck de todos os workspaces + workers, lint (0 erros após remoção do worktree órfão), build
Next.js completo, `prisma validate` + `prisma migrate status` (20 migrations, schema
sincronizado).

## Security

- Secrets criptografados com AES-256-GCM (`MASTER_ENCRYPTION_KEY`, 32 bytes hex), `authTag`
  validado com exatamente 16 bytes no decrypt (corrigido nesta sessão, commit `53380f4`).
- Identidade externa curada manualmente (`githubRepo`/`snapshotSpace`/`discourseForumUrl`),
  nunca inferida por nome, com validação anti-SSRF revalidada a cada redirect
  (`packages/defi-data/src/external-identity.ts`, commit `02edaa0`).
- Autenticação: middleware cobre `/dashboard/*`; rotas `/api/*` fazem checagem de sessão
  individualmente (confirmado: 29/31 rotas, e reconfirmado nesta sessão via chamada HTTP real
  sem sessão — `/api/projects` retorna `401 {"error":"Não autenticado."}` sem vazar detalhe
  interno).
- Sem rate limiting/CSRF explícito — aceitável para deployment single-user interno controlado,
  não para exposição pública.
- Senha em texto puro nunca persistida (só bcrypt hash em `ADMIN_PASSWORD_HASH`).

## Data Sources

DefiLlama e CoinGecko reais, sem mock em nenhum ambiente (inclusive testes, que pulam
automaticamente se offline). MyMemory Translation API real (PT-BR, sem key, limite ~500
caracteres/requisição). Nunca fabrica status "healthy" ou dado sintético para substituir uma
chamada real. `TOKEN_UNLOCK` (DefiLlama Pro) implementado mas inativo sem key configurada — a
estrutura do payload nunca foi validada contra resposta real de produção.

## Historical Intelligence

Historical Fundamental Intelligence: 15/15 métricas auditadas matematicamente nesta sessão
(fórmula a fórmula contra a especificação do Sprint 14). Bug de look-ahead bias em
`calculateGrowthForWindow`/`calculateGrowthWindowPair` (`packages/research-engine/src/metrics.ts`)
corrigido (commit `590ece8`), com 16 testes de regressão novos. Duas specification gaps
documentadas e aceitas (não corrigidas): tolerância de alinhamento temporal entre séries de
fontes diferentes nas valuation ratios; nomenclatura ambígua "Market Cap x TVL". Detalhes
completos em `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md`.

## Event Intelligence

Event Impact: associação temporal, nunca causalidade. Classificação determinística
(`event-classification.ts`) usada apenas para GitHub Releases — Discourse foi testado e
rejeitado (~50% falsos positivos, Sprint 23); fontes estruturadas nunca passam pela engine.
Processamento sequencial por projeto (`EVENT_IMPACT_BATCH_SIZE = 1`) — deliberado, pool do
Prisma tem só 5 conexões.

## Scoring

`FundamentalScore`/`TokenomicsScore`/`InstitutionalCapitalScore` sempre `INSERT`, nunca
`UPDATE` — histórico completo versionado por `scoreModelVersion`. Sem dado sintético: fontes sem
cobertura gratuita hoje (Unlock Pressure/Distribution/Value Capture do Tokenomics Score) ficam
`null`/N/A explicitamente.

## Dashboard

Validado nesta sessão via chamadas HTTP reais (sem browser interativo disponível): `/login`
retorna 200; `/dashboard` e `/dashboard/projects/[slug]` (inclusive slug inválido) redirecionam
307 para `/login` sem sessão — nenhum vazamento de dado nem erro não tratado. Autenticação
completa (login de fato) não foi exercida nesta sessão por não haver a senha em texto puro
disponível (só o hash bcrypt) — comportamento pós-login foi inferido por leitura de código +
dados reais do banco, não testado end-to-end via browser. Freshness: `/dashboard`,
`/dashboard/projects/[slug]` e `/dashboard/settings` exibem timestamp de última atualização
(confirmado por grep no código-fonte).

## Reports

Project Report em Markdown com download, gerado sob demanda a partir de dados reais
(`packages/research-engine/src/report.ts`).

## Kanban

Board único (singleton, decisão deliberada do MVP), WIP Limit, Pull atômico, Blocked, Urgent,
bottleneck detection — operacional e coberto por testes de integração.

## Operational Requirements

Ver `docs/V1_OPERATIONS.md` para o runbook completo (start/stop, backup/restore, migrations,
health check, failure recovery, rollback). Requer Postgres+Redis via `docker-compose.yml`, e
processos manuais separados para Web/Worker/Scheduler (nenhum orquestrador introduzido nesta
V1).

## Known Limitations

- Scheduler suporta apenas uma instância (sem lock distribuído entre instâncias do scheduler).
- Data Collection é sequencial (Research Worker `concurrency: 1`, projetos processados um a um
  dentro de uma run) — gargalo real, não ajustável só pelo WIP Limit do Kanban.
- Sem rate limiting/CSRF.
- `MASTER_ENCRYPTION_KEY` sem rotação automática — perder a chave é irreversível para os
  secrets existentes.
- Duas specification gaps do Historical Fundamental Intelligence (ver seção acima).
- Restore de produção real (sobre o banco principal) é procedimento manual, não automatizado
  pelo `restore-db.ps1` por segurança.

## Explicitly Out of Scope

Second Brain completo (só contrato de entrada/saída), Trading Intelligence (RSI/MACD/sinais),
Pine Script/TradingView/Technical Score, Backtesting/Historical Intelligence avançada,
multi-tenant, Improvement Proposals automáticos, `TOKEN_UNLOCK` sem DefiLlama Pro key,
classificação automática de Discourse, orquestração complexa (Kubernetes/Terraform).

## Backup & Recovery

`scripts/backup-db.ps1`/`scripts/restore-db.ps1` (PowerShell, via `docker exec pg_dump`/
`pg_restore` no container do compose — sem exigir client Postgres no host). Testado end-to-end
nesta sessão: backup real (1.31 MB, 29 tabelas) + restore em banco isolado
(`crypto_research_restore_test`) + verificação de contagem idêntica em 7 tabelas-chave + limpeza
do banco de teste. `MASTER_ENCRYPTION_KEY` nunca incluída no backup — guardada separadamente,
sem procedimento de recuperação se perdida. Detalhes completos em `docs/V1_OPERATIONS.md`.

## Deployment

Postgres+Redis via `docker-compose.yml`; Web/Worker/Scheduler como processos manuais
documentados (`docs/V1_OPERATIONS.md`, seções 3, 10, 11). Sem containerização de Web/Worker
nesta V1 (avaliado, não implementado — priorizado documentar o processo manual real).

## Post-V1.0 Roadmap

Rotação de `MASTER_ENCRYPTION_KEY`, rate limiting/CSRF caso o deployment deixe de ser
single-user controlado, lock distribuído de scheduler, containerização opcional de Web/Worker,
`TOKEN_UNLOCK` real (validar payload contra DefiLlama Pro), correção das duas specification
gaps do Historical Fundamental Intelligence, features hoje fora de escopo (Second Brain,
Trading Intelligence, Backtesting) conforme decisão de produto futura.
