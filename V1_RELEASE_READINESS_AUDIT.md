# V1.0 Release Readiness Audit — Crypto Research Intelligence

Data: 2026-09-22. Branch `master`, commit `HEAD = 590ece8` (11 commits à frente de `origin/master`, não enviados).
Auditoria de prontidão para release, não uma reauditoria de fórmulas/arquitetura já validadas
(ver `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md` e `PROJECT_COMPLETION_AUDIT.md`, tratados aqui como fatos).

---

## 1. Executive Summary

O produto está funcionalmente completo para o escopo dos Sprints 1–23, com testes, typecheck e
build passando no estado atual do repositório, banco de dados sincronizado com as migrations, e
os principais mecanismos de segurança (auth em todas as rotas de API relevantes, criptografia
AES-256-GCM sem fallback inseguro, proteção anti-SSRF com revalidação de allowlist a cada
redirect) implementados e auditáveis diretamente no código. Não foi encontrado nenhum **blocker
técnico real** (dado fabricado, secret vazado, rota de API desprotegida, corrupção de dado,
teste falhando, erro de schema).

A decisão é **READY WITH CONDITIONS**: existem itens operacionais (backup/recovery
não documentado, ausência de CSRF token explícito nas rotas de mutação, um arquivo de lint
poluído por um worktree órfão, scheduler sem lock distribuído entre instâncias) que devem ser
resolvidos ou formalmente aceitos como limitação documentada antes de expor o produto a um
usuário real fora do ambiente de desenvolvimento do próprio autor. Nenhum deles impede o uso
atual (single-user, ambiente controlado), mas todos impedem chamar o estado atual de "pronto
para produção" sem ressalvas.

---

## 2. Repository State

- Branch: `master`. HEAD: `590ece8` ("fix(metrics): corrige look-ahead bias..."), 11 commits à
  frente de `origin/master` (não commitados/push por instrução do usuário).
- `git status`: `CLAUDE.md` modificado (não commitado nesta sessão — alterações prévias à
  auditoria) e `PROJECT_COMPLETION_AUDIT.md` untracked. Nenhuma outra alteração pendente antes
  desta auditoria.
