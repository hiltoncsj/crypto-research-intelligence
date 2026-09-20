# SPRINT 23 — DISCOURSE GOVERNANCE INTELLIGENCE

## Executive Summary

O Sprint 23 adicionou fóruns Discourse oficiais como fonte de eventos de governança
(`DISCOURSE_SOURCE_ARCHITECTURE.md`). Foram curados 6 fóruns reais para 7 projetos, e o pipeline
real coletou **240 tópicos** (40 por fórum, o limite por run). Achado principal: a
**Classification Engine (Sprint 20) não serve para texto de fórum** — das 32 classificações que
dispararam, cerca de metade eram falsos positivos claros. A implementação inicial foi revertida
para tratar o Discourse como o Snapshot (`GOVERNANCE` / `STRUCTURED_SOURCE`), e os 240 eventos
foram corrigidos no banco.

O sprint também incluiu um incidente de infraestrutura (perda de dados do Postgres local, ver
"Incidente") e a re-semeadura dos 7 projetos a partir dos relatórios dos Sprints 21/22.

## Incidente: perda de dados do Postgres local

Antes deste trabalho, as 29 tabelas do schema estavam com 0 linhas (7 projetos e 2.323+ eventos
dos Sprints 21/22 perdidos), com `_prisma_migrations` intacta. Causa provável: instabilidade do
Docker Desktop/WSL2 (documentada em `CLAUDE.md`). Após reboot, o banco tinha os 7 projetos e 7
eventos DefiLlama, sem nenhuma curadoria. Recuperação: `githubRepo`/`snapshotSpace` restaurados
a partir de `SPRINT_21_IMPLEMENTATION_REPORT.md` e `SPRINT_22_IMPLEMENTATION_REPORT.md` (valores
já verificados ao vivo naqueles sprints; **não reverificados agora**), fóruns Discourse a partir
do handoff (confirmados ao vivo antes do incidente).

## Projetos e Identity Mapping

| Projeto      | githubRepo                         | snapshotSpace         | discourseForumUrl                 |
| ------------ | ---------------------------------- | --------------------- | --------------------------------- |
| aave-v3      | aave/aave-v3-core                  | aavedao.eth           | https://governance.aave.com       |
| uniswap-v4   | Uniswap/v4-core                    | uniswapgovernance.eth | https://gov.uniswap.org           |
| compound-v3  | compound-finance/compound-protocol | comp-vote.eth         | https://www.comp.xyz              |
| lido         | lidofinance/core                   | lido-snapshot.eth     | https://research.lido.fi          |
| gmx-v2-perps | gmx-io/gmx-synthetics              | gmx.eth               | https://gov.gmx.io                |
| stargate-v2  | stargate-protocol/stargate-v2      | stgdao.eth            | — (sem fórum Discourse conhecido) |
| balancer-v2  | balancer/balancer-v3-monorepo      | balancer.eth          | https://forum.balancer.fi         |

## Eventos reais coletados (banco após a run)

| Fonte     | Eventos | Classificação                     |
| --------- | ------- | --------------------------------- |
| SNAPSHOT  | 1.890   | STRUCTURED_SOURCE                 |
| GITHUB    | 433     | RULE                              |
| DISCOURSE | 240     | STRUCTURED_SOURCE (após correção) |
| COINGECKO | 13      | STRUCTURED_SOURCE                 |
| DEFILLAMA | 7       | STRUCTURED_SOURCE                 |

GitHub reproduziu exatamente os 433 do Sprint 22. `stargate-v2` foi pulado no Discourse
(`events.discourse_skipped_no_mapping`), sem dado fabricado.

## Auditoria da Classification Engine sobre Discourse

Com a implementação inicial (engine sobre título + corpo do primeiro post), 32 dos 240 tópicos
casaram alguma regra; 208 caíram em `OTHER`. Auditoria manual **sobre título e evidência curta**
(não sobre o corpo completo de cada post — a contagem é uma leitura, não uma prova):

