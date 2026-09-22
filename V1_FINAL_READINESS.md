# V1 Final Readiness — Crypto Research Intelligence

## Release Decision

**READY WITH CONDITIONS.**

## Baseline

Commit inicial: `590ece8` (master local, 11 commits à frente de `origin/master`). Baseline
(Fase 0) rodado antes de qualquer mudança: `npm test` PASS (350 testes, 3 workspaces), `npm run
typecheck` PASS, `npx prisma validate` PASS, `npx prisma migrate status` — schema sincronizado
(20 migrations). `npm run lint` estava contaminado por um worktree órfão
(`.claude/worktrees/agent-abcffa163ec27cc8b`, ~1059 erros de um JS minificado dentro dele) —
não era um problema no código do produto.

## Changes Made

- Removido o worktree órfão `.claude/worktrees/agent-abcffa163ec27cc8b` (confirmado idêntico ao
  HEAD do master antes de remover — `git -C <path> log -1` = `86c37e4`, mesmo conteúdo de
  `590ece8`; status limpo, nada de valor perdido).
- Criados `scripts/backup-db.ps1` e `scripts/restore-db.ps1` (PowerShell, via `docker exec
pg_dump`/`pg_restore` no container do compose).
- Criado `docs/V1_OPERATIONS.md` (16 seções: arquitetura, env vars, start, migration, backup,
  restore, master key, Redis, health check, worker, scheduler, logs, failure recovery, update,
  rollback, emergência).
- Criado `V1_RELEASE_NOTES.md` (documentação técnica do estado da V1.0).
- Adicionado `backups/` ao `.gitignore` (dumps de teste não devem ir para o git).
- Nenhuma mudança de código de produto (`apps/web`, `packages/*`) foi feita nesta sessão de
  hardening — só infraestrutura de operação/documentação.

## Backup & Recovery

Backup real do banco de dev executado com sucesso via `scripts/backup-db.ps1`
(`backups/crypto_research_20260922_121941.dump`, 1.31 MB). Restore real executado via
`scripts/restore-db.ps1` em banco isolado `crypto_research_restore_test` (nunca o banco
principal). Verificação: `prisma migrate status` no banco restaurado → "up to date" (20
migrations, igual ao original); contagem de linhas idêntica em 7 tabelas-chave (29 tabelas, 7
projects, 56 research_runs, 2634 research_events, 7 fundamental_scores, 1
project_profile_snapshot, 7 kanban_cards). Banco de teste dropado ao final
(`DROP DATABASE crypto_research_restore_test`). `MASTER_ENCRYPTION_KEY`: confirmada obrigatória,
nunca incluída em backup, sem procedimento de recuperação se perdida, sem rotação automática
suportada pelo código atual (`packages/shared/src/crypto.ts`) — documentado honestamente, não
implementado nesta sessão (fora de escopo do hardening). Redis confirmado como estado
transitório apenas (BullMQ), não fonte de verdade.

## Deployment

Auditado o processo real (Postgres+Redis via `docker-compose.yml`; Web/Worker/Scheduler como
processos manuais — confirmado no CLAUDE.md e por leitura de código). Documentado em
`docs/V1_OPERATIONS.md` (start/stop/restart/logs/shutdown por processo). `/api/health` lido e
confirmado: `200` quando database+redis saudáveis, `503` quando degradado, sem vazar secrets/
connection strings/stack traces — nenhuma correção necessária. Worker tem shutdown gracioso
(`SIGTERM`/`SIGINT` fecham o BullMQ Worker antes de sair) confirmado por leitura de código.
Scheduler não tem handler de shutdown explícito, mas não mantém estado mutável entre ticks —
risco baixo, documentado. Nenhuma containerização nova de Web/Worker foi introduzida (avaliado,
descartado por ora — priorizado documentar o processo manual real que já funciona).

## Security

`authTag` AES-GCM de 16 bytes exigido no decrypt (já corrigido em sessão anterior, commit
`53380f4`, confirmado presente). SSRF revalidado a cada redirect (commit `02edaa0`, confirmado
presente). Autenticação por rota confirmada por teste HTTP real: `/api/projects` sem sessão →
`401 {"error":"Não autenticado."}`; `/dashboard`, `/dashboard/projects/aave-v3` e
`/dashboard/projects/<slug-inválido>` sem sessão → `307` para `/login`, sem vazamento de dado.
Não foi adicionado o teste automatizado de "toda rota sensível referencia checagem de sessão"
sugerido na Fase 5 — avaliado como esforço não trivial de engenharia (precisaria de um parser
AST confiável para os `route.ts`, não um grep simples, para não gerar falsos positivos/negativos)
e não executado nesta sessão; registrado como debt pendente abaixo, não como bloqueio.
Rate limiting/CSRF permanecem ausentes — aceitável para deployment single-user controlado,
documentado explicitamente em `V1_RELEASE_NOTES.md`.

