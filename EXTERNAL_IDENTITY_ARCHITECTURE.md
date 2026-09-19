# External Identity Mapping & Governance Intelligence (Sprint 19)

## Objetivo

Destravar as duas fontes reais que o Sprint 17 (audit) já tinha confirmado funcionais e
gratuitas — GitHub Releases API e Snapshot GraphQL — mas que ficaram `NOT_IMPLEMENTED` por falta
de um jeito confiável de associar `Project` a um identificador externo (repositório GitHub /
space do Snapshot). Ver `CATALYSTS_RISKS_SOURCE_AUDIT.md` para a investigação original.

## Decisão de arquitetura: campos diretos em `Project` (Opção A)

Avaliadas duas opções:

- **Opção A** — `Project.githubRepo`/`Project.snapshotSpace` como colunas opcionais diretas.
- **Opção B** — tabela `ProjectExternalIdentity` genérica (`projectId`, `provider`,
  `externalId`, `externalUrl`, `verified`, timestamps).

**Escolhida: Opção A.** Só existem 2 identificadores hoje, ambos 1:1 com `Project` (um projeto
tem no máximo um repositório GitHub "oficial" e um space Snapshot "oficial" — não há caso de uso
para múltiplos por projeto nesta sprint). Uma tabela genérica seria abstração prematura para 2
campos — mesmo princípio já usado para `coinGeckoId`/`defillamaId` (também colunas diretas, não
uma tabela `ProjectIdentifier`). Se um terceiro/quarto identificador externo aparecer no futuro
com necessidade de N:1 (ex.: múltiplos repositórios por projeto), reavaliar para a Opção B nesse
momento — não antes.

Migration: `packages/database/prisma/migrations/20260919140000_sprint19_external_identity/`
(`ALTER TABLE projects ADD COLUMN github_repo TEXT, ADD COLUMN snapshot_space TEXT` — nullable,
sem default, sem backfill).

## Curadoria manual — nunca inferência por nome

`githubRepo`/`snapshotSpace` só podem ser preenchidos via `PATCH /api/projects/[slug]`
(`apps/web/src/app/api/projects/[slug]/route.ts`), autenticado pela MESMA sessão NextAuth
Credentials já usada em todo o resto do app admin (sistema single-user — ver `CLAUDE.md`; não
existe RBAC separado, e criar um painel de permissões só para 2 campos seria complexidade
desnecessária, conforme a Parte 22 do documento de especificação desta sprint).

UI mínima: um formulário de 2 campos na página do projeto
(`apps/web/src/app/dashboard/projects/[slug]/page.tsx`, componente `ExternalIdentitySection`).
Nenhum matching automático por nome/slug foi implementado em lugar nenhum — o único caminho de
escrita é a curadoria manual explícita.

## Validação anti-SSRF (defesa em profundidade)

`packages/defi-data/src/external-identity.ts` (`isValidGithubRepo`/`isValidSnapshotSpace`) é
chamado em DOIS pontos independentes:

1. Na API de curadoria (`apps/web/src/lib/research.ts`,
   `updateProjectExternalIdentity`) — antes de persistir.
2. De novo em cada client (`github-client.ts`/`snapshot-client.ts`) — antes de montar qualquer
   URL, mesmo que o valor já esteja no banco.

Formato exigido: `owner/repo` para GitHub (sem protocolo/host/query string) e um slug simples
para Snapshot (ex.: `ens.eth`). Qualquer valor contendo `://`, espaço, `..` ou caracteres fora
do allowlist regex é rejeitado — nunca vira uma URL arbitrária. Os hosts de destino
(`api.github.com`/`hub.snapshot.org`) são constantes fixas no código, nunca derivadas do valor
curado — o campo curado só entra como um _path segment_ (GitHub) ou uma _variável GraphQL_
(Snapshot), nunca como host.

## GitHub Releases

- `packages/defi-data/src/github-client.ts` (`getGithubReleases`) — `GET
/repos/{owner}/{repo}/releases`, paginado (`per_page=100`, até 5 páginas = 500 releases),
  keyless (60 req/hora por IP — suficiente para o volume esperado, um subconjunto pequeno de
  projetos curados). Confirmado AO VIVO em 2026-09-19 (`aave/aave-v3-core`).
- Normalização (`normalizeGithubReleases`, `packages/defi-data/src/adapter.ts`): categoria
  **SEMPRE `OTHER`** — a regra explícita da sprint proíbe inferir `PROTOCOL_UPGRADE`/`MAINNET`
  a partir de um release sem evidência textual clara, e nenhuma heurística de palavra-chave foi
  implementada (seria "inventar significado sem evidência" da mesma forma que um match por
  nome). `confidence` é `MEDIUM` para releases publicadas e `LOW` para drafts.
- `eventDate` = `published_at` quando disponível, com fallback para `created_at` só para drafts
  sem publicação — `publishedAt` fica `null` nesse caso, sinalizando a limitação.
