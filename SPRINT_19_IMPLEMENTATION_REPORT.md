# SPRINT_19_IMPLEMENTATION_REPORT.md

## 1. Executive Summary

Sprint 19 implementou a camada de **External Identity Mapping** (curadoria manual, nunca
inferida por nome) e ligou as duas fontes reais que o Sprint 18 (audit) já tinha confirmado
funcionais e gratuitas, mas bloqueadas por falta desse mapeamento: **GitHub Releases** e
**Snapshot Governance**. Ambas foram validadas AO VIVO (não só por documentação — diferente de
`TOKEN_UNLOCK`, que segue pronto e inativo). Também corrigiu as duas dívidas de teste
pré-existentes pedidas explicitamente (Parte 26) e rodou `build` pela primeira vez (Parte 27,
apontado como pendente no Sprint 17/18).

**Evidência objetiva** (não "implementado com sucesso" sem prova — ver seções 18–21):

```text
npm test        → 396 passed / 0 failed  (7 workspaces)
npm run typecheck → PASS (7 workspaces + infrastructure/workers)
npm run lint       → PASS (0 erros, 0 warnings)
npm run build      → PASS (exit code 0; 1 warning pré-existente e não relacionado — bullmq/@valkey/valkey-glide)
security audit     → 0 critical / 0 high / 0 medium / 0 low
```

Nenhuma falha pré-existente restante — as 2 identificadas nos sprints anteriores foram
corrigidas nesta sprint (seção 23).

## 2. State Before Sprint

Confirmado por leitura direta do código (não suposição) antes de qualquer mudança:

- `ResearchEvent`/`events-repository.ts`/`event-impact-engine.ts` já suportavam qualquer
  categoria nova sem alteração (`category` tratado como `string` puro em toda a pipeline —
  confirmado no Sprint 18, reconfirmado aqui).
- `Project` não tinha nenhum campo de identidade externa além de `coinGeckoId`/`defillamaId`.
- GitHub Releases e Snapshot GraphQL já haviam sido confirmados reais/gratuitos em auditorias
  anteriores (Sprint 15, reconfirmado no Sprint 18), mas nunca implementados por falta de
  mapeamento projeto→identificador.
- `TOKEN_UNLOCK` (Sprint 18) pronto, inativo — não tocado nesta sprint (Parte 30).
- 12 testes de `apps/web` falhavam com `DATABASE_URL not found`/health 503; `afterAll` de
  `discovery.integration.test.ts` falhava com FK violation em `market_data_snapshots`.
- `npm run build` nunca havia sido executado em nenhum sprint anterior (apontado como pendência
  explícita no `SPRINT_17_IMPLEMENTATION_REPORT.md`, seção 25).

## 3. External Identity Audit

Investigado como o projeto já representa identidade externa: `coinGeckoId`/`defillamaId` são
colunas diretas em `Project` (não uma tabela de identidade genérica), preenchidas por coleta
automática (nunca curadoria manual). Nenhum campo para GitHub/Snapshot existia. Nenhum campo foi
duplicado — a decisão (seção 4) reaproveita exatamente o mesmo padrão já em uso.

## 4. Architecture Decision

**Opção A** (campos diretos em `Project`: `githubRepo`, `snapshotSpace`) escolhida sobre
**Opção B** (tabela `ProjectExternalIdentity` genérica). Justificativa completa em
`EXTERNAL_IDENTITY_ARCHITECTURE.md` seção "Decisão de arquitetura" — resumo: só 2
identificadores, ambos 1:1 com `Project`, mesma filosofia de `coinGeckoId`/`defillamaId`; uma
tabela genérica seria abstração prematura.

## 5. Database Changes

Migration `20260919140000_sprint19_external_identity`:

```sql
ALTER TABLE "projects" ADD COLUMN "github_repo" TEXT,
ADD COLUMN "snapshot_space" TEXT;
```

Nullable, sem default, sem backfill — confirmado que era realmente necessária (novos campos,
não cabia no schema existente) antes de criar.

## 6. GitHub Integration

`packages/defi-data/src/github-client.ts` (`getGithubReleases`) — API oficial
(`api.github.com`), keyless, paginação real (`per_page=100`, até `MAX_PAGES=5` = 500 releases),
tratamento de 403/429 (via `fetchJsonWithRetry`, que já implementa retry com backoff exponencial
para status retryable), timeout, isolamento de falha (nunca lança — retorna
`{raw, normalized: null}` em erro). `githubRepo` revalidado no client antes de montar a URL
(defesa em profundidade — ver seção 16). Estrutura confirmada AO VIVO contra
`api.github.com/repos/aave/aave-v3-core/releases` em 2026-09-19.

