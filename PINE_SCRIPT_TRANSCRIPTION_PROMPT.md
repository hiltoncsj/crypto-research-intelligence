# PINE_SCRIPT_TRANSCRIPTION_PROMPT.md

> Prompt para uso no ChatGPT — não é parte do produto, é uma ferramenta de trabalho para gerar
> a base de conhecimento (`.md` cumulativo, aula a aula) do curso "Learn TradingView Pine Script
> Programming From Scratch" (Paul D. Mendes). O `.md` resultante alimenta os prompts de
> construção de indicadores em `TECHNICAL_SIGNALS_SPEC.md`. Copie o bloco abaixo e cole no
> ChatGPT antes de mandar a primeira transcrição.

```
Você vai me ajudar a transformar as transcrições de áudio das aulas do curso "Learn
TradingView Pine Script Programming From Scratch" (Paul D. Mendes) em um único arquivo
Markdown cumulativo, que crescerá aula a aula. Este arquivo será a fonte que eu uso depois
para escrever prompts de construção de indicadores para um agente de programação (Claude
Code) — então precisão e completude importam mais do que economia de espaço.

## Como você deve processar cada transcrição que eu enviar

1. NUNCA resuma de forma que perca informação técnica. Se a aula descreve sintaxe, uma
   função, um parâmetro, um valor padrão, uma armadilha ("isso não funciona se..."), ou uma
   ordem de execução específica do Pine Script — tudo isso precisa aparecer explicitamente
   no Markdown, não parafraseado de forma vaga.
2. Separe claramente TEORIA (conceito sendo ensinado) de CÓDIGO (qualquer trecho de Pine
   Script mencionado, mesmo que a transcrição só descreva o código falado em vez de mostrar
   texto literal — nesse caso, reconstrua o código mais provável a partir da descrição falada
   e marque como "[reconstruído a partir da narração, conferir contra a aula]").
3. Sempre que a aula mencionar uma versão do Pine Script (v4, v5, v6...), registre isso
   explicitamente — não assuma, não silenciosamente atualize para a versão mais nova.
4. Se a aula contradiz ou corrige algo dito em uma aula anterior do mesmo curso, sinalize
   isso como "⚠️ Atualiza [Aula X]: ..." em vez de simplesmente substituir silenciosamente.
5. Não invente nada que não esteja na transcrição. Se a transcrição estiver ambígua ou
   incompleta em algum ponto, marque com "[TRECHO INCERTO — conferir com o áudio original]"
   em vez de preencher a lacuna com suposição.

## Estrutura do arquivo Markdown (mantenha esta estrutura em TODA atualização)

# Pine Script — Base de Aulas (Paul D. Mendes)

## Índice de Progresso
- [x] Aula 01 — <título curto> — <data em que processei>
- [x] Aula 02 — <título curto> — <data em que processei>
- [ ] Aula 03 — (ainda não recebida)
...
(Marque com [x] as aulas já incorporadas, mantenha a lista sempre com TODAS as aulas do
curso, mesmo as que ainda não processei — se eu não te disse o índice completo do curso,
pergunte antes de continuar.)

## Glossário Acumulado
(Termos técnicos de Pine Script introduzidos até agora, definição curta, e em qual aula
apareceu pela primeira vez. Atualize este glossário a cada nova aula, sem duplicar
entradas — se um termo já existe, só adicione a aula nova como referência adicional se ele
for reforçado/expandido lá.)

## Funções e Palavras-chave Cobertas
(Tabela: Nome da função/keyword | Assinatura/parâmetros | O que faz | Aula onde foi
ensinada | Exemplo de uso mínimo)

## Aula NN — <Título>

### Contexto
(Onde essa aula se encaixa no curso — o que ela assume que você já sabe, o que ela
prepara para a próxima aula, se disse isso explicitamente na transcrição.)

### Conceitos Ensinados
(Lista dos conceitos novos, cada um com explicação completa — não é um resumo de uma
linha, é a explicação real dada na aula.)

### Código Apresentado
(Todo trecho de Pine Script mencionado na aula, em bloco de código, com comentário
explicando o que cada parte faz. Se o código foi construído incrementalmente durante a
aula, mostre as versões intermediárias também, não só a final.)

### Erros/Armadilhas Mencionados
(Qualquer coisa que o instrutor tenha dito como "cuidado com isso", "erro comum",
"isso não funciona se...")

### Exercício/Desafio Proposto (se houver)
(O enunciado exato do desafio, se a aula propuser um.)

### Perguntas em Aberto
(Qualquer coisa que ficou pouco clara na transcrição e que eu deveria confirmar antes de
pedir para construir esse indicador de verdade.)

---

## Como vamos trabalhar

- Eu vou te mandar uma transcrição de cada vez, identificando o número/nome da aula.
- Você me devolve SÓ a seção "## Aula NN — <Título>" daquela aula, pronta para eu colar no
  arquivo acumulado — não precisa reescrever o arquivo inteiro toda vez, a menos que eu
  peça explicitamente uma consolidação completa.
- Depois de cada aula nova, também me devolva separadamente:
  (a) as entradas NOVAS que devem entrar no Glossário Acumulado,
  (b) as entradas NOVAS que devem entrar na tabela de Funções e Palavras-chave,
  (c) se essa aula atualiza/corrige algo de uma aula anterior, me diga exatamente o quê.
- Quando eu pedir "consolide o arquivo até aqui", você junta tudo que já processamos numa
  única entrega seguindo a estrutura acima, do zero, sem perder nada das aulas anteriores.
- Se eu mandar uma transcrição fora de ordem (ex: aula 7 antes da aula 5), me avise e
  pergunte se devo aguardar as intermediárias ou processar mesmo assim.

Confirme que entendeu o processo e me pergunte o índice completo de aulas do curso (todos
os títulos, mesmo que eu ainda não tenha te mandado as transcrições) antes de começarmos,
para você já montar o Índice de Progresso completo.
```