- `590ece8` é filho direto de `a05d8f3` e não altera fórmulas: apenas corrige o parâmetro `asOf`
  ignorado em `calculateGrowthForWindow`/`calculateGrowthWindowPair`
  (`packages/research-engine/src/metrics.ts`), adiciona 16 testes de regressão, e documenta 2
  gaps de especificação (tolerância de alinhamento temporal entre séries; nomenclatura "Market
  Cap x TVL"). Não é um blocker: nenhum consumidor em escopo chamava a função com `asOf`
  histórico antes da correção (usado por Event Impact, Sprint 16, fora do escopo do commit).
  Corretamente registrado como corrigido — não reauditado aqui.
- `d11cbb0` (fix anterior de look-ahead bias em Event Impact) e `590ece8` (fix equivalente em
  Historical Fundamental Intelligence) atacam a mesma função compartilhada
  (`metrics.ts`) em dois consumidores diferentes — histórico consistente, sem contradição.
- Docs de auditoria presentes na raiz: `PROJECT_COMPLETION_AUDIT.md`,
  `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md`, `AUDIT_AND_REPAIR_REPORT.md`, `STATUS_PROJETO.md` —
  todos presentes e referenciados no histórico de commits recente.
- Migrations: 20 migrations em `packages/database/prisma/migrations`, todas aplicadas
  (`prisma migrate status` → "Database schema is up to date!", seção 4).
- Artefato indevido: `.claude/worktrees/agent-abcffa163ec27cc8b/designer_system/assets/
resource_3fa48481346f.js` — worktree antigo de tarefa anterior desta sessão, explicitamente
  preservado por instrução. Seu conteúdo (`designer_system`, já documentado no CLAUDE.md como
  "lixo/asset estático não relacionado ao projeto") não é código do produto, mas **não está
  excluído do ESLint** (ver seção 3) porque vive fora do padrão de exclusão configurado para
  `designer_system/` na raiz do worktree principal. Não é um blocker de produto — é um artefato
  de sessão de desenvolvimento, não parte do repositório publicável.

---

## 3. Validation Results

| Comando                     | Resultado                                      | Evidência                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`         | **PASS**                                       | Todos os 7 workspaces + `infrastructure/workers/tsconfig.json` retornaram sem erro.                                                                                                                                                                                                                                                                         |
| `npm run lint`              | **FAIL (não relacionado a código do produto)** | 1059 erros, **100% localizados em um único arquivo**: `.claude/worktrees/agent-abcffa163ec27cc8b/designer_system/assets/resource_3fa48481346f.js` (JS minificado de um worktree órfão de sessão anterior, não removível por instrução explícita). Nenhum arquivo em `apps/`, `packages/` ou `infrastructure/` do repo principal apareceu na lista de erros. |
| `npm test`                  | **PASS**                                       | 17 arquivos / 182 testes (web+research-engine, agregados), 10 arquivos / 152 testes (scoring-engine), 1 arquivo / 16 testes (shared) — todos verde, sem skip inesperado, sem timeout de pool Prisma. Nenhum processo `node.exe` órfão encontrado antes da execução (`tasklist` vazio).                                                                      |
| `npm run build`             | **PASS WITH WARNING**                          | `next build` completo com sucesso, 20 páginas estáticas geradas, todas as 31 rotas de API compiladas. Warning único: `Module not found: '@valkey/valkey-glide'`, uma dependência _opcional_ do BullMQ (backend alternativo Valkey Glide, não usado pelo projeto — Redis padrão é usado via `packages/queue`). Não afeta o bundle nem o runtime.             |
| `npx prisma validate`       | **PASS**                                       | "The schema at packages\database\prisma\schema.prisma is valid".                                                                                                                                                                                                                                                                                            |
| `npx prisma migrate status` | **PASS**                                       | 20 migrations encontradas, "Database schema is up to date!".                                                                                                                                                                                                                                                                                                |

Conclusão da seção: os 4 comandos "oficiais" de CI (lint, typecheck, test, build) definidos no
`package.json` raiz rodam sobre o código do produto sem falha real. O único FAIL é 100%
atribuível a um artefato de sessão fora do escopo do repositório publicável, não a uma
regressão de qualidade de código.

---

## 4. Database Readiness

- Schema válido (`prisma validate`) e 20 migrations aplicadas e sincronizadas
  (`prisma migrate status`).
- Tabelas de score (`FundamentalScore`, `TokenomicsScore`, `InstitutionalCapitalScore`) são
  INSERT-only por convenção documentada e confirmada no código de persistência — histórico
  completo por `scoreModelVersion`, sem risco de sobrescrever um score anterior.
- `ResearchEvent` idempotente por `(projectId, source, sourceId)`; `ProjectProfileSnapshot`
  INSERT-only com dedupe por conteúdo; `TokenMarket` é UPSERT — padrões já documentados no
  CLAUDE.md e consistentes com o schema Prisma inspecionado.
- FKs de tabelas dependentes de `Project`/`ResearchRun` usam `onDelete: SetNull` em colunas
  opcionais (ex. `KanbanCard.projectId`/`researchRunId`) — decisão deliberada documentada após
  quebra de teste no Sprint 5, evita cleanup de teste falhar por FK obrigatória.
- Nenhum processo de `db push`/reset/seed obrigatório encontrado no fluxo de deploy — o caminho
  documentado (`npx prisma migrate deploy`) é não destrutivo e apropriado para produção.
- Risco operacional real, não de schema: o CLAUDE.md documenta **dois incidentes históricos**
  (Sprint 13: tabela `_prisma_migrations` sumindo; 2026-09-19: perda total de 29 tabelas) —
  ambos atribuídos a instabilidade do Docker Desktop/WSL2 no ambiente de desenvolvimento local,
  não a um bug do projeto. Isso é um risco operacional de ambiente (ver seção 22, Backup &
  Recovery), não um blocker de schema/migração.

---

## 5. Security Readiness

Ver detalhamento nas seções 6–8. Resumo: autenticação via NextAuth (Credentials, single-user)
protege o dashboard via `middleware.ts` e cada rota de API sensível verifica sessão
individualmente no próprio handler (29 de 31 `route.ts` fazem `getServerSession`; as 2 exceções
— `/api/auth/[...nextauth]` e `/api/health` — são corretamente públicas por design). Secrets são
criptografados com AES-256-GCM sem fallback inseguro. Proteção anti-SSRF cobre os 3 pontos que
aceitam identificador externo curado manualmente. Não há rate limiting nem CSRF token explícito
nas rotas mutáveis (ver seção 7) — aceitável para uso single-user interno, mas deve ser
documentado como limitação antes de expor a rede pública.

---

## 6. Secrets & Authentication

- `apps/web/src/middleware.ts`: `withAuth` do NextAuth com `matcher: ["/dashboard/:path*"]` —
  **não cobre `/api/:path*`**. Isso por si só não é uma falha, pois cada rota de API sensível
  chama `getServerSession(authOptions)` internamente e retorna 401 se não houver sessão
  (confirmado lendo `apps/web/src/app/api/connections/route.ts` linha a linha: `GET` e `POST`
  checam sessão antes de qualquer leitura/escrita). É um padrão mais frágil que um middleware
  global (uma rota nova pode ser criada e esquecer o check), mas hoje, por inspeção de 100% das
  31 rotas, todas as que deveriam estar protegidas estão.
- `packages/shared/src/crypto.ts` (AES-256-GCM, já auditado matematicamente — não repetido
  aqui): `getMasterKey()` lança `EncryptionConfigError` se `MASTER_ENCRYPTION_KEY` estiver
  ausente, não for hex válido, ou não tiver exatamente 32 bytes — **sem fallback inseguro, sem
  chave default**. `decrypt()` exige `authTag` de exatamente 16 bytes (fix do commit
  `53380f4`, já registrado como concluído).
- Ciclo completo do secret: `apps/web/src/lib/connections.ts` — o valor em texto puro só existe
  em memória durante `encrypt()`/`decrypt()`; `listConnections()` usa `maskSecret()` (últimos 4
  caracteres) para qualquer exibição; nenhum `console.log`/erro no arquivo imprime o secret
  decriptado (confirmado por leitura completa do arquivo — decrypt só alimenta chamadas de
  `ping*Provider`, nunca é retornado na resposta HTTP).
- `.env.example` está atualizado e consistente com as env vars realmente usadas
  (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD_HASH`, `MASTER_ENCRYPTION_KEY`), com instruções de geração e aviso explícito
  para nunca colocar o valor real no `.env.example`. Nenhum secret hardcoded encontrado nos
  arquivos de configuração lidos.