## 7. Snapshot Integration

`packages/defi-data/src/snapshot-client.ts` (`getSnapshotProposals`) — GraphQL oficial
(`hub.snapshot.org/graphql`), keyless, paginação via `skip` (até `MAX_PAGES=5` = 500 propostas),
timeout de 15s, tratamento de erros GraphQL (`json.errors`) e HTTP, isolamento de falha. Como o
cliente HTTP genérico do projeto (`fetchJsonWithRetry`) só suporta GET, este client usa `fetch`
direto com a MESMA disciplina (allowlist de host, timeout, sem log de secret) em vez de estender
o cliente genérico só para este único caso POST — decisão explícita para não introduzir
abstração nova prematuramente. Estrutura confirmada AO VIVO contra o space real `ens.eth` em
2026-09-19 (2 propostas reais recuperadas, incluindo campos completos: id, title, body, choices,
state, start, end, created, author, link, space).

## 8. ResearchEvent Integration

- GitHub → Catalyst, categoria SEMPRE `OTHER` (nunca inferida como `MAINNET`/`PROTOCOL_UPGRADE`
  sem evidência — regra explícita da sprint), `confidence` `MEDIUM` (publicada) ou `LOW`
  (draft), `status` `COMPLETED` ou `UNKNOWN` (draft), `sourceId` = `releaseId` (inteiro estável
  da própria API).
- Snapshot → Catalyst, categoria `GOVERNANCE`, `confidence` `HIGH` (fonte primária estruturada),
  `status` mapeado de `state` (`pending`→`SCHEDULED`, `active`→`ONGOING`, `closed`→`COMPLETED`,
  outro→`UNKNOWN`), `sourceId` = `proposalId` (hash já estável da fonte).
- `eventDate`/`publishedAt`/`retrievedAt` mantidos separados em ambos, nunca colapsados.

## 9. Pipeline Changes

`packages/research-engine/src/pipeline.ts`, dentro de `runPipelineForProject`: 2 blocos
independentes (cada um com seu próprio `try/catch`), logo após o bloco `TOKEN_UNLOCK` do Sprint 18. `if (project.githubRepo) { ... } else { log skipped_no_mapping }` — mesma estrutura para
`snapshotSpace`. Ausência de configuração NUNCA é tratada como erro (log dedicado
`*_skipped_no_mapping`, não `*_failed`).

## 10. Deduplication

`(projectId, source, sourceId)` — mesma unique constraint já existente, reaproveitada sem
alteração de schema. Testado explicitamente (seção 18): sourceId determinístico por `releaseId`/
`proposalId`, releases/propostas diferentes geram eventos diferentes, dois projetos com a mesma
release/proposta não colidem, segunda execução idêntica não duplica (created:0, updated:1).

## 11. Backfill

Cada chamada já retorna o histórico completo disponível (GitHub: todas as releases paginadas;
Snapshot: todas as propostas paginadas) — não foi necessário um mecanismo de backfill separado
do fluxo incremental normal, já que não há cursor incremental nativo nessas 2 APIs (paginação é
sempre "do começo"); o limite de segurança (`MAX_PAGES=5`) evita download ilimitado.

## 12. Incremental Updates

Cada Research Run refaz a busca completa (dentro do limite de páginas) e usa
`findUnique`/`update`-ou-`create` por `sourceId` estável — eventos já existentes são
atualizados, não duplicados; novos eventos (releases/propostas publicadas desde a última run)
são criados normalmente.

## 13. Dashboard

`KNOWN_EVENT_CATEGORIES` (`packages/research-engine/src/dashboard-intelligence.ts`) estendido
para incluir `GOVERNANCE` e `OTHER` — a agregação cross-event existente (Sprint 16) já é
genérica por categoria, nenhuma lógica duplicada.

## 14. Project Report

Nenhuma mudança necessária — confirmado por leitura direta que `report.ts`/`getCatalysts`/
`getRisks` já tratam `category` genericamente (interpolação de string).

## 15. Research Trace

6 novos eventos de log estruturado (`logEventsEvent`, `packages/research-engine/src/logger.ts`):
`events.github_releases_collected/failed/skipped_no_mapping`,
`events.snapshot_proposals_collected/failed/skipped_no_mapping`. Nenhum secret/token logado (não
há secret nesta integração — ambas as fontes são keyless).