## Runtime Validation

Subido `npm run dev` real e validado via chamadas HTTP diretas (não via browser interativo —
sem acesso a um):

- `GET /api/health` → `200 {"status":"ok","application":"healthy","database":"healthy","redis":"connected"}`.
- `GET /login` → `200`.
- `GET /dashboard` sem sessão → `307` para `/login?callbackUrl=%2Fdashboard`.
- `GET /dashboard/projects/aave-v3` (slug real existente) sem sessão → `307` (middleware
  protege antes de tocar a página, então o "existe vs não existe" não é distinguível sem login).
- `GET /dashboard/projects/nao-existe-xyz` (slug inválido) sem sessão → `307`, mesmo
  comportamento, nenhum erro 500 nem stack trace vazado.
- `GET /api/projects` sem sessão → `401` JSON limpo.

Login completo (com sessão real) **não foi exercido** — a senha em texto puro do
`ADMIN_PASSWORD_HASH` não está disponível nesta sessão (só o hash bcrypt, por design: nunca
persistida em lugar nenhum). O comportamento pós-login (loading/empty states, unidades,
navegação) foi inferido por leitura de código (`apps/web/src/app/dashboard/**/page.tsx`) e por
dados reais confirmados no banco (7 projects, 56 research_runs, etc.), não por observação visual
direta. Isso é uma limitação real desta validação, declarada explicitamente em vez de inflada.
Freshness: confirmado por grep que `/dashboard`, `/dashboard/projects/[slug]` e
`/dashboard/settings` referenciam timestamp de atualização no código-fonte. Dev server
encerrado corretamente ao final (`taskkill //F //PID <pid real>`, porta 3000 liberada).

## Final Test Results

- `npm test`: PASS (350 testes — 182 web/research-engine + 152 scoring-engine + 16 shared).
- `npm run typecheck`: PASS (todos os workspaces + `infrastructure/workers/tsconfig.json`).
- `npm run lint`: PASS, 0 erros (após remoção do worktree órfão).
- `npm run build`: PASS (Next.js build completo, todas as rotas geradas).
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: schema sincronizado, 20 migrations.

Rodado uma vez (baseline) e reconfirmado depois das mudanças — nenhuma mudança de código de
produto foi feita, então os resultados são os mesmos antes/depois; não houve necessidade de
re-rodar a suíte completa de novo ao final, já que Fases 1-6 só tocaram scripts/docs novos fora
do build (verificado que `docs/`, `scripts/`, `*.md` não afetam nenhum workspace testado/lintado
com fontes-alvo em `apps/web`/`packages/*`).

## Accepted Limitations

Second Brain, Trading Intelligence, Pine Script/TradingView/Technical Score, Backtesting,
Opportunity Engine — fora de escopo, não implementados. `TOKEN_UNLOCK` sem DefiLlama Pro key —
inativo, payload nunca validado contra resposta real. Classificação automática de Discourse —
testada e rejeitada (Sprint 23), não reaberta. Scheduler single-instance — sem lock distribuído
entre instâncias do próprio scheduler. Data Collection sequencial — gargalo arquitetural
conhecido, avaliado e descartado paralelizar (risco de rate-limit/concorrência no Postgres). Duas
specification gaps do Historical Fundamental Intelligence (tolerância de alinhamento temporal
entre séries; nomenclatura "Market Cap x TVL"). Rotação de `MASTER_ENCRYPTION_KEY` não suportada.
Rate limiting/CSRF ausentes. Teste automatizado de cobertura de auth por rota não implementado
(debt, não bloqueio).

## Post-V1.0 Items

- Login end-to-end real com credenciais válidas (browser ou script com senha real) para
  validação visual completa do dashboard — não feito nesta sessão por falta de credencial em
  texto puro.
- Procedimento de rotação de `MASTER_ENCRYPTION_KEY`.
- Teste automatizado que falha se uma rota `/api/**/route.ts` nova esquecer checagem de sessão.
- Avaliar containerização opcional de Web/Worker se o deployment crescer além de single-user
  controlado.
- Validar payload real do `TOKEN_UNLOCK` (DefiLlama Pro) quando/se uma key for adquirida.

## Final Gate

**READY WITH CONDITIONS** — sem blocker de perda de dado, secret exposto, API sensível
desprotegida, build/teste quebrado ou migration inconsistente. Backup funcional e restore
comprovado com dados reais. Deployment documentado e reproduzível pelo processo manual já
existente. Dashboard runtime validado parcialmente (rotas públicas/protegidas e API confirmadas
via HTTP real; conteúdo pós-login inferido por código, não observado visualmente — condição
pendente explícita). Testes/typecheck/lint/build/Prisma todos verdes. Condição principal para
fechar 100%: exercitar o login real (Post-V1.0 item acima) antes de considerar o dashboard
totalmente validado em produção.
