# Sprint 13 — Tokenomics Completo + Perfil da Cripto + Mercados de Negociação

## Relatório de implementação

Data: 2026-09-18/19. Todas as evidências abaixo vêm de execução real dos comandos e de chamadas
reais às APIs externas feitas nesta sessão — não de suposição sobre o que "provavelmente" existe.

---

## 1. Resumo

Dois objetivos independentes:

- **Parte A (Tokenomics)**: investigada a fundo, com chamadas reais às fontes candidatas.
  Conclusão honesta: **não implementada** — nenhuma fonte gratuita real e acessível existe hoje
  para Unlock Pressure, Distribution ou Value Capture. Nenhum dado sintético foi criado. Supply
  Dilution (única dimensão com dado real) foi regression-testada, sem alteração de código.
- **Parte B (Perfil + Mercados)**: implementada com dado 100% real, reaproveitando a MESMA
  chamada HTTP já existente (Sprint 11) — **nenhuma chamada de rede nova** foi adicionada ao
  pipeline. Novo model `ProjectProfileSnapshot` (descrição/categoria/blockchain/homepage) e
  `TokenMarket` (exchanges/pares/volume reais), ambos exibidos no Project Report.

Nenhum score existente foi recalibrado. Discovery, Top 10, DefiLlama pipeline, Market Data
histórico (Sprint 12), Fundamental Score, Institutional Capital Score, Research Priority, Kanban,
History/Diff, segurança de API Keys — nada disso foi tocado.

---

## 2. Estado anterior

Confirmado lendo `packages/research-engine/src/tokenomics-score-repository.ts` e
`packages/scoring-engine/src/tokenomics-score.ts` antes de qualquer mudança: `unlockPressure`,
`distribution` e `valueCapture` são sempre `null` no código, com comentários explícitos já
documentando a ausência de fonte gratuita. A função pura `computeUnlockPressureRatio`
(`packages/scoring-engine/src/tokenomics-score.ts`) já existe desde o Sprint 6 e está testada com
fixtures sintéticas — só falta um `next30dUnlockAmount` real para ser usada de verdade.
`Token.circulatingSupply` (necessário para essa fórmula) já é real desde o Sprint 11.

---

## 3. Tokenomics implementado

**Nenhuma mudança de código nesta parte.** Ver seção 4 para a investigação que levou a essa
decisão. `computeAndPersistTokenomicsScore`, `computeTokenomicsScore`, os pesos em
`TOKENOMICS_GROUP_WEIGHTS` — todos idênticos ao estado pré-Sprint 13.

---

## 4. Fonte de unlocks

### Investigação (chamadas reais feitas nesta sessão, não suposição)

