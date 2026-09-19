# CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md

> Documento central de explicação do sistema — o que é, como funciona o pipeline, e o
> significado de cada dado que ele coleta e calcula. Complementa (não substitui)
> `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md` (arquitetura técnica) e
> `Crypto_Research_Intelligence_Kanban_Pull_System.md` (gestão de fluxo). Versionado junto com o
> código — atualizar sempre que um campo, fonte ou regra de interpretação mudar.

---

## A. O que é o sistema

O Crypto Research Intelligence é uma plataforma de **inteligência fundamentalista** para
criptoativos: coleta dados reais (hoje, DefiLlama), calcula métricas de crescimento, gera três
scores (Fundamental, Tokenomics, Institutional Capital) com uma medida de confiança
independente, e organiza tudo em rankings, Research Trace (rastreabilidade métrica → fonte) e um
Kanban Pull System que gerencia o fluxo de trabalho de pesquisa.

O sistema é **analítico e informacional**, nunca prescritivo — ver seção E.

## B. Como funciona o pipeline

```text
Discovery (getProtocols DefiLlama, filtro de TVL mínimo — discovery-v1)
↓
Collectors (packages/defi-data)
↓
Normalizer/Adapter
↓
Validator (cross-check, marca dados suspeitos/inválidos)
↓
Snapshots (TvlSnapshot/RevenueSnapshot/FeeSnapshot — sempre INSERT, nunca sobrescritos)
↓
Metrics (crescimento 7/30/90/180d)
↓
Research Engine (orquestra o Research Run)
↓
Scoring (Fundamental/Tokenomics/Institutional Capital — cada run gera uma linha nova)
↓
Research Priority (priority-v1: Score + Growth Momentum + Capital Momentum)
↓
Top 10 Selection (ResearchRunSelection, imutável por run)
↓
History + Diff + Changelog (diff-v1, comparando as duas runs mais recentes)
↓
Ranking + Research Trace + Project Report (sob demanda) + Dashboard + Kanban
↓
Knowledge Base (este documento + TUTORIAL.md + DATA_DICTIONARY.md + Perfil de Projeto)
```

Discovery e Top 10 Selection foram implementados no Sprint 8; History/Diff/Changelog/Report no
Sprint 9; Knowledge Base/Perfil de Projeto no Sprint 10. `FIXED_DEV_PROJECT_SLUGS`
(`packages/research-engine/src/pipeline.ts`) não controla mais a seleção — existe só como
constante de conveniência para chamadas manuais explícitas. Ver `STATUS_PROJETO.md` para o
detalhamento de cada sprint.

## C. O significado de cada dado

Ver `DATA_DICTIONARY.md` para a referência completa, campo a campo. Aqui, o resumo interpretativo
das métricas centrais:

### TVL (Total Value Locked)

**O que é:** valor total em ativos depositados no protocolo.
**Por que o sistema coleta:** proxy de adoção e confiança de capital no protocolo — quanto mais
TVL, mais capital de terceiros está exposto às regras do protocolo.
**Como interpretar:** olhar a variação (7/30/90d), não o valor absoluto isolado. Um TVL alto mas
estagnado é diferente de um TVL menor mas em aceleração.
**Exemplo:** "TVL cresceu 35% em 30 dias."
**O que isso NÃO significa automaticamente:** que o protocolo é seguro, que o crescimento é
orgânico (pode ser incentivo temporário/"mercenary capital"), ou que o token do protocolo captura
esse valor (ver Value Capture).

### Revenue e Fees

**O que são:** Fees é o total pago pelos usuários ao protocolo; Revenue é a parcela que fica com o
protocolo/token (não redistribuída a terceiros, ex.: LPs).
**Por que o sistema coleta:** Revenue é o sinal mais próximo de "monetização real" — mede se o
protocolo gera receita genuína, não apenas TVL especulativo.
**Como interpretar:** Revenue crescendo mais rápido que TVL sugere melhora de eficiência/margem;
o contrário pode indicar que o crescimento de TVL não está convertendo em receita.
**Limitação:** DefiLlama depende de como cada protocolo reporta esses números — nem todos
seguem a mesma metodologia.

### Funding (captação de capital)

**O que é:** rodadas de investimento, investidores, valuation (quando disponível), estágio.
**Por que importa:** indica interesse de capital institucional/especializado, mas **funding alto
não é sinal de qualidade por si só** — mede captação, não execução.
**Como interpretar:** cruzar com Revenue/TVL reais. Funding alto + métricas operacionais fracas é
um padrão de risco (dependência de capital externo, não de tração).
**Fonte:** hoje, dados reais quando disponíveis via `FundingRound`/`Investor` no schema; quando
ausente, `N/A` — nunca inventado.

### Score e Confidence

**Score** (Fundamental/Tokenomics/Institutional Capital): nota 0-100 combinando várias dimensões
ponderadas (`packages/scoring-engine/src/weights.ts`), versionada por `scoreModelVersion`, sempre
uma linha nova por Research Run (histórico completo preservado, nunca `UPDATE`).
**Confidence** (`packages/scoring-engine/src/confidence.ts`): mede o quão **confiável é a
evidência** por trás do Score — não a qualidade do projeto. É a média de 4 fatores (completude
dos dados, amostra suficiente para percentil, ausência de dados suspeitos, recência) — 25% cada.
**Como interpretar juntos:** um Score alto com Confidence baixa deve ser tratado com cautela — a
nota pode estar apoiada em poucos dados ou dados antigos. Score e Confidence **nunca são
multiplicados entre si** — são dimensões independentes, mostradas lado a lado.

