# @crypto-research/scoring-engine

Sprint 5 — matemática pura do **Fundamental Score** (0–30 pontos), Confidence (0–100) e
percentile ranking. Não acessa banco de dados nem chama APIs externas — recebe métricas e
percentiles já resolvidos e devolve números. A persistência (associar a um `ResearchRun`,
carregar pares do setor, montar o Trace com fonte/timestamp) vive em
`packages/research-engine/src/score-repository.ts`, que é quem de fato usa este package.

## Modelo (`fundamental-v1`)

```
Fundamental Score (30 pts)
├── TVL Growth      10 pts  (7d 20% / 30d 50% / 90d 30%)
├── Revenue Growth  10 pts  (7d 20% / 30d 50% / 90d 30%)
├── Fees Growth      5 pts  (7d 20% / 30d 50% / 90d 30%)
└── Efficiency       5 pts  (Revenue/TVL 50% / Fees/TVL 50%)
```

Cada sub-métrica é comparada por **percentile rank dentro do setor do projeto** (não contra um
threshold fixo) — `percentile(value, peers) = (count(peer<value) + 0.5*count(peer==value)) /
total * 100`. Amostra de pares menor que 3 → percentile `null` (não confiável), nunca
inventado.

Se uma janela/ratio está ausente, o peso das janelas disponíveis do mesmo grupo é
renormalizado para ainda somar o peso total do grupo. Se um grupo inteiro está ausente, ele
contribui 0 ao total (nunca um valor fabricado) e é listado em `missingGroups` — o resultado
fica marcado `partial: true`.

**Confidence é independente do Score** (nunca `Score × Confidence`). É a média de 4 fatores
0–1: completude das 3 métricas fundamentais, adequação de amostra dos percentiles calculados,
ausência de flags de qualidade (`SUSPICIOUS`/rejeição `INVALID` durante o pipeline) e
atualidade dos dados (recência plena até 3 dias, decai linear até 30 dias).

## Limitação conhecida: INVALID vs MISSING

O Validator do Sprint 3 rejeita pontos `INVALID` antes de persistir (nunca viram uma linha no
banco) e pontos `MISSING` (ausentes na resposta da fonte) também não geram linha — ambos são
indistinguíveis olhando só para o banco depois do fato. O Scoring Engine só consegue marcar
`invalidRejected: true` porque o pipeline (mesma execução) passa adiante os contadores efêmeros
de `rejectedInvalid` que tinha em memória antes de descartar os pontos — ver
`score-repository.ts`. Rodar o Scoring Engine de forma desacoplada de uma Research Run (ex:
recalcular score de dados antigos sem reprocessar o pipeline) perde essa distinção fina e trata
tudo como `MISSING`.

## Não é recomendação financeira

O Fundamental Score mede força fundamental observável (crescimento, eficiência) segundo
métricas quantitativas já coletadas — não é, e não deve ser apresentado como, uma recomendação
de compra/venda.