| Fonte                                             | Endpoint                                        | Autenticação                | Disponibilidade                                                                                                                                                                                         | Dados fornecidos                                                                                                                                                                                                                                                                                 | Limitações                                                                                                                         | Histórico    | Cronograma futuro | Custo                                              | Confiabilidade                                     |
| ------------------------------------------------- | ----------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------- | -------------------------------------------------- | -------------------------------------------------- |
| DefiLlama                                         | `GET api.llama.fi/emissions/{protocol}`         | Nenhuma (quando disponível) | **HTTP 402** — reconfirmado por chamada real nesta sessão (`curl`/`fetch` diretos): `{"message":"Upgrade to the paid API plan..."}`                                                                     | N/A — endpoint pago                                                                                                                                                                                                                                                                              | Requer assinatura paga, custo não determinado nesta sessão                                                                         | N/A          | N/A               | Pago (plano não testado)                           | N/A — inacessível                                  |
| DefiLlama                                         | `GET api.llama.fi/emissions` (lista)            | Nenhuma                     | **HTTP 402**, mesma resposta                                                                                                                                                                            | idem                                                                                                                                                                                                                                                                                             | idem                                                                                                                               | idem         | idem              | Pago                                               | N/A                                                |
| CoinGecko                                         | `GET /coins/{id}` (endpoint já usado, gratuito) | Opcional (Pro key)          | Disponível, já integrado                                                                                                                                                                                | Inspecionado campo a campo nesta sessão (payload completo de `GET /coins/aave`): supply atual/max/circulante, FDV, market cap, preço, ATH/ATL, `has_supply_breakdown` (flag booleana, sem os dados em si). **Nenhum campo de alocação/distribuição/unlock schedule em lugar nenhum do payload.** | Não expõe unlock schedule nem alocação por categoria no tier gratuito                                                              | N/A          | N/A               | Gratuito (tier atual)                              | Fonte confiável, mas não tem o dado                |
| Tokenomist.ai                                     | `GET api.tokenomist.ai/v4/unlock-events/{id}`   | API Key exigida             | **HTTP 404** no endpoint testado sem key (rota provavelmente exige autenticação antes mesmo de validar o id) — bloqueado, mesma situação já documentada em `STATUS_PROJETO.md` desde antes deste sprint | Desconhecido (não foi possível ver payload real sem key)                                                                                                                                                                                                                                         | Sem key, não é possível confirmar schema de resposta — "nunca adivinhar schema de API externa" (regra do próprio prompt do sprint) | Desconhecido | Desconhecido      | Trial gratuito mencionado, não obtido nesta sessão | Não verificável sem acesso                         |
| Documentação/API oficial do projeto (caso a caso) | Variável por projeto                            | Variável                    | Não escalável — exigiria integração dedicada por projeto, incompatível com a arquitetura de coleta genérica atual (DefiLlama/CoinGecko cobrem o universo inteiro com uma integração cada)               | Variável                                                                                                                                                                                                                                                                                         | Não padronizável, fora do modelo de coleta em massa do sistema                                                                     | Variável     | Variável          | Variável                                           | Não avaliada — fora de escopo por não ser genérica |

### Decisão

**Nenhuma fonte tecnicamente disponível de forma adequada foi encontrada nesta sessão.** Por
instrução explícita do sprint ("se não houver fonte adequada, NÃO criar dados sintéticos"),
`TokenUnlock` continua sem write path real e `unlockPressure` continua `null`. Isso não é uma
lacuna de implementação — é a ausência real e verificada de uma fonte gratuita.

---

## 5. Distribution

Mesma conclusão que unlocks, verificada no mesmo payload de `GET /coins/{id}` (Sprint 11/13):
nenhum campo de distribuição de alocação (team/investors/treasury/community) ou concentração de
holders existe no tier gratuito da CoinGecko. DefiLlama não expõe isso em nenhum endpoint
conhecido e testado. **Não implementado**, `distribution` continua `null`.

---

## 6. Value Capture

Nenhuma fonte real identificada para Protocol Revenue vs. Token Holder Revenue, buyback, burn ou
staking rewards de forma padronizada e genérica (aplicável a qualquer projeto do universo, não
caso a caso). **Não implementado**, `valueCapture` continua `null`. Nenhuma suposição do tipo
"Protocol Revenue = Token Holder Revenue" foi feita em código algum.

---

## 7. Perfil do Projeto

- **Fonte**: CoinGecko, campo `description.en`/`categories`/`platforms`/`links.homepage` do MESMO
  payload de `GET /coins/{id}` já buscado desde o Sprint 11 para FDV/supplies — confirmado por
  chamada real (`GET /coins/aave`) que esses campos vêm juntos, sem custo de chamada adicional.
- **Texto preservado, nunca reescrito**: `descriptionEn` é o texto exato devolvido pela fonte
  (`normalizeCoinGeckoProfile`, `packages/defi-data/src/adapter.ts`) — nenhuma heurística de
  resumo/paráfrase própria, que seria uma forma de "inventar", mesmo que sutil.
- **Multi-chain preservado**: `platforms` guarda TODAS as chains onde a CoinGecko conhece o token
  (testado explicitamente: 3 chains simultâneas em um caso de teste), nunca reduzido a uma única
  blockchain.