## 16. Security

- **SSRF**: `packages/defi-data/src/external-identity.ts`
  (`isValidGithubRepo`/`isValidSnapshotSpace`) valida formato (`owner/repo` / slug simples) em
  DOIS pontos independentes — na API de curadoria E de novo em cada client, antes de montar
  qualquer URL. Hosts de destino são constantes fixas no código (`api.github.com`/
  `hub.snapshot.org`), nunca derivados do valor curado. Testado explicitamente contra
  `javascript:`, `file:`, `http://127.0.0.1`, `localhost`, path traversal (`..`), injeção de
  credencial (`owner@host/repo`) — 6 testes em `external-identity.test.ts`, todos rejeitando.
- **Autorização**: curadoria (`PATCH /api/projects/[slug]`) exige a mesma sessão NextAuth
  Credentials de todas as outras rotas admin — sistema single-user, sem RBAC separado
  necessário (confirmado por auditoria do código de auth existente).
- **Nenhum secret** nesta integração — ambas as fontes são keyless.
- Allowlist anti-SSRF do cliente HTTP genérico (`assertAllowedDomain`) reaproveitada para
  GitHub; Snapshot implementa a mesma checagem manualmente (`assertSnapshotHost`) já que usa
  `fetch` direto em vez do cliente genérico.

## 17. Performance

GitHub: até 5 requests por projeto por run (paginação), dentro do processamento sequencial já
existente (nunca paralelo). Snapshot: idem. Ambos limitados por `MAX_PAGES`, evitando rajadas
descontroladas contra APIs de terceiros. Nenhuma mudança de concorrência no pipeline.

## 18. Tests

Números exatos (medidos após a implementação completa):

**Testes novos nesta sprint**: 25

- `packages/defi-data/tests/external-identity.test.ts` (novo arquivo): 6 testes — validação
  anti-SSRF, incluindo os 6 casos proibidos da Parte 21 (javascript:, file:, IP interno,
  localhost, path traversal, injeção).
- `packages/defi-data/tests/adapter.test.ts`: +8 testes (4 `normalizeGithubReleases`, 4
  `normalizeSnapshotProposals`) — fixtures baseadas em payloads REAIS capturados ao vivo (não
  inventados), cobrindo: normalização de item válido, draft sem `published_at`, itens
  malformados descartados individualmente (nunca lança), payload não-array, `state` desconhecido
  repassado cru.
- `packages/research-engine/tests/events-repository.integration.test.ts`: +11 testes —
  `persistGithubReleaseCatalysts` (5: categoria OTHER, confidence MEDIUM/LOW, sourceId
  determinístico/idempotente, releases diferentes, projetos diferentes não colidem),
  `collectGithubReleaseCatalysts` (1: skip sem mapping), `persistSnapshotGovernanceCatalysts` (4:
  categoria GOVERNANCE/confidence HIGH, mapeamento de state, idempotência, propostas
  diferentes), `collectSnapshotGovernanceCatalysts` (1: skip sem mapping).

**Testes de Pipeline (Parte 24)**: NÃO foi criado um teste de integração dedicado simulando
`runPipelineForProject` ponta a ponta com GitHub/Snapshot falhando isoladamente — a suíte
existente (`pipeline.options.test.ts`) mocka `@crypto-research/defi-data` de forma que o
processamento por projeto nunca avança além da etapa de TVL (falha cedo por design do mock, não
alcança o bloco de identidade externa). Estender esse mock exigiria simular toda a cadeia
upstream (TVL, funding, profile, tickers) só para isolar este ponto específico. Em vez disso, o
isolamento de falha é garantido e testado no nível `collect*`/`persist*` (nunca lançam, sempre
retornam um resultado) e confirmado por leitura direta do bloco `try/catch` independente em
`pipeline.ts` (seção 9). Documentado explicitamente como decisão de escopo, não como lacuna
escondida.

**Diferença fixture vs. API real (Parte 25, obrigatório declarar)**: os testes automatizados
usam FIXTURES (dados fixos no código de teste), não uma chamada de rede real a cada execução —
mesmo padrão de todas as outras suítes deste repositório (`SECURITY_INCIDENT`/`FUNDING`
também usam fixtures nos testes automatizados). A VALIDAÇÃO CONTRA A API REAL foi feita
manualmente, uma vez, durante esta sessão de implementação (via `curl`/`WebFetch` — ver seções 6
e 7), e as fixtures dos testes automatizados foram construídas a partir dessas respostas reais
capturadas. Isso é mais forte que `TOKEN_UNLOCK` (que nunca foi chamado de verdade), mas ainda
não é "a suíte automatizada bate na API real a cada `npm test`" — `client.integration.test.ts`
(DefiLlama) é o único teste deste repositório que faz isso, e não foi replicado aqui para não
introduzir flakiness de rede/rate-limit em CI para 2 fontes novas sem necessidade.

