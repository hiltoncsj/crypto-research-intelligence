# TOP10_SELECTION_SPEC.md

> **Implementado no Sprint 8** (`packages/scoring-engine/src/priority.ts` +
> `packages/research-engine/src/selection.ts`, tabela `ResearchRunSelection`). Documento mantido
> como registro histórico da decisão de design; a seção 4 abaixo ("menor evolução proposta") é
> agora o que de fato existe no código. Ver `STATUS_PROJETO.md` seção 2.11 para o resumo do que
> foi entregue e o que ficou fora deste ciclo (múltiplos tipos de ranking, Narrative/Catalyst
> Strength).

---

## 1. Estado real hoje (auditado)

| Item                                                                                    | Classificação                                                                 | Evidência                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universo pesquisável distinto de "selecionados no run"                                  | **AUSENTE**                                                                   | `ResearchRun` não tem nenhum campo de seleção/critério; `pipeline.ts` recebe uma lista fixa de slugs, processados em ordem de array                            |
| "Top N" ou conceito de priorização de pesquisa                                          | **AUSENTE**                                                                   | Grep confirmado: único uso de "priority" no repo é `KanbanCard.priority` (ordenação manual de card no board), sem relação com seleção de projeto para pesquisa |
| Múltiplos tipos de ranking (Growth, Capital, Narrative, Catalyst, Emerging, Conviction) | **AUSENTE**                                                                   | Só existe `/api/rankings/fundamental`                                                                                                                          |
| Histórico de quem esteve no Top 10 e quando saiu                                        | **AUSENTE** (mas a base para isso já existe — ver `RESEARCH_HISTORY_SPEC.md`) | —                                                                                                                                                              |

## 2. Conceito de seleção (referência normativa)

```text
Universe (todos os projetos conhecidos, incl. recém-descobertos)
↓
Research (atualização de dados dos que precisam)
↓
Scoring (score já implementado)
↓
Ranking (múltiplos tipos, hoje só Fundamental existe)
↓
Top 10 Selection (critério documentado e versionado, não arbitrário)
↓
Deep Research Update (só os 10 selecionados recebem pesquisa detalhada no ciclo)
↓
Reports (ver PROJECT_RESEARCH_REPORT_SPEC.md)
```

Regra crítica preservada do prompt: **projetos que saem do Top 10 não são apagados** — só deixam
de ser prioridade. O histórico de scores/snapshots já é append-only (ver seção 3), então nada
precisa mudar ali; o que falta é o registro de "estava no Top 10 neste run, sim/não".

## 3. O que já resolve isso sem mudança nenhuma

O padrão de histórico já implementado (Score sempre `INSERT`, nunca `UPDATE`, com
`researchRunId`) significa que, mesmo sem um conceito de "seleção" hoje, **nenhum dado histórico
é perdido quando um projeto muda de prioridade** — o problema real é que não há, ainda, um
registro explícito de _quais_ projetos foram tratados como prioritários em cada run.

## 4. Menor evolução arquitetural proposta (não implementada agora)

1. **Não criar uma tabela nova de "seleção"** — adicionar um campo mínimo, por exemplo
   `ResearchRun.selectedProjectIds String[]` (ou uma tabela de junção simples
   `ResearchRunSelection(researchRunId, projectId, rank, reasonSummary)` se for necessário
   registrar o motivo por projeto) — decisão de schema a tomar no momento da implementação, não
   agora.
2. **Critério de priorização versionado**, seguindo o padrão de `weights.ts`:
   ```text
   Priority =
   Global Score
   + Capital Momentum
   + Narrative Strength   (bloqueado até existir tabela Narrative real — ver DATA_DICTIONARY.md)
   + Catalyst Relevance    (bloqueado até existir modelo de Catalyst real)
   + Growth Momentum
   + Research Freshness
   ```
   Pesos exatos **não devem ser inventados agora** — só o conceito e a estrutura versionável.
   Componentes sem dado real disponível (Narrative Strength, Catalyst Relevance) ficam com peso
   zero/documentado como pendente, nunca com valor inventado.
3. **Múltiplos rankings**: evolução incremental do endpoint já existente
   (`/api/rankings/fundamental`) para uma família `/api/rankings/{fundamental,growth,capital,...}`
   — implementar um de cada vez, conforme a dimensão correspondente já tiver dado real
   suficiente.

## 5. O que NÃO fazer

- Não implementar os 7 tipos de ranking de uma vez — só Fundamental tem dado real suficiente hoje
  para ser confiável; os demais dependem de Narrative/Catalyst/Value Capture, que ainda são
  `N/A`.
- Não recalcular seleção a cada request — a seleção pertence ao momento do Research Run, não é
  uma query dinâmica sobre o estado atual.

## 6. Dependências

Depende de `PROJECT_DISCOVERY_SPEC.md` (universo pesquisável) e alimenta
`PROJECT_RESEARCH_REPORT_SPEC.md` (quais projetos recebem relatório atualizado a cada ciclo).
