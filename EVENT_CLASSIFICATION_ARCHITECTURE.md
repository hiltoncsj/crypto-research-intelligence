# Auditable Event Classification Engine (Sprint 20)

## 1. Objetivo

Até o Sprint 19, todo evento vindo do GitHub Releases (a única fonte de texto livre do sistema)
virava Catalyst `OTHER` sempre, mesmo quando o título/corpo do release indicava claramente um
`MAINNET`/`PROTOCOL_UPGRADE`/etc. O Sprint 20 substitui isso por uma engine de classificação
**determinística, auditável e explicável** — nunca uma "opinião do modelo", nunca um LLM (ver
seção 12: fora de escopo explicitamente).

## 2. Arquitetura

```text
SOURCE (GitHub Release)
    ↓
RAW EVENT (title, body)
    ↓
NORMALIZATION (packages/defi-data — NormalizedGithubRelease, já existia do Sprint 19)
    ↓
CLASSIFICATION (packages/scoring-engine/src/event-classification.ts — classifyEvent, NOVO)
    ↓
ResearchEvent (packages/research-engine/src/events-repository.ts, persistGithubReleaseCatalysts)
    ↓
EVENT IMPACT ANALYSIS / FUNDAMENTAL CONTEXT (Sprints 16/15 — nenhuma mudança necessária)
```

Fontes ESTRUTURADAS (Snapshot Governance, FundingRound, DefiLlama `/hacks`, diff de
`TokenMarket`) **nunca passam pela engine** — cada `persist*` correspondente atribui a categoria
diretamente, com `classificationMethod: STRUCTURED_SOURCE`. Isso não é uma regra de prioridade
dentro da engine; é a própria arquitetura: a função `classifyEvent` simplesmente nunca é chamada
para esses eventos, então não há como ela "vencer" ou "perder" para a fonte estruturada — a fonte
estruturada é a única que decide.

## 3. Taxonomia

A mesma do Sprint 15 (`ResearchEventCategory` em `schema.prisma`) — nenhuma categoria nova
adicionada. A engine hoje sabe atribuir 12 das ~40 categorias existentes (ver seção 5); as
demais seguem `NOT_IMPLEMENTED`/`OTHER` por falta de evidência textual confiável.

## 4. Rule Engine

`packages/scoring-engine/src/event-classification.ts`, função `classifyEvent(input)`:

```ts
interface ClassificationInput {
  title: string;
  description?: string | null;
}

interface ClassificationResult {
  category: string; // valor de ResearchEventCategory, ou "OTHER"
  confidence: "HIGH" | "MEDIUM" | "LOW";
  classificationMethod: "RULE"; // este arquivo só produz RULE — nunca STRUCTURED_SOURCE/MANUAL/FUTURE_LLM
  ruleId: string | null; // ex.: "mainnet-launch-v1"
  evidence: string | null; // trecho do texto que motivou a categoria (max 160 chars)
  secondaryCandidates: string[]; // outras categorias que também tiveram match, nunca persistidas
}
```

Pura (sem I/O, sem DB, sem chamada externa), determinística (mesma entrada → mesma saída, sempre
— testado explicitamente), nunca lança.

## 5. Regras implementadas

12 categorias, cada uma com um `ruleId` versionado (`*-v1` — uma mudança de comportamento em uma
regra existente deve criar `*-v2`, nunca reescrever silenciosamente `v1`, para preservar o
significado de eventos já classificados por ela):

| Categoria             | ruleId                   | Confidence | Exemplos de padrão exigido                                                   |
| --------------------- | ------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `MAINNET`             | `mainnet-launch-v2`      | HIGH       | "mainnet is live", "mainnet launched", "mainnet goes live"                   |
| `TESTNET`             | `testnet-launch-v2`      | HIGH       | "testnet launches", "testnet is live", "public testnet launch"               |
| `PROTOCOL_UPGRADE`    | `protocol-upgrade-v1`    | HIGH       | "protocol upgrade", "hard fork", "upgrade deployed"                          |
| `TOKEN_MIGRATION`     | `token-migration-v1`     | HIGH       | "token migration", "migration begins", "token swap"                          |
| `TOKEN_BURN`          | `token-burn-v1`          | HIGH       | "tokens were burned", "burn event" (exclui "burn mechanism"/"burn proposal") |
| `TOKEN_BUYBACK`       | `token-buyback-v1`       | HIGH       | "token buyback", "buyback completed", "repurchase"                           |
| `STAKING`             | `staking-launch-v1`      | HIGH       | "staking launch", "staking goes live", "staking activated"                   |
| `NEW_CHAIN`           | `new-chain-v1`           | HIGH       | "new chain launched", "new blockchain"                                       |
| `ECOSYSTEM_EXPANSION` | `ecosystem-expansion-v1` | MEDIUM     | "ecosystem expansion", "expands to", "deployed on"                           |
| `PRODUCT_LAUNCH`      | `product-launch-v1`      | MEDIUM     | "product launch", "new product"                                              |
| `INTEGRATION`         | `integration-v1`         | MEDIUM     | "integrated with", "now integrated"                                          |
| `PARTNERSHIP`         | `partnership-v1`         | MEDIUM     | "partnered with", "strategic partnership"                                    |

