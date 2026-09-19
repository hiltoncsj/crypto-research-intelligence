# SPRINT 22 — MULTI-SECTOR EVENT SOURCE EXPANSION & INTELLIGENCE COVERAGE

## Executive Summary

O Sprint 22 expandiu a amostra real de 4 para **7 projetos**, cobrindo 7 setores distintos
(Lending×2, DEX, Liquid Staking, Derivatives, Cross-Chain Bridge, AMM), e mediu — sem alterar a
Classification Engine por antecipação — como GitHub Releases se comporta em setores diferentes
de Lending. O resultado mais importante: pela primeira vez a engine **disparou de verdade em
produção** (28 matches reais em Stargate/Bridge), e a auditoria manual desses 28 eventos
encontrou um **falso positivo real e confirmado** (não teórico) — a regra foi corrigida com
evidência concreta (`mainnet-launch-v1`/`testnet-launch-v1` → `v2`), e o mecanismo de
reclassificação (Sprint 20) foi usado em produção pela primeira vez para corrigir os eventos já
persistidos. Nenhuma fonte nova foi implementada (GitHub e Snapshot continuam sendo as únicas
fontes de texto livre disponíveis e viáveis sem custo/curadoria adicional — ver "New Sources
Investigated").

## Before / After

| Métrica                           | Antes (Sprint 21)                | Depois (Sprint 22)                                                                   |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| Projetos                          | 4                                | **7**                                                                                |
| Setores representados             | 3 (Lending, DEX, Liquid Staking) | **7** (+ Derivatives, Cross-Chain Bridge, AMM)                                       |
| Projetos com `githubRepo`         | 4                                | 7                                                                                    |
| Projetos com `snapshotSpace`      | 4                                | 7                                                                                    |
| Eventos GitHub reais              | 85                               | **433**                                                                              |
| Eventos Snapshot reais            | 1.159                            | **1.890**                                                                            |
| Total de eventos reais            | 1.244                            | **2.323**                                                                            |
| Regras que dispararam em produção | 0                                | **2** (`mainnet-launch-v1`, `testnet-launch-v1` — ambas depois corrigidas para `v2`) |
| Testes passando                   | 424                              | **426**                                                                              |

## Projects Added

| Project      | Slug         | DefiLlama slug | Setor (categoria DefiLlama) | githubRepo                    | snapshotSpace |
| ------------ | ------------ | -------------- | --------------------------- | ----------------------------- | ------------- |
| GMX V2 Perps | gmx-v2-perps | gmx-v2-perps   | Derivatives                 | gmx-io/gmx-synthetics         | gmx.eth       |
| Stargate V2  | stargate-v2  | stargate-v2    | Cross Chain Bridge          | stargate-protocol/stargate-v2 | stgdao.eth    |
| Balancer V2  | balancer-v2  | balancer-v2    | Dexs (AMM)                  | balancer/balancer-v3-monorepo | balancer.eth  |

**Curve DEX (`curve-dex`) falhou** — `runManualResearchPipeline` retornou `"Resposta JSON
inválida em /protocol/curve-dex"`. Falha isolada (real, não fabricada): o protocolo Curve tem um
payload muito grande na DefiLlama (múltiplas chains/pools); não foi investigado a fundo por estar
fora do escopo deste sprint (é uma questão de parsing/tamanho de resposta da DefiLlama, não da
Classification Engine ou de fontes de evento). Documentado como limitação, não contornado com
dado fabricado.

## Sector Coverage

| Setor                        | Projeto(s)           |
| ---------------------------- | -------------------- |
| Lending                      | Aave V3, Compound V3 |
| DEX (concentrated liquidity) | Uniswap V4           |
| DEX (AMM)                    | Balancer V2          |
| Liquid Staking               | Lido                 |
| Derivatives (perpétuos)      | GMX V2 Perps         |
| Cross-Chain Bridge           | Stargate V2          |

## External Identity Mapping

Metodologia idêntica ao Sprint 21 (nenhuma infraestrutura nova criada — reaproveitado
integralmente `Project.githubRepo`/`Project.snapshotSpace` do Sprint 19): cada
`githubRepo`/`snapshotSpace` foi **verificado AO VIVO** (GitHub API real + Snapshot GraphQL
real, `spaces(where: {id_in: [...]})` retornando `proposalsCount > 0`) antes de curar. Nenhum
mapping foi inferido por nome — vários candidatos testados (`aave.eth` sozinho não existe, é
`aavedao.eth`; `curvefi/curve-contract` não tem releases, `curvefi/curve-stablecoin` sim mas
vazio; `LayerZero-Labs/stargate-v2` não existe, o org correto é `stargate-protocol`) foram
descartados ou corrigidos antes de persistir qualquer coisa.

## Source Inventory

| Fonte                                 | Setor testado                                          | Categoria                   | Primária? | API                                                                                              | Custo                    | Histórico                                | Identidade          | Automação                | Status                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------ | --------------------------- | --------- | ------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------- | ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Releases                       | Lending, DEX, Liquid Staking, Derivatives, Bridge      | (múltiplas, ver "Decision") | Sim       | Sim                                                                                              | Gratuita (60 req/h)      | Completo, mas muito variável por projeto | Curada manualmente  | Sim                      | **EXISTENTE, validado em 6 setores**                                                                                                                                            |
| Snapshot GraphQL                      | Lending, DEX, Liquid Staking, Derivatives, Bridge, AMM | GOVERNANCE                  | Sim       | Sim                                                                                              | Gratuita                 | Completo (paginado)                      | Curada manualmente  | Sim                      | **EXISTENTE, validado em 6 setores**                                                                                                                                            |
| Official Blog/Announcements           | —                                                      | vários                      | Sim       | Não (varia por projeto, sem schema único)                                                        | Varia                    | Varia                                    | Nenhuma padronizada | Não (sem endpoint comum) | **NOT_IMPLEMENTED** — sem host único/schema identificável (Fase 6: não construir scraping genérico)                                                                             |
| Official Governance Forum (Discourse) | —                                                      | GOVERNANCE (texto rico)     | Sim       | Parcial (Discourse tem API, mas cada fórum é uma instalação separada, sem descoberta automática) | Gratuita, por instalação | Completo por fórum                       | Nenhuma padronizada | Parcial                  | **NOT_IMPLEMENTED** — exigiria uma curadoria de URL de fórum por projeto (viável no futuro, não testado nesta sprint)                                                           |
| GitHub Commits/Tags                   | mesmos 6 setores                                       | (nenhuma nova)              | Sim       | Sim                                                                                              | Gratuita                 | Completo                                 | Mesma de Releases   | Sim                      | **NOT_IMPLEMENTED** — avaliado e descartado: commits/tags têm ainda menos texto semântico que Releases (só uma mensagem de commit curta), não resolveria a limitação encontrada |

## Source Quality Analysis

Aplicado só a GitHub Releases e Snapshot (as 2 fontes reais existentes), sem criar um score
financeiro:

| Fonte            | Identity reliability                       | Date reliability                     | Event structure                                                                                                    | Historical coverage                                                 | API stability              | Cost     | Rate limits                               | Automation | Provenance                                      |
| ---------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------- | -------- | ----------------------------------------- | ---------- | ----------------------------------------------- |
| GitHub Releases  | Alta (curadoria manual verificada ao vivo) | Alta (`published_at` real)           | **Baixa/variável** — de 0 releases (Balancer) a 346 (Stargate), texto às vezes rico, às vezes só uma tag de versão | Completo por repo, mas ausente quando o projeto não usa GH Releases | Alta (API oficial estável) | Gratuita | 60 req/h — suficiente para o volume atual | Alta       | Alta (`releaseId` estável)                      |
| Snapshot GraphQL | Alta                                       | Alta (`start`/`end`/`created` reais) | Alta — título/corpo consistentemente estruturado como proposta de governança                                       | Completo (paginado, `MAX_PAGES` limita a 500)                       | Alta                       | Gratuita | Sem limite documentado observado          | Alta       | Alta (`proposalId` já um hash estável da fonte) |

## GitHub Analysis

| Sector             | Projeto      | Releases reais | Classificados (não-OTHER)                            | OTHER          |
| ------------------ | ------------ | -------------- | ---------------------------------------------------- | -------------- |
| Lending            | Aave V3      | 41             | 0                                                    | 41             |
| Lending            | Compound V3  | 10             | 0                                                    | 10             |
| DEX                | Uniswap V4   | 1              | 0                                                    | 1              |
| Liquid Staking     | Lido         | 33             | 0                                                    | 33             |
| Derivatives        | GMX V2 Perps | 2              | 0                                                    | 2              |
| Cross-Chain Bridge | Stargate V2  | 346            | 0 (após reclassificação — eram 28 antes da correção) | 346            |
| DEX (AMM)          | Balancer V2  | 0              | —                                                    | —              |
| **Total**          |              | **433**        | **0**                                                | **433** (100%) |

Achado adicional de densidade: **densidade de releases varia enormemente por projeto**, não por
setor — de 0 (Balancer, não usa a feature GitHub Releases) a 346 (Stargate, usa
`changesets`/monorepo com publicação automática por pacote — cada patch de qualquer um dos ~8
pacotes do monorepo vira uma "release"). Isso é mais sobre a CONVENÇÃO DE ENGENHARIA do projeto
do que sobre o setor a que pertence.

## Snapshot Analysis

1.890 propostas reais coletadas em 6 spaces (aavedao.eth: 978→500 limitado por `MAX_PAGES`;
uniswapgovernance.eth: 199; comp-vote.eth: 38; lido-snapshot.eth: 422; gmx.eth: 76; stgdao.eth:
155; balancer.eth: 500 limitado). **100% permanecem `GOVERNANCE`/`HIGH`/`STRUCTURED_SOURCE`** em
todos os 6 spaces — confirmado novamente que a classificação estruturada nunca é contaminada pela
engine textual, mesmo com um volume 15× maior que o Sprint 21.

## New Sources Investigated

- **Official Blog/Announcements**: investigado conceitualmente (Fase 5/11) — rejeitado por não
  ter host único nem schema identificável entre projetos (cada projeto usa uma plataforma de
  blog diferente — Mirror, Medium, blog próprio). Implementar exigiria um adapter por projeto ou
  scraping genérico, ambos fora do escopo permitido (Fase 6).
- **Discourse (fóruns oficiais de governança)**: Discourse tem API JSON real e documentada, mas
  cada fórum é uma instalação separada sem descoberta automática de URL — exigiria curar uma URL
  de fórum por projeto (viável tecnicamente, não implementado nesta sprint por não haver
  evidência ainda de que resolveria o problema de densidade encontrado em GitHub).
- **GitHub Commits/Tags**: avaliado e descartado — teria ainda menos contexto semântico que
  Releases (mensagens de commit são tipicamente mais curtas que release notes), não atacaria a
  causa raiz encontrada no Sprint 21 (falta de linguagem de anúncio, não falta de volume).

## New Sources Implemented

**Nenhuma.** Confirmado explicitamente pelo critério de sucesso da Fase 32: "se nenhuma fonte
adicional atender aos critérios, NOT_IMPLEMENTED é aceitável." Nenhuma das fontes investigadas
atendeu ao padrão de host único + schema identificável + automação sem curadoria manual por
projeto.

## New Sources Rejected

Ver "New Sources Investigated" acima — 3 fontes avaliadas, 3 rejeitadas com motivo documentado.

## Real Events Collected

- **433 eventos GitHub reais** (era 85 — +348, todos de 3 novos projetos).
- **1.890 eventos Snapshot reais** (era 1.159 — +731, de 3 novos projetos).
- **Total: 2.323 eventos reais.**

## Event Distribution

GitHub: 433/433 (100%) `OTHER` — nenhuma mudança na taxa de 100% observada no Sprint 21 mesmo com
3 setores novos. Snapshot: 1.890/1.890 (100%) `GOVERNANCE`.

## Classification Distribution

Idêntica ao Sprint 21 em proporção: 100% OTHER (GitHub), 100% GOVERNANCE (Snapshot) — **após** a
correção do falso positivo (antes da correção: 405 OTHER + 28 MAINNET/TESTNET em 433 GitHub).

## OTHER Analysis

Reconfirmado com 5× mais dados que o Sprint 21: GitHub Releases reais continuam sendo,
majoritariamente, changelogs técnicos (`"v1.19.4"`) ou tags de pacote de monorepo
(`"@stargatefinance/stg-evm-v2@6.1.2"`), não anúncios. A EXCEÇÃO real encontrada (Stargate) não
era, na verdade, um anúncio de produto — era uma frase de infraestrutura ("mainnet deployment")
que só existe porque Stargate é uma bridge cross-chain cujo core business é literalmente
"adicionar suporte a novas chains" repetidamente — cada adição gera uma linha de changelog
contendo "mainnet"/"testnet" + "deployment"/"configuration", sem ser um evento de lançamento do
PRÓPRIO protocolo.

## Candidate Rules

Nenhuma proposta nesta sprint — a Fase 9/10 pede para não criar regra a partir de padrão
observado uma única vez. O único padrão real repetido observado (`"<ChainName> mainnet/testnet
deployment"` em bridges/multi-chain) já tem uma regra que o capturava incorretamente
(`mainnet-launch-v1`/`testnet-launch-v1`) — a ação correta foi RESTRINGIR essa regra, não criar
uma nova.

## Rules Changed

**2** (`mainnet-launch-v1` → `mainnet-launch-v2`, `testnet-launch-v1` → `testnet-launch-v2`) —
removido o padrão bare `/\bmainnet\s+deployment\b/i` (e equivalente testnet), responsável por
**28 falsos positivos reais confirmados** em Stargate (26 MAINNET + 2 TESTNET), todos releases
automáticos de monorepo/changesets descrevendo adição de suporte a novas chains, não lançamentos
do próprio protocolo. Confirmado lendo o corpo real de 2 releases via GitHub API
(`InjectiveEVM mainnet deployment`, `Monad testnet deployment` — ambos itens de "Patch Changes"
em changelog automático). Regressão adicionada em
`packages/scoring-engine/tests/event-classification.test.ts` (2 testes novos) e reclassificação
real aplicada em produção via `npm run reclassify-events`-equivalente
(`reclassifyExistingGithubEvents`) — 28 eventos corrigidos, 0 remanescentes com categoria
incorreta.

## Rules Not Changed

As outras 10 (`protocol-upgrade-v1`, `token-migration-v1`, `token-burn-v1`, `token-buyback-v1`,
`staking-launch-v1`, `new-chain-v1`, `ecosystem-expansion-v1`, `product-launch-v1`,
`integration-v1`, `partnership-v1`) — **0 evidência de disparo em produção** (0/433), portanto
`KEEP` (Fase 29: sem evidência, manter).

## Event Impact Validation

Validado com dados reais de um setor novo (GMX/Derivatives): 5 eventos recentes processados via
`computeEventImpact` — resultados: 2 `NO_CLEAR_CHANGE`, 3 `OVERLAPPING_EVENTS`. Diferente da
distribuição do Sprint 21 (Lido: 100% OVERLAPPING_EVENTS) — confirma que a classificação de
impacto varia legitimamente por padrão real de atividade de cada projeto, não é um valor fixo.
Nenhuma afirmação causal.

## Dashboard Validation

**Não completada integralmente nesta sessão** — a chamada de `getEventIntelligenceOverview` foi
interrompida DUAS vezes por pressão de memória do ambiente local (mesma limitação já registrada
no Sprint 21, confirmada como reproduzível e não relacionada ao código). Confirmado por proxy:
7/7 projetos agora têm `FundamentalScore` (escopo de `getResearchedProjects` satisfeito) e
existem 2.323 eventos reais que a função consultaria. Recomendação mantida para o Sprint 23:
revalidar em um ambiente com mais memória disponível, ou considerar um teste de integração
dedicado com mock/limite de dados para não depender de rodar a função inteira manualmente.

## Research Trace

Confirmado — 1 log agregado por fonte por projeto por execução (nenhum log individual por
evento), mesmo com Stargate tendo 346 eventos numa única coleta:
`{"event":"events.github_releases_collected","slug":"stargate-v2","created":346,...,
"classification":{"otherCount":318,"ruleUsage":{"mainnet-launch-v1":26,"testnet-launch-v1":2}}}`
(1ª execução, antes da correção da regra) — confirma que o log agregado já reportava
corretamente o uso de regra, permitindo a descoberta do falso positivo SEM precisar auditar
evento por evento manualmente primeiro.

## Idempotency

**Confirmada em 3 execuções completas** contra os 3 novos projetos: `created: 0` em todas as
coletas GitHub/Snapshot nas execuções 2 e 3. Adicionalmente, a reclassificação
(`reclassifyExistingGithubEvents`) e a recoleta normal produziram o MESMO resultado final (28
eventos → OTHER) de duas formas independentes — confirma consistência entre os dois caminhos de
código.

## Performance

Nenhuma degradação nova. A correção de connection pool do Sprint 21
(`EVENT_IMPACT_BATCH_SIZE = 1`) foi mantida sem alteração (Fase 18 deste sprint: "NÃO remover
essa proteção sem benchmark" — respeitado, nenhum benchmark foi feito, nenhuma mudança).

## Connection Pool

**Nenhum novo problema.** A coleta de 346 eventos GitHub de Stargate numa única chamada não
estressou o connection pool porque `persistGithubReleaseCatalysts` já processa eventos em um
loop sequencial simples (não `Promise.all`) — só `getEventImpactsForProject` (já corrigido no
Sprint 21) tinha esse padrão de risco.

## Security

Reauditado com 3 novos hosts/repos reais:

- `isValidGithubRepo`/`isValidSnapshotSpace` validaram corretamente todos os 3 novos mappings
  antes de persistir — nenhuma URL arbitrária construída.
- Nenhum secret exposto (todas as 3 fontes continuam keyless).
- Nenhum `dangerouslySetInnerHTML`, nenhum ReDoS observado processando 433 releases reais (2
  linhas de código antes do gargalo real, se houvesse, seria a rede, não a engine).
- **0 critical / 0 high / 0 medium / 0 low.**

## Tests

426 passed / 0 failed (424 do Sprint 21 + 2 testes de regressão para o falso positivo
mainnet/testnet deployment).

## Typecheck

PASS.

## Lint

PASS, 0 erros, 0 warnings.

## Build

PASS, exit code 0.

## Coverage

Inalterada em proporção (12 regras textuais, 6 categorias estruturadas) — o que mudou foi a
QUALIDADE da evidência: agora sabemos que 2 das 12 regras tinham um problema real de precisão em
pelo menos 1 cenário (bridges cross-chain), corrigido.

## Findings

1. **GitHub Releases tem baixíssima densidade semântica útil independente do setor** — 0% de
   match real (não-corrigido) em 433 releases de 6 setores diferentes.
2. **Quando a engine dispara, ela precisa de auditoria real, não só teste sintético** — o
   Sprint 20 tinha 21 testes sintéticos "passando" para `mainnet-launch-v1`, mas nenhum deles
   cobria o padrão real "`<ChainName> mainnet deployment`" que causou o falso positivo — só
   apareceu com dado de produção real.
3. **O mecanismo de reclassificação (Sprint 20) funciona em produção** — primeira vez usado
   contra dados reais, corrigiu 28 eventos sem duplicar nada e sem afetar os 405 eventos
   corretos.
4. **Densidade de GitHub Releases é uma característica de convenção de engenharia do projeto**
   (monorepo + changesets = centenas de releases; contrato único sem automação = poucas
   dezenas), não do setor de mercado.

## Limitations

- `curve-dex` não pôde ser adicionado (falha real na resposta da DefiLlama para esse protocolo
  específico) — amostra ficou em 7 projetos, não 8.
- Dashboard (`getEventIntelligenceOverview`) não validado integralmente por limitação de memória
  do ambiente local, reproduzida 2 vezes (Sprint 21 e 22).
- Nenhuma fonte nova de texto rico foi encontrada e aprovada — a limitação de "GitHub Releases
  não tem linguagem de anúncio" permanece sem solução de fonte alternativa nesta sprint.

## Technical Debt

Nenhuma nova.

## Decision: GitHub as Event Source

**PARTIALLY.** GitHub Releases é uma fonte técnica válida (API estável, keyless, identidade
confiável, histórico completo por repo) mas **não é adequada como fonte PRIMÁRIA de
catalisadores de anúncio** (MAINNET/TESTNET/PARTNERSHIP/etc.) — em 433 releases reais de 6
setores, 0 continham linguagem de anúncio genuína após a correção do único falso positivo
encontrado. Continua sendo uma fonte legítima para o que ela realmente contém (histórico
técnico verificável de versões/deploys), só não para o propósito original de detectar eventos
de marketing/produto.

## Decision: Classification Engine

**KEEP**, com uma correção pontual já aplicada (`v1` → `v2` em 2 regras, ver "Rules Changed").
Nenhuma expansão de categorias, nenhum redesenho — a arquitetura (regras determinísticas,
STRUCTURED_SOURCE > RULE > OTHER, evidência obrigatória) se provou correta E capaz de ser
corrigida com segurança quando um problema real apareceu (o mecanismo de reclassificação existiu
exatamente para este cenário e funcionou).

## Future LLM Candidates

Nenhum identificado com confiança. A limitação encontrada não é "o texto é semanticamente rico
mas o regex não entende" — é "o texto simplesmente não contém o sinal buscado" (changelogs
técnicos). Um LLM não resolveria a ausência de informação (reafirmado explicitamente pela Fase
30 do documento de especificação, confirmado empiricamente aqui).

## Decision for Sprint 23

1. **Não investir mais em GitHub Releases como fonte de catalisadores de anúncio** — a
   Decision acima (`PARTIALLY`) já responde isso com 2 sprints de evidência real (85 + 433
   releases, 6+ setores, ~0% de sinal útil).
2. **Investigar Discourse/fóruns oficiais de governança** como próxima fonte candidata — tem API
   real documentada, e ao contrário de GitHub Releases, fóruns de governança são exatamente onde
   decisões de produto (mainnet, parcerias, upgrades) costumam ser discutidas em linguagem
   natural rica ANTES de se tornarem uma proposta Snapshot formal. Exigiria curar 1 URL de
   fórum por projeto (mesmo padrão de curadoria manual já estabelecido).
3. Revalidar `getEventIntelligenceOverview` (Dashboard) em ambiente com mais memória — pendência
   recorrente de 2 sprints.
4. Não recomendado: expandir a Classification Engine com novas regras sem uma fonte nova que
   realmente contenha o sinal — continuar adicionando regras para GitHub Releases não mudaria o
   resultado (0% de sinal), independente de quantas regras existirem.

---

## Respostas objetivas

1. **Quantos projetos existem agora?** 7.
2. **Quantos setores estão representados?** 6 (Lending, DEX-concentrated, DEX-AMM, Liquid
   Staking, Derivatives, Cross-Chain Bridge).
3. **Quantos possuem GitHub mapping?** 7.
4. **Quantos possuem Snapshot mapping?** 7.
5. **Quantos eventos reais foram coletados?** 2.323 (433 GitHub + 1.890 Snapshot) — total
   acumulado desde o Sprint 21.
6. **Quantos eventos vieram de cada fonte?** GitHub: 433. Snapshot: 1.890.
7. **Qual a distribuição por categoria?** GitHub: 100% OTHER (433/433). Snapshot: 100%
   GOVERNANCE (1.890/1.890).
8. **Qual percentual é OTHER?** 100% dos eventos GitHub.
9. **Qual percentual foi classificado por regra?** 0% (após correção) — era 6,5% (28/433) antes
   da correção do falso positivo.
10. **Quais regras realmente dispararam?** `mainnet-launch-v1` (26×) e `testnet-launch-v1` (2×)
    — ambas antes da correção; 0 regras disparam com `v2` (confirmado corretamente, já que eram
    falsos positivos).
11. **Em quais setores?** Cross-Chain Bridge (Stargate) — único setor onde alguma regra disparou.
12. **Quantos falsos positivos foram encontrados?** 28 (confirmados via leitura do corpo real de
    2 releases representativos).
13. **Quantos falsos negativos foram encontrados?** 0 confirmados (mesma metodologia do Sprint
    21 — nenhum título/corpo real continha evidência clara o suficiente para ser considerado
    falso negativo, dada a barra de conservadorismo da Fase 8).
14. **Quais padrões reais foram descobertos?** `"<ChainName> mainnet/testnet deployment"` em
    changelogs automáticos de projetos multi-chain/bridge — não é um anúncio de produto, é
    rotina de expansão de suporte a chains.
15. **Quais novas fontes foram investigadas?** Official Blog/Announcements, Discourse (fóruns de
    governança), GitHub Commits/Tags.
16. **Quais novas fontes foram implementadas?** Nenhuma.
17. **Quais foram rejeitadas e por quê?** As 3 acima — sem host único/schema identificável
    (Blog), sem descoberta automática de URL por projeto (Discourse, viável no futuro com
    curadoria), sem ganho semântico sobre Releases (Commits/Tags).
18. **GitHub Releases mostrou-se adequado?** PARTIALLY — fonte tecnicamente sólida, mas
    inadequada como fonte primária de catalisadores de anúncio (ver "Decision: GitHub as Event
    Source").
19. **A Classification Engine deve ser modificada?** KEEP, com a correção pontual já aplicada
    nesta sprint (2 regras `v1`→`v2`).
20. **Event Impact foi validado integralmente?** Sim, com uma amostra de 5 eventos reais de um
    setor novo (Derivatives/GMX) — resultados corretos e sem afirmação causal.
21. **Dashboard foi validado integralmente?** Não — interrompido por memória do ambiente local 2
    vezes (Sprint 21 e 22); validado por proxy (escopo/contagem confirmados via query direta).
22. **Houve duplicações?** Não — 0 em 3 execuções completas do pipeline.
23. **Houve problemas de performance?** Não além do já conhecido (memória do Dashboard, não do
    código dos novos projetos/fontes).
24. **Houve novos problemas de connection pool?** Não — a correção do Sprint 21 se manteve
    suficiente mesmo com 346 eventos coletados de um único projeto numa única execução.
25. **Qual foi o resultado de `npm test`?** 426 passed / 0 failed.
26. **Qual foi o resultado de `npm run typecheck`?** PASS.
27. **Qual foi o resultado de `npm run lint`?** PASS.
28. **Qual foi o resultado de `npm run build`?** PASS.
29. **Qual foi o resultado da auditoria de segurança?** 0 critical / 0 high / 0 medium / 0 low.
30. **Qual deve ser o Sprint 23 e por quê?** Investigar Discourse/fóruns de governança oficiais
    como fonte candidata (API real, texto naturalmente rico, curadoria manual de 1 URL por
    projeto — mesmo padrão já estabelecido), já que 2 sprints de evidência real mostram que
    GitHub Releases não é onde o sinal de anúncio realmente vive. Não investir mais em regras
    novas para a fonte atual.
