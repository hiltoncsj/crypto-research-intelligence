# TUTORIAL.md

> Guia para quem nunca usou a plataforma. Para o significado técnico de cada campo, ver
> `DATA_DICTIONARY.md`; para a explicação conceitual de cada métrica, ver
> `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`. Este arquivo foca em **como usar** o sistema.

---

## Primeiro acesso

O sistema é single-user (sem cadastro). O login usa as credenciais definidas em `.env` na raiz
(`ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`, hash bcrypt — a senha em texto puro nunca é persistida em
lugar nenhum). Acesse a URL do `NEXTAUTH_URL` configurado (em desenvolvimento local, normalmente
`http://localhost:3000`) e entre com essas credenciais na tela de login.

Depois de logado, o dashboard (`/dashboard`) lista os projetos com dados já coletados. Se ainda
não houver nenhum, é preciso disparar a primeira Research Run (seção seguinte).

## Configuração das APIs

`apps/web/src/app/api/connections` gerencia chaves de API de terceiros, criptografadas em
repouso (AES-256-GCM, `MASTER_ENCRYPTION_KEY`) e mascaradas na UI — nunca exibidas em texto puro
depois de salvas. Duas fontes de dados reais estão integradas hoje: DefiLlama (TVL/Fees/Revenue/
Funding) e CoinGecko (Sprint 11 — FDV/supplies, só para projetos cujo `gecko_id` a DefiLlama
conhece). Nenhuma das duas exige chave para funcionar — a tela de "Conexões" permite
opcionalmente colar uma key CoinGecko Pro para aumentar o rate limit, mas isso não é obrigatório.
Nenhuma chave de API aparece em logs, relatórios Markdown ou
Research Trace (auditado no Sprint 10).

## 1. O que o sistema faz

Coleta dados reais sobre protocolos cripto (hoje via DefiLlama), calcula métricas de crescimento
e três scores (Fundamental, Tokenomics, Institutional Capital), e organiza tudo em rankings,
histórico rastreável e um Kanban que mostra o fluxo de trabalho de pesquisa em andamento.

O sistema **não recomenda compra/venda** — é uma ferramenta analítica.

## 2. Como iniciar uma pesquisa (Research Run)

Uma Research Run sem `projectIds` explícitos roda Discovery (descobre novos protocolos elegíveis
via DefiLlama) → Top 10 Selection (prioriza os projetos com melhor combinação de Score/Growth/
Capital Momentum) → pesquisa detalhada só dos selecionados (Sprint 8). Uma lista fixa de
desenvolvimento (`aave`, `uniswap`, `lido`) continua disponível para chamadas manuais explícitas.
Disparada manualmente (`/api/research-runs`) ou pelo `scheduler:dev` opcional. Acompanhe o
progresso em `/dashboard/research`, incluindo o Top 10 selecionado por run (ver seção 19 para
como interpretar a tabela do Top 10).

## 3. Como interpretar o Score

Cada projeto recebe três scores independentes: **Fundamental**, **Tokenomics** e **Institutional
Capital**, cada um de 0 a 100. Eles não se combinam automaticamente em uma nota única — leia os
três, cada um responde uma pergunta diferente:

- **Fundamental**: saúde operacional (TVL, Revenue, Fees, crescimento).
- **Tokenomics**: estrutura do token (supply, unlocks, value capture — hoje parcialmente `N/A`,
  ver `DATA_DICTIONARY.md`).
- **Institutional Capital**: qualidade e histórico de captação/investidores.

## 4. Como interpretar Confidence

Ao lado de cada Score, o **Confidence** (0-100) diz o quão confiável é a evidência por trás
daquele número — não se o projeto é bom. Score alto + Confidence baixa = leia com cautela, pode
haver pouco dado ou dado antigo sustentando a nota.

## 5. Como interpretar TVL, Revenue e Fees

Veja sempre a **variação** (7/30/90 dias), não o valor absoluto isolado. Um projeto pequeno em
aceleração pode ser mais relevante para observação do que um projeto grande estagnado — e
vice-versa, dependendo do que você está buscando.

## 6. O que significa Funding

Rodadas de captação, investidores e (quando disponível) valuation. Indica interesse de capital
especializado — não é, por si só, sinal de qualidade. Cruze sempre com métricas operacionais
reais (Revenue, TVL).

## 7. O que significa Institutional Capital

Dimensão dedicada a avaliar a qualidade/histórico dos investidores por trás do projeto (lead
investors, rodadas anteriores) — ver Score correspondente.