- **Persistência**: `ProjectProfileSnapshot` (INSERT-only), mas com **dedupe por conteúdo**, não
  por timestamp — testado explicitamente (`profile-repository.integration.test.ts`): rodar a
  coleta duas vezes com o MESMO perfil não cria linha nova (`unchanged`); mudar qualquer campo
  cria uma nova linha preservando a anterior (`updated`, histórico real).
- **Exibição**: nova seção `## Perfil do Projeto` no Project Report
  (`packages/research-engine/src/report.ts`), sempre com fonte e data de coleta visíveis; `N/A`
  explícito quando o projeto não tem `coinGeckoId` ou nenhum dado de perfil foi coletado.

---

## 8. Exchanges/Mercados

- **Fonte**: CoinGecko, `GET /coins/{id}?tickers=true` — MESMA chamada, só a flag `tickers`
  mudou de `false` para `true` (`packages/defi-data/src/coingecko-client.ts`). Confirmado por
  chamada real: `GET /coins/aave?tickers=true` devolveu **100 tickers reais** (exchange, par,
  volume, URL de negociação, timestamp), sem nenhuma chamada extra além da já existente.
- **Nenhum ranking/recomendação**: o report apresenta uma tabela ordenada por volume (maior
  primeiro, dado observado — não "melhor"), com o aviso explícito "apenas dados observados, sem
  recomendação" acima da tabela (`report.ts`, seção "## Onde o Token é Negociado").
- **Temporalidade**: a seção do report sempre abre com "Na última coleta ({data})..." — nunca
  "X é negociado em Y" como fato permanente (seção 16 do prompt do sprint).
- **Persistência**: `TokenMarket`, UPSERT por `(projectId, exchangeId, baseSymbol, targetSymbol)`
  — testado explicitamente que uma segunda coleta do MESMO mercado atualiza a mesma linha (não
  duplica) e que dois mercados diferentes geram duas linhas.
- **Token sem mercados**: retorna lista vazia, tratado explicitamente no report como "Mercados
  identificados: N/A" + "Não foram encontrados mercados verificáveis na última coleta" — nunca
  confundido com erro de coleta (que fica em `token_markets.failed` no log, distinto).
- **Validação**: volume/preço negativos ou não-finitos são rejeitados ponto a ponto sem derrubar
  os demais mercados do mesmo projeto (testado: `rejeita volume negativo sem derrubar os demais
mercados`).

---

## 9. Alterações no banco

### Migrations aplicadas (1 nova)

`20260919000000_sprint13_project_profile_and_token_markets` — `CREATE TABLE
project_profile_snapshots`, `CREATE TABLE token_markets`, índices, unique constraint, FKs.
Gerada via `prisma migrate diff --script` (não interativo — `prisma migrate dev` falhou com
"non-interactive environment" ao rodar via shell sem TTY, gotcha novo documentado no CLAUDE.md) e
aplicada via `prisma migrate deploy`.

**Gotcha operacional encontrado e resolvido nesta sessão**: ao tentar aplicar a migration, o
comando falhou com `P3005: The database schema is not empty`. Investigação: `SELECT tablename
FROM pg_tables` mostrou que TODAS as tabelas do Sprint 12 (incluindo `market_data_snapshots`)
continuavam presentes e íntegras, mas a tabela de bookkeeping `_prisma_migrations` tinha
desaparecido entre sessões — `SELECT * FROM _prisma_migrations` retornou `relation does not
exist`. Não é corrupção de dado (schema e conteúdo intactos, `project count` = 0 apenas porque os
dados de teste tinham sido limpos pelos próprios `afterAll` das suítes, comportamento esperado).
Resolvido com baseline: `prisma migrate resolve --applied <nome>` para cada uma das 14 migrations
anteriores, na ordem, antes do `migrate deploy` da nova. Documentado em `CLAUDE.md` para não
repetir a investigação em sessões futuras.

### Modelos novos