**Regra de conservadorismo (obrigatória)**: nenhuma regra usa `text.includes("palavra-chave")`
isolado — toda regra exige um verbo/ação junto ("mainnet **is live**", não "mainnet" sozinho).
`"Preparing for mainnet"` e `"How mainnet works"` nunca casam com a regra `MAINNET` — testado
explicitamente.

**Histórico de correção (Sprint 22)**: `mainnet-launch-v1`/`testnet-launch-v1` incluíam
originalmente o padrão bare `/\bmainnet\s+deployment\b/i` (sugerido pelo próprio documento de
especificação do Sprint 20). Validação com dados reais (Stargate, bridge cross-chain) encontrou
**28 falsos positivos confirmados**: changelogs automáticos de monorepo usam a frase
`"<ChainName> mainnet/testnet deployment"` para descrever ROTINA de adicionar suporte a uma nova
chain (ex.: `"InjectiveEVM mainnet deployment"`), não um anúncio de que o próprio protocolo
lançou. O padrão foi removido em `v2`; os 28 eventos já persistidos foram corrigidos via
`reclassifyExistingGithubEvents` (seção 11). Ver `SPRINT_22_IMPLEMENTATION_REPORT.md`.

## 6. Prioridade entre categorias (múltiplos sinais no mesmo texto)

Ordem fixa (`PRIORITY_ORDER` em `event-classification.ts`): `MAINNET` > `TESTNET` >
`PROTOCOL_UPGRADE` > `TOKEN_MIGRATION` > `TOKEN_BURN` > `TOKEN_BUYBACK` > `STAKING` >
`NEW_CHAIN` > `ECOSYSTEM_EXPANSION` > `PRODUCT_LAUNCH` > `INTEGRATION` > `PARTNERSHIP` — eventos
de rede antes de tokenomics, antes de produto/ecossistema, antes dos sinais mais fracos/ambíguos
(integration/partnership, por último de propósito). Quando mais de uma regra casa, a de maior
prioridade vira a categoria persistida; as demais aparecem em `secondaryCandidates` (só
informativo, **nunca persistido como evento separado** nesta sprint).

## 7. Confidence

Reaproveita o campo `ResearchEvent.confidence` já existente (nenhum campo novo) — é exatamente a
mesma semântica que o sistema já usa desde o Sprint 15 (HIGH para fontes primárias/inequívocas,
MEDIUM/LOW para sinal mais fraco). Regras com padrões inequívocos (launch/live/deployed) são
HIGH; regras com risco maior de falso positivo (`INTEGRATION`/`PARTNERSHIP`/`PRODUCT_LAUNCH`/
`ECOSYSTEM_EXPANSION`) são MEDIUM. Sem match nenhum → `OTHER`/`LOW`.

## 8. Evidência

Um trecho do próprio texto (`match[0]` do regex, até 160 caracteres,
`MAX_EVIDENCE_LENGTH`) — nunca o conteúdo inteiro. Persistido em
`ResearchEvent.classificationEvidence`.

## 9. Fontes estruturadas — autoridade superior

`GOVERNANCE` (Snapshot), `FUNDING` (FundingRound), `SECURITY_INCIDENT` (DefiLlama `/hacks`),
`LISTING`/`DELISTING` (diff de `TokenMarket`) e `TOKEN_UNLOCK` (DefiLlama Pro, Sprint 18) **nunca
passam pela engine** — `classificationMethod: STRUCTURED_SOURCE`,
`classificationRuleId: null`, `classificationEvidence: null`. Testado explicitamente: uma
proposta Snapshot cujo título contém "mainnet" continua `GOVERNANCE`, nunca vira `MAINNET`.

## 10. GitHub

`persistGithubReleaseCatalysts` (`packages/research-engine/src/events-repository.ts`) chama
`classifyEvent({ title: r.title, description: r.body })` para cada release. O `body` do release
(`NormalizedGithubRelease.body`, adicionado nesta sprint) é usado **só para classificar** —
NUNCA persistido em `ResearchEvent.description` (fica sempre `null`), para não guardar
changelogs/Markdown arbitrário no banco.

Releases em **draft** sempre recebem `confidence: LOW` e `status: UNKNOWN`, independente do que
a engine classificou — a categoria ainda reflete o texto (útil para auditoria), mas a confiança
de que o evento de fato ocorreu é rebaixada por ser só um rascunho.

## 11. Reclassificação de eventos existentes

`reclassifyExistingGithubEvents(projectId?)` (`events-repository.ts`) — mecanismo manual,
idempotente, nunca automático (não roda na Research Run nem no scheduler). Script:
`infrastructure/workers/reclassify-events.ts`, invocado com `npm run reclassify-events`
(opcionalmente `-- --project=<id>`).

