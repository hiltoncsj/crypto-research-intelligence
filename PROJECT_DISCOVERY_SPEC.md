# PROJECT_DISCOVERY_SPEC.md

> **Implementado no Sprint 8** (`packages/research-engine/src/discovery.ts`). Este documento foi
> escrito originalmente como especificação conceitual antes da implementação — mantido como
> registro histórico da decisão de design; a seção 3 abaixo ("menor evolução proposta") é agora
> o que de fato existe no código, não mais uma proposta. Ver `STATUS_PROJETO.md` seção 2.11 para
> o resumo do que foi entregue.

---

## 1. Estado real hoje (auditado, não suposto)

| Item                                                                  | Classificação | Evidência                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint de listagem completa de protocolos                           | **PARCIAL**   | `packages/defi-data/src/client.ts` já implementa `getProtocols()` contra `GET /protocols` da DefiLlama — mas só é chamado por `pingDefiLlama()` (health-check da conexão), nunca pelo pipeline |
| Descoberta de projeto novo (fora da lista já conhecida)               | **AUSENTE**   | `pipeline.ts` usa `FIXED_DEV_PROJECT_SLUGS = ["aave", "uniswap", "lido"]`, uma lista fixa de código — não há query ao universo de protocolos disponíveis na DefiLlama                          |
| Registro de "por que"/"quando" um projeto foi descoberto              | **AUSENTE**   | Nenhum campo em `Project` ou tabela dedicada guarda `discoveredAt`/`discoverySource`/`discoveryReason`                                                                                         |
| Card Kanban distinguindo "Novo Projeto Descoberto" de pesquisa normal | **PARCIAL**   | `KanbanCard.type` existe mas hoje só recebe o valor constante `"RESEARCH"` — a coluna `DISCOVERY` já existe e é usada, mas não diferencia "descoberto agora" de "redescoberto"                 |

## 2. Conceito de Discovery (referência normativa, não implementação)

```text
Universe (todos os protocolos disponíveis via DefiLlama /protocols)
↓
Filtro básico (ex.: TVL mínimo, categoria relevante — critério a definir e VERSIONAR,
                    mesmo padrão de `weights.ts` já usado no scoring)
↓
Projetos ainda não presentes na tabela Project (diff contra o banco)
↓
Registro de Discovery (quando, fonte, motivo)
↓
Card Kanban em DISCOVERY (reaproveitando `recordProjectDiscovered`, já existente)
```

Uma "descoberta" deve registrar, no mínimo, os campos já pedidos no prompt de extensão: projeto,
data, fonte, setor, narrativa (quando existir), blockchain, estágio, funding conhecido, métricas
disponíveis, motivo, timestamp — **nunca inventados**; campos sem dado real ficam `N/A`.

## 3. Menor evolução arquitetural proposta (não implementada agora)

1. **Reconectar `getProtocols()` ao pipeline** como um passo opcional de descoberta, separado do
   processamento normal — não precisa rodar em toda Research Run.
2. **Dois campos novos em `Project`** (evolução mínima de schema, quando for a hora de
   implementar): `discoveredAt DateTime?` e `discoverySource String?` — evita criar uma tabela
   nova só para isso; segue o padrão já usado em outros campos opcionais do schema atual.
3. **Reaproveitar `KanbanCard.type`** para diferenciar `"DISCOVERY"` de `"RESEARCH"` quando o
   card nasce de uma descoberta automática vs. de uma Research Run manual — nenhuma coluna nova
   necessária, o campo já existe e está subutilizado.
4. **Critério de filtro versionado**, seguindo o mesmo padrão de `packages/scoring-engine/src/weights.ts`
   (constantes documentadas e versionadas, não regra invisível no código) — evitar que centenas
   de protocolos irrelevantes poluam o universo pesquisável.

## 4. O que NÃO fazer (para não sobre-engenheirar)

- Não criar uma tabela `Discovery` separada de `Project`/`KanbanCard` — os dois já cobrem os
  campos necessários com uma extensão mínima.
- Não implementar scraping de fontes além da DefiLlama sem necessidade comprovada.
- Não rodar descoberta em toda Research Run — é um processo de menor frequência, separado do
  fluxo de pesquisa detalhada.

## 5. Dependências

Depende de `TOP10_SELECTION_SPEC.md` para decidir como um projeto recém-descoberto entra (ou não)
na priorização de pesquisa detalhada.