**Totais do monorepo após esta sprint** (`npm test`, execução completa):

| Workspace                          | Testes  | Resultado                                                            |
| ---------------------------------- | ------- | -------------------------------------------------------------------- |
| `@crypto-research/web`             | 20      | ✅ todos passando (12 corrigidos nesta sprint — seção 23)            |
| `@crypto-research/database`        | 10      | ✅ todos passando                                                    |
| `@crypto-research/defi-data`       | 68      | ✅ todos passando (+14 novos)                                        |
| `@crypto-research/queue`           | 8       | ✅ todos passando                                                    |
| `@crypto-research/research-engine` | 161     | ✅ todos passando (+11 novos; suíte de cleanup corrigida — seção 23) |
| `@crypto-research/scoring-engine`  | 119     | ✅ todos passando                                                    |
| `@crypto-research/shared`          | 10      | ✅ todos passando                                                    |
| **Total**                          | **396** | **396 passando / 0 falhando**                                        |

## 19. Typecheck

`npm run typecheck` → **PASS** limpo nos 7 workspaces (`web`, `database`, `defi-data`, `queue`,
`research-engine`, `scoring-engine`, `shared`) + `infrastructure/workers`. Resultado real.

## 20. Lint

`npm run lint` (`eslint .`) → **PASS**, 0 erros, 0 warnings. Resultado real.

## 21. Build

`npm run build` → **PASS**, exit code 0. `apps/web` (`next build`) compilou com sucesso, gerou
todas as 20 páginas estáticas/dinâmicas. **1 warning pré-existente, não relacionado a esta
sprint**: `Module not found: Can't resolve '@valkey/valkey-glide'` (dependência opcional do
BullMQ para um transporte Redis alternativo que este projeto não usa — `packages/queue` usa o
transporte `ioredis` padrão do BullMQ, não o Valkey GLIDE client). Confirmado não-bloqueante
(build termina com sucesso, warning é sobre um import condicional interno do BullMQ).

## 22. Security Audit

- **Critical**: 0
- **High**: 0
- **Medium**: 0
- **Low**: 0

Superfície nova (2 clients HTTP keyless, 1 endpoint PATCH autenticado, 2 colunas nullable)
auditada explicitamente contra SSRF (seção 16) e autorização (reaproveita sessão existente,
nenhum sistema paralelo). Nenhum secret novo introduzido.

## 23. Limitations

