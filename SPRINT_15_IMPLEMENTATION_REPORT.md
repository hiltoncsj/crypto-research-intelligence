# Sprint 15 — Catalysts + Risks + Fundamental Context

## Relatório de implementação

Data: 2026-09-19. Toda a investigação de fontes veio de chamadas reais feitas nesta sessão
(`fetch` ao vivo contra cada API candidata), não de suposição.

---

## 1. Executive Summary

A regra mais importante deste sprint era: investigar fontes reais ANTES de codificar, e nunca
fabricar dado quando não houver fonte adequada. De 8 fontes candidatas testadas ao vivo, apenas
2 atenderam ao critério "real + auto-identificável sem curadoria manual": DefiLlama `/hacks`
(incidentes de segurança, casados por `defillamaId` exato) e os `FundingRound` já persistidos
desde o Sprint 6 (reclassificados como Catalyst `FUNDING`, zero coleta nova). O resultado é um
escopo real menor do que a taxonomia completa sugerida no prompt (39 categorias definidas, só 2
populadas) — deliberado e documentado, não uma implementação incompleta escondida.

---

## 2. Source Investigation

Ver `CATALYSTS_RISKS_ARCHITECTURE.md` para a matriz completa. Resumo:

| Fonte                                              | Testada ao vivo                                                                      | Resultado                                                                                                                                     | Decisão                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| DefiLlama `/hacks`                                 | Sim — `GET https://api.llama.fi/hacks` → 200, 1273 incidentes reais                  | `defillamaId` (quando presente) casa exatamente com `Project.defillamaId` (confirmado: "Compound V2" → id "114", igual ao id de `/protocols`) | **IMPLEMENTADO**                                                                          |
| `FundingRound` (Sprint 6)                          | N/A — já integrado                                                                   | Dado real já persistido                                                                                                                       | **IMPLEMENTADO** (reclassificação, zero coleta)                                           |
| CoinGecko `status_updates`                         | Sim — 5 projetos reais (bitcoin, uniswap, aave, lido-dao, compound-governance-token) | Sempre `[]`                                                                                                                                   | **REJEITADO** — campo parece abandonado pela fonte                                        |
| GitHub Releases                                    | Sim — `GET api.github.com/repos/aave/aave-v3-core/releases` → 200, dados reais       | API funciona, mas nenhum campo hoje mapeia projeto→repositório                                                                                | **NÃO IMPLEMENTADO** — Reason: no suitable automatic project→repository mapping available |
| Snapshot.org (governance)                          | Sim — GraphQL `hub.snapshot.org/graphql`, proposals reais confirmadas                | API funciona, mas nenhum campo hoje mapeia projeto→space                                                                                      | **NÃO IMPLEMENTADO** — mesmo motivo                                                       |
| CryptoPanic                                        | Sim — `GET cryptopanic.com/api/v1/posts/?public=true` → 403                          | Exige API key                                                                                                                                 | **REJEITADO** — sem key disponível                                                        |
| CoinDesk/TheBlock/Decrypt/Blockworks/Cointelegraph | Não (sem endpoint gratuito documentado a testar)                                     | N/A                                                                                                                                           | **REJEITADO** — sem API pública gratuita conhecida                                        |
| Messari                                            | Não (maior parte requer key paga, conhecimento consolidado)                          | N/A                                                                                                                                           | **REJEITADO** — sem key disponível                                                        |

---

## 3. State Before Sprint

Confirmado por leitura direta do código antes de qualquer mudança: `report.ts` tinha seções
"## Catalysts"/"## Risks" fixas em `N/A (não modelado ainda)`. Nenhum model, nenhuma tabela,
nenhuma lógica de coleta existia para isso.

## 4. State After Sprint

Model `ResearchEvent` real, 2 fontes ativas (FUNDING, SECURITY_INCIDENT), Fundamental Context
agregando tudo, Report/Dashboard/API atualizados.

---

## 5. Sources Implemented

1. **DefiLlama `/hacks`** — Risk, categoria `SECURITY_INCIDENT`. Confidence `HIGH` (fonte
   primária estruturada). Status sempre `COMPLETED` (fato histórico). Casamento por
   `defillamaId` exato, nunca por nome — testado explicitamente (`NÃO casa quando defillamaId
difere`).
2. **`FundingRound`** — Catalyst, categoria `FUNDING`. Confidence `HIGH`. Reclassificação pura,
   zero chamada HTTP nova.

## 6. Sources Rejected

