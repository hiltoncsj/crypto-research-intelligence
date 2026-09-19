# PROJECT_RESEARCH_REPORT_SPEC.md

> **Implementado no Sprint 9** (ver `STATUS_PROJETO.md`, seção 2.12) —
> `packages/research-engine/src/report.ts` (`generateProjectReport`, `report-v1`) e
> `GET /api/projects/[slug]/report`. Este documento foi escrito originalmente como especificação
> conceitual antes da implementação; mantido como registro do raciocínio de design e como
> referência de quais campos permanecem `N/A` por falta de fonte real.

---

## 1. Estado real hoje (auditado)

| Item                                                             | Classificação                                | Evidência                                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Geração de relatório/documento por projeto (markdown, PDF, etc.) | **IMPLEMENTADO (Sprint 9)**                  | `generateProjectReport()` em `packages/research-engine/src/report.ts` + `GET /api/projects/[slug]/report` (Markdown, com download via `Content-Disposition: attachment`) |
| Dados que alimentariam o relatório                               | **EXISTENTE em boa parte, PARCIAL no resto** | Ver mapeamento na seção 3 — mapeamento validado pela implementação real                                                                                                  |
| Estrutura de pasta por projeto (`/research/projects/<slug>/`)    | **AUSENTE (decisão deliberada)**             | Não implementado — a decisão da seção 2 (gerar sob demanda do banco, nunca persistir arquivo estático) foi a adotada                                                     |

## 2. Princípio de design: gerar sob demanda, não armazenar arquivo estático

O prompt de extensão sugere uma estrutura de pastas (`/research/projects/<slug>/`). Dado que
**todo o dado fonte já é estruturado no PostgreSQL** (Project, Score, Snapshot, FundingRound,
etc.), a menor evolução é **gerar o relatório sob demanda a partir do banco** (endpoint que monta
o markdown na hora), em vez de manter arquivos físicos sincronizados com o banco — evita um
segundo lugar de verdade. Persistir em disco só se houver necessidade real de cache/download
offline, e mesmo assim como artefato derivado, nunca como fonte.

## 3. Estrutura do relatório mapeada para dados reais

```markdown
# {Project.name} ({Token.symbol})

## Identificação

- Setor: {Sector.name}
- Narrativa: N/A (Project.narrativeId é string livre, sem tabela Narrative real — ver DATA_DICTIONARY.md)
- Blockchain(s): {ProjectChain[] onde active=true}
- Classificação (Consolidado/Emergente): N/A (framework ainda não implementado)

## O que o projeto faz

(descrição factual do protocolo — fonte a definir; nunca gerada por inferência do agente sem fonte)

## Métricas

- TVL: {TvlSnapshot mais recente} + variação 7/30/90d
- Revenue: {RevenueSnapshot} + variação
- Fees: {FeeSnapshot} + variação
- Market Cap: {Token.marketCapUsd}
- FDV / MC-FDV: N/A (DefiLlama não expõe FDV hoje)

## Capital e Captação

- Funding total, rodadas, investidores: {FundingRound[]} / {Investor[]} quando existirem — N/A quando ausente

## Tokenomics

- Unlocks: {TokenUnlock[]} quando existir dado
- Value Capture: N/A (sem fonte real conectada hoje)

## Score

- Fundamental Score: {FundamentalScore.score} (Confidence: {.confidence})
- Tokenomics Score: {TokenomicsScore.score} (Confidence: {.confidence})
- Institutional Capital Score: {InstitutionalCapitalScore.score} (Confidence: {.confidence})
- Modelo: {scoreModelVersion}

## Por que observar este projeto

(derivado de mudanças reais nas métricas acima — nunca texto opinativo arbitrário; ver seção 9 do prompt de extensão)

## Research Trace

- Fontes e timestamps de cada métrica acima

## Metadados

- Research Run: {researchRunId}
- Data as of: {createdAt}
- Gerado em: {timestamp de geração}
```

## 4. Evolução arquitetural implementada

1. **Endpoint** `GET /api/projects/[slug]/report` (Markdown) — monta o documento acima a partir
   de queries já existentes nos repositórios de `research-engine`/`scoring-engine`. Nenhuma
   tabela nova foi necessária.
2. **Botão "Baixar análise"** na página de detalhe do projeto (`dashboard/projects/[slug]/page.tsx`),
   consumindo o endpoint acima (`handleDownloadReport`, download via blob).
3. **Changelog de atualização** (seção "What Changed Since Last Research" do relatório):
   reaproveita `diffResearchRuns()` de `RESEARCH_HISTORY_SPEC.md`/`diff.ts` — não duplicado.

## 5. O que NÃO fazer

- Não gerar PDF/DOCX nesta fase — markdown é suficiente e mais simples de manter fiel aos dados.
- Não escrever texto explicativo/opinativo sem ancorar em métrica real com fonte — qualquer frase
  interpretativa deve ser derivável programaticamente de um dado existente (ver regras de
  não-alucinação em `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`, seção E).
- Não persistir o relatório como arquivo físico antes de haver necessidade real de cache.

## 6. Dependências

Depende de `TOP10_SELECTION_SPEC.md` (quais projetos têm relatório atualizado a cada ciclo) e
`RESEARCH_HISTORY_SPEC.md` (changelog entre versões do relatório).