- Persistência: `packages/research-engine/src/events-repository.ts`
  (`persistGithubReleaseCatalysts`/`collectGithubReleaseCatalysts`). `sourceId` = `releaseId`
  (inteiro estável da própria API do GitHub, nunca aleatório).

## Snapshot Governance

- `packages/defi-data/src/snapshot-client.ts` (`getSnapshotProposals`) — GraphQL oficial
  (`hub.snapshot.org/graphql`), paginado via `skip` (até 5 páginas = 500 propostas), keyless.
  Confirmado AO VIVO em 2026-09-19 (space `ens.eth`, 2 propostas reais recuperadas).
- `fetchJsonWithRetry` (cliente HTTP genérico do projeto) só suporta GET — Snapshot exige POST
  com corpo GraphQL, então este client usa `fetch` direto com a MESMA disciplina (timeout de
  15s, allowlist de host, isolamento de erro) em vez de estender o cliente genérico usado por
  DefiLlama/CoinGecko/GitHub só para este único caso.
- Normalização (`normalizeSnapshotProposals`): `state` é repassado CRU da fonte
  (`pending`/`active`/`closed`), nunca reinterpretado no normalizador.
- Mapeamento de status (`events-repository.ts`, `mapSnapshotState`): `pending`→`SCHEDULED`,
  `active`→`ONGOING`, `closed`→`COMPLETED`, qualquer outro valor→`UNKNOWN` (nunca uma suposição).
- `confidence` é `HIGH` — fonte primária oficial estruturada, status mapeado diretamente do
  campo `state` sem interpretação (mesmo padrão de confiança de `SECURITY_INCIDENT`/`FUNDING`).
- `sourceId` = `proposalId` (já um hash hex estável gerado pelo próprio Snapshot).
- Categoria sempre `GOVERNANCE`; `TOKEN_MIGRATION`/`TOKEN_BURN`/etc. mencionados na Parte 6 do
  documento de especificação NÃO foram implementados nesta sprint — exigiriam interpretar o
  título/corpo da proposta para inferir esses sub-tipos, o que violaria a mesma regra de "não
  interpretar livremente títulos como fatos econômicos". Documentado como limitação (ver
  `SPRINT_19_IMPLEMENTATION_REPORT.md` seção 23).

## Pipeline

`packages/research-engine/src/pipeline.ts`, dentro de `runPipelineForProject`: dois blocos
independentes, cada um com seu próprio `try/catch`, logo após o bloco de `TOKEN_UNLOCK` (Sprint
18). Se `project.githubRepo` for `null`, GitHub nunca é chamado (log
`events.github_releases_skipped_no_mapping`, nunca tratado como erro); mesma lógica para
`project.snapshotSpace`/Snapshot. Uma fonte falhando (`events.github_releases_failed` /
`events.snapshot_proposals_failed`) nunca impede a outra nem o resto do pipeline.

## Compatibilidade com Event Impact / Dashboard / Report / Research Trace

Confirmado por leitura direta (mesma auditoria do Sprint 18): `EventImpactEngine` trata
`category` como `string` puro — nenhuma mudança necessária para `OTHER`/`GOVERNANCE`.
`report.ts`/`getCatalysts`/`getRisks` já são genéricos por categoria. `dashboard-intelligence.ts`
(`KNOWN_EVENT_CATEGORIES`) estendido para incluir `GOVERNANCE`/`OTHER` na agregação cross-event.
Research Trace segue o padrão `logEventsEvent` já estabelecido — 6 novos eventos de log
(`events.github_releases_*`, `events.snapshot_proposals_*`).

## Limitações conhecidas

- Categorias de Catalyst mais específicas (`PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET`) permanecem
  `NOT_IMPLEMENTED` mesmo com GitHub Releases ativo — a fonte não permite inferir isso com
  confiança sem interpretação de texto, que a sprint proíbe explicitamente.
- `TOKEN_MIGRATION`/`TOKEN_BURN`/`TOKEN_BUYBACK`/`STAKING`/`REVENUE_SHARE` via Snapshot (Parte 6)
  não implementados pelo mesmo motivo.
- Cobertura depende inteiramente da curadoria manual — nenhum projeto tem `githubRepo`/
  `snapshotSpace` por padrão; o operador precisa preencher via UI/API para cada projeto que
  quiser cobrir.
- Testes de isolamento de falha (uma fonte falha, outra continua) são cobertos no nível
  `collect*`/`persist*` (nunca lançam, sempre retornam) e por leitura direta do bloco
  `try/catch` independente em `pipeline.ts` — não há um teste de integração de
  `runPipelineForProject` ponta a ponta simulando falha de rede do GitHub especificamente (exigiria
  mockar toda a cadeia de upstream do pipeline só para isolar esse ponto; ver
  `SPRINT_19_IMPLEMENTATION_REPORT.md` seção 18 para o racional completo desta decisão de
  escopo de teste).