CoinGecko `status_updates` (vazio/deprecated), GitHub Releases (sem mapeamento repo↔projeto),
Snapshot.org (sem mapeamento space↔projeto), CryptoPanic (exige key), CoinDesk/TheBlock/Decrypt/
Blockworks/Cointelegraph/Messari (sem API gratuita acessível). Detalhes e evidência de cada
chamada em `CATALYSTS_RISKS_ARCHITECTURE.md`.

---

## 7. Catalysts

Taxonomia completa (`ResearchEventCategory`, união de Catalyst+Risk sem duplicatas, ~39 valores)
definida no schema. Só `FUNDING` populado hoje. Campos: título, categoria, data do evento, status
(`COMPLETED` para os existentes), confidence, fonte, URL (quando disponível), retrievedAt.
Dedupe por `(projectId, source, sourceId)`, `sourceId = FundingRound.id` (já estável).

## 8. Risks

Só `SECURITY_INCIDENT` populado hoje. `sourceId` construído deterministicamente
(`sha256(defillamaId|eventDate|name)`, já que a API de hacks não fornece um ID próprio) — nunca
aleatório, nunca por nome. Testado: idempotente (rodar de novo atualiza a mesma linha, não
duplica).

## 9. Fundamental Context

`computeFundamentalContext` reúne Historical Intelligence (Sprint 14) + Catalysts (active/
upcoming/completed) + Risks + Tokenomics coverage (`NONE`/`PARTIAL`/`FULL`, derivado do campo
`partial` do `TokenomicsScore` mais recente) + Capital (`computeFundingAggregates`, mesma fonte
do Sprint 6, não duplicada). Testado explicitamente que o resultado NUNCA tem um campo de score
final (`globalScore`/`finalScore`/`investmentScore` ausentes) — não é Global Score.

## 10. Event × Fundamental Analysis

Não implementado nesta sprint como feature dedicada (Parte 8/16 do prompt) — a infraestrutura
para isso (Historical Fundamental Intelligence, Sprint 14) já existe e os dois eventos reais
disponíveis (funding rounds, incidentes de segurança) têm `eventDate`, então uma janela pré/pós-
evento É calculável em princípio com o que já existe. Não implementado agora porque: (a) o volume
real de eventos coletados nesta sprint é pequeno (2 categorias), insuficiente para validar a
análise pré/pós de forma significativa; (b) é uma feature de análise separada da infraestrutura
de coleta que era o foco real desta sprint dado o resultado da investigação de fontes. Registrado
como candidato natural para o próximo sprint em vez de implementado de forma apressada.

## 11. Event × Market Analysis

Mesma situação — não implementado, mesmo motivo.

---

## 12. Database Changes

Nova migration `20260919120000_sprint15_research_events`: 5 enums novos
(`ResearchEventKind`, `ResearchEventCategory`, `ResearchEventStatus`, `ResearchEventConfidence`,
`ResearchEventImpactDimension`) + tabela `research_events`. Unique constraint
`(projectId, source, sourceId)`, índices `(projectId, kind)` e `(projectId, eventDate)`.

**Gotcha operacional repetido** (mesmo já documentado no CLAUDE.md desde o Sprint 13): a tabela
`_prisma_migrations` tinha sumido de novo entre sessões — resolvido com o mesmo procedimento de
baseline (`prisma migrate resolve --applied` para as 15 migrations anteriores, depois
`migrate deploy` só da nova).

## 13. API Changes

- `GET /api/projects/[slug]/catalysts`
- `GET /api/projects/[slug]/risks`
- `GET /api/projects/[slug]/fundamental-context`
- `GET /api/dashboard/fundamental` estendido com `catalysts`/`risks` (consolidado, não 2 rotas
  novas de dashboard — decisão de reaproveitamento documentada em `apps/web/src/lib/dashboard.ts`)

## 14. Pipeline Changes

`GET /hacks` buscado UMA VEZ por Research Run (`runManualResearchPipeline`), nunca por projeto —
evita N+1 external requests. Passado para `runPipelineForProject`, que chama
`collectSecurityIncidentRisks`/`collectFundingCatalysts` logo após persistir os funding rounds.
Isolamento total: falha na busca de `/hacks` não aborta a run (lista vazia, log
`events.hacks_fetch_failed`); falha por projeto não aborta o projeto nem a run.

## 15. Dashboard Changes

Duas novas seções na Home: "Catalysts" (upcoming/recent/completed) e "Risks" (identified/with
historical evidence) — só contagens factuais, nunca "melhor projeto"/ranking.

