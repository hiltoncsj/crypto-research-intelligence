# RESEARCH_HISTORY_SPEC.md

> **Implementado no Sprint 9** (ver `STATUS_PROJETO.md`, seção 2.12). Este documento foi escrito
> originalmente como especificação conceitual antes da implementação; mantido como registro do
> raciocínio de design. As seções 1–2 abaixo descrevem o estado _antes_ do Sprint 9 — para o
> estado atual, ver `STATUS_PROJETO.md` § 2.12.

---

## 1. Estado real hoje (auditado)

| Item                                                       | Classificação                               | Evidência                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshots (TVL/Revenue/Fees) nunca sobrescritos            | **EXISTENTE**                               | `@@unique([projectId, source, sourceTimestamp])` funciona como dedupe, não upsert; duplicatas são puladas (`skippedDuplicate`), não sobrescrevem                              |
| Score histórico completo, nunca sobrescrito                | **EXISTENTE**                               | `FundamentalScore`/`TokenomicsScore`/`InstitutionalCapitalScore` não têm unique constraint por `(projectId, researchRunId)` — cada Research Run insere uma linha nova, sempre |
| Vínculo de cada score/snapshot à Research Run que o gerou  | **EXISTENTE**                               | `researchRunId` é FK obrigatória em todas as três tabelas de score                                                                                                            |
| Research Trace (métrica → fonte/timestamp)                 | **EXISTENTE**                               | `packages/scoring-engine/src/trace.ts`                                                                                                                                        |
| Visão histórica navegável por projeto (7/30/90/180d) na UI | **IMPLEMENTADO (Sprint 9)**                 | `GET /api/projects/[slug]/history` + `getProjectHistory()` em `packages/research-engine/src/history.ts`; seção "Research History" em `dashboard/projects/[slug]/page.tsx`     |
| Registro explícito de "estava no Top 10 quando"            | **IMPLEMENTADO (Sprint 9, sobre Sprint 8)** | `diffResearchRuns()` compara `ResearchRunSelection` entre runs (`TOP10_ENTERED`/`TOP10_EXITED`/`RANKING_CHANGED`)                                                             |
| Changelog legível ("Score: 82 → 87, TVL 30d: +21%...")     | **IMPLEMENTADO (Sprint 9)**                 | `packages/research-engine/src/diff.ts`, `diffResearchRuns(projectId)`, `diff-v1`                                                                                              |

## 2. O que falta é visão, não dado

Diferente das outras extensões, esta não exige nenhuma mudança de schema para o histórico básico
funcionar — os dados já são append-only e já carregam `researchRunId`, `createdAt`,
`sourceTimestamp`. A lacuna real é:

1. Um endpoint que agregue snapshots/scores de um projeto ao longo do tempo, agrupado em janelas
   (curto/médio/longo prazo).
2. Uma função que compare a última Research Run com a anterior e produza um changelog legível
   (`Score: 82 → 87`, `TVL 30d: +21%`) — puramente derivada dos dados existentes, sem inventar
   nada.
3. Uma UI que exiba essa timeline no dashboard individual do projeto.

## 3. Evolução implementada (Sprint 9)

- **Endpoint de histórico agregado por projeto** (`GET /api/projects/[slug]/history`), que
  consulta os snapshots/scores já existentes e agrupa por janela de tempo — sem nova tabela.
- **Função de diff entre duas Research Runs de um mesmo projeto** (comparar a run mais recente
  com a run anterior nas mesmas métricas) — lógica pura sobre dados já existentes.
- Se, no futuro, o volume de dados tornar a agregação em tempo real cara, considerar uma tabela de
  materialização (ex.: `ProjectHistorySummary`) — **não implementado, sem necessidade real
  observada ainda**.

## 4. Regra crítica preservada

Nenhuma alteração aqui deve envolver `UPDATE` ou `DELETE` em snapshots/scores históricos — o
padrão append-only já implementado é exatamente o que os itens 11-14/26/48 do prompt de extensão
pedem. O trabalho futuro é só de leitura/agregação.
