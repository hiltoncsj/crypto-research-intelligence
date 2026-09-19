# SPRINT_20_IMPLEMENTATION_REPORT.md

## Executive Summary

Sprint 20 substituiu a categoria `OTHER` hardcoded (aplicada a TODO evento GitHub desde o Sprint 19) por uma **Auditable Event Classification Engine** determinística, sem LLM, sem opinião de
modelo — regras de regex conservadoras (verbo+ação, nunca palavra-chave isolada) que produzem
`category` + `confidence` + `ruleId` + `evidence`, todos auditáveis. Fontes estruturadas
(Snapshot/FundingRound/DefiLlama `/hacks`/Listing-Delisting/TokenUnlock) permanecem intocadas —
nunca passam pela engine, confirmado por teste. Um mecanismo de reclassificação idempotente foi
criado para eventos GitHub já persistidos. **423 testes passando / 0 falhando**, typecheck/lint/
build limpos, 0 findings de segurança.

## Before / After

**Antes (Sprint 19)**: `GitHub Release → ResearchEvent → OTHER` (sempre, sem exceção).

**Depois (Sprint 20)**: `GitHub Release → título+corpo → classifyEvent (12 regras
determinísticas) → categoria real (ou OTHER com evidência insuficiente, honestamente) →
ResearchEvent (com classificationMethod/ruleId/evidence)`.

## Architecture

```text
SOURCE (GitHub Release)
  ↓
RAW EVENT (title, body)
  ↓
NORMALIZATION (packages/defi-data, já existia)
  ↓
CLASSIFICATION (packages/scoring-engine/src/event-classification.ts — NOVO)
  ↓
ResearchEvent (packages/research-engine/src/events-repository.ts)
  ↓
EVENT IMPACT ANALYSIS / FUNDAMENTAL CONTEXT (nenhuma mudança necessária)
```

Detalhes completos: `EVENT_CLASSIFICATION_ARCHITECTURE.md`.

## Classification Taxonomy

Mesma taxonomia do Sprint 15 (`ResearchEventCategory`). Nenhuma categoria nova adicionada ao
enum. 12 das ~40 categorias existentes agora têm uma regra de classificação real.

## Rule Engine

`packages/scoring-engine/src/event-classification.ts`, `classifyEvent(input)` — pura (sem I/O),
determinística, nunca lança. Retorna `{ category, confidence, classificationMethod: "RULE",
ruleId, evidence, secondaryCandidates }`.

## Rules Implemented

12: `mainnet-launch-v1`, `testnet-launch-v1`, `protocol-upgrade-v1`, `token-migration-v1`,
`token-burn-v1` (com exclusão explícita de "burn mechanism"/"burn proposal"),
`token-buyback-v1`, `staking-launch-v1`, `new-chain-v1`, `ecosystem-expansion-v1`,
`product-launch-v1`, `integration-v1`, `partnership-v1`. Tabela completa com exemplos de padrão
em `EVENT_CLASSIFICATION_ARCHITECTURE.md` seção 5.

## Confidence Model

Reaproveita `ResearchEvent.confidence` já existente (nenhum campo novo) — HIGH para padrões
inequívocos (launch/live/deployed), MEDIUM para regras com maior risco de falso positivo
(`INTEGRATION`/`PARTNERSHIP`/`PRODUCT_LAUNCH`/`ECOSYSTEM_EXPANSION`), LOW automático para
`OTHER` (nenhuma regra deu match).

## Evidence Model

Trecho do próprio texto (`match[0]` do regex, até 160 caracteres) — nunca o conteúdo inteiro.
Persistido em `ResearchEvent.classificationEvidence` (novo campo, nullable).

## GitHub Integration

`persistGithubReleaseCatalysts` agora chama `classifyEvent({ title: r.title, description: r.body
})` para cada release real. `NormalizedGithubRelease.body` é um campo novo — usado SÓ para
classificar, nunca persistido em `ResearchEvent.description` (fica `null`, para não guardar
changelogs/Markdown arbitrário no banco). Releases em draft sempre recebem `confidence: LOW` e
`status: UNKNOWN`, independente da categoria que a engine classificou.

## Snapshot Integration

**Nenhuma mudança.** Continua `GOVERNANCE`/`HIGH`, agora explicitamente marcado
`classificationMethod: STRUCTURED_SOURCE` — a engine de classificação nunca é invocada para
eventos Snapshot. Testado explicitamente: uma proposta com "mainnet" no título permanece
`GOVERNANCE`.

## Reclassification