- **Falsos positivos claros (~16):** `new-chain-v1` 5/5 (ex.: "Ignas Delegate Platform", "Marketing
  Funds…" por frases incidentais "chain launch"/"new blockchain"); `ecosystem-expansion-v1`
  ("deployed on" em posts de tokenomics/votação/comitê); `partnership-v1` ("collaboration with" em
  boilerplate de delegados); `token-buyback-v1` em "Balancer V3 deployment on Arbitrum Sepolia
  (testnet)"; `token-migration-v1`; `protocol-upgrade-v1` em "0x02 CSM Landscape".
- **Duvidosos:** `mainnet-launch-v2` HIGH em "[ARFC] Deploy Aave V4 on Arc" (proposta, não
  lançamento); `token-burn-v1` HIGH em um [RFC].
- **Plausíveis mas sempre propostas, não fatos:** Rekt News, NLO×Balancer, Hummingbot×GMX, HINC no
  Aave Horizon, Uniswap v3 no BNB.

**Causa:** regras calibradas para changelogs do GitHub; Discourse é discussão/proposta com posts
longos e boilerplate.

## Decisão

Discourse = fonte de governança estruturada: `category GOVERNANCE`, `classificationMethod
STRUCTURED_SOURCE`, `confidence MEDIUM`, `status UNKNOWN`, sem chamar a engine (mesmo precedente
do Snapshot, Sprint 20). Nenhuma regra da engine foi alterada. Os 240 eventos já persistidos
foram atualizados via `updateMany` (equivalente ao upsert da próxima run).

## Idempotência

Chave `(projectId, source, sourceId = topicId)`. Coberta por teste de integração
(`persistDiscourseTopicCatalysts` chamado duas vezes → 0 criados, 1 atualizado).

## Verificação

- `npm run lint`: limpo.
- `npm run typecheck`: limpo nos 7 workspaces e nos workers.
- `npm test`: **440 passando, 0 falhando** (web 20, database 10, defi-data 77, queue 8,
  research-engine 173, scoring-engine 142, shared 10).
- `npm run build`: sucesso (20 páginas estáticas). Aviso não bloqueante:
  `@valkey/valkey-glide` não resolvido dentro do `bullmq` (módulo opcional).

**Ocorrência durante a verificação:** a primeira `npm test` teve 1 falha em
`kanban-repository` (WIP Limit 1/1 em Data Collection). Não era a contenção paralela conhecida
(reproduzia isolado): minha primeira run do pipeline foi cortada por um `timeout` de 590s no meio
do último projeto (`balancer-v2`), deixando o card preso em Data Collection e o projeto sem score.
Re-rodar só o `balancer-v2` com a mesma `researchRunId` completou o projeto (score gerado, card
liberado) e a suíte passou. Não foi um bug de código. A `ResearchRun` criada manualmente não foi
finalizada pelo worker (o pipeline não fecha o status da run — isso é do Worker).

## Não validado neste sprint

- Event Impact / Dashboard com os eventos Discourse (não exercitados).
- Reverificação ao vivo dos mappings GitHub/Snapshot restaurados (valores dos relatórios 21/22).
- Comparação de Snapshot (1.890) com o total do Sprint 22.

## Technical Debt

1. **Corpo do tópico buscado sem uso:** `getDiscourseTopics` faz 1 request `/t/{id}.json` por
   tópico (até 40) só para obter o corpo, que a nova decisão não consome. É a maior parte do
   tempo da coleta (~1–2 min por fórum). Remover exige revisar `discourse-client.ts`,
   `normalizeDiscourseTopic`, `NormalizedDiscourseTopic.bodyText` e testes.
2. Sem paginação de histórico além de 40 tópicos e sem status de proposta (aberta/aprovada).
3. `SPRINT_23_HANDOFF_TEMP.md` deve ser removido (nota de continuidade temporária).

## Respostas objetivas

1. **Fóruns Discourse integrados?** 6 (aave-v3, uniswap-v4, compound-v3, lido, gmx-v2-perps,
   balancer-v2); stargate-v2 sem fórum conhecido.
2. **Eventos Discourse reais?** 240.
3. **A engine é adequada para Discourse?** Não — ~metade das classificações auditadas eram
   falsos positivos claros; o Discourse passou a `GOVERNANCE` estruturado.
4. **Testes?** 440 passando, 0 falhando.