## 8. Como interpretar Tokenomics e Unlocks

Estrutura de supply do token e cronograma de liberação de tokens travados. Unlocks relevantes
próximos podem indicar pressão de venda futura — quando o dado estiver disponível (ver estado
real de cada campo em `DATA_DICTIONARY.md`).

## 9. O que é MC, FDV e MC/FDV

**MC** (Market Cap) é real e sempre disponível. **FDV** (Fully Diluted Valuation) e a razão
**MC/FDV** vêm da integração com CoinGecko (Sprint 11) para projetos cujo `gecko_id` a DefiLlama
conhece — quando disponíveis, aparecem no perfil do projeto. Seguem como `N/A` apenas quando o
projeto não tem esse `gecko_id` mapeado. Isso é uma limitação de dado, não um erro.

## 10. O que significa Value Capture

Se o token do protocolo captura o valor que o protocolo gera (via staking, buyback, burn). Hoje
modelado no Tokenomics Score, mas sem fonte de dado real conectada — aparece como `N/A`.

## 11. O que são Catalysts

Eventos que podem acelerar/mudar a trajetória de um projeto (upgrade, integração, mudança
regulatória). Hoje é apenas um peso no modelo de score, sem detecção real implementada — não
espere ver catalysts listados ainda.

## 12. O que significa Risk

Ainda não modelado como campo dedicado no sistema.

## 13. Como interpretar crescimento

Prefira olhar múltiplas janelas (7/30/90 dias) e cruzar TVL com Revenue — crescimento de TVL sem
crescimento de Revenue pode significar capital especulativo/incentivado, não adoção real.

## 14. Projetos emergentes vs. consolidados

Classificação planejada (ver seção 10 de `Crypto_Research_Intelligence_Kanban_Pull_System.md`
e a extensão futura descrita em `PROJECT_DISCOVERY_SPEC.md`) — **ainda não implementada**. Hoje
todos os projetos aparecem sem essa classificação.

## 15. Como usar o histórico

O sistema nunca sobrescreve dados antigos: cada Research Run gera novas linhas de snapshot e
score. A visão histórica navegável por projeto (curto/médio/longo prazo, changelog automático de
mudanças relevantes) já está implementada na própria página do projeto (`/dashboard/projects/
[slug]`, seção "Research History"), consumindo `/api/projects/[slug]/history` — ver
`RESEARCH_HISTORY_SPEC.md` para o detalhamento.

## 16. Como interpretar rankings

`/dashboard/rankings` mostra o ranking fundamentalista atual. Outros tipos de ranking (Growth,
Capital, Narrative, Catalyst, Emerging, Conviction — seção 33 do Kanban Pull System) são conceito
futuro, ainda não implementados.

## 17. Como usar o Kanban

`/dashboard/kanban` mostra o fluxo real do pipeline de pesquisa (Discovery → Data Collection →
Fundamental Analysis → Scoring → Published), com limites de WIP, cards bloqueados/urgentes e
métricas de fluxo (Waiting Time, Buffer, classificação de gargalo). Não é uma ferramenta de
tarefas genérica — reflete o pipeline real de pesquisa em execução.

### Cronômetro de Data Collection

Ao lado de "Card aberto mais antigo", um cronômetro mostra o tempo da tarefa **atualmente em
andamento** em Data Collection (a etapa mais lenta do pipeline, "o gargalo real"). A média
pequena acima dele é a duração média histórica dessa etapa — comparando com ela, o cronômetro
fica **verde** enquanto está abaixo da média e **vermelho** quando ultrapassa. Fica parado em
`00:00:00` quando não há nenhuma tarefa em Data Collection no momento, e reinicia do zero a cada
nova tarefa — nunca acumula tempo entre tarefas diferentes. A média é calculada só a partir de
ciclos **realmente concluídos** (nunca inclui tarefas canceladas — ver próximo tópico), e pode
ser "zerada" (recomeçar a contagem do zero, sem apagar o histórico real) via
`resetDataCollectionMetricBaseline()` quando fizer sentido descartar dados antigos de teste.

### O que acontece quando você cancela uma Research Run

Cards que ainda estavam em Discovery/Data Collection/Fundamental Analysis/Scoring **voltam
automaticamente para Backlog** (nunca são apagados — fica registrado no histórico de
movimentação com o motivo `RESEARCH_RUN_CANCELLED`). Esse movimento é **excluído** do cálculo da
média de Data Collection — uma tarefa abortada não é um ciclo real concluído, então não distorce
a média para baixo. Cards que já tinham chegado em Published não são tocados.