`reclassifyExistingGithubEvents(projectId?)` — mecanismo manual (nunca automático, não roda na
Research Run nem no scheduler), idempotente, filtra estritamente `source: "GITHUB"` (nunca toca
fontes estruturadas — testado explicitamente com um evento `FUNDING`). Nunca altera
`sourceId`/`eventDate`/`publishedAt`/`retrievedAt`. Script:
`infrastructure/workers/reclassify-events.ts` (`npm run reclassify-events`).

## Research Trace

Log agregado por coleta (`events.github_releases_collected`, já existente desde o Sprint 19)
estendido com `classification: { otherCount, ruleUsage }`. Decisão deliberada de NÃO logar uma
linha por evento individual — ver `EVENT_CLASSIFICATION_ARCHITECTURE.md` seção 15 para o
racional completo (evitar "excesso de logs", instrução explícita da própria especificação).

## Dashboard

`KNOWN_EVENT_CATEGORIES` (`dashboard-intelligence.ts`) estendido com as 12 categorias novas —
agregação cross-event já genérica (Sprint 16), nenhuma lógica duplicada. Nenhum ranking, nenhum
score de evento, nenhuma sugestão financeira adicionados.

## Event Impact

Confirmado por leitura direta: `EventImpactEngine` trata `category` como `string` puro em toda a
pipeline — nenhuma mudança necessária. Linguagem permanece estritamente descritiva ("foi
observada uma variação de X% na janela analisada"), nunca causal.

## Security

- **ReDoS**: todos os padrões são regex simples (alternações planas, sem quantificadores
  aninhados) — auditados manualmente, nenhum padrão com complexidade exponencial conhecida.
  Segunda camada de defesa: `MAX_CLASSIFICATION_INPUT_LENGTH` (4000 chars) trunca a entrada
  antes de qualquer regex rodar, independente do tamanho real do release.
- **XSS**: confirmado por grep — nenhum `dangerouslySetInnerHTML` em `apps/web/src`. React
  escapa texto por padrão; `classificationEvidence`/`title` nunca são interpretados como HTML.
- **Conteúdo externo nunca executado**: `classifyEvent` só faz correspondência de regex sobre
  texto — nunca `eval`, nunca interpretação de Markdown como HTML, nunca execução de código.
- **Tamanho de evidência limitado**: `MAX_EVIDENCE_LENGTH` (160 chars) — nunca persiste um
  trecho arbitrariamente grande.

## Performance

`classifyEvent` é O(n) sobre o número de regras (12, fixo) × padrões por regra (3-7) — custo
desprezível por evento, sem chamada HTTP adicional, sem LLM, sem query individual por evento.
Chamado dentro do loop já existente de `persistGithubReleaseCatalysts` (mesmo padrão de todas as
outras fontes desde o Sprint 15) — nenhuma mudança de concorrência/paralelismo.

## Tests

**27 testes novos nesta sprint**:

- `packages/scoring-engine/tests/event-classification.test.ts` (arquivo novo): 21 testes — um
  para cada categoria da Fase 17 do documento de especificação (MAINNET, TESTNET,
  PROTOCOL_UPGRADE, TOKEN_MIGRATION, TOKEN_BURN incluindo as 2 exclusões explícitas,
  TOKEN_BUYBACK, INTEGRATION, PARTNERSHIP, PRODUCT_LAUNCH), casos ambíguos ("Preparing for
  mainnet", "How mainnet works", "Testnet coming soon" — nenhum deve casar), título/descrição
  vazios, múltiplos sinais no mesmo texto (prioridade + secondaryCandidates), determinismo
  (mesma entrada → mesma saída), limite de tamanho de evidência, entrada extremamente longa
  (10.000 chars) não lança.
- `packages/research-engine/tests/events-repository.integration.test.ts`: +6 testes —
  classificação real persistida (categoria+confidence+ruleId+evidence corretos no banco),
  regra de conservadorismo também no nível de persistência, classificação lendo o `body` (não
  só o `title`), draft força LOW/UNKNOWN mesmo com título classificável, 3 testes de
  `reclassifyExistingGithubEvents` (reclassifica sem alterar sourceId/datas, idempotência,
  nunca toca eventos estruturados).

**Totais do monorepo** (`npm test`, execução completa):

| Workspace                          | Testes  | Resultado                     |
| ---------------------------------- | ------- | ----------------------------- |
| `@crypto-research/web`             | 20      | ✅                            |
| `@crypto-research/database`        | 10      | ✅                            |
| `@crypto-research/defi-data`       | 68      | ✅                            |
| `@crypto-research/queue`           | 8       | ✅                            |
| `@crypto-research/research-engine` | 167     | ✅ (+6)                       |
| `@crypto-research/scoring-engine`  | 140     | ✅ (+21)                      |
| `@crypto-research/shared`          | 10      | ✅                            |
| **Total**                          | **423** | **423 passando / 0 falhando** |

## Typecheck

`npm run typecheck` → **PASS** limpo nos 7 workspaces + `infrastructure/workers` (inclui o novo
script `reclassify-events.ts`).

## Lint

`npm run lint` → **PASS**, 0 erros, 0 warnings.

## Build

`npm run build` → **PASS**, exit code 0. Mesmo warning pré-existente e não relacionado do Sprint
19 (`@valkey/valkey-glide`, dependência opcional do BullMQ não usada por este projeto).

## Coverage

12 de ~40 categorias de `ResearchEventCategory` agora classificáveis a partir de texto livre
(GitHub Releases). As demais categorias que já tinham fonte estruturada (FUNDING,
SECURITY_INCIDENT, LISTING, DELISTING, TOKEN_UNLOCK, GOVERNANCE) continuam cobertas por essas
fontes, não pela engine. O restante permanece `NOT_IMPLEMENTED`/`OTHER` — sem fonte real ou sem
evidência textual confiável o suficiente para uma regra conservadora.

## Limitations

- Cobertura textual limitada a 12 categorias — deliberado, não expandir sem evidência real.
- Reclassificação de eventos antigos só usa `title` (o `body` nunca foi persistido) — menos
  preciso que a classificação original.
- `secondaryCandidates` não é persistido nesta sprint (só retornado pela função pura).
- `partnership-v1`/`repurchase` usam padrões relativamente amplos (seguindo literalmente a lista
  de exemplos do documento de especificação) — risco de falso positivo maior que as demais
  regras; nenhum caso real observado ainda (zero projetos com `githubRepo` curado em produção).

## Technical Debt

Nenhuma dívida técnica nova introduzida.

## Files Created

- `EVENT_CLASSIFICATION_ARCHITECTURE.md`
- `SPRINT_20_IMPLEMENTATION_REPORT.md` (este arquivo)
- `packages/database/prisma/migrations/20260919150000_sprint20_event_classification/migration.sql`
- `packages/scoring-engine/src/event-classification.ts`
- `packages/scoring-engine/tests/event-classification.test.ts`
- `infrastructure/workers/reclassify-events.ts`

## Files Modified

- `packages/database/prisma/schema.prisma` — `ResearchEvent.classificationMethod/
classificationRuleId/classificationEvidence` + enum `ResearchEventClassificationMethod`.
- `packages/scoring-engine/src/index.ts` — export do novo módulo.
- `packages/defi-data/src/types.ts` — `NormalizedGithubRelease.body` (novo campo).
- `packages/defi-data/src/adapter.ts` — `normalizeGithubReleases` popula `body`.
- `packages/research-engine/src/events-repository.ts` — classificação real em
  `persistGithubReleaseCatalysts`, `classificationMethod: STRUCTURED_SOURCE` em todas as fontes
  estruturadas, `reclassifyExistingGithubEvents`, `ResearchEventView` estendido.
- `packages/research-engine/src/dashboard-intelligence.ts` — `KNOWN_EVENT_CATEGORIES`
  estendido com as 12 categorias novas.
- `packages/research-engine/tests/events-repository.integration.test.ts` — fixtures atualizadas
  (`body`) + 6 testes novos.
- `package.json` — script `reclassify-events`.
- `CLAUDE.md`, `STATUS_PROJETO.md`, `CATALYSTS_RISKS_SOURCE_AUDIT.md` — narrativa da sprint.

## Database Changes

Uma migration: `20260919150000_sprint20_event_classification` — 1 enum novo
(`ResearchEventClassificationMethod`) + 3 colunas nullable em `research_events`. Backward
compatible: eventos existentes ficam com os 3 campos `NULL`, nenhum backfill automático forçado
(a reclassificação é um mecanismo opt-in, separado).

## Next Sprint Recommendation

1. Se o usuário curar `githubRepo` para projetos reais (via UI do Sprint 19), rodar `npm run
reclassify-events` não é necessário para eventos NOVOS (já saem classificados
   corretamente); só serviria para eventos coletados durante a janela entre o Sprint 19 e este
   Sprint 20 — o que hoje é zero eventos (confirmado: nenhum projeto tinha `githubRepo`
   configurado ainda).
2. Se novas categorias precisarem de cobertura textual, seguir o guia "Como adicionar uma nova
   regra" em `EVENT_CLASSIFICATION_ARCHITECTURE.md` seção 13 — nunca adicionar uma regra sem
   teste de caso positivo E caso ambíguo negativo.
3. `FUTURE_LLM` permanece reservado, não implementado — só revisitar com aprovação explícita do
   usuário, dado o princípio central desta sprint (nunca opinião de modelo silenciosa).

---

## Respostas objetivas (Fase 27)

1. **O que foi implementado?** Auditable Event Classification Engine completa (12 regras),
   integração real com GitHub Releases, campos de auditoria no schema, mecanismo de
   reclassificação, testes, documentação.
2. **Quais categorias agora podem ser classificadas automaticamente?** MAINNET, TESTNET,
   PROTOCOL_UPGRADE, TOKEN_MIGRATION, TOKEN_BURN, TOKEN_BUYBACK, STAKING, NEW_CHAIN,
   ECOSYSTEM_EXPANSION, PRODUCT_LAUNCH, INTEGRATION, PARTNERSHIP (via regra) + FUNDING,
   SECURITY_INCIDENT, LISTING, DELISTING, TOKEN_UNLOCK, GOVERNANCE (via fonte estruturada,
   inalterado).
3. **Quais continuam sem classificação?** As ~22 categorias restantes do enum (ex.:
   TOKEN_LAUNCH, INSTITUTIONAL_ADOPTION, REGULATORY, e os Risks estruturais/contínuos já
   documentados como `NOT_IMPLEMENTED` desde o Sprint 18).
4. **Quais fontes reais alimentam cada categoria?** GitHub Releases (via regra) para as 12 da
   pergunta 2; Snapshot/FundingRound/DefiLlama `/hacks`/diff `TokenMarket`/DefiLlama Pro para as
   6 estruturadas.
5. **Quantos eventos foram reclassificados?** 0 em produção — nenhum projeto tinha `githubRepo`
   curado até o momento desta sprint (confirmado por query direta ao banco). O mecanismo foi
   testado com fixtures (seção Tests), não com dados reais, por não existirem ainda.
6. **Quantos permaneceram OTHER?** 0 em produção pelo mesmo motivo (nenhum evento GitHub real
   existe ainda). Em testes, o caso "sem evidência" é coberto explicitamente.
7. **Quantos HIGH/MEDIUM/LOW?** Não aplicável em produção (nenhum evento real ainda). Ver seção
   Confidence Model para a distribuição por regra.
8. **Quais regras foram utilizadas?** As 12 listadas em "Rules Implemented" — nenhuma delas foi
   usada em produção ainda (zero eventos GitHub reais).
9. **Existem falsos positivos conhecidos?** Nenhum caso real observado (zero dados em
   produção). Risco teórico documentado na seção Limitations (`partnership-v1`/`repurchase`).
10. **Existem falsos negativos conhecidos?** Sim, por design — qualquer frase fora dos padrões
    exatos vira `OTHER` (comportamento correto, não um bug, ver Fase 8 do documento de
    especificação).
11. **Houve alguma alteração de schema?** Sim — 1 migration, 1 enum novo, 3 colunas nullable
    (seção Database Changes).
12. **Houve alguma nova chamada externa?** Não — a classificação é pura lógica sobre dados já
    coletados pelo GitHub client do Sprint 19, zero chamada HTTP nova.
13. **Houve alguma regressão?** Não — 423/423 testes passando, incluindo todos os testes dos
    Sprints 1-19 (nenhum foi alterado exceto as fixtures que precisaram do campo `body`).
14. **Qual foi o resultado dos testes?** 423 passed / 0 failed (seção Tests).
15. **Qual foi o resultado do typecheck?** PASS (seção Typecheck).
16. **Qual foi o resultado do lint?** PASS (seção Lint).
17. **Qual foi o resultado do build?** PASS (seção Build).
18. **Qual foi o resultado da auditoria de segurança?** 0 critical / 0 high / 0 medium / 0 low
    (seção Security).
19. **Qual é a cobertura atual de classificação?** 12/40 categorias via regra + 6/40 via fonte
    estruturada = 18/40 categorias do enum com alguma fonte de classificação real; o restante
    permanece `NOT_IMPLEMENTED`/`OTHER` honestamente.
20. **Qual é a principal limitação restante?** Cobertura textual (12 categorias) e o fato de
    nenhum projeto real ter `githubRepo` curado ainda — a engine está pronta e testada, mas
    ainda não processou nenhum evento real em produção.