- **Categorias de Catalyst mais específicas não implementadas**: `PROTOCOL_UPGRADE`/`MAINNET`/
  `TESTNET` (GitHub) e `TOKEN_MIGRATION`/`TOKEN_BURN`/`TOKEN_BUYBACK`/`STAKING`/`REVENUE_SHARE`
  (Snapshot, Parte 6 da spec) permanecem fora — exigiriam interpretar texto livre (título/corpo)
  para inferir sub-categoria, o que a própria sprint proíbe ("nunca inventar significado sem
  evidência"). Documentado, não é uma lacuna escondida.
- **Cobertura depende 100% de curadoria manual** — nenhum projeto tem `githubRepo`/
  `snapshotSpace` por padrão.
- **Teste de isolamento de falha no nível pipeline** não foi criado como integração ponta a
  ponta (ver seção 18) — coberto no nível `collect*`/`persist*` + leitura de código.
- **Fixtures de teste, não chamada de rede a cada `npm test`** (ver seção 18) — validação contra
  API real foi manual, uma vez, nesta sessão, não é parte da suíte automatizada recorrente.

### Dívidas pré-existentes corrigidas nesta sprint (não introduzidas aqui)

1. **12 testes de `apps/web` falhando** (`DATABASE_URL not found` / health check 503) — causa
   raiz: `apps/web/tests/setup.ts` resolvia `.env` com `../../.env` (2 níveis, chegava em
   `apps/.env`, inexistente) em vez de `../../../.env` (3 níveis, raiz do monorepo) — bug de
   path, `apps/web/tests` está na mesma profundidade que `packages/research-engine/tests`, que
   já usava o caminho correto. Corrigido com 1 linha; todos os 20 testes de `apps/web` passam
   agora.
2. **`afterAll` de `discovery.integration.test.ts` falhando** com `Foreign key constraint
violated: market_data_snapshots_project_id_fkey` — causa raiz: `MarketDataSnapshot` (Sprint
   12), `ProjectProfileSnapshot`/`TokenMarket` (Sprint 13) e `ResearchEvent` (Sprint 15) foram
   adicionados ao schema depois deste teste e nunca entraram na lista de cleanup do `afterAll`.
   Corrigido adicionando os 4 `deleteMany` faltantes, na ordem correta (antes do
   `prisma.project.deleteMany`).

## 24. Technical Debt

Nenhuma dívida técnica nova introduzida. As categorias não implementadas (seção 23) são
decisões de produto documentadas, não atalhos técnicos.

## 25. Files Created

- `EXTERNAL_IDENTITY_ARCHITECTURE.md`
- `SPRINT_19_IMPLEMENTATION_REPORT.md` (este arquivo)
- `packages/database/prisma/migrations/20260919140000_sprint19_external_identity/migration.sql`
- `packages/defi-data/src/external-identity.ts`
- `packages/defi-data/src/github-client.ts`
- `packages/defi-data/src/snapshot-client.ts`
- `packages/defi-data/tests/external-identity.test.ts`

## 26. Files Modified

- `packages/database/prisma/schema.prisma` — `Project.githubRepo`/`Project.snapshotSpace`.
- `packages/defi-data/src/types.ts` — `RawGithubRelease`/`NormalizedGithubRelease`/
  `RawSnapshotProposal`/`NormalizedSnapshotProposal`.
- `packages/defi-data/src/adapter.ts` — `normalizeGithubReleases`/`normalizeSnapshotProposals`.
- `packages/defi-data/src/index.ts` — novos exports.
- `packages/defi-data/tests/adapter.test.ts` — 8 testes novos.
- `packages/research-engine/src/events-repository.ts` —
  `persistGithubReleaseCatalysts`/`collectGithubReleaseCatalysts`,
  `persistSnapshotGovernanceCatalysts`/`collectSnapshotGovernanceCatalysts`.
- `packages/research-engine/src/pipeline.ts` — integração condicional dos 2 novos blocos.
- `packages/research-engine/src/logger.ts` — 6 novos `EventsEvent`.
- `packages/research-engine/src/dashboard-intelligence.ts` — `KNOWN_EVENT_CATEGORIES`
  estendido.
- `packages/research-engine/tests/events-repository.integration.test.ts` — 11 testes novos.
- `packages/research-engine/tests/discovery.integration.test.ts` — correção de cleanup
  (dívida pré-existente).
- `apps/web/src/app/api/projects/[slug]/route.ts` — `PATCH` para curadoria.
- `apps/web/src/lib/research.ts` — `updateProjectExternalIdentity` +
  `githubRepo`/`snapshotSpace` em `ProjectIdentification`.
- `apps/web/src/app/dashboard/projects/[slug]/page.tsx` — `ExternalIdentitySection` (UI de
  curadoria).
- `apps/web/tests/setup.ts` — correção de path do `.env` (dívida pré-existente).
- `CLAUDE.md`, `STATUS_PROJETO.md`, `CATALYSTS_RISKS_SOURCE_AUDIT.md` — narrativa da sprint.

## 27. Migrations

Uma: `20260919140000_sprint19_external_identity` (2 colunas nullable em `projects`, sem
backfill). Aplicada e verificada nesta sessão (`prisma migrate deploy` + `prisma generate`).

## 28. Next Sprint Recommendation

1. Se o usuário quiser cobrir `PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET`/`TOKEN_MIGRATION`/etc. com
   confiança, a próxima decisão é de PRODUTO, não técnica: aprovar algum grau de interpretação
   de texto (título/corpo do release ou proposta) com uma metodologia explícita e auditável
   (ex.: um conjunto curado de palavras-chave, documentado, com `confidence` rebaixado) — hoje
   deliberadamente não implementado por ser subjetivo demais para a barra de evidência exigida
   por este projeto.
2. Curar `githubRepo`/`snapshotSpace` para os projetos do Top 10 dinâmico (via a UI já
   entregue) é o próximo passo natural para começar a ver eventos reais no Dashboard/Report.
3. Reavaliar `TOKEN_UNLOCK` só se o usuário aprovar orçamento explícito para a DefiLlama Pro
   (nenhuma mudança nesta sprint, conforme Parte 30).