### FDV, MC/FDV e Value Capture — estado real hoje

**FDV (Fully Diluted Valuation)**: campo `fdvUsd` existe no schema e **é populado de verdade
desde a integração CoinGecko (Sprint 11)** — `packages/research-engine/src/funding-repository.ts`
grava `fdvUsd`/`circulatingSupply`/`totalSupply`/`maxSupply`/`marketCapRank` sempre que o
projeto tem `coinGeckoId` conhecido (vem do `gecko_id` que a própria DefiLlama retorna) e a
chamada à CoinGecko tem sucesso. Confirmado com dados reais em produção (ex.: AAVE/UNI com FDV
populado). `MC/FDV` (proxy de "diluição futura pendente", `computeMcToFdvRatio`) calcula
normalmente nesses casos — o **Tokenomics Score → Supply Dilution** já usa isso e mostra
percentis reais. Só fica `null` quando o projeto não tem `coinGeckoId` ou a chamada à CoinGecko
falhou nesta run — nunca por falta de fonte.
**Value Capture** (se o token captura o valor gerado pelo protocolo — via staking/buyback/burn):
é uma dimensão modelada no Tokenomics Score (`weights.ts`), mas **hoje sempre `null`** — não há
fonte de dado real conectada para esse sinal ainda (nenhum candidato gratuito/trial identificado
até o momento). **Unlock Pressure** e **Distribution** (os outros dois grupos ainda vazios) têm
um candidato de fonte identificado — Tokenomist.ai (`api.tokenomist.ai`, `/unlock-events/{id}`)
— integração em andamento, aguardando API Key para confirmar o formato real de resposta antes de
escrever o parser (nunca se adivinha o schema de uma API externa).
**Regra de não-alucinação**: em qualquer relatório ou explicação gerada, FDV/MC-FDV/Value
Capture/Unlock Pressure/Distribution devem aparecer explicitamente como `N/A` quando `null` —
nunca como zero, nunca omitidos silenciosamente.

### Catalysts

Hoje existe **apenas como peso no modelo de score** (`CATALYSTS: 10` em `weights.ts`) — não há
tabela `Catalyst`, nem lógica de detecção. Qualquer menção a "catalyst" em relatórios futuros deve
vir de um dado real ainda a ser modelado, nunca de uma inferência do agente.

## D. Como os indicadores se relacionam

Dois exemplos didáticos (nunca conclusões automáticas do sistema — sempre apresentadas como
padrões a observar, não como veredito):

```text
TVL ↑
Revenue ↑
Funding ↑
Value Capture ↑ (quando existir dado real)
```

Pode sugerir crescimento saudável com monetização real e alinhamento de incentivos — mas ainda
assim precisa de contexto (concentração de capital, sustentabilidade dos incentivos, etc.).

```text
TVL ↑
Revenue ↓
Funding alto
FDV muito alto (quando existir dado real)
Unlocks próximos
```

Pode sugerir que o crescimento de TVL não está convertendo em receita, e que há pressão de
diluição futura — um padrão que merece observação, não uma sentença.

## E. Regra central de linguagem: dado vs. interpretação vs. hipótese

Todo texto gerado pelo sistema (relatórios, explicações, changelogs) deve distinguir três níveis:

```text
Dado observado:   "Revenue cresceu 35% em 30 dias." (métrica real, com fonte e timestamp)
Interpretação:    "Isso indica aceleração de monetização." (leitura do dado, contextualizada)
Hipótese:         nunca "Esse projeto terá valorização." — o sistema não faz recomendação
                   financeira nem projeta preço.
```

Nenhum indicador isolado deve ser apresentado como prova de qualidade ou oportunidade de
investimento.

## F. Diferença entre conceitos-chave (Sprint 10)

É fácil confundir estes termos — aqui está a diferença exata, com o que existe implementado hoje:

- **Project Universe**: todo `Project` já conhecido pelo banco, descoberto automaticamente ou
  criado manualmente. Não é filtrado por nenhum critério de qualidade.
- **Project Discovery**: o processo (`discovery.ts`, `discovery-v1`) que adiciona novos projetos
  ao Universe a partir do `getProtocols()` da DefiLlama, com um filtro mínimo de TVL. Só roda
  quando o worker não recebe uma lista explícita de `projectIds`.
- **Established / Emerging**: uma classificação de maturidade do projeto — **não implementada**.
  Não existe campo/enum no schema para isso hoje; qualquer seção da UI/relatório que a mencione
  deve mostrar `N/A — critério ainda não implementado`, nunca inferir a partir de outros sinais.
- **Fundamental Score**: nota 0-100 de crescimento/eficiência, calculada uma vez por Research Run
  para um projeto específico (ver seção C acima).
- **Research Priority**: um número diferente do Fundamental Score — combina o Score com Growth
  Momentum e Capital Momentum para decidir **quais projetos pesquisar primeiro** na próxima run
  (Sprint 8, `priority-v1`). Um projeto pode ter Score alto e Priority baixa (ex.: sem captação
  recente) ou vice-versa.
- **Confidence**: não é maturidade nem qualidade — é confiabilidade da evidência por trás de um
  Score específico (seção C acima). Um projeto "Established" (se essa classificação existisse)
  ainda poderia ter Confidence baixa se os dados recentes forem escassos.