- Filtra estritamente `source: "GITHUB"` — nunca toca eventos de fontes estruturadas (testado
  explicitamente: um evento `FUNDING` nunca é sequer escaneado).
- Nunca altera `sourceId`/`eventDate`/`publishedAt`/`retrievedAt` — só `category`/
  `classificationMethod`/`classificationRuleId`/`classificationEvidence`/`confidence`.
- **Limitação conhecida**: como `description` nunca foi persistido para eventos GitHub (nem
  antes nem depois desta sprint), a reclassificação só tem o `title` disponível — um evento cuja
  categoria dependeria de uma frase presente só no corpo do release original pode não ser
  corretamente reclassificado por este mecanismo. Isso é aceitável porque o mecanismo serve para
  aplicar correções/evoluções de regras sobre o campo mais estável (o título); se o payload
  precisar ser reprocessado de verdade com o corpo completo, a próxima Research Run já faz isso
  naturalmente.

## 12. Fora de escopo (Fase 25, deliberado)

Nenhum LLM, nenhuma API OpenAI, nenhuma classificação por IA. `FUTURE_LLM` existe como valor
reservado no enum `ResearchEventClassificationMethod` só para uma sprint futura explicitamente
aprovada — nunca usado hoje. Trading Intelligence, ranking, score de evento, previsão de preço,
inferência causal: nada disso foi tocado.

## 13. Como adicionar uma nova regra

1. Escolher a categoria (já existente em `ResearchEventCategory`) e escrever um `ruleId` novo
   (ex.: `regulatory-notice-v1`).
2. Escrever padrões (`RegExp`) conservadores — exigir verbo/ação junto da palavra-chave, nunca a
   palavra-chave isolada. Evitar quantificadores aninhados (ReDoS).
3. Escolher a posição na `PRIORITY_ORDER` (mais específico/inequívoco primeiro).
4. Adicionar testes cobrindo: um caso positivo claro, um caso ambíguo que NÃO deve casar, e (se
   aplicável) uma exclusão explícita.
5. Nunca alterar um `ruleId` já existente com mudança de comportamento — criar uma nova versão
   (`v2`) e decidir explicitamente se/quando reclassificar eventos antigos com o mecanismo da
   seção 11.

## 14. Como auditar uma classificação

Cada `ResearchEvent` carrega `classificationMethod`/`classificationRuleId`/
`classificationEvidence` (expostos via `getCatalysts`/`getRisks`,
`packages/research-engine/src/events-repository.ts`) — permite responder, para qualquer evento:
qual categoria foi atribuída, se veio de uma fonte estruturada ou de uma regra, qual regra
exatamente, e qual trecho do texto original motivou a decisão. O Project Report
(`report.ts`) já mostra `category`/`confidence` na tabela; `ruleId`/`evidence` não são exibidos
na tabela (para não poluir o dossiê), mas estão disponíveis via API para quem precisar auditar.

## 15. Observabilidade

Um log agregado por chamada de coleta (`events.github_releases_collected`, já existente desde o
Sprint 19), estendido com `classification: { otherCount, ruleUsage }` — contagem de quantos
eventos caíram em `OTHER` e quantas vezes cada `ruleId` foi usado nesta run. Decisão deliberada:
**não** logar uma linha por evento individual (`event_classified`/
`event_classification_unresolved`, como o documento de especificação original sugeria como
exemplo) — geraria uma linha de log por release em repositórios com centenas de releases,
violando a instrução explícita da mesma especificação ("não gerar excesso de logs"). O resumo
agregado por run já responde as mesmas perguntas de observabilidade (quantos HIGH/MEDIUM/LOW,
quantos OTHER, uso por regra) sem o volume.

## 16. Limitações

- Cobertura: 12 de ~40 categorias possíveis. As demais exigiriam padrões de texto mais
  arriscados/ambíguos (maior chance de falso positivo) — deliberadamente não implementadas até
  haver evidência de que valem a pena.
- Falsos positivos conhecidos possíveis: `partnership-v1`/`repurchase` (TOKEN_BUYBACK) usam
  padrões relativamente amplos (`\bpartnership\b`, `\brepurchase\b`) por seguirem literalmente a
  lista de exemplos do documento de especificação — ambos com `confidence` não-HIGH (MEDIUM para
  partnership; HIGH para buyback, aceito o risco por ser um domínio mais restrito de vocabulário
  financeiro específico). Nenhum caso real observado ainda (nenhum projeto tem `githubRepo`
  curado em produção no momento desta sprint).
- Falsos negativos: qualquer frase fora dos padrões exatos cadastrados vira `OTHER` — é o
  comportamento correto e esperado (Fase 8), não um bug.
- `secondaryCandidates` não é persistido — só retornado pela função pura, disponível se uma
  sprint futura quiser expor múltiplas categorias por evento.