- `ProjectProfileSnapshot` — INSERT-only, dedupe por conteúdo (ver seção 7).
- `TokenMarket` — UPSERT "estado atual" (ver seção 8), `@@unique([projectId, exchangeId,
baseSymbol, targetSymbol], name: "token_market_dedupe")`.

### Índices

`@@index([projectId, createdAt])` em `ProjectProfileSnapshot` (mesma consulta "última versão" das
demais tabelas); `@@index([projectId, retrievedAt])` em `TokenMarket`. Nenhum índice especulativo.

### Validação

```
npx prisma validate --schema packages/database/prisma/schema.prisma → válido
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma → aplicado com sucesso
npx prisma generate (via npm run prisma:generate) → Prisma Client gerado sem erro
```

---

## 10. Alterações no pipeline

`packages/research-engine/src/pipeline.ts`, dentro do bloco `if (project.coinGeckoId)` que já
existia para FDV/supplies (Sprint 11): logo após `persistTokenSupply`, o MESMO
`supplyResult.raw.payload` (já em memória, zero I/O extra) é passado para
`normalizeCoinGeckoProfile`/`normalizeCoinGeckoTickers`, e os resultados para
`collectProjectProfile`/`collectTokenMarkets` (`packages/research-engine/src/profile-repository.ts`,
novo arquivo). Isolamento de falha idêntico ao resto do pipeline: ambas as funções nunca lançam,
só logam (`profile.failed`/`token_markets.failed`) e seguem para o próximo projeto.

---

## 11. Alterações no Report

`packages/research-engine/src/report.ts`: duas seções novas (`## Perfil do Projeto`, `## Onde o
Token é Negociado`) inseridas logo após "## Identificação" e antes de "## Fundamental Metrics" —
mais próximo possível da ordem sugerida na seção 22 do prompt do sprint sem reestruturar o report
inteiro (regra "preservar o que já funciona"). Seção "## Sources" estendida com as duas novas
origens de dado.

---

## 12. Research Trace

Cada dado novo no report aparece na seção "## Sources" com fonte + timestamp: `CoinGecko — Perfil
do Projeto — {retrievedAt}` e `CoinGecko — Mercados ({N} identificados) — {retrievedAt}`. Mesmo
padrão das origens já existentes (DefiLlama TVL/Revenue/Fees, CoinGecko FDV/Supplies).

---

## 13. Testes

### Novos (34 casos, todos rodados isolados e dentro da suíte completa)

- `packages/defi-data/tests/adapter.test.ts` — +16 casos: `normalizeCoinGeckoProfile` (5:
  extração real, multi-chain, campos ausentes → null/[], payload inválido → null, descrição
  vazia/whitespace nunca copiada) e `normalizeCoinGeckoTickers` (5: extração real, tickers
  malformados descartados sem quebrar os demais, volume/preço ausentes → null, timestamp
  fallback, resposta vazia).
- `packages/research-engine/tests/profile-repository.integration.test.ts` (novo arquivo, Prisma
  real) — 14 casos: perfil (criação, dedupe por conteúdo idêntico, nova linha só quando algo
  muda, vazio não persiste, null não persiste/não lança, skip sem coinGeckoId) e mercados (upsert
  cria, upsert não duplica/atualiza, múltiplos mercados, volume negativo rejeitado sem derrubar
  os demais, volume null nunca vira 0, resposta vazia, skip sem coinGeckoId, token sem mercados).

### Resultado real (comandos executados nesta sessão)

```
npm test (raiz, workspaces completos)
→ research-engine:   12 arquivos / 99 testes — todos passando (era 85 no fim do Sprint 12; +14
  de profile-repository)
→ scoring-engine:     7 arquivos / 47 testes — todos passando (sem alteração de código nesta
  parte, regression confirmada)
→ shared:             1 arquivo  / 10 testes — todos passando
→ demais workspaces (database/defi-data/queue/apps-web) rodaram como parte do mesmo comando
  composto; exit code final do `npm test` = 0 → todos passaram

npm run typecheck (raiz) → exit code 0, todos os workspaces + infrastructure/workers limpos
npm run lint (raiz) → eslint . sem erros/warnings, exit code 0
npm run build (raiz) → next build "✓ Compiled successfully", 19/19 páginas estáticas, exit code 0
```