### Por que cards "somem" em Discovery sem nunca avançar

Toda Research Run automática roda **Discovery** (descobre TODOS os protocolos elegíveis na
DefiLlama, um card por protocolo) e depois **Top 10 Selection** (escolhe só os 10 de maior
Priority pra pesquisa detalhada — ver seção 19). **Só os 10 selecionados avançam** de coluna
naquele ciclo; os demais ficam com o card parado em Discovery — não é um erro, é esperado. Na
próxima Research Run, a Priority de todo mundo é recalculada com dados atualizados; se a de um
projeto parado subir o suficiente, ele entra no próximo Top 10 e avança. Pra forçar a pesquisa de
um projeto específico sem esperar o Top 10 escolher, dispare uma Research Run com `projectIds`
explícitos.

## 18. Como entender o Research Trace

Toda métrica exibida pode ser rastreada até sua fonte e timestamp de coleta — clique/navegue a
partir do valor exibido no dashboard do projeto para ver a origem exata do dado.

## 19. Como interpretar a tabela do Top 10 Dinâmico (Priority)

Toda Research Run automática passa primeiro por **Discovery** (descobre protocolos elegíveis via
DefiLlama) e depois por **Top 10 Selection** (`priority-v1`,
`packages/scoring-engine/src/priority.ts`) — só os 10 projetos com maior **Priority** são
pesquisados em detalhe naquele ciclo. Essa tabela responde "quem merece atenção **agora**", não
"qual é o melhor projeto" — um projeto excelente mas estagnado pode ficar de fora, enquanto um
projeto menor em forte aceleração entra.

Exemplo real de uma seleção:

| #   | Projeto          | Priority | Score | Growth Momentum | Capital Momentum | Motivo                 |
| --- | ---------------- | -------- | ----- | --------------- | ---------------- | ---------------------- |
| 1   | 40 Acres         | 72.98    | 49.17 | 96.8            | —                | Strong Growth Momentum |
| 2   | 9Summits         | 68.33    | 36.67 | 100             | —                | Strong Growth Momentum |
| 3   | 3F               | 63.29    | 53.77 | 71.32           | 64.78            | Strong Growth Momentum |
| 4   | Uniswap          | 59.91    | 63.33 | 72.8            | 43.58            | Strong Growth Momentum |
| 5   | Aave V3          | 53.67    | 38.47 | 68.88           | —                | Baseline Priority      |
| 6   | 3Jane Lending    | 52.02    | 29.87 | 74.17           | —                | Strong Growth Momentum |
| 7   | Lido             | 44.07    | 50    | 82.22           | 0                | Strong Growth Momentum |
| 8   | Aave             | 39.4     | 48.2  | 70.01           | 0                | Strong Growth Momentum |
| 9   | Aave V2          | 37.61    | 52.73 | 60.11           | 0                | Baseline Priority      |
| 10  | Aave Horizon RWA | 30.54    | 6.27  | 54.81           | —                | Baseline Priority      |

**O que cada coluna significa:**

- **# / Projeto** — posição no Top 10 daquele ciclo e nome do protocolo.
- **Priority** (0-100) — a nota que decide a ordem. É a **média simples dos componentes
  disponíveis** entre Score, Growth Momentum e Capital Momentum. Um componente ausente (`—`) é
  **excluído da média, nunca vira 0** — por isso dois projetos com Priority parecida podem ter
  combinações bem diferentes por trás (ex.: 3F tem os 3 componentes; 40 Acres só tem 2).
- **Score** — o Fundamental Score mais recente do projeto (0-100), de uma pesquisa anterior. Mede
  força fundamental (TVL/Revenue/Fees e crescimento), não é recomendação de compra/venda. `—`
  apareceria aqui se o projeto nunca foi pesquisado antes (não é o caso nesta tabela).
- **Growth Momentum** — crescimento de TVL nos últimos 30 dias, normalizado 0-100 (±50% de
  crescimento já satura a escala: +50% ou mais vira 100, -50% ou menos vira 0).
- **Capital Momentum** — quão recente foi a última captação de funding conhecida, normalizado:
  captação nos últimos 30 dias = 100, um ano ou mais sem captar = 0.
  **Atenção à diferença entre `—` e `0` nesta coluna** — não são a mesma coisa:
  - `—` (40 Acres, 9Summits, 3Jane Lending, Aave V3) = **nenhuma rodada de funding registrada**
    para o projeto (dado ausente, nunca tratado como zero).
  - `0` (Lido, Aave, Aave V2) = **existe** histórico de captação conhecido, mas a última rodada
    foi há 365 dias ou mais (dado presente, só velho — momentum baixo é uma informação real, não
    ausência de dado).