## 16. Project Report Changes

Seções "## Catalysts" e "## Risks" (antes `N/A` fixo) agora reais, com tabelas
(data/evento/categoria/status/confiança/fonte). Nova seção "## Fundamental Context".

## 17. Research Trace

Seção "## Sources" estendida com uma linha por Catalyst/Risk (fonte, categoria, data do evento,
data de coleta).

---

## 18. Tests

```
new tests:
  packages/research-engine/tests/events-repository.integration.test.ts        10 tests
  packages/research-engine/tests/fundamental-context.integration.test.ts       5 tests
  total novos: 15 tests, 2 files

existing tests: todos revalidados, nenhum alterado/removido/skipado
```

### Resultado real

```
npm test (raiz) → research-engine: 16 arquivos / 129 testes — todos passando
                   scoring-engine:  8 arquivos /  81 testes — todos passando
                   shared:          1 arquivo  /  10 testes — todos passando
                   exit code final = 0 (todos os workspaces)
```

## 19. Typecheck

`npm run typecheck` (raiz) — exit code 0, todos os workspaces + `infrastructure/workers`.

## 20. Lint

`eslint .` — 2 erros encontrados e corrigidos nesta sessão (`SnapshotSource` importado e não
usado nos 2 arquivos de teste novos) — após a correção, exit code 0.

## 21. Build

`next build` — 20/20 páginas, exit code 0. As 3 novas rotas de projeto (`catalysts`, `risks`,
`fundamental-context`) aparecem na listagem.

---

## 22. Security Audit

Nenhuma URL de usuário é aceita/consultada — as duas fontes (`/hacks`, `FundingRound`) usam URLs
fixas já allowlisted (`api.llama.fi`, mesmo padrão anti-SSRF do resto do sistema). Ambas as rotas
novas exigem `getServerSession` (401 sem sessão), mesmo padrão do resto do sistema. Nenhum secret
logado pelos novos eventos estruturados.

## 23. Data Quality

Confidence e Status nunca fabricados: `HIGH` só para fontes primárias estruturadas; `status`
sempre `COMPLETED` para eventos que já ocorreram (nunca `ANNOUNCED`/`SCHEDULED` inventado para um
fato passado). Categorias sem fonte real permanecem simplesmente ausentes da tabela — nunca
populadas com `OTHER` como fallback genérico.

## 24. Performance

`/hacks` buscado 1x por Research Run (não por projeto) — evita N+1. Filtro por `defillamaId`
feito em memória sobre a lista já buscada.

---

## 25. Limitations

- Catalysts/Risks cobrem só 2 das ~39 categorias da taxonomia — as demais existem no schema, sem
  dado real.
- Nenhum evento futuro/anunciado (`ANNOUNCED`/`SCHEDULED`) é coletado hoje — as duas fontes ativas
  só reportam fatos já ocorridos.
- Sem deduplicação cross-fonte (Parte 15) — não relevante ainda porque só 1 fonte alimenta cada
  categoria hoje; nenhum evento é reportado por duas fontes diferentes.
- Event × Fundamental/Market Analysis (Partes 8-10, 16) não implementadas — infraestrutura pronta
  (Sprint 14), mas não conectada aos eventos nesta sprint.
- Histórico de mudança de `status` não versionado linha a linha (decisão documentada — sem
  consumidor real que precise disso ainda).

## 26. Technical Debt Remaining

Idêntica à listada nos Sprints 12-14, mais o escopo real limitado de Catalysts/Risks
(seção 25 acima): `TokenUnlock` (schema-only) · Distribution/Value Capture do Tokenomics ·
`Project.narrativeId`/Narrative · Emerging/Established · Global Score · Second Brain · Trading
Intelligence · Backtesting · Opportunity Engine · multi-tenant/RBAC.

## 27. Próximo Sprint recomendado

**Event × Fundamental/Market Analysis** (Partes 8-10/16 deste sprint, não implementadas) —
cruzar os eventos reais já coletados (funding rounds, incidentes de segurança) com as janelas
pré/pós já calculáveis via Historical Fundamental Intelligence (Sprint 14). Justificativa: é a
continuação natural e de menor risco do que este sprint construiu — nenhuma fonte nova necessária,
só conectar duas peças que já existem. Alternativa, se a prioridade for expandir cobertura de
Catalysts/Risks: obter acesso a uma fonte de notícias real (CryptoPanic com key, ou negociar
acesso a Messari) — mas isso depende de uma decisão de produto/orçamento fora do controle desta
sessão.