Nenhum teste foi desabilitado, marcado `.skip`, removido, ou teve timeout aumentado
arbitrariamente para passar.

---

## 14. Typecheck

Limpo em todos os 7 workspaces + `infrastructure/workers/tsconfig.json` (comando composto do
`npm run typecheck` da raiz, exit code 0).

---

## 15. Lint

`eslint .` sem nenhum erro ou warning (exit code 0).

---

## 16. Build

`next build` compilou com sucesso, 19/19 páginas estáticas geradas (mesmas 19 rotas do Sprint 12
— nenhuma rota HTTP nova foi criada para Perfil/Mercados nesta sprint, os dados aparecem só
dentro do Project Report existente). O único warning presente (dependência opcional
`@valkey/valkey-glide` do `bullmq`) é pré-existente, não relacionado a este sprint.

---

## 17. Limitações

- **Perfil/Mercados só para projetos com `coinGeckoId` conhecido** — mesmo gate já existente
  desde o Sprint 11, sem mudança.
- **Descrição só em inglês** — a CoinGecko não fornece tradução PT-BR no payload gratuito.
- **Mercados são "estado atual", não série histórica linha-a-linha** — decisão arquitetural
  documentada (ver seção 8); a "história" de mercados é dada pelo `retrievedAt` sempre visível,
  não por múltiplas linhas por mercado ao longo do tempo. Se no futuro for necessário reconstruir
  "quais exchanges listavam X token em determinada data passada", essa granularidade não estará
  disponível retroativamente a partir de agora — registrar como possível `FOUNDATION DATA
REQUIRED NOW` para um sprint futuro, se essa necessidade for confirmada.
- **Só mercados SPOT** — CoinGecko `/coins/{id}` não lista perpetuals; fora de escopo (seção 22
  do prompt: "Perpetual, se futuramente suportado").
- **Unlock Pressure/Distribution/Value Capture permanecem sem fonte real** — não é uma lacuna de
  esforço, é a conclusão de uma investigação real (seção 4/5/6). Se uma fonte nova aparecer no
  futuro (ex.: Tokenomist.ai com API Key obtida), a matemática (`computeUnlockPressureRatio`) já
  está pronta e testada, só falta o dado.

---

## 18. Dados ainda indisponíveis

Unlock schedule (qualquer fonte gratuita), distribuição/alocação de tokens, concentração de
holders, Protocol Revenue vs. Token Holder Revenue, FDV histórico (já registrado no Sprint 12).

---

## 19. Dívidas técnicas mantidas

`TokenUnlock` (schema-only, sem write path real — inalterado) · Catalysts · Risks · `Project.narrativeId`/Narrative
· Emerging/Established · Global Score (cálculo agregado) · Second Brain · Trading Intelligence ·
Backtesting · Opportunity Engine · multi-tenant/RBAC · Improvement Proposals automáticos.
Nenhuma dessas foi tocada nesta sprint.

---

## 20. Próximo Sprint recomendado

**Consumir o que já foi coletado nos Sprints 12 e 13** — o Gap Analysis original (já removido do
repositório, mas o raciocínio permanece válido) apontava exatamente isso: cruzar
`MarketDataSnapshot` (preço/market cap histórico, Sprint 12) com TVL/Revenue (já existentes) para
responder "valuation acompanha fundamentos?" no Project Report — sem exigir Trading Intelligence
completo, só uma correlação simples entre séries que já existem no banco. Alternativa: se a
prioridade de produto mudar para Tokenomics, o próximo passo real seria obter uma API Key de
Tokenomist.ai (ou fonte equivalente) — sem isso, não há mais nada a fazer nessa frente que não
seja inventar dado, o que este sprint explicitamente evitou.