- **Motivo** — texto gerado mecanicamente a partir dos números acima (nunca narrativa inventada):
  "Strong Growth/Capital Momentum" quando aquele componente específico é ≥70, "High Score" quando
  o Score é ≥70, "Baseline Priority" quando nenhum componente individual passa de 70 mas ainda há
  algum dado disponível.

**O que é relevante observar e por que um projeto se destaca:**

- **Growth Momentum muito alto com Score/Capital ausentes** (ex.: 40 Acres 96.8, 9Summits 100) —
  sinaliza um protocolo em aceleração forte de TVL recente, mas ainda **sem histórico**
  consolidado (nunca pesquisado a fundo antes, sem captação conhecida). Vale acompanhar, mas com
  cautela: alta Priority aqui reflete só um sinal (momentum), não os 3 juntos — leia como "digno
  de atenção agora", não "fundamentalmente forte comprovado".
- **Os 3 componentes presentes e coerentes** (ex.: 3F, Uniswap) — sinal mais robusto, porque a
  Priority não depende de um único fator isolado. Esses são os casos em que "Strong Growth
  Momentum" carrega mais peso de evidência.
- **Score alto mas Priority baixa** (ex.: Aave V2, Score 52.73 mas Priority só 37.61) — mostra a
  diferença entre "bom fundamentalmente" e "merece pesquisa agora": o projeto é sólido, mas sem
  momentum de crescimento nem captação recente, então cai na fila em relação a quem está
  acelerando.
- **Motivo "Baseline Priority"** (Aave V3, Aave V2, Aave Horizon RWA) — nenhum sinal individual
  extremo, entraram no Top 10 por não terem nenhum componente fraco o bastante para cair, não por
  terem um destaque específico. É o caso "mediano, sem sinal de alerta nem de aceleração".
- **Nunca leia a tabela como recomendação de investimento** — Priority mede "onde focar o esforço
  de pesquisa deste ciclo", não "o que comprar". Um projeto no topo pode ainda ter Tokenomics
  Score zerado, Confidence baixa, ou riscos não capturados por essas 3 dimensões (ver seções 3–4,
  10 e 12).

### Destaque visual (linha verde) — o que significa e como ele "aprende" com o tempo

Na página `/dashboard/research`, algumas linhas do Top 10 aparecem com fundo verde e um botão
`ⓘ` ao lado do nome do projeto — é o destaque de **sinal raro/relevante**
(`packages/research-engine/src/selection-relevance.ts`, `selection-relevance-v1`).

**Como o critério é calculado**: em vez de um número fixo tipo "Priority ≥ 70", o sistema calcula
o **percentil** do `priorityScore` daquele projeto contra **toda a população histórica** de
seleções já feitas por todas as Research Runs anteriores (mesmo mecanismo de `percentileRank` já
usado no Fundamental Score — determinístico, nunca uma IA "decidindo" por conta própria). Uma
linha é destacada quando está no percentil ≥90, ou seja, mais prioritária que 90% de tudo que já
foi selecionado até hoje.

**Por que isso "aprende com o tempo"**: como a população cresce a cada Research Run, o corte se
recalibra sozinho — se o mercado inteiro esfriar, o que hoje seria "normal" passa a se destacar
mais facilmente (porque a base de comparação também esfriou); se tudo estiver aquecido, o corte
fica mais exigente. Não é machine learning nem um LLM ajustando pesos — é estatística simples
recalculada a cada consulta, então nunca precisa de "retreinamento".

**Confirmação (não é só previsão)**: quando você clica no `ⓘ` de um projeto que **já tinha
cruzado esse percentil em uma Research Run anterior**, o tooltip mostra o que aconteceu de fato
desde então — usando o Diff Engine (`diff.ts`, já existente desde o Sprint 9) para comparar Score
e TVL entre a run em que o projeto se destacou pela primeira vez e a mais recente. Isso é dado
real, não uma promessa: "Confirmação: Fundamental Score +8.2, TVL +22.4%" significa que o sistema
está literalmente checando se aquele destaque anterior se sustentou, toda vez que uma nova
Research Run roda. Se o projeto está se destacando pela primeira vez, o tooltip avisa que ainda
não há confirmação — volte depois de uma nova Research Run pra ver o resultado real.