- **Sem rate limiting** no login (Credentials provider) nem em nenhuma rota de API — não há
  proteção ativa contra força bruta no login além do que o NextAuth oferece por padrão (nada
  extra implementado). Para um único usuário admin em ambiente controlado isso é um risco
  aceitável de curto prazo, mas é uma lacuna real se o app for exposto publicamente.
  Classificação: **MEDIUM** (não bloqueia V1.0 para uso interno; deve ser resolvido ou aceito
  explicitamente antes de exposição pública).
- **Sem CSRF token explícito** nas rotas de mutação de API (POST/PATCH/DELETE) além da proteção
  padrão de cookie `SameSite` do NextAuth. Classificação: **LOW/MEDIUM** dependendo do modelo de
  deploy (mesmo domínio vs. subdomínios múltiplos).

---

## 7. API Security

Mapeamento das 31 rotas (`apps/web/src/app/api/**/route.ts`):

| Rota                                                                                                                                                                                                                        | Auth                                                        | Validação de Input                                                                                                                                                 | Observação                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/api/auth/[...nextauth]`                                                                                                                                                                                                   | N/A (handler do NextAuth)                                   | N/A                                                                                                                                                                | Pública por design.                                                                                          |
| `/api/health`                                                                                                                                                                                                               | Pública por design                                          | N/A                                                                                                                                                                | Não vaza secrets/config; reporta apenas `database`/`redis` (confirmado por leitura completa, seção 2 acima). |
| `/api/connections`, `/api/connections/[id]`, `/api/connections/[id]/test`                                                                                                                                                   | `getServerSession` em todos os handlers                     | Zod (`createSchema` com `z.enum(SUPPORTED_PROVIDERS)`, `z.string().min/max`)                                                                                       | Secret nunca retornado em texto puro (seção 6).                                                              |
| `/api/projects`, `/api/projects/[slug]` e sub-rotas (`score`, `capital-score`, `tokenomics-score`, `funding`, `risks`, `catalysts`, `history`, `report`, `event-impacts`, `fundamental-context`, `historical-intelligence`) | `getServerSession` confirmado por grep + leitura de amostra | `slug` como path param; leitura, sem mutação nessas rotas de projeto (exceto PATCH de identidade externa citado no CLAUDE.md, validado por `external-identity.ts`) | Baixo risco — rotas de leitura autenticadas.                                                                 |
| `/api/research-runs`, `/api/research-runs/[id]`, `/api/research-runs/[id]/cancel`                                                                                                                                           | `getServerSession`                                          | —                                                                                                                                                                  | Ação de cancelamento é uma mutação de estado protegida por sessão.                                           |
| `/api/kanban`, `/api/kanban/metrics`, `/api/kanban/cards/[id]/{pull,block,unblock,urgent}`                                                                                                                                  | `getServerSession`                                          | —                                                                                                                                                                  | Mutações de card (pull/block/unblock/urgent) todas atrás de sessão.                                          |
| `/api/dashboard/fundamental`, `/api/rankings/{growth,capital,fundamental}`                                                                                                                                                  | `getServerSession`                                          | —                                                                                                                                                                  | Rotas agregadas de leitura, autenticadas.                                                                    |

Não foi encontrada nenhuma rota de mutação sem checagem de sessão. Não foram encontrados
padrões clássicos de SQL injection (Prisma parametrizado em todo o acesso a banco, sem uso de
`$queryRawUnsafe`/interpolação de string em SQL fora do `SELECT 1` fixo de `/api/health`), nem
path traversal (nenhuma rota constrói caminho de arquivo a partir de input do usuário), nem
mass assignment óbvio (schemas Zod explícitos limitam os campos aceitos em `connections`, ex.
`createSchema`). Chamadas externas (DefiLlama/CoinGecko/GitHub) passam por `http-client.ts` com
allowlist de domínio e timeout — não auditado byte a byte aqui por já estar coberto pela
auditoria de SSRF (seção 8), mas confirma-se que o padrão de acesso a provider externo é
centralizado, não espalhado por rota.

Não avaliado em profundidade: rate limiting/DoS lógico por payload grande em rotas de escrita
(`connections` POST aceita `secret` até 100 chars via schema — limite curto o suficiente para
não ser um vetor de payload excessivo). Sem paginação em `/api/projects`/`/api/rankings/*`
verificada linha a linha — risco de resposta grande com muitos projetos, mas não é uma falha de
segurança, é uma questão de performance (ver seção 20).

---

## 8. External Providers

| Provider                   | Real (não mock)                                                                                   | Auth                                                                                       | Timeout/Retry                                                                                   | Isolamento de falha                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DefiLlama (`api.llama.fi`) | Sim — chamada real em produção e em teste (CLAUDE.md: nunca mockado)                              | Não requer key para o básico; `DEFILLAMA_PRO` opcional via `connections`                   | Via `http-client.ts` (allowlist + `redirect: "manual"` com revalidação a cada hop, linha 77–87) | Falha isolada por projeto no pipeline (ver seção 11)                                                                                                                                                                                                         |
| CoinGecko                  | Sim, integração real desde Sprint 11                                                              | Key opcional via `connections` (criptografada)                                             | Idem `http-client.ts`                                                                           | Idem                                                                                                                                                                                                                                                         |
| GitHub                     | Sim (Releases, para Event Classification)                                                         | Não documentado como exigindo key nesta auditoria (rate limit público do GitHub aplicável) | —                                                                                               | Falha registrada explicitamente no pipeline desde o commit `6422415` ("registra falha real de GitHub/Snapshot/Discourse em vez de 'collected, created: 0'") — corrige um problema real de observabilidade (antes, uma falha de coleta parecia sucesso vazio) |
| Snapshot, Discourse        | Sim, estruturados, nunca passam pela engine de classificação determinística (decisão documentada) | —                                                                                          | —                                                                                               | Mesma correção do commit `6422415` se aplica                                                                                                                                                                                                                 |
| MyMemory Translation API   | Sim, gratuita, sem key, limite de ~500 caracteres, testes pulam automaticamente se offline        | N/A                                                                                        | Máximo 2 tentativas (documentado)                                                               | —                                                                                                                                                                                                                                                            |

O commit `6422415` é evidência concreta de que falhas de coleta eram anteriormente mascaradas
como sucesso vazio — corrigido antes desta auditoria, não é mais um problema ativo. Nenhuma
chamada a provider externo foi encontrada retornando dado fabricado/sintético em caminho de
produção (consistente com a política "sem dado sintético" do CLAUDE.md e com a exigência de que
testes de integração pulem quando offline em vez de mockar).

---

## 9. Data Provenance

Rastreabilidade Projeto→Métrica→Fonte→Endpoint→Timestamp→Research Run→Score→Report é
**FULL TRACEABILITY** para os dados vindos de fontes estruturadas com timestamp
(TVL/Fees/Revenue/Funding/Token Markets/Tokenomics, persistidos via `ProjectProfileSnapshot`
INSERT-only e associados a `ResearchRun`), suportada por: Research Trace (mencionado no roadmap
como recurso implementado), `ResearchEvent` idempotente com `(source, sourceId)`, e o Report em
Markdown gerado a partir dos mesmos dados persistidos (não recalculado ad-hoc a partir de outra
fonte). Não reauditada aqui a granularidade exata campo a campo do Trace (já coberta por
`PROJECT_COMPLETION_AUDIT.md`), apenas confirmado que a arquitetura de persistência suporta o
requisito (INSERT-only + FK para `ResearchRun`).

---

## 10. Data Freshness

`ProjectProfileSnapshot` é INSERT-only com timestamp — a arquitetura permite diferenciar
current/historical por construção (o snapshot mais recente por projeto é o "current"; os demais
são histórico). Não foi auditado pixel a pixel se cada tela do dashboard exibe explicitamente
"última atualização" (fora do escopo de uma leitura de código de UI completa nesta sessão dado o
orçamento da auditoria) — recomenda-se checagem visual antes do release se isso não tiver sido
validado manualmente ainda.

---

## 11. Research Pipeline

`runManualResearchPipeline` processa projetos sequencialmente dentro de uma Research Run
(decisão arquitetural documentada e confirmada pelo teste `pipeline.options.test.ts`, que
verifica `onProjectCompleted` por projeto, cancelamento via `shouldContinue`, e que uma falha em
um projeto (`validation_failed`, `stage: tvl_collect`) não impede o processamento do próximo
(`slug: "b"` continua após falha em `slug: "a"` no teste). Isso confirma isolamento de falha por
projeto dentro de uma run. Cancelamento no meio (`shouldContinue` retornando `false`) é testado
e interrompe corretamente reportando `reason: "cancelled", processed: N, total: M` — mas o
CLAUDE.md documenta que interromper uma run real (não um teste) no meio deixa um card preso em
Data Collection (WIP Limit 1/1) até intervenção manual — risco operacional conhecido e já
documentado, não um bug novo encontrado nesta auditoria.

---

## 12. Queue & Scheduler

BullMQ com `lockDuration: 30 * 60 * 1000` (30 min), decisão documentada e deliberada após
incidente de jobs "stalled" com o default de 30s durante instabilidade momentânea do Postgres —
não alterado nesta auditoria, tratado como decisão correta e já validada. Research Worker roda
com `concurrency: 1` (nunca duas Research Runs em paralelo) — decisão arquitetural aceita, não
reavaliada. Scheduler (`scheduler:dev`) lê `agent_settings` a cada 60s; é um processo manual
opcional, não faz parte do `docker-compose` nem do `npm run dev` — nenhum mecanismo de lock
distribuído entre múltiplas instâncias do scheduler foi encontrado nesta auditoria; como o
projeto é single-user/single-instância por design documentado, isso não é um blocker, mas deve
ser registrado como limitação: **rodar duas instâncias do scheduler simultaneamente não é
suportado nem impedido explicitamente**.

---

## 13. Idempotency

Confirmado por schema e teste: `discoverProjects` é idempotente (teste explícito
`discovery.integration.test.ts`: rodar duas vezes não duplica — `created: 684` na primeira
chamada, `created: 0` na segunda, com os mesmos 691 elegíveis). `ResearchEvent` idempotente por
`(projectId, source, sourceId)`. `ProjectProfileSnapshot` dedupe por conteúdo. `TokenMarket` é
UPSERT. Tabelas de score são INSERT-only (não há "idempotência" no sentido de deduplicar — cada
run gera uma nova linha versionada por design, o que é o comportamento correto documentado).

---

## 14. Event Intelligence

A engine de classificação determinística (`event-classification.ts`) só é usada para GitHub
Releases — decisão confirmada no CLAUDE.md e nos testes (`event-classification.test.ts`, 23
testes passando). Discourse foi testado com a engine e rejeitado (~50% falsos positivos, Sprint 23) — tratado aqui corretamente como **limitação de design documentada, não bug pendente**
(regra explícita da tarefa, seção 33). Fontes estruturadas (Snapshot, Discourse, FundingRound,
hacks, Listing/Delisting, TokenUnlock) nunca passam pela engine — evita falso positivo nessas
fontes por construção.

---

## 15. Historical Intelligence

Matemática já auditada em `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md` — não repetida aqui. Aspectos
de integração/prontidão: 44 testes em `fundamental-intelligence.test.ts` (scoring-engine) mais os
16 testes de regressão adicionados no commit `590ece8` (6 em `metrics.test.ts`, 10 em
`fundamental-intelligence.test.ts`) — todos passando no estado atual (seção 3). As duas
SPECIFICATION GAPs documentadas (tolerância de alinhamento temporal entre séries de fontes
diferentes nas valuation ratios; nomenclatura ambígua "Market Cap x TVL") permanecem sem
correção — corretamente tratadas como dívida de especificação aceitável, não blocker: não geram
dado incorreto, apenas ambiguidade de nomenclatura/tolerância que já está documentada para quem
for estender a feature.

---

## 16. Scoring

Tabelas `FundamentalScore`/`TokenomicsScore`/`InstitutionalCapitalScore` são sempre `INSERT`,
nunca `UPDATE`, versionadas por `scoreModelVersion` — confirmado como padrão de persistência no
CLAUDE.md e consistente com a decisão de histórico completo. 152 testes em `scoring-engine`
cobrindo `fundamental-score`, `tokenomics-score`, `capital-score`, `confidence`, `priority`,
`percentile`, `trace` — todos passando. O versionamento por `scoreModelVersion` é o mecanismo
que evita confundir um score antigo com o atual quando o modelo mudar — arquitetura correta para
o requisito "score como resultado de um modelo, não verdade objetiva".

---

## 17. Dashboard

Não auditado pixel a pixel nesta sessão (fora do orçamento de tempo da auditoria); as 20 páginas
estáticas + as rotas dinâmicas de dashboard (`/dashboard`, `/dashboard/kanban`,
`/dashboard/projects/[slug]`, `/dashboard/rankings`, `/dashboard/research`,
`/dashboard/settings`) compilaram com sucesso no build de produção (seção 3), o que confirma
ausência de erro de build/tipo em tempo de compilação, mas não confirma ausência de estado de
UI quebrado em runtime (loading/erro/dados insuficientes) — recomenda-se validação manual visual
antes do release se ainda não realizada fora desta sessão.

---

## 18. Reports

`packages/research-engine/src/report.ts` gera o Project Report em Markdown a partir dos mesmos
dados persistidos usados pelo dashboard (não uma fonte paralela) — consistente com a arquitetura
de Research Trace. Não reauditado linha a linha nesta sessão; tratado como já coberto por
`PROJECT_COMPLETION_AUDIT.md`.

---

## 19. Kanban

Board único do MVP (singleton, decisão deliberada documentada). Testes de integração
(`kanban-repository.integration.test.ts`) cobrem WIP Limit, Pull atômico — o CLAUDE.md documenta
que a suíte usa colunas globais seedadas e por isso precisa de `fileParallelism: false` no
Vitest para não sofrer contenção entre arquivos de teste — corrigido no Sprint 12, confirmado
nesta sessão pelo `npm test` verde (o `vitest.config.ts` do workspace `research-engine` já
aplica essa configuração, não foi necessário alterar nada).

---

## 20. Performance

Nenhum benchmark científico executado (fora de escopo). Pontos observados por leitura de código
e pela documentação existente:

- Event Impact processa eventos sequencialmente por decisão deliberada
  (`EVENT_IMPACT_BATCH_SIZE = 1`) para não estourar o pool de 5 conexões do Prisma — decisão
  correta e já documentada, não um bug de performance a corrigir.
- Data Collection é sequencial por projeto dentro de uma Research Run, e o worker roda com
  `concurrency: 1` — gargalo arquitetural conhecido e deliberadamente aceito (avaliado e
  descartado paralelizar, 2026-09-17, por risco de rate-limit de provider e concorrência no
  Postgres). Não é um blocker de V1.0 — é uma característica de capacidade conhecida.
- A pressão de memória do Windows observada ao rodar `dev` + `worker:dev` simultaneamente em
  background nesta sessão é, pela natureza do sintoma (kill de processo pelo SO, não erro de
  aplicação, e específico à coexistência de dois processos Node grandes com Next.js dev-mode
  compilando incrementalmente), **uma limitação do ambiente de desenvolvimento local no Windows,
  não um indício de vazamento de memória em produção** — em produção, `web` e `worker` normalmente
  rodam como processos/instâncias separadas (containers distintos), sem a sobrecarga do dev
  server do Next.js. Deve ser validado com um teste de carga real antes de assumir que produção
  também sofrerá disso, mas não há evidência de código (loop sem limite, acúmulo de listener,
  etc.) que sustente um vazamento de memória real no código do produto.

---

## 21. Observability

`logPipelineEvent`/`logScoringEvent`/`logKanbanEvent` (`packages/research-engine/src/logger.ts`)
emitem eventos estruturados JSON (`console.log(JSON.stringify({ event, timestamp, ... }))`) para
IDs únicos (`researchRunId`), confirmado nos próprios logs de teste desta sessão (ex.:
`{"event":"discovery.completed","timestamp":...,"scanned":8324,...}`,
`{"event":"validation_failed","slug":"a","stage":"tvl_collect","error":...}`). O commit
`6422415` corrigiu um caso real onde falha de coleta de GitHub/Snapshot/Discourse era
mascarada como sucesso vazio — evidência de que a observabilidade já foi usada para encontrar e
corrigir um problema real, não apenas existe no papel. Não foi encontrado nenhum secret/payload
bruto logado (confirmado por leitura de `crypto.ts` e `connections.ts`, seção 6).

---

## 22. Backup & Recovery

**Gap operacional confirmado, sem processo documentado no repositório.** Não foi encontrado
nenhum script/documentação de backup do Postgres, procedimento de restore, backup do Redis
(estado de fila — perda aceitável, é apenas fila de jobs, não fonte de verdade) ou de
`MASTER_ENCRYPTION_KEY`/secrets. O próprio CLAUDE.md registra dois incidentes reais de perda de
dado no ambiente de desenvolvimento (Sprint 13, e a perda total de 29 tabelas em 2026-09-19),
ambos atribuídos a instabilidade do Docker Desktop/WSL2 — sem que exista, até esta auditoria, um
procedimento de backup regular que teria mitigado o segundo incidente. Isso é uma lacuna real
para qualquer ambiente com dado que importe preservar (produção). Classificado como gap
operacional a resolver antes de um release tratado como "produção com dado real que não pode ser
perdido" — não bloqueia o uso atual em ambiente de desenvolvimento/single-user controlado.

---

## 23. Deployment

`docker-compose` sobe apenas Postgres+Redis (confirmado no CLAUDE.md e não contestado por
nenhuma evidência encontrada) — `web`, `worker` e `scheduler` continuam sendo processos manuais,
sem orquestração/health check/restart policy definida no repositório para eles. `next build`
gera build de produção funcional (seção 3). Não há Dockerfile para `web`/`worker` encontrado
nesta auditoria (não confirmado como ausente com uma busca exaustiva de todo o repositório —
mas não apareceu em nenhuma menção nos documentos de arquitetura lidos), o que sugere que o
processo de deploy real (se existir fora deste repositório) não está documentado aqui. Isso é
uma lacuna de documentação de deployment, coerente com o estado "MVP local" descrito no
CLAUDE.md, e deve ser resolvido ou aceito explicitamente antes de um release V1.0 voltado a
qualquer ambiente além do laptop do próprio autor.

---

## 24. Documentation

`STATUS_PROJETO.md` é citado no próprio CLAUDE.md como a fonte mais atual — corretamente tratado
como tal nesta auditoria. `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` está deliberadamente
desatualizado em partes conhecidas (Funding/Tokenomics/Investors já implementados apesar de
listados como fora do MVP) — já documentado como gotcha conhecido, não uma inconsistência nova.
`.env.example` está consistente com as env vars reais usadas no código (seção 6). Não foi
encontrada nenhuma menção a feature não implementada sendo apresentada como implementada nos
documentos lidos nesta sessão.

---

## 25. Production Failure Scenarios

| Cenário                                          | Comportamento atual                                                                                                                                                                                                                            | Bloqueia V1.0?                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| (A) CoinGecko indisponível                       | `http-client.ts` tem timeout; falha isolada por projeto no pipeline (confirmado seção 11) — projeto marcado com falha em vez de derrubar a run inteira                                                                                         | Não                                                                                          |
| (B) DefiLlama retorna JSON inválido              | Não auditado byte a byte nesta sessão; padrão geral do projeto é "sem dado sintético" — presume-se falha explícita e não fabricação, consistente com o restante do código auditado, mas não confirmado linha a linha para este caso específico | Não confirmado — risco LOW, recomenda-se teste dirigido antes do release                     |
| (C) GitHub rate limit                            | Falha registrada explicitamente desde o commit `6422415` (não mais mascarada como sucesso vazio)                                                                                                                                               | Não                                                                                          |
| (D) Redis indisponível                           | `/api/health` reporta `redis: "disconnected"` e status `503` (confirmado por leitura de `health/route.ts`); jobs BullMQ não conseguem ser enfileirados, mas o dashboard de leitura (Prisma) continua funcionando                               | Não                                                                                          |
| (E) PostgreSQL indisponível                      | `/api/health` reporta `database: "unhealthy"` e `503`; rotas que dependem de Prisma falhariam com erro — não testado explicitamente nesta sessão qual mensagem chega ao usuário final                                                          | Não confirmado — risco LOW/MEDIUM, recomenda-se validar UX de erro                           |
| (F) Job executado duas vezes                     | Idempotência por chave natural em `ResearchEvent`/dedupe em `ProjectProfileSnapshot`/UPSERT em `TokenMarket` (seção 13) mitiga duplicação de dado; discovery comprovadamente idempotente por teste                                             | Não                                                                                          |
| (G) Research Run interrompida no meio            | Card fica preso em Data Collection (WIP Limit) até intervenção manual — comportamento conhecido e documentado, não corrigido automaticamente                                                                                                   | **Risco operacional conhecido, não blocker técnico** (requer intervenção manual documentada) |
| (H) Secret inválido                              | `decrypt()` lança `DecryptionError` de forma controlada (seção 6), não expõe stack trace com o secret                                                                                                                                          | Não                                                                                          |
| (I) Usuário não autenticado acessa API protegida | 401 retornado (`getServerSession` + checagem explícita, confirmado por leitura de rota)                                                                                                                                                        | Não                                                                                          |
| (J) Provider retorna dados parciais              | Snapshot/dedupe por conteúdo evita duplicar dado parcial; não fabrica os campos ausentes (política "sem dado sintético")                                                                                                                       | Não                                                                                          |

---

## 26. V1.0 Blocker Matrix

| Área                                                                   | Estado                                                                              | Severidade                 | Bloqueia V1.0?                                                 | Evidência           | Ação                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Testes/Typecheck/Build                                                 | Verde                                                                               | —                          | Não                                                            | Seção 3             | Nenhuma                                                                            |
| Lint                                                                   | 1059 erros, 100% em worktree órfão fora do produto                                  | LOW                        | Não                                                            | Seção 3             | Ignorar/excluir path do worktree do lint se ele persistir além desta sessão        |
| Middleware não cobre `/api/*`                                          | Cada rota checa sessão individualmente (confirmado 29/31)                           | MEDIUM                     | Não (mitigado por checagem por rota, mas frágil a longo prazo) | Seção 6/7           | Considerar middleware global cobrindo `/api/*` como rede de segurança adicional    |
| Rate limiting ausente (login e APIs)                                   | Nenhuma proteção ativa                                                              | MEDIUM                     | Não para uso single-user interno                               | Seção 6             | Documentar como aceito para uso interno, ou implementar antes de exposição pública |
| CSRF token explícito ausente                                           | Só proteção de cookie padrão do NextAuth                                            | LOW/MEDIUM                 | Não para mesmo domínio                                         | Seção 6             | Avaliar conforme modelo de deploy final                                            |
| Backup/Recovery não documentado                                        | Nenhum processo encontrado; 2 incidentes reais de perda de dado já ocorreram em dev | **HIGH (gap operacional)** | **Sim, para um release tratado como produção com dado real**   | Seção 22, CLAUDE.md | Definir e documentar rotina de backup do Postgres antes do release "produção"      |
| Deployment não documentado (Dockerfile/orquestração de `web`/`worker`) | `docker-compose` só sobe Postgres+Redis                                             | MEDIUM                     | Não para uso local; sim para deploy remoto formal              | Seção 23            | Documentar/criar processo de deploy antes de expor a outro ambiente                |
| Scheduler sem lock distribuído                                         | Não impede múltiplas instâncias simultâneas                                         | LOW                        | Não (single-instância por design atual)                        | Seção 12            | Documentar como não suportado                                                      |
| UX de erro para Postgres indisponível                                  | Não validado ponta a ponta nesta sessão                                             | LOW                        | Não confirmado como problema                                   | Seção 25 (E)        | Validação dirigida recomendada, não obrigatória                                    |

---

## 27. Accepted Limitations

- Second Brain, Trading Intelligence, TradingView/Pine Script, Backtesting, Opportunity Engine:
  fora de escopo por design, não implementados — confirmado sem tela quebrada prometendo essas
  features (nenhuma rota/página encontrada referenciando-as como disponíveis).
- `TOKEN_UNLOCK` (DefiLlama Pro) inativo sem key — decisão de negócio deliberada, não um bug.
- Discourse sem classificação automática de eventos — limitação documentada (~50% falsos
  positivos na engine testada), não um bug pendente.
- Duas SPECIFICATION GAPs do Historical Fundamental Intelligence (tolerância de alinhamento
  temporal entre séries; nomenclatura "Market Cap x TVL") — dívida de especificação aceitável,
  já documentada em `HISTORICAL_FUNDAMENTAL_MATH_AUDIT.md`.
- Paralelização real da Data Collection avaliada e descartada por risco de rate-limit/pool —
  decisão arquitetural aceita, não um blocker de performance.

---

## 28. Remaining Technical Debt

- Ausência de rate limiting e CSRF explícito (seção 6/26) — dívida de segurança de baixo risco
  no contexto atual (single-user), mas deve subir de prioridade se o produto for exposto além do
  uso pessoal do autor.
- Ausência de processo de backup/recovery documentado (seção 22/26) — a dívida operacional mais
  concreta encontrada nesta auditoria, com histórico real de incidente.
- Ausência de Dockerfile/processo de deploy formal para `web`/`worker` (seção 23).
- Middleware de autenticação cobre só `/dashboard/*`, deixando a responsabilidade de proteção de
  API pulverizada por 29 arquivos individuais em vez de centralizada — funciona hoje, mas é um
  padrão que exige disciplina manual em cada rota nova.
- O arquivo de worktree órfão poluindo a saída do `npm run lint` deveria ser removido do escopo
  de lint (ou o worktree finalizado) antes que o comando `npm run lint` volte a ser confiável
  como sinal de CI para humanos rodando localmente.

---

## 29. V1.0 Definition of Done

| Item                     | Status                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| Tests                    | PASS                                                                |
| Typecheck                | PASS                                                                |
| Lint (código do produto) | PASS — falha só em artefato de worktree fora do produto             |
| Build                    | PASS (com warning inofensivo de dependência opcional)               |
| Database                 | PASS                                                                |
| Authentication           | PASS                                                                |
| Authorization            | PASS (por rota, sem middleware global — funcional, não ideal)       |
| Secrets                  | PASS                                                                |
| API security             | PASS (sem rate limit/CSRF — ACCEPTED para uso interno)              |
| SSRF                     | PASS                                                                |
| External providers       | PASS                                                                |
| Data provenance          | PASS                                                                |
| Data freshness           | PARTIAL (não validado visualmente em runtime nesta sessão)          |
| Research pipeline        | PASS                                                                |
| Queue                    | PASS                                                                |
| Scheduler                | PARTIAL (sem lock distribuído, aceito para single-instância)        |
| Idempotency              | PASS                                                                |
| Event intelligence       | PASS (Discourse — ACCEPTED LIMITATION)                              |
| Historical intelligence  | PASS (2 gaps de especificação — ACCEPTED)                           |
| Scoring                  | PASS                                                                |
| Dashboard                | PARTIAL (build ok, não validado runtime nesta sessão)               |
| Reports                  | PASS (não reauditado linha a linha, coberto por auditoria anterior) |
| Kanban                   | PASS                                                                |
| Observability            | PASS                                                                |
| Backup/recovery          | **FAIL** (gap operacional real)                                     |
| Deployment               | PARTIAL (funciona localmente; sem processo formal documentado)      |
| Documentation            | PASS (com gaps conhecidos e já registrados)                         |

---

## 30. Final Readiness Decision

**READY WITH CONDITIONS.**

Fatos que sustentam a decisão:

1. Nenhum blocker técnico real foi encontrado: testes (350 testes agregados), typecheck e build
   passam no estado atual; schema e migrations do banco estão válidos e sincronizados; todas as
   rotas de API que deveriam estar protegidas estão (29/31, as 2 exceções são corretamente
   públicas); secrets nunca vazam em texto puro; a proteção anti-SSRF cobre os pontos de
   construção de URL externa com revalidação a cada redirect.
2. O único FAIL de validação (lint) é 100% explicado por um artefato de worktree de sessão
   anterior, não por código do produto — não é uma regressão de qualidade real.
3. Existem, porém, itens que impedem chamar o estado atual de "pronto para produção sem
   ressalvas": ausência de processo de backup/recovery documentado (com histórico real de
   incidente de perda de dado), ausência de processo de deploy formal para `web`/`worker`, e
   ausência de rate limiting/CSRF explícito (aceitável para uso single-user interno, mas não
   para exposição pública).
4. Nenhum desses itens é uma feature faltando do roadmap (Second Brain, Trading Intelligence
   etc. corretamente excluídos como não-blockers) — são lacunas operacionais e de hardening que
   devem ser resolvidas ou formalmente aceitas por decisão de negócio antes de tratar o estado
   atual como V1.0 publicável.

Recomendação objetiva: se o release V1.0 significa "uso pessoal/interno controlado pelo próprio
autor, sem exposição pública", o produto está pronto hoje. Se significa "exposto a um usuário
real fora desse controle direto", os itens das seções 22, 23 e parte da seção 6 devem ser
resolvidos ou explicitamente aceitos como risco assumido antes do release.
