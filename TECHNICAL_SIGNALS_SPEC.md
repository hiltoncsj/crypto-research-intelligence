# TECHNICAL_SIGNALS_SPEC.md

> Criado em 2026-09-24. Documenta uma decisão de escopo que **reverte** uma decisão anterior
> (ver `CLAUDE.md` — Pine Script/TradingView estava listado como fora de escopo; deixou de estar).
> Este documento é a fonte normativa desta frente; não repete o que já está no
> `Crypto_Research_Intelligence_Master_Roadmap.md` nem no `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`,
> que continuam descrevendo só o Fundamental Intelligence.

## 1. O que é

Um agente de construção de indicadores técnicos em Pine Script (TradingView), guiado
incrementalmente pelo usuário a partir de um curso externo (Paul D. Mendes — _Learn TradingView
Pine Script Programming From Scratch_). O usuário transcreve o áudio do curso, consolida em PDF e
escreve prompts passo a passo pedindo a construção de cada indicador/sinal. O agente:

1. Gera o código Pine Script correspondente.
2. Quando há conta TradingView paga com alertas/webhooks configurados, conecta o sinal a um
   alerta que dispara notificação.
3. Envia a notificação de entrada/saída via **Telegram** (bot próprio do projeto).

## 2. Por que isso é uma decisão durável e não um recurso qualquer

A plataforma inteira (`Crypto_Research_Intelligence_Master_Roadmap.md`,
`CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`, e o `CLAUDE.md`) foi desenhada com uma linha vermelha
explícita: **Fundamental Intelligence, nunca Trading** — sem RSI/MACD/sinal de compra-venda
misturado ao Score. Essa linha continua valendo para o Fundamental Intelligence. O que mudou é
que agora existe, **ao lado**, um produto técnico deliberadamente separado — não uma exceção
silenciosa à regra antiga, mas uma segunda frente com seu próprio contrato.

## 3. Isolamento (regra que não pode ser violada)

- **Nunca** importar nada de `packages/technical-signals` (ou onde este módulo viver) dentro de
  `packages/scoring-engine`, `packages/research-engine/src/fundamental-context.ts`, ou qualquer
  rota que sirva o Fundamental/Tokenomics/Institutional Capital Score.
- **Nunca** escrever em `FundamentalScore`, `TokenomicsScore`, `InstitutionalCapitalScore`, nem
  em nenhuma tabela de scoring existente.
- O único ponto de contato com o resto do monorepo é **leitura** do histórico de seleção
  (`ResearchRunSelection` via `apps/web/src/lib/research.ts:listProjectsWithData`, já implementado
  para a página `dashboard/research`) — este módulo nunca decide sozinho quais projetos analisar;
  ele herda o universo já selecionado pelo Priority Score do Fundamental Intelligence
  (`packages/scoring-engine/src/priority.ts`).
- Sem dado sintético aqui também: um alerta só dispara a partir de um sinal real calculado pelo
  indicador (Pine Script rodando de fato no TradingView), nunca simulado/inventado no backend.

## 4. Arquitetura proposta (esqueleto, a confirmar antes de escrever código de indicador)

```
packages/technical-signals/         ← novo workspace npm, sem dependência de scoring-engine
  src/
    pine/                           ← templates/geradores de código Pine Script (texto, não executa aqui)
    telegram/                       ← bot + envio de mensagens de entrada/saída
    universe.ts                     ← lê ResearchRunSelection (read-only) para saber quais projetos têm indicador ativo
```

- **Pine Script não roda no nosso backend** — TradingView é quem executa o indicador de verdade.
  O que este módulo gera é o **código-fonte** `.pine` (para colar manualmente, opção do usuário)
  e, quando a integração com webhook/alerta da conta paga existir, o **payload do alerta** que o
  TradingView dispara para o nosso endpoint.
- **Endpoint de recebimento de webhook do TradingView** (a implementar quando a conta paga e os
  alertas estiverem configurados): rota HTTP fina que só valida o payload e repassa para o envio
  Telegram — mesmo padrão de camadas do resto do projeto (rota fina → serviço → nada de lógica de
  indicador aqui, essa lógica vive inteira dentro do próprio Pine Script).
- **Telegram**: bot próprio do projeto, token novo em `.env` (nunca reaproveitar
  `MASTER_ENCRYPTION_KEY`/segredos existentes). Nome de variável e formato de mensagem a definir
  quando a primeira integração for implementada.

## 5. Fluxo de trabalho de construção dos indicadores

Cada indicador é construído em uma sessão, guiada por um prompt do usuário derivado do PDF do
curso. O agente:

1. Recebe o passo a passo (via prompt do usuário, nunca lendo o PDF/curso original diretamente
   como fonte — o usuário já traduziu em instrução).
2. Traduz para Pine Script versionado (comentário no topo do arquivo indicando de qual etapa do
   curso veio, sem citar conteúdo do curso além do necessário para entender o indicador).
3. Adiciona/atualiza o gerador correspondente em `src/pine/`.
4. Não assume automaticamente que o indicador deve virar um alerta Telegram — isso é decidido
   projeto a projeto, quando o usuário confirmar que quer aquele sinal específico monitorado.

## 6. O que NÃO fazer

- Não misturar este módulo com o Fundamental Score, Tokenomics Score ou Institutional Capital
  Score — mesmo que pareça conveniente reaproveitar alguma tabela existente.
- Não implementar execução de Pine Script no nosso backend (não existe runtime Pine Script fora
  do TradingView) — este módulo só gera código-fonte e processa webhooks/alertas.
- Não gerar sinal de compra/venda sem que o indicador em Pine Script realmente exista e tenha
  sido validado no TradingView — sem dado sintético, mesma regra do resto do projeto.
- Não expandir escopo para múltiplos indicadores de uma vez — construção é incremental, um
  indicador por vez, seguindo os prompts do usuário.

## 7. Estado atual

Nada implementado ainda além deste documento e da decisão de escopo registrada no `CLAUDE.md`.
Próximo passo: usuário traz o primeiro prompt (primeiro indicador do curso) para começar a
implementação real do esqueleto acima.
