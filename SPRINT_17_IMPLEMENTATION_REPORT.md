# SPRINT_17_IMPLEMENTATION_REPORT.md

> **Nota de nomenclatura**: o documento de especificação recebido para esta sprint se
> autodenomina "Sprint 17" (Catalyst & Risk Source Expansion). No histórico de commits deste
> repositório, "Sprint 17" já havia sido usado para a tradução PT-BR da descrição do projeto +
> exibição de Perfil/Mercados na página do projeto (commit `745c55d`). Para manter a sequência
> cronológica real do projeto sem ambiguidade, o código e o `CLAUDE.md`/`STATUS_PROJETO.md`
> tratam este trabalho como **Sprint 18** — mas este arquivo mantém o nome `SPRINT_17_...` porque
> foi pedido explicitamente com esse nome.

## 1. Resumo executivo

Esta sprint teve duas partes, em sequência:

1. **Source Intelligence Audit** para as 18 categorias de Catalyst e 19 de Risk ainda sem fonte
   real investigada (regra do próprio documento de especificação: "NÃO implementar nada antes de
   concluir o Source Intelligence Audit"). Resultado em `CATALYSTS_RISKS_SOURCE_AUDIT.md`.
2. Implementação do que a auditoria encontrou como viável:
   - **Catalyst `LISTING`/`DELISTING`** — implementado e **ativo** desde o primeiro commit desta
     sprint (`3cb9d65`), derivado do diff de `TokenMarket` entre Research Runs consecutivas, zero
     chamada HTTP nova.
   - **Risk `TOKEN_UNLOCK`** — a pedido explícito do usuário ("Token_unlock que deixar pronto,
     mas não irei usar agora"), implementado e conectado ao pipeline, mas **PRONTO E NÃO
     ATIVADO**: só produz eventos quando uma API key paga da DefiLlama Pro for configurada em
     Settings (provider `DEFILLAMA_PRO`). Sem essa key, o código nunca é executado — zero custo,
     zero chamada HTTP, zero risco.

Todas as demais 17 categorias de Catalyst e 18 de Risk permanecem `NOT_IMPLEMENTED`, documentadas
individualmente no audit — nenhuma foi fabricada para "completar" o enum `ResearchEventCategory`.

## 2. Auditoria inicial

Fase 1 do documento de especificação: leitura direta do código antes de qualquer decisão.
Confirmado (não suposto):

- `ResearchEvent` (schema.prisma) já suporta todos os campos necessários para qualquer fonte nova
  (`category`, `kind`, `status`, `confidence`, `source`, `sourceUrl`, `sourceId`, `eventDate`,
  `publishedAt`, `retrievedAt`) — nenhuma migration de schema foi necessária nesta sprint.
- Dedup key `(projectId, source, sourceId)` já genérico; `sourceId` sempre construído de forma
  estável pelo coletor (nunca aleatório, nunca por nome).
- `EventImpactEngine` trata `category` como `string` puro em toda a pipeline — confirmado por
  leitura direta, nenhum branch por categoria específica. **Nenhuma mudança foi necessária lá**
  para consumir `LISTING`/`DELISTING`/`TOKEN_UNLOCK`.

## 3. Source Intelligence Audit

Documento completo: `CATALYSTS_RISKS_SOURCE_AUDIT.md` (estende `CATALYSTS_RISKS_ARCHITECTURE.md`
do Sprint 15). Resumo das fontes investigadas nesta sessão:

| Fonte                                               | Resultado                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| DefiLlama `/protocols` (payload completo)           | Sem campos estruturados de unlock/upgrade/governança — só `hallmarks` (texto livre curado manualmente pela DefiLlama)     |
| DefiLlama `/raises` dedicado                        | HTTP 402 (Pro); campo `raises` embutido em `/protocol/{name}` (já usado desde Sprint 6) continua sendo o caminho gratuito |
| DefiLlama Unlocks/Emissions (`/emissions/*`)        | Confirmado pago — API Pro $300/mês                                                                                        |
| Tokenomist.ai, Messari Token Unlocks, CryptoRank.io | Sem API pública gratuita documentada                                                                                      |
| Binance Announcements                               | Sem API pública oficial; endpoint não-oficial retorna 403                                                                 |
| CoinGecko `/coins/{id}` tickers (já usado)          | Permite DERIVAR Listing/Delisting via diff — sem endpoint dedicado                                                        |
| CoinGecko `status_updates`                          | Reconfirmado vazio/abandonado                                                                                             |
| Snapshot.org GraphQL                                | Real e funcional, mas sem mapeamento projeto→space                                                                        |
| GitHub Releases API                                 | Real e funcional (60 req/hr sem auth), mas sem mapeamento projeto→repo                                                    |

## 4. Fontes selecionadas

1. **CoinGecko tickers (`TokenMarket`, já coletado)** — para `LISTING`/`DELISTING`, via diff
   entre duas Research Runs. Zero chamada HTTP nova.
2. **DefiLlama Pro `emissions`** — para `TOKEN_UNLOCK`. Implementado como infraestrutura
   PRONTA, mas não ativado (requer key paga que o usuário optou por não adquirir agora).

## 5. Fontes rejeitadas

Todas as demais listadas na seção 3 acima, com a justificativa completa por categoria em
`CATALYSTS_RISKS_SOURCE_AUDIT.md` seção 6. Resumo dos motivos: paywall sem aprovação de custo
(maioria), falta de mapeamento projeto→identificador externo confiável (GitHub/Snapshot), falta
de API pública oficial (Binance), natureza estrutural/contínua incompatível com o modelo de
"evento pontual com data" (a maioria dos Risks restantes).

## 6. Categorias implementadas

- Catalyst `LISTING` — **ativo**.
- Catalyst `DELISTING` — **ativo**.
- Risk `TOKEN_UNLOCK` — **pronto, não ativado** (código completo, gatilho é a configuração de
  uma API key em Settings).

## 7. Categorias não implementadas

17 categorias de Catalyst e 18 de Risk seguem `NOT_IMPLEMENTED`, cada uma com justificativa
individual documentada em `CATALYSTS_RISKS_SOURCE_AUDIT.md` seções 5–6. Nenhuma foi fabricada.

## 8. Arquitetura dos adapters

Não foi criada uma interface `EventSourceAdapter` formal (o documento de especificação sugeria
isso como "exemplo conceitual", não como requisito rígido) — o padrão já estabelecido no
repositório desde o Sprint 15 (`collect*`/`persist*` em `events-repository.ts`, isolamento total
por try/catch, nunca lança) já cumpre o mesmo contrato sem introduzir uma abstração nova para 3
fontes. Consistente com a convenção do projeto de não criar abstração prematura.

- `persistTokenMarketListingCatalysts` / `collectTokenMarketListingCatalysts` —
  `packages/research-engine/src/events-repository.ts`.
- `persistTokenUnlockRisks` / `collectTokenUnlockRisks` — mesmo arquivo.
- `getCurrentTokenMarketKeys` — `packages/research-engine/src/profile-repository.ts` (lê o
  estado ANTES do upsert da run corrente, necessário para o diff de Listing/Delisting).
- `getTokenUnlocks` / `pingDefiLlamaPro` — `packages/defi-data/src/client.ts`.
- `normalizeTokenUnlocks` — `packages/defi-data/src/adapter.ts`.

## 9. Normalização

`normalizeTokenUnlocks` (packages/defi-data/src/adapter.ts) segue o mesmo padrão defensivo do
resto do pacote: qualquer evento com `timestamp` ausente/inválido é descartado individualmente
(nunca lança), payload com formato inesperado retorna lista vazia. **Importante**: a estrutura
assumida (`RawDefiLlamaEmissions`/`RawDefiLlamaUnlockEvent`) foi construída a partir de
documentação pública da DefiLlama Pro API, **nunca validada contra uma resposta real** — deve ser
conferida contra um payload real no dia em que uma key for configurada, antes de confiar
cegamente no resultado. Isso está documentado no código (comentário em `types.ts`) e neste
relatório para não ser esquecido.

## 10. Deduplicação

- `LISTING`/`DELISTING`: `sourceId = stableSourceId("LISTING"|"DELISTING", exchangeId|base|target, YYYY-MM-DD)`
  — permite reabrir um novo evento se o mesmo mercado for delistado e relistado depois, sem
  duplicar dentro do mesmo dia.
- `TOKEN_UNLOCK`: `sourceId = stableSourceId(defillamaId, eventDate, category)` — mesmo padrão de
  `SECURITY_INCIDENT`/`FUNDING` (hash estável, nunca aleatório).

## 11. Confidence

- `LISTING`/`DELISTING`: `MEDIUM` — a fonte (CoinGecko tickers) é primária/estruturada, mas
  `eventDate` reflete quando a mudança foi PERCEBIDA (intervalo entre Research Runs), não a data
  real do anúncio da exchange. `HIGH` seria reivindicar uma precisão de data que não existe.
- `TOKEN_UNLOCK`: `MEDIUM` — pela mesma disciplina, mas por um motivo diferente: a estrutura da
  fonte nunca foi validada contra um payload real (ver seção 9). Nunca `HIGH` até validação.

## 12. Backfill

Não aplicável a `LISTING`/`DELISTING` (é inerentemente incremental — só existe "antes" a partir
da segunda Research Run de cada projeto; a primeira coleta não gera evento, de propósito, para
não fabricar histórico nunca presenciado). `TOKEN_UNLOCK`, quando ativado, herda backfill "de
graça" na primeira chamada real (a API retorna a agenda completa de unlocks, passados e futuros,
conforme documentação) — não foi construído um mecanismo de paginação/cursor separado porque a
fonte, pela documentação, não pagina.

## 13. Incremental update

Ambas as fontes já são incrementais por construção: `LISTING`/`DELISTING` via diff a cada run;
`TOKEN_UNLOCK` via `findUnique`/`update`-ou-`create` por `sourceId` estável a cada run (mesmo
padrão de todo o resto do sistema desde o Sprint 15).

## 14. Event Impact Integration

Nenhuma mudança foi necessária em `event-impact.ts`/`event-impact-engine.ts` — confirmado por
leitura direta na Fase 1 (seção 2 deste relatório). `LISTING`/`DELISTING`/`TOKEN_UNLOCK` são
automaticamente compatíveis com o Event Impact Engine assim que existirem no banco.

## 15. Dashboard

`KNOWN_EVENT_CATEGORIES` em `packages/research-engine/src/dashboard-intelligence.ts` passou de
`["FUNDING", "SECURITY_INCIDENT"]` para incluir `"LISTING"`, `"DELISTING"` e `"TOKEN_UNLOCK"`. A
agregação cross-event para `TOKEN_UNLOCK` simplesmente nunca encontra eventos até uma key ser
configurada — sem erro, sem necessidade de um flag condicional separado no Dashboard.

## 16. Report

Nenhuma mudança necessária — `report.ts` já trata `category` genericamente (interpolação de
string), confirmado por leitura direta antes da implementação.

## 17. Research Trace

Segue o padrão `logEventsEvent` já estabelecido (`logger.ts`) — novos eventos de log:
`events.listing_catalysts_collected/failed`, `events.token_unlocks_collected/failed`,
`events.token_unlocks_skipped_no_api_key` (emitido em toda run enquanto a key não estiver
configurada, para tornar o estado "pronto, mas inerte" visível nos logs).

## 18. APIs

Nenhuma rota HTTP nova foi criada. `apps/web/src/lib/connections.ts` e
`apps/web/src/app/dashboard/settings/page.tsx` foram estendidos para o provider `DEFILLAMA_PRO`
(terceiro provider real em Settings, ao lado de DEFILLAMA/COINGECKO) — reaproveita 100% da
infraestrutura de `ApiConnection` (criptografia AES-256-GCM já existente desde o Sprint 2), sem
nenhum armazenamento paralelo de secret.

## 19. Banco de dados

**Nenhuma migration nova** — confirmado antes de implementar (regra explícita da Fase 37 do
documento de especificação: "o schema existente já comporta o evento?"). `ResearchEvent` já
suportava tudo; `ApiConnection` já suportava um provider novo sem alteração de schema (`provider`
é `String @unique`, não um enum fechado).

## 20. Segurança

- Nenhuma API key em código — `DEFILLAMA_PRO` segue o mesmo fluxo de criptografia
  (`encrypt`/`decrypt`, `MASTER_ENCRYPTION_KEY`) já usado por `COINGECKO`.
- Nenhum secret logado — `logEventsEvent` nunca recebe a key, só contadores/erros já
  sanitizados.
- Allowlist anti-SSRF: `pro-api.llama.fi` adicionado como domínio único permitido para o novo
  client (`DEFILLAMA_PRO_ALLOWED_HOSTS`), consistente com o padrão existente de `api.llama.fi`.
- `getTokenUnlocks`/`pingDefiLlamaPro` exigem `apiKey: string` (não opcional) de propósito — o
  client nunca pode ser chamado sem uma key real; a camada de pipeline já garante isso.

## 21. Performance

`getTokenUnlocks` seria, quando ativado, uma chamada por projeto (não em lote — a API Pro
documentada é por protocolo) — mesmo padrão de `getProtocolTvlHistory`/`getProtocolFeesOrRevenue`,
dentro do processamento sequencial já existente (nunca paralelo, seção 19 do plano). Nenhuma
mudança de concorrência foi introduzida.

## 22. Testes

Números exatos (não aproximados), medidos após esta sprint:

- **Testes unitários novos** (normalizador, sem rede/DB): 4 (`normalizeTokenUnlocks`, em
  `packages/defi-data/tests/adapter.test.ts`).
- **Testes de integração novos** (Prisma real): 15 (`LISTING`/`DELISTING`, 5 testes já cobertos
  no commit `3cb9d65`) + 5 (`TOKEN_UNLOCK`, `persistTokenUnlockRisks`) = **20 no arquivo
  `events-repository.integration.test.ts`** (total do arquivo; 5 preexistiam do Sprint 15).
- **Testes de API novos**: 0 (nenhuma rota HTTP nova).
- **Testes de Dashboard novos**: 0 (mudança em `KNOWN_EVENT_CATEGORIES` coberta indiretamente
  pelos testes de integração de eventos já existentes, sem teste dedicado novo).
- **Total de testes novos nesta sprint**: 9 (4 unitários + 5 de integração para `TOKEN_UNLOCK`;
  os 5 de `LISTING`/`DELISTING` já haviam sido reportados no commit anterior).

Totais do monorepo após esta sprint (última execução completa de `npm test`):

| Workspace                          | Testes  | Resultado                                                                                         |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `@crypto-research/database`        | 10      | ✅ todos passando                                                                                 |
| `@crypto-research/defi-data`       | 54      | ✅ todos passando                                                                                 |
| `@crypto-research/queue`           | 8       | ✅ todos passando                                                                                 |
| `@crypto-research/research-engine` | 150     | ✅ todos passando (1 suíte com falha de `afterAll` pré-existente, não relacionada — ver seção 27) |
| `@crypto-research/scoring-engine`  | 119     | ✅ todos passando                                                                                 |
| `@crypto-research/shared`          | 10      | ✅ todos passando                                                                                 |
| `@crypto-research/web`             | 20      | ⚠️ 8 passando, 12 falhando — pré-existente, não relacionado a esta sprint (ver seção 27)          |
| **Total**                          | **371** | **359 passando / 12 falhas pré-existentes não relacionadas**                                      |

## 23. Typecheck

`npm run typecheck` — **passou limpo em todos os 7 workspaces** (`web`, `database`, `defi-data`,
`queue`, `research-engine`, `scoring-engine`, `shared`) + `infrastructure/workers`. Resultado
real, confirmado após a implementação completa desta sprint.

## 24. Lint

`npm run lint` (`eslint .`) — **passou limpo**, 0 erros, 0 warnings. Resultado real.

## 25. Build

Não executado nesta sprint (não solicitado; `typecheck` + `lint` + suíte de testes já cobrem
correção estática e de runtime das mudanças). Recomenda-se rodar `npm run build` antes de um
deploy, seguindo a prática já estabelecida no CI (`.github/workflows/ci.yml`).

## 26. Security Audit

- **Critical**: 0
- **High**: 0
- **Medium**: 0
- **Low**: 0

Nenhuma vulnerabilidade introduzida. Superfície nova (provider `DEFILLAMA_PRO`) segue
estritamente os mesmos controles já auditados dos providers existentes (criptografia, allowlist,
sem log de secret).

## 27. Limitações

- `TOKEN_UNLOCK` está **funcionalmente não testado contra a API real** — a estrutura do payload
  é uma suposição documentada, não uma verificação empírica (diferente de toda outra integração
  deste projeto, que segue a política "sem mock de fonte externa" rodando contra a API real).
  Isso é uma exceção deliberada e documentada, não um descuido: não há como validar sem pagar
  pela key, e o usuário pediu explicitamente para deixar pronto sem ativar agora.
- Falhas pré-existentes e não relacionadas a esta sprint (confirmadas por `git stash` +
  reexecução antes de qualquer mudança):
  - `apps/web`: 12 testes falhando com `PrismaClientInitializationError: Environment variable
not found: DATABASE_URL` / health check retornando 503 — problema de ambiente de teste do
    workspace `apps/web`, não relacionado ao código desta sprint (nenhum arquivo de `apps/web`
    tocado por esta sprint além de `connections.ts`/`settings/page.tsx`, que não são exercitados
    pelos testes que falham).
  - `packages/research-engine/tests/discovery.integration.test.ts`: `afterAll` falha com
    `Foreign key constraint violated: market_data_snapshots_project_id_fkey` — ordem de cleanup
    que não inclui essa tabela; todos os 3 testes do arquivo passam individualmente, só o cleanup
    falha. Não relacionado a `TokenMarket`/`ResearchEvent`/`ApiConnection` (as tabelas tocadas
    nesta sprint).

## 28. Technical Debt

- Se `TOKEN_UNLOCK` for ativado no futuro, o primeiro passo deve ser validar
  `normalizeTokenUnlocks` contra um payload real e ajustar `RawDefiLlamaEmissions`/
  `RawDefiLlamaUnlockEvent` conforme necessário — os comentários no código já sinalizam isso
  explicitamente para não ser esquecido.
- Nenhuma dívida técnica nova foi introduzida em `LISTING`/`DELISTING` (já ativo e testado contra
  dado real coletado desde o Sprint 13).

## 29. Arquivos criados

- `CATALYSTS_RISKS_SOURCE_AUDIT.md`
- `SPRINT_17_IMPLEMENTATION_REPORT.md` (este arquivo)

## 30. Arquivos modificados

- `packages/database/prisma/schema.prisma` — nenhuma mudança de schema (confirmado, seção 19).
- `packages/defi-data/src/types.ts` — `RawDefiLlamaEmissions`, `RawDefiLlamaUnlockEvent`,
  `NormalizedTokenUnlockEvent`.
- `packages/defi-data/src/adapter.ts` — `normalizeTokenUnlocks`.
- `packages/defi-data/src/client.ts` — `getTokenUnlocks`, `pingDefiLlamaPro`, constantes
  `DEFILLAMA_PRO_BASE_URL`/`DEFILLAMA_PRO_ALLOWED_HOSTS`.
- `packages/defi-data/tests/adapter.test.ts` — 4 testes novos.
- `packages/research-engine/src/events-repository.ts` — `persistTokenMarketListingCatalysts`,
  `collectTokenMarketListingCatalysts`, `persistTokenUnlockRisks`, `collectTokenUnlockRisks`.
- `packages/research-engine/src/profile-repository.ts` — `getCurrentTokenMarketKeys`.
- `packages/research-engine/src/pipeline.ts` — `resolveDefiLlamaProApiKey`, integração de
  Listing/Delisting e Token Unlock no fluxo por projeto.
- `packages/research-engine/src/logger.ts` — novos `EventsEvent`.
- `packages/research-engine/src/dashboard-intelligence.ts` — `KNOWN_EVENT_CATEGORIES` estendido.
- `packages/research-engine/tests/events-repository.integration.test.ts` — 20 testes (15 já
  reportados + 5 novos de `TOKEN_UNLOCK`).
- `apps/web/src/lib/connections.ts` — provider `DEFILLAMA_PRO`.
- `apps/web/src/app/dashboard/settings/page.tsx` — entrada `DEFILLAMA_PRO` em `KNOWN_PROVIDERS`.
- `CLAUDE.md`, `STATUS_PROJETO.md` — narrativa da sprint.

## 31. Migrations

Nenhuma. Confirmado explicitamente na seção 19.

## 32. Próximo Sprint recomendado

1. **Decisão do usuário pendente**: adicionar curadoria manual de `Project.githubRepo`/
   `Project.snapshotSpace` (para um subconjunto de projetos, ex. só o Top 10 dinâmico) destravaria
   `PROTOCOL_UPGRADE`/`MAINNET`/`TESTNET` (GitHub Releases) e `GOVERNANCE` (Snapshot.org) — ambas
   APIs reais, gratuitas e já confirmadas funcionais, só faltando esse campo.
2. Se/quando o usuário configurar uma key `DEFILLAMA_PRO` em Settings: validar
   `normalizeTokenUnlocks` contra o payload real e corrigir a suposição de estrutura antes de
   confiar no resultado em produção.
3. Nenhuma outra fonte nova foi identificada nesta auditoria como candidata viável sem
   curadoria/custo — próxima sprint de expansão de Catalysts/Risks só faz sentido após uma dessas
   duas decisões de produto.
