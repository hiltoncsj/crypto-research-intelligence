# Crypto Research Intelligence — Kanban Pull System

## Objetivo

Definir a arquitetura e os princípios operacionais do Kanban do **Crypto Research Intelligence**, com foco em fluxo puxado (_Pull System_), controle de WIP, redução de filas, identificação de gargalos e integração futura com Research Runs, agentes e Second Brain.

Este documento deve ser tratado como referência para a implementação da **Etapa/Sprint 7 — Kanban**.

---

## 1. Princípio central

O Kanban do Crypto Research Intelligence deve utilizar um **sistema puxado (Pull System)**.

> **Uma etapa só deve iniciar ou receber novo trabalho quando houver capacidade disponível na etapa seguinte.**

O objetivo não é maximizar a quantidade de trabalho iniciado, mas manter um fluxo contínuo, equilibrado e sustentável.

### Sistema empurrado — evitar

```text
Etapa A produz o máximo possível
        ↓
empurra para B
        ↓
B fica congestionada
        ↓
empurra para C
        ↓
C vira gargalo
        ↓
filas + espera + desperdício
```

### Sistema puxado — desejado

```text
Etapa C possui capacidade
        ↑
puxa trabalho de B
        ↑
B libera capacidade
        ↑
puxa trabalho de A
        ↑
A libera capacidade
```

O trabalho deve avançar porque existe capacidade real para recebê-lo.

---

## 2. Aplicação ao Crypto Research Intelligence

Fluxo conceitual inicial:

```text
DISCOVERY
    ↓
ANÁLISE
    ↓
VALIDAÇÃO
    ↓
REVISÃO
    ↓
FINALIZADO
```

Fluxo futuro possível:

```text
Discovery
    ↓
Fundamental Analysis
    ↓
Tokenomics
    ↓
Capital / Funding
    ↓
Catalysts
    ↓
Valuation
    ↓
Risk Review
    ↓
Second Brain
    ↓
Final Research
    ↓
Published
```

A implementação inicial não deve assumir que todas essas etapas já existem.

---

## 3. WIP Limits

Cada coluna intermediária deve possuir um **WIP Limit (Work In Progress Limit)**.

Exemplo:

```text
Escrever
WIP = 1

Revisar
WIP = 2

Publicar
WIP = 2
```

Se uma coluna atingir seu limite:

```text
REVISÃO
2 / 2
```

ela não pode receber um novo item.

O WIP Limit é uma **regra operacional**, não apenas uma informação visual.

---

## 4. Separação entre Em Andamento e Pronto

Etapas intermediárias devem poder ser divididas em:

```text
EM ANDAMENTO
PRONTO
```

Exemplo:

```text
REVISÃO

EM ANDAMENTO
└── Card A

PRONTO
└── Card B
```

Isso permite distinguir:

- trabalho atualmente executado;
- trabalho concluído naquela etapa;
- trabalho aguardando a próxima etapa;
- capacidade disponível.

---

## 5. Regra de Pull

Cada responsável por uma etapa deve:

> **Puxar um cartão pronto da etapa anterior quando houver capacidade disponível.**

Fluxo:

```text
Existe capacidade?
      │
     SIM
      ↓
Existe item pronto à esquerda?
      │
     SIM
      ↓
Puxar item
      ↓
Trabalhar
```

Se não houver capacidade:

```text
NÃO INICIAR NOVO ITEM
```

---

## 6. Exemplo prático

Suponha:

```text
ESCREVER
WIP = 1

REVISÃO
WIP = 2

PUBLICAÇÃO
WIP = 1
```

Inicialmente existem vários itens não iniciados.

O responsável por escrever puxa apenas um:

```text
ESCREVER — EM ANDAMENTO
Artigo 1
```

Com WIP 1, ele não inicia o Artigo 2 simultaneamente.

Ao concluir:

```text
ESCREVER
└── PRONTO
    Artigo 1
```

O revisor, se tiver capacidade, puxa o Artigo 1:

```text
REVISÃO
└── EM ANDAMENTO
    Artigo 1
```

A capacidade de escrita fica novamente disponível e o escritor pode puxar o Artigo 2.

---

## 7. Gargalo

Se uma etapa estiver cheia:

```text
REVISÃO
2 / 2
```

e surgir:

```text
Artigo 3 — pronto para revisão
```

o artigo permanece pronto na etapa anterior até existir capacidade.

O sistema deve identificar essa situação como possível **gargalo/capacidade saturada**.

---

## 8. Quando a próxima etapa está saturada

Se a etapa seguinte estiver cheia, a etapa atual deve evitar iniciar trabalho adicional que apenas aumentaria a fila.

O executor poderá:

- trabalhar em melhoria;
- corrigir bloqueios;
- ajudar outra etapa, quando permitido;
- executar atividade de suporte;
- aguardar capacidade.

O objetivo é privilegiar o fluxo, não a ocupação artificial de cada agente.

---

## 9. Propagação de capacidade

A capacidade liberada deve poder se propagar pelo fluxo:

```text
REVISÃO libera 1 vaga
        ↓
VALIDAÇÃO pode puxar 1 item
        ↓
VALIDAÇÃO libera 1 vaga
        ↓
ANÁLISE pode puxar 1 item
        ↓
ANÁLISE libera 1 vaga
        ↓
DISCOVERY pode puxar 1 item
```

Assim, o fluxo é conduzido pela capacidade existente.

---

## 10. Estados dos Cards

Estados mínimos:

```text
READY
IN_PROGRESS
BLOCKED
DONE
```

### READY

Item pronto para ser puxado pela próxima etapa.

### IN_PROGRESS

Item atualmente em trabalho.

### BLOCKED

Item impedido de avançar por alguma dependência.

### DONE

Etapa concluída.

---

## 11. Kanban e Agentes

O sistema possui agentes automatizados. O Kanban deve identificar:

```text
Executor:
- Human
- Agent
- System
```

Quando aplicável:

```text
Agent:
- Research Agent
- Validation Agent
- Review Agent
- Second Brain
```

O Kanban não deve presumir que todos os executores são humanos.

---

## 12. Kanban e Research Run

Cards devem poder ser associados a:

```text
researchRunId
projectId
agentId
```

Exemplo:

```text
Research Run #125
    ↓
Project A
    ↓
Fundamental Analysis
    ↓
Kanban Card
```

Isso permitirá rastrear o caminho completo da pesquisa.

---

## 13. Histórico de movimentação

Toda movimentação relevante deve ser registrada.

Exemplo:

```text
Card #123

09:00
Discovery → Analysis
Executor: Research Agent

09:15
Analysis → Validation
Executor: Analysis Agent

09:20
Validation → Blocked
Motivo: dados insuficientes

10:10
Blocked → Validation
Motivo: dados corrigidos

10:30
Validation → Review
Executor: Validation Agent
```

O histórico deve permitir reconstruir o fluxo.

---

## 14. Auditoria

Registrar:

- card;
- origem;
- destino;
- executor;
- timestamp;
- motivo;
- Research Run;
- agente, quando aplicável.

Isso será importante para o futuro Second Brain.

---

## 15. Métricas do Kanban

O sistema deverá futuramente medir:

### WIP

Quantidade de itens em andamento.

### Cycle Time

Tempo entre início do trabalho e conclusão.

### Lead Time

Tempo entre entrada no fluxo e conclusão.

### Waiting Time

Tempo aguardando capacidade ou dependência.

### Throughput

Quantidade de itens concluídos por período.

### Blocked Time

Tempo em estado bloqueado.

### WIP Utilization

Utilização do limite de cada etapa.

---

## 16. Identificação de Gargalos

O Dashboard deverá conseguir identificar situações como:

```text
VALIDAÇÃO
WIP 5 / 5
↑
GARGALO
```

e:

```text
REVISÃO
WIP 2 / 2
↑
CAPACIDADE SATURADA
```

O preenchimento do WIP, isoladamente, não deve ser considerado automaticamente um problema. Devem ser observados também:

- tempo de permanência;
- tempo bloqueado;
- throughput;
- frequência de saturação.

---

## 17. Backpressure

O sistema deve permitir **backpressure**.

Quando uma etapa posterior estiver saturada:

```text
Review = 100%
```

as etapas anteriores devem reduzir ou interromper a produção de novos itens que não possam avançar.

Conceitualmente:

```text
Review saturado
      ↓
Validation desacelera
      ↓
Analysis desacelera
      ↓
Discovery desacelera
```

Isso evita grandes filas intermediárias.

---

## 18. Pull e BullMQ

O Kanban complementa o sistema de filas do Sprint 4.

BullMQ representa a execução técnica:

```text
ResearchRun
    ↓
BullMQ
    ↓
Worker
```

Kanban representa o fluxo operacional:

```text
Discovery
    ↓
Analysis
    ↓
Validation
    ↓
Review
```

Não confundir:

- **Queue** = mecanismo técnico de execução;
- **Kanban** = controle visual e operacional do fluxo.

---

## 19. Scheduler + Kanban

O Scheduler não deve simplesmente criar trabalhos ilimitados.

Conceitualmente:

```text
Scheduler
    ↓
Research Run
    ↓
Kanban Capacity Check
    ↓
Existe capacidade?
    ├── SIM → Pull / iniciar
    └── NÃO → aguardar
```

A integração definitiva será definida na implementação do Kanban.

---

## 20. Full vs Incremental

O Kanban deve suportar:

```text
FULL
INCREMENTAL
```

O card pode indicar o modo da Research Run associada.

---

## 21. Bloqueios

Cards podem ficar bloqueados por:

- dados ausentes;
- validação pendente;
- dependência externa;
- erro técnico;
- aprovação;
- revisão;
- falta de capacidade;
- outra pesquisa;
- dependência de outro agente.

Todo bloqueio deve possuir motivo quando possível.

---

## 22. Blocked ≠ WIP

Um item bloqueado não deve ser tratado automaticamente como trabalho ativo.

O sistema deve distinguir:

```text
IN_PROGRESS
```

de:

```text
BLOCKED
```

A regra exata de contagem de WIP deverá ser definida durante a implementação.

---

## 23. Pull entre subcolunas

Uma etapa pode possuir:

```text
EM ANDAMENTO
PRONTO
```

A próxima etapa puxa somente itens que estejam:

```text
PRONTO
```

Exemplo:

```text
ANÁLISE

EM ANDAMENTO
└── Project A

PRONTO
├── Project B
└── Project C
```

A próxima etapa pode puxar B ou C se possuir capacidade.

---

## 24. Regra contra multitarefa excessiva

O WIP Limit também deve impedir que um agente acumule vários trabalhos simultâneos.

Exemplo:

```text
Analysis WIP = 1
```

O agente deve concluir ou mover o trabalho antes de iniciar outro.

Isso reduz:

- troca de contexto;
- trabalho parcialmente concluído;
- espera;
- filas;
- desperdício.

---

## 25. Priorização

O Kanban poderá possuir:

```text
LOW
NORMAL
HIGH
URGENT
```

Prioridade não deve quebrar automaticamente os WIP Limits.

Um item urgente pode ser priorizado para o próximo Pull, mas não criar uma vaga adicional em uma coluna cujo limite é 2.

---

## 26. Kanban não é apenas uma tela

Não implementar apenas:

```text
drag and drop
```

sem regras.

A interface deve refletir:

- capacidade;
- WIP;
- Pull;
- bloqueios;
- dependências;
- agentes;
- Research Runs;
- histórico.

A lógica deve existir no backend e ser validada independentemente do frontend.

---

## 27. Dashboard Kanban

A interface deverá mostrar claramente:

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ DISCOVERY    │ ANALYSIS     │ VALIDATION   │ REVIEW       │
│ WIP 1/3      │ WIP 2/3      │ WIP 3/3      │ WIP 2/2      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Card A       │ Card B       │ Card D       │ Card F       │
│              │ Card C       │ Card E       │ Card G       │
│              │              │              │              │
│              │              │ SATURATED    │ SATURATED    │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

O usuário deve perceber rapidamente:

- onde estão os trabalhos;
- onde existe capacidade;
- onde existe saturação;
- quais itens estão bloqueados;
- quais itens estão prontos para Pull.

---

## 28. Capacidade

Exibir:

```text
WIP
2 / 3
```

significa:

```text
2 itens ocupados
1 vaga disponível
```

Enquanto:

```text
3 / 3
```

significa capacidade máxima.

---

## 29. Pull Action

Quando uma etapa tiver capacidade, poderá existir uma ação:

```text
Puxar próximo
```

ou o sistema poderá executar o Pull automaticamente conforme as regras dos agentes.

A ação deve respeitar:

- WIP;
- prioridade;
- estado;
- dependências;
- permissões.

---

## 30. Second Brain

O Second Brain deverá futuramente poder analisar:

- qual etapa está funcionando como gargalo;
- onde existe maior tempo de espera;
- qual agente está acumulando trabalho;
- qual etapa possui maior variação de Cycle Time;
- se os WIP Limits são adequados;
- se existe trabalho sendo iniciado antes da capacidade existir;
- quais cards estão bloqueados por muito tempo;
- se o fluxo está realmente funcionando como Pull.

O Kanban deve registrar dados suficientes para permitir essas análises.

---

## 31. Melhoria contínua

O objetivo não é apenas manter o quadro organizado.

O sistema deve permitir:

```text
problema
    ↓
medição
    ↓
análise
    ↓
ajuste
    ↓
novo comportamento
    ↓
medição
```

Exemplo:

```text
Validation WIP = 3
Cycle Time crescente
Blocked Time elevado
        ↓
possível gargalo
        ↓
Second Brain analisa
        ↓
proposta de melhoria
```

Não alterar automaticamente WIP Limits sem regras explícitas.

---

## 32. Integração futura com Opportunity Engine

Posteriormente:

```text
Opportunity Engine
        ↓
Discovery
        ↓
Research
        ↓
Validation
        ↓
Second Brain
        ↓
Final Research
```

Não implementar Opportunity Engine na primeira versão do Kanban.

---

## 33. Integração futura com Backtesting

O histórico de:

- entrada;
- saída;
- tempo;
- Score;
- Research Run;
- estado;
- evidências

poderá futuramente ser usado para análise histórica.

Não implementar Backtesting nesta etapa.

---

## 34. Referência visual obrigatória

Existe no projeto:

```text
designer_system/
```

e:

```text
designer_system/designer-system.html
```

Antes de implementar a UI do Kanban:

1. localizar o arquivo;
2. abrir e analisar;
3. identificar tipografia;
4. identificar espaçamentos;
5. identificar cards;
6. identificar bordas;
7. identificar radius;
8. identificar sombras;
9. identificar cores;
10. identificar tabelas;
11. identificar hierarquia visual;
12. seguir os componentes existentes.

Não criar um novo Design System paralelo.

---

## 35. Regra visual sobre mouse

**NÃO adicionar efeitos visuais relacionados ao movimento do mouse.**

Não implementar:

- mouse tracking;
- cursor glow;
- spotlight seguindo cursor;
- cards seguindo cursor;
- tilt 3D;
- parallax de mouse;
- gradientes seguindo cursor;
- efeitos magnéticos;
- animações baseadas na posição do mouse.

Também não adicionar efeitos decorativos de hover que não façam parte do `designer-system.html`.

A interface deve ser:

```text
limpa
estável
previsível
profissional
orientada a dados
```

---

## 36. Princípios que não devem ser violados

1. Não criar filas artificialmente.
2. Não ignorar WIP Limits.
3. Não transformar Kanban em simples Drag & Drop.
4. Não permitir Push indiscriminado.
5. Não tratar capacidade como mera informação visual.
6. Não ocultar bloqueios.
7. Não apagar histórico de movimentação.
8. Não perder relação com Research Run.
9. Não criar sistema paralelo ao BullMQ.
10. Não depender exclusivamente do frontend para aplicar as regras.

---

## 37. Resumo operacional

```text
                 CAPACIDADE
                     │
                     ▼
              ┌─────────────┐
              │   REVIEW    │
              │    2 / 2    │
              └──────┬──────┘
                     │
                    PULL
                     │
              ┌──────▼──────┐
              │ VALIDATION  │
              │    2 / 3    │
              └──────┬──────┘
                     │
                    PULL
                     │
              ┌──────▼──────┐
              │   ANALYSIS  │
              │    1 / 3    │
              └──────┬──────┘
                     │
                    PULL
                     │
              ┌──────▼──────┐
              │  DISCOVERY  │
              │    1 / 3    │
              └─────────────┘
```

A capacidade das etapas à direita conduz o fluxo.

---

## 38. Princípio final

O Kanban do Crypto Research Intelligence deve buscar:

```text
menos filas
+
menos espera
+
menos multitarefa
+
menos desperdício
+
mais fluxo
+
mais previsibilidade
+
mais transparência
+
melhor utilização da capacidade
```

A ideia central:

> **Não produza trabalho apenas porque existe capacidade para produzir. Produza quando o fluxo tiver capacidade para recebê-lo.**

Operacionalmente:

```text
A etapa seguinte puxa.
A etapa anterior responde.
O WIP limita.
O fluxo determina o ritmo.
```

---

## Referências para a Etapa 7

Utilizar este documento junto com:

- `Crypto_Research_Intelligence_Master_Roadmap.md`
- `CRYPTO_RESEARCH_IMPLEMENTATION_PLAN.md`
- `designer_system/designer-system.html`

Na implementação da Etapa 7, o Claude Code deverá primeiro auditar esses documentos e o código existente.

**Este arquivo define os princípios e requisitos conceituais do Kanban Pull System.**

---

# 39. Princípios Fundamentais do Kanban Aplicados ao Crypto Research Intelligence

Esta seção complementa o documento com princípios extraídos do material de estudo fornecido, adaptando-os ao contexto do **Crypto Research Intelligence**.

> **Nota de terminologia:** o texto transcrito utiliza algumas ocorrências incorretas de “Kahneman”/“Kamban”. Para este documento, o conceito é tratado como **Kanban**.

## 39.1 Começar com o que existe hoje

O Kanban não deve exigir que o Crypto Research Intelligence seja reconstruído para se adequar à metodologia.

A implementação deve começar pelo fluxo que já existe:

```text
processo atual
     ↓
visualização
     ↓
medição
     ↓
identificação de gargalos
     ↓
pequenas melhorias
     ↓
novo estado do fluxo
     ↓
medição novamente
```

Isso significa que, antes de criar novas etapas, agentes, papéis ou estados, o sistema deve perguntar:

- Como o trabalho é realizado atualmente?
- Onde o trabalho começa?
- Quais etapas já existem?
- Quem ou qual agente executa cada etapa?
- Quais ferramentas já são utilizadas?
- Onde o trabalho espera?
- Onde surgem bloqueios?
- Onde existe retrabalho?
- Onde existe excesso de WIP?

O objetivo é **mapear e otimizar**, e não impor uma estrutura artificial.

## 39.2 Melhoria contínua

O Kanban deve ser tratado como um sistema de evolução contínua.

O Crypto Research Intelligence deve permitir o ciclo:

```text
OBSERVAR
   ↓
MEDIR
   ↓
IDENTIFICAR PROBLEMA
   ↓
FORMULAR HIPÓTESE
   ↓
IMPLEMENTAR PEQUENA MUDANÇA
   ↓
MEDIR RESULTADO
   ↓
APRENDER
   ↓
AJUSTAR
   ↺
```

Uma melhoria não deve ser considerada permanente apenas porque parece boa. Sempre que possível, deve existir evidência de que a mudança melhorou o fluxo.

### Aplicação prática

O Second Brain poderá futuramente analisar:

- aumento de Lead Time;
- aumento de Waiting Time;
- crescimento de WIP;
- aumento de itens bloqueados;
- concentração de trabalho em determinada etapa;
- queda de Throughput;
- aumento de retrabalho;
- aumento de falhas de validação;
- excesso de intervenções manuais;
- desequilíbrio entre capacidade e demanda.

A partir disso, poderá propor **Improvement Proposals**.

---

# 40. Respeitar Processos e Responsabilidades Existentes

O Kanban do Crypto Research Intelligence deve se adaptar à arquitetura existente.

Não criar cargos artificiais apenas para representar etapas do Kanban.

Uma coluna pode ser executada por:

- humano;
- agente de IA;
- serviço automatizado;
- combinação humano + agente;
- integração externa.

O Kanban representa **o fluxo do trabalho**, não necessariamente a estrutura organizacional.

Exemplo:

```text
DISCOVERY
   │
   └── Research Agent

ANALYSIS
   │
   └── Fundamental Agent

VALIDATION
   │
   └── Validation Agent

REVIEW
   │
   └── Human / Second Brain

FINALIZED
   │
   └── Research System
```

A implementação não deve assumir que cada coluna precisa corresponder a uma pessoa.

---

# 41. Liderança Distribuída e Autonomia Operacional

O sistema deve favorecer autonomia dentro das regras do fluxo.

Cada agente ou operador deve ter clareza sobre:

- o que pode puxar;
- quando pode puxar;
- quais critérios de entrada devem ser atendidos;
- quais critérios de saída devem ser atendidos;
- quando deve bloquear um item;
- quando deve solicitar ajuda;
- quais informações precisam ser registradas.

Isso evita o modelo:

```text
Gestor manda tarefa
       ↓
Executor executa
       ↓
Executor entrega
       ↓
Próxima tarefa
```

E favorece:

```text
Capacidade disponível
       ↓
Agente verifica READY
       ↓
Agente faz PULL
       ↓
Executa
       ↓
Conclui
       ↓
Libera capacidade
       ↓
Próximo PULL
```

A autonomia, entretanto, não significa ignorar WIP, políticas ou critérios de qualidade.

---

# 42. Seis Práticas Gerais do Kanban

O Crypto Research Intelligence deve considerar as seguintes práticas como princípios operacionais do sistema.

## 42.1 Visualizar o fluxo

O quadro deve tornar explícito:

- o trabalho existente;
- o estado de cada item;
- quem está trabalhando em cada item;
- onde os itens estão esperando;
- quais itens estão bloqueados;
- onde existe capacidade;
- onde existem filas;
- quais itens são urgentes;
- qual é a prioridade relativa.

O Kanban não deve ser apenas uma lista de tarefas com aparência diferente.

A visualização deve permitir **análise operacional imediata**.

## 42.2 Limitar WIP

O WIP é uma das principais ferramentas para controlar filas e multitarefa.

```text
mais trabalho iniciado
        ≠
mais valor entregue
```

O sistema deve privilegiar:

```text
START LESS
FINISH MORE
```

ou, em português:

> **Pare de começar e comece a terminar.**

## 42.3 Gerenciar o fluxo

A pergunta principal do Kanban não é apenas:

> “Quantas tarefas estão sendo executadas?”

Mas:

> **“Com que qualidade e previsibilidade o trabalho atravessa o sistema?”**

Por isso o sistema deve observar:

- Throughput;
- Cycle Time;
- Lead Time;
- Waiting Time;
- Blocked Time;
- WIP;
- WIP por etapa;
- idade dos itens;
- distribuição do trabalho;
- variação do tempo de execução.

## 42.4 Tornar políticas explícitas

As regras do fluxo devem ser visíveis e verificáveis.

Exemplos:

- definição de pronto;
- critérios de entrada;
- critérios de saída;
- WIP Limit;
- regras de urgência;
- regras de bloqueio;
- critérios de prioridade;
- regras de Pull;
- critérios de validação;
- critérios para publicação/finalização.

Essas políticas não devem ficar apenas na memória de uma pessoa.

Devem fazer parte do sistema.

## 42.5 Criar ciclos de feedback

O sistema deve permitir ciclos de feedback adequados à realidade operacional.

Exemplos futuros:

### Daily Flow Review

Revisão rápida de:

- bloqueios;
- capacidade;
- itens envelhecendo;
- gargalos;
- prioridades.

### Weekly Flow Review

Análise de:

- Throughput;
- Lead Time;
- Cycle Time;
- WIP;
- bloqueios;
- gargalos recorrentes;
- qualidade das pesquisas;
- sugestões de melhoria.

### Improvement Review

Revisão das experiências realizadas e seus resultados.

O Kanban não exige uma única cadência universal. A cadência deve ser adequada ao fluxo real.

## 42.6 Evoluir por experimentação

A equipe e os agentes devem poder testar melhorias controladas.

Exemplos:

- alterar WIP de uma etapa;
- dividir uma etapa em Em Andamento / Pronto;
- alterar critérios de entrada;
- modificar prioridade operacional;
- introduzir uma validação automática;
- automatizar uma transferência entre etapas;
- alterar a capacidade de um agente;
- introduzir uma política explícita.

Cada alteração relevante deve, quando possível, ser registrada como experimento e posteriormente avaliada.

---

# 43. Construção do Quadro: Começar pelo Trabalho Atual

Antes de definir o fluxo ideal, o sistema deve permitir identificar o trabalho que já está sendo realizado.

Um primeiro estado simplificado pode ser:

```text
A FAZER
   ↓
FAZENDO
   ↓
FEITO
```

Neste momento o objetivo é apenas responder:

> **“O que está sendo feito atualmente?”**

Não é necessário resolver todos os problemas do processo durante o mapeamento inicial.

Isso é importante para evitar que a equipe tente otimizar um processo que ainda não compreende.

---

# 44. Priorização do Trabalho

Depois de mapear o trabalho, os itens devem ser ordenados segundo critérios explícitos de prioridade.

No Crypto Research Intelligence, a prioridade poderá considerar, por exemplo:

- valor potencial da pesquisa;
- relevância estratégica;
- mudança recente de fundamentos;
- evento/catalisador próximo;
- necessidade de atualização;
- importância para uma decisão do sistema;
- dependências;
- urgência legítima.

A ordenação não deve exigir detalhamento completo de todos os itens futuros.

### Princípio de refinamento progressivo

Itens muito distantes no fluxo podem permanecer com informações mínimas até que se aproximem da execução.

```text
Muito distante
    ↓
informação mínima

Próximo
    ↓
mais contexto

READY
    ↓
critérios completos

IN_PROGRESS
    ↓
execução
```

Isso evita desperdício de esforço com pesquisas que podem perder relevância antes de serem executadas.

---

# 45. Mapear o Fluxo Atual

As colunas do Kanban devem representar as etapas reais do processo.

Perguntas fundamentais:

1. Onde o trabalho começa?
2. Qual é a primeira transformação?
3. Qual é a próxima etapa?
4. Onde ocorre validação?
5. Onde ocorre revisão?
6. Quando o trabalho pode ser considerado pronto?
7. O que acontece depois da conclusão?

Exemplo para o Crypto Research Intelligence:

```text
DISCOVERY
   ↓
FUNDAMENTAL ANALYSIS
   ↓
TOKENOMICS
   ↓
CAPITAL / FUNDING
   ↓
VALIDATION
   ↓
REVIEW
   ↓
FINAL RESEARCH
```

Esse fluxo é apenas um exemplo. A implementação deve refletir o processo realmente adotado pelo sistema em cada fase.

---

# 46. Itens Urgentes — Expedite Lane

Itens urgentes devem ser explicitamente identificados.

Uma solução visual recomendada é uma **Expedite Lane / Urgent Lane**.

```text
┌─────────────────────────────────────────┐
│ URGENTE / EXPEDITE                      │
│ [Research X]                            │
└─────────────────────────────────────────┘

┌──────────┬───────────┬──────────┬───────┐
│ Discovery│ Analysis  │ Review   │ Done  │
└──────────┴───────────┴──────────┴───────┘
```

Porém, a existência da raia não significa que qualquer pessoa possa marcar um item como urgente.

## 46.1 Definição explícita de urgência

O sistema deve possuir critérios objetivos para classificar um item como urgente.

Exemplos possíveis:

- evento crítico iminente;
- mudança material de protocolo;
- incidente relevante;
- desbloqueio de decisão importante;
- alteração significativa de dados;
- necessidade operacional previamente definida.

Não utilizar:

```text
“É urgente porque alguém pediu.”
```

A urgência deve ter uma política explícita.

## 46.2 Limite de urgências

A raia urgente pode possuir limite de entrada por período.

Exemplo conceitual:

```text
máximo = 2 itens urgentes / semana
```

O valor real deverá ser calibrado com dados históricos.

### Regra importante

Urgência é uma exceção controlada, não um segundo fluxo normal.

---

# 47. Buffers / Colunas de Espera

Uma coluna **Pronto / Ready** pode funcionar como buffer entre duas etapas executadas por responsáveis diferentes.

Exemplo:

```text
ANÁLISE
┌───────────────┬───────────────┐
│ EM ANDAMENTO  │ PRONTO        │
│               │               │
│ Research A    │ Research B    │
└───────────────┴───────────────┘
                         ↓
                      PULL
                         ↓
VALIDAÇÃO
```

O buffer torna visível a diferença entre:

- capacidade de produção;
- trabalho concluído na etapa;
- capacidade de consumo da etapa seguinte.

## 47.1 Buffer como sensor de gargalo

Se muitos itens se acumulam em `PRONTO`, isso pode indicar que a etapa seguinte está limitando o fluxo.

```text
ANÁLISE → PRONTO ████████ → VALIDAÇÃO
                              ↑
                           gargalo
```

O acúmulo deve gerar investigação, e não simplesmente aumento indiscriminado do WIP.

## 47.2 Buffer não é depósito

Uma coluna de buffer não deve ser utilizada para esconder excesso de produção.

Seu propósito é tornar o estado do fluxo observável e permitir Pull controlado.

---

# 48. Swimlanes por Responsável

Raias também podem representar responsáveis quando isso melhora a gestão visual.

Exemplo:

```text
┌──────────────────────────────────────────────┐
│ AGENT RESEARCH                               │
│ Discovery → Analysis → Validation → Done     │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ AGENT FUNDAMENTAL                            │
│ Discovery → Analysis → Validation → Done     │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ HUMAN REVIEW                                 │
│ Review → Final → Published                   │
└──────────────────────────────────────────────┘
```

Isso é especialmente útil quando diferentes agentes possuem capacidades distintas.

A criação de uma raia por responsável não deve ser automática. Ela deve ser usada quando melhora a compreensão do fluxo.

---

# 49. Kanban entre Equipes e Agentes

Um fluxo pode atravessar múltiplos quadros.

No Crypto Research Intelligence isso pode representar diferentes domínios ou subsistemas.

```text
BOARD A
Research Discovery
      ↓
READY FOR FUNDAMENTAL
      ↓
BOARD B
Fundamental Research
      ↓
READY FOR VALIDATION
      ↓
BOARD C
Validation / Review
      ↓
READY FOR FINAL RESEARCH
      ↓
BOARD D
Final Intelligence
```

Cada quadro pode possuir seu próprio WIP, políticas e métricas.

Entretanto, os quadros devem possuir relações explícitas para que o sistema consiga analisar o fluxo **end-to-end**.

---

# 50. Kanban Interligado e Fluxo End-to-End

Quando um quadro alimenta outro, o ponto de transferência deve ser explícito.

Exemplo:

```text
DISCOVERY BOARD
       ↓
   READY FOR
   ANALYSIS
       ↓
ANALYSIS BOARD
       ↓
   READY FOR
  VALIDATION
       ↓
VALIDATION BOARD
       ↓
   READY FOR
    REVIEW
       ↓
REVIEW BOARD
```

O sistema deve registrar:

- origem;
- destino;
- timestamp da transferência;
- item relacionado;
- equipe/agente de origem;
- equipe/agente de destino;
- estado anterior;
- estado posterior.

Isso permite calcular métricas de fluxo além dos limites de um único quadro.

---

# 51. Anatomia do Kanban Card

O cartão representa uma unidade de trabalho.

No Crypto Research Intelligence, um cartão pode representar:

- projeto a pesquisar;
- protocolo;
- token;
- pesquisa de atualização;
- validação de dados;
- revisão de uma conclusão;
- investigação de risco;
- atualização de tokenomics;
- investigação de funding;
- análise de catalisador;
- proposta de melhoria.

## 51.1 Informações mínimas

Um cartão deve possuir, no mínimo:

```text
Título
Tipo
Status
Prioridade
Responsável
Research Run
```

## 51.2 Informações complementares

Quando aplicável:

- descrição;
- projeto relacionado;
- setor/narrativa;
- links;
- fontes;
- anexos;
- checklist;
- critérios de aceite;
- data de entrada;
- data prevista;
- data de conclusão;
- bloqueio;
- motivo do bloqueio;
- WIP class;
- urgência;
- score atual;
- versão do research;
- confiança;
- evidências.

## 51.3 Research Trace

O cartão de pesquisa deve permanecer conectado às evidências utilizadas.

```text
CARD
 ↓
RESEARCH RUN
 ↓
FINDINGS
 ↓
SOURCES
 ↓
TIMESTAMPS
```

Isso é essencial para auditoria e para o futuro Backtesting.

---

# 52. WIP — Definição e Calibração

O WIP Limit não deve ser tratado como um número universal.

O sistema deve iniciar com uma hipótese operacional e ajustar com base em evidências.

### Método inicial

Uma heurística inicial pode considerar:

```text
WIP inicial ≈ capacidade simultânea real da etapa
```

Por exemplo:

```text
2 agentes de validação
→ WIP inicial = 2
```

Mas essa é apenas uma hipótese inicial.

O limite deve ser revisado considerando:

- velocidade real;
- variabilidade;
- tempo de execução;
- dependências;
- tamanho dos itens;
- frequência de chegada;
- frequência de saída;
- bloqueios;
- capacidade da próxima etapa.

## 52.1 Ajuste empírico

```text
Definir WIP inicial
       ↓
Observar por período
       ↓
Medir fluxo
       ↓
Identificar fila ou ociosidade
       ↓
Ajustar WIP
       ↓
Medir novamente
```

Não deve existir uma regra de “WIP perfeito” independente do contexto.

---

# 53. Multitarefa e Foco

O sistema deve desencorajar que um agente ou pessoa mantenha muitos itens simultaneamente em `IN_PROGRESS`.

Exemplo indesejado:

```text
Agent A
├── Research 1
├── Research 2
├── Research 3
├── Research 4
└── Research 5
```

Preferível:

```text
Agent A
└── Research 1 → DONE
                 ↓
              Research 2
```

O objetivo é reduzir:

- troca de contexto;
- trabalho parcialmente concluído;
- tempo de espera;
- retrabalho;
- perda de contexto;
- dispersão de atenção.

Qualquer afirmação quantitativa sobre perda de produtividade deve ser tratada como hipótese a ser validada, e não como regra universal do sistema.

---

# 54. Capacidade Ociosa Não Significa Iniciar Qualquer Trabalho

Quando uma etapa possui capacidade disponível, o agente não deve necessariamente criar novo trabalho na etapa anterior.

A pergunta correta é:

> **“Existe trabalho READY que eu possa puxar?”**

Se não houver, o agente pode executar outra atividade que agregue valor, como:

- melhorar documentação;
- validar dados existentes;
- revisar fontes;
- analisar inconsistências;
- melhorar testes;
- investigar dívida técnica;
- revisar uma proposta de melhoria;
- ajudar uma etapa bloqueada.

Isso evita criar trabalho artificial apenas para manter recursos ocupados.

---

# 55. Backpressure e Equilíbrio de Capacidade

O fluxo deve possuir mecanismos para impedir que uma etapa produza indefinidamente enquanto a etapa seguinte está cheia.

```text
DISCOVERY
   ↓
ANALYSIS
   ↓
VALIDATION ████████ 3/3
              ↑
          CAPACIDADE
            CHEIA
```

Quando a validação está cheia:

```text
ANALYSIS não deve continuar produzindo
apenas para manter ANÁLISE ocupada.
```

Em vez disso, o sistema deve permitir que a capacidade seja redirecionada para atividades de valor.

Esse comportamento é **backpressure** operacional.

---

# 56. Políticas Explícitas no Sistema

As políticas do Kanban devem ser dados/configuração, e não apenas regras descritas em documentação.

Estrutura conceitual:

```text
BoardPolicy
├── WIP Limits
├── Pull Rules
├── Priority Rules
├── Expedite Rules
├── Block Rules
├── Entry Criteria
├── Exit Criteria
├── Definition of Ready
└── Definition of Done
```

Isso permite que o sistema valide automaticamente as regras.

Exemplo:

```text
if nextStage.availableCapacity == 0:
    rejectPull()
```

E não simplesmente:

```text
frontend mostra “WIP cheio”
mas API aceita o movimento.
```

As regras críticas devem existir no backend.

---

# 57. Bloqueios

Um item bloqueado não deve ser confundido com WIP normal.

Estados recomendados:

```text
READY
IN_PROGRESS
BLOCKED
DONE
```

Quando bloqueado:

- registrar motivo;
- registrar timestamp;
- identificar responsável pela resolução;
- manter visibilidade;
- contabilizar Blocked Time;
- permitir análise posterior.

Exemplo:

```text
Research Card
      ↓
BLOCKED
      ↓
Motivo: fonte primária indisponível
      ↓
Ação: buscar fonte alternativa
```

O sistema não deve simplesmente mover o cartão para outra coluna para esconder o bloqueio.

---

# 58. Kanban não é apenas Drag & Drop

A interface pode utilizar Drag & Drop, mas isso não define o Kanban.

O comportamento real deve ser:

```text
Política
   ↓
Capacidade
   ↓
WIP
   ↓
Pull
   ↓
Movimento
   ↓
Histórico
   ↓
Métrica
   ↓
Melhoria
```

Um usuário não deve conseguir quebrar silenciosamente as regras do fluxo apenas arrastando um cartão.

Quando uma movimentação não for permitida, a interface deve explicar:

- qual regra foi violada;
- qual capacidade está indisponível;
- qual etapa precisa liberar espaço;
- qual ação o usuário pode realizar.

---

# 59. Kanban + BullMQ — Papéis Diferentes

O Kanban e o BullMQ não devem ser tratados como a mesma coisa.

### Kanban

Representa o **fluxo lógico e operacional do trabalho**:

```text
Discovery
→ Analysis
→ Validation
→ Review
→ Final
```

### BullMQ

Representa a **execução assíncrona de jobs**:

```text
Queue
→ Worker
→ Job
→ Retry
→ Completion
```

A integração deve ser explícita.

Exemplo:

```text
KANBAN CARD
     ↓
PULL
     ↓
CREATE/START JOB
     ↓
BULLMQ
     ↓
WORKER
     ↓
RESULT
     ↓
KANBAN CARD READY
```

O Kanban não deve substituir BullMQ, e BullMQ não deve substituir o Kanban.

---

# 60. Research Run como Unidade de Rastreamento

Cada pesquisa automatizada deve continuar relacionada ao seu `Research Run`.

Exemplo:

```text
Research Run #1042
        ↓
Discovery Card
        ↓
Analysis Card
        ↓
Validation Card
        ↓
Review Card
        ↓
Final Research
```

Isso permite responder futuramente:

- qual execução criou o cartão?
- quais dados foram utilizados?
- quais agentes participaram?
- quanto tempo cada etapa levou?
- onde houve bloqueio?
- quais fontes sustentaram a conclusão?
- qual versão do scoring foi utilizada?

---

# 61. Métricas de Fluxo

O Kanban deve transformar o histórico de movimentações em inteligência operacional.

## Métricas mínimas

### WIP

Quantidade de itens em andamento.

### Throughput

Quantidade de itens concluídos por período.

### Cycle Time

Tempo entre início efetivo do trabalho e conclusão.

### Lead Time

Tempo entre entrada no sistema e conclusão.

### Waiting Time

Tempo aguardando antes de ser processado.

### Blocked Time

Tempo em estado bloqueado.

### Aging

Tempo que um item atualmente aberto está no fluxo.

### WIP Utilization

Relação entre WIP atual e WIP permitido.

---

# 62. Análise de Gargalos

O sistema deve identificar gargalos por evidências.

Sinais possíveis:

```text
WIP alto
+
Waiting Time alto
+
Throughput baixo
+
Buffer crescendo
+
Capacity Utilization próxima do limite
=
possível gargalo
```

Isso não deve gerar automaticamente a conclusão de que existe um gargalo. Deve gerar um **sinal para investigação**.

O Second Brain poderá posteriormente correlacionar múltiplas métricas antes de propor uma melhoria.

---

# 63. Dashboard de Capacidade

O Kanban deve apresentar capacidade operacional de forma clara.

Exemplo:

```text
DISCOVERY       2 / 3
ANALYSIS        3 / 3  ⚠ FULL
VALIDATION      1 / 2
REVIEW          0 / 2
FINAL           —
```

Visualizações futuras:

- WIP atual / limite;
- capacidade livre;
- itens READY;
- itens BLOCKED;
- idade dos itens;
- gargalos detectados;
- Throughput;
- Cycle Time;
- Lead Time.

A visualização deve seguir o `designer_system/designer-system.html`.

---

# 64. Pull Action Explícita

O sistema pode evoluir para possuir uma ação explícita de Pull.

Exemplo:

```text
REVIEW

Capacidade: 1 vaga

READY FROM VALIDATION

[ PULL CARD ]
```

Ao executar o Pull, o sistema deve validar:

1. capacidade disponível;
2. WIP Limit;
3. critérios de entrada;
4. estado READY da origem;
5. prioridade;
6. bloqueios;
7. permissões;
8. dependências.

Somente depois disso o movimento deve ser confirmado.

---

# 65. Prioridade Não Deve Quebrar WIP

Uma prioridade alta não deve automaticamente permitir que uma coluna ultrapasse seu limite.

Exceção possível:

```text
EXPEDITE POLICY
```

Mas a política precisa ser explícita.

Exemplo:

```text
WIP Review = 2

Review = 2/2

Novo item urgente
        ↓
verificar Expedite Policy
        ↓
se permitido:
   registrar exceção
   registrar motivo
   registrar impacto
```

Assim o sistema não transforma exceções em comportamento normal.

---

# 66. Definition of Ready e Definition of Done

O Kanban do Crypto Research Intelligence deve utilizar critérios claros para entrada e saída das etapas.

## Definition of Ready — exemplo

Uma pesquisa pode entrar em `Analysis` quando:

- projeto identificado;
- slug/identificador conhecido;
- dados mínimos disponíveis;
- objetivo da análise definido;
- fontes iniciais disponíveis;
- dependências satisfeitas.

## Definition of Done — exemplo

Uma pesquisa pode entrar em `Finalized` quando:

- dados validados;
- fontes registradas;
- conclusões rastreáveis;
- inconsistências registradas;
- scoring calculado quando aplicável;
- confiança calculada quando aplicável;
- revisão concluída;
- Research Trace completo.

Esses critérios devem ser configuráveis por fluxo.

---

# 67. Refinamento Progressivo do Trabalho

O Kanban deve evitar especificar detalhadamente todo o backlog futuro.

Itens mais próximos da execução recebem mais detalhamento.

```text
BACKLOG DISTANTE
      ↓
prioridade + título

PRÓXIMO
      ↓
contexto + objetivo

READY
      ↓
critérios completos + fontes

IN_PROGRESS
      ↓
execução

DONE
      ↓
evidências + histórico
```

Isso é particularmente importante para pesquisa de mercado, porque relevância, dados, narrativas e catalisadores podem mudar antes da execução.

---

# 68. Kanban como Sistema de Gestão, não como Ferramenta de Tarefas

O objetivo do módulo não é apenas permitir que o usuário mova cartões.

O Kanban deve responder operacionalmente:

```text
O que está acontecendo?
        ↓
Onde está acontecendo?
        ↓
Quem/qual agente está trabalhando?
        ↓
Onde está esperando?
        ↓
Onde está bloqueado?
        ↓
Qual etapa tem capacidade?
        ↓
Qual etapa está limitando o fluxo?
        ↓
O que deve ser puxado agora?
        ↓
O que podemos melhorar?
```

Essa visão é fundamental para o futuro **Second Brain**.

---

# 69. Second Brain como Auditor do Fluxo

Em uma fase futura, o Second Brain deve utilizar o histórico do Kanban para analisar o sistema.

Exemplos de perguntas:

- Qual etapa mais frequentemente cria fila?
- Qual etapa possui maior Waiting Time?
- Qual etapa possui maior variabilidade?
- Onde o WIP está frequentemente saturado?
- Quais itens ficam bloqueados por mais tempo?
- Quais políticas são frequentemente violadas?
- O WIP atual está coerente com a capacidade observada?
- Quais agentes possuem capacidade ociosa?
- Existem transferências desnecessárias?
- Existe retrabalho recorrente?
- O Throughput está melhorando?
- O Lead Time está piorando?

O Second Brain deve produzir **evidências + hipótese + recomendação**, e não simplesmente alterar o sistema sem auditoria.

---

# 70. Improvement Proposal

Toda melhoria significativa identificada pelo Second Brain ou pela equipe poderá ser registrada como uma proposta.

Estrutura conceitual:

```text
Improvement Proposal
├── Problema observado
├── Evidências
├── Hipótese
├── Mudança proposta
├── Impacto esperado
├── Risco
├── Métrica de sucesso
├── Responsável
├── Data de implementação
└── Resultado
```

Fluxo:

```text
Problema
   ↓
Observação
   ↓
Proposta
   ↓
Aprovação
   ↓
Experimento
   ↓
Medição
   ↓
Adotar / Reverter / Ajustar
```

---

# 71. Kanban e Melhoria Contínua do Próprio Kanban

O sistema deve ser capaz de melhorar suas próprias regras.

Exemplo:

```text
WIP = 3
↓
4 semanas de dados
↓
fila recorrente
↓
Second Brain identifica padrão
↓
Proposal: testar WIP = 2
↓
experimento
↓
comparar métricas
```

Isso transforma o Kanban em um mecanismo de aprendizado operacional.

---

# 72. Regras de Implementação para a Etapa/Sprint 7

Ao implementar o Kanban no Crypto Research Intelligence, Claude Code deve considerar obrigatoriamente:

1. Começar pelo fluxo existente.
2. Não criar complexidade sem necessidade.
3. Visualizar o trabalho real.
4. Implementar WIP como regra operacional.
5. Implementar Pull real.
6. Permitir `Em Andamento` e `Pronto` quando necessário.
7. Registrar bloqueios.
8. Registrar histórico de movimentação.
9. Registrar timestamps.
10. Implementar políticas explícitas.
11. Tratar urgência como exceção controlada.
12. Permitir buffers quando houver transferência entre responsáveis.
13. Permitir swimlanes quando melhorarem a visualização.
14. Permitir fluxos entre múltiplos quadros.
15. Preservar relação com Research Run.
16. Não substituir BullMQ pelo Kanban.
17. Não depender somente do frontend para regras críticas.
18. Implementar métricas de fluxo desde o início quando tecnicamente viável.
19. Preparar dados históricos para Second Brain.
20. Não implementar ainda Backtesting, Pine Script ou TradingView nesta etapa.

---

# 73. Checklist de Auditoria do Kanban

Antes de considerar o módulo concluído:

### Fluxo

- [ ] O fluxo representa o processo real?
- [ ] As etapas estão claramente definidas?
- [ ] Existem critérios de entrada e saída?

### Pull

- [ ] A etapa seguinte realmente puxa?
- [ ] O sistema impede Push indiscriminado?
- [ ] Capacidade é considerada antes do movimento?

### WIP

- [ ] Cada etapa relevante possui WIP?
- [ ] WIP é validado no backend?
- [ ] Exceções são registradas?

### Buffers

- [ ] Buffers existem apenas quando fazem sentido?
- [ ] Acúmulo em buffer é visível?
- [ ] O sistema consegue detectar crescimento anormal?

### Urgência

- [ ] Existe política explícita?
- [ ] Existe limite?
- [ ] A exceção fica registrada?

### Cards

- [ ] Card possui Research Run?
- [ ] Card possui responsável/agente?
- [ ] Card possui histórico?
- [ ] Card possui evidências quando necessário?

### Métricas

- [ ] WIP?
- [ ] Throughput?
- [ ] Cycle Time?
- [ ] Lead Time?
- [ ] Waiting Time?
- [ ] Blocked Time?
- [ ] Aging?

### Integrações

- [ ] BullMQ continua responsável por jobs?
- [ ] Research Run continua rastreável?
- [ ] Second Brain pode consumir o histórico?

### UX

- [ ] UI segue `designer_system/designer-system.html`?
- [ ] Não existe mouse tracking?
- [ ] Não existe cursor glow?
- [ ] Não existe spotlight?
- [ ] Não existe tilt/parallax?
- [ ] Não existem efeitos magnéticos?
- [ ] A interface permanece limpa e orientada a dados?

---

# 74. Modelo Conceitual Completo

A visão consolidada do Kanban do Crypto Research Intelligence passa a ser:

```text
                         CAPACIDADE
                             │
                             ▼
                      ┌──────────────┐
                      │    REVIEW    │
                      │    1 / 2     │
                      └──────┬───────┘
                             │
                            PULL
                             │
                      ┌──────▼───────┐
                      │  VALIDATION  │
                      │    2 / 3     │
                      └──────┬───────┘
                             │
                            PULL
                             │
                      ┌──────▼───────┐
                      │   ANALYSIS   │
                      │    2 / 3     │
                      └──────┬───────┘
                             │
                            PULL
                             │
                      ┌──────▼───────┐
                      │  DISCOVERY   │
                      │    1 / 3     │
                      └──────────────┘

       ┌───────────────────────────────────────────┐
       │              POLÍTICAS                    │
       │ WIP • Pull • Priority • Urgent • Blocked │
       └───────────────────────────────────────────┘

       ┌───────────────────────────────────────────┐
       │               HISTÓRICO                    │
       │ Movements • Timestamps • Research Runs   │
       └───────────────────────────────────────────┘

       ┌───────────────────────────────────────────┐
       │                MÉTRICAS                    │
       │ WIP • Throughput • Lead • Cycle • Wait   │
       └───────────────────────────────────────────┘

                         ↓
                  SECOND BRAIN
                         ↓
                IMPROVEMENT PROPOSAL
                         ↓
                    EXPERIMENTO
                         ↓
                     MEDIÇÃO
                         ↺
```

---

# 75. Princípio Consolidado

O Kanban do Crypto Research Intelligence deve ser construído como um **sistema operacional de fluxo**, e não apenas como um quadro visual.

O princípio central passa a ser:

> **Comece com o que existe, torne o fluxo visível, limite o trabalho em progresso, permita que a capacidade puxe o trabalho, torne as políticas explícitas, meça o fluxo, aprenda com os resultados e melhore continuamente.**

Em termos operacionais:

```text
FLUXO REAL
    ↓
VISIBILIDADE
    ↓
WIP LIMIT
    ↓
PULL
    ↓
CAPACIDADE
    ↓
MÉTRICAS
    ↓
FEEDBACK
    ↓
EXPERIMENTAÇÃO
    ↓
MELHORIA CONTÍNUA
    ↺
```

O objetivo final não é fazer cada pessoa ou agente trabalhar no máximo.

O objetivo é fazer o **sistema entregar valor de forma contínua, equilibrada, previsível e rastreável**.

---

# 76. SPRINT 7 — AUDITORIA, AJUSTE E EVOLUÇÃO (implementado)

> Registro consolidado do que foi auditado e alterado na implementação real do Kanban Pull
> System (`packages/research-engine/src/kanban-repository.ts` e `kanban-metrics.ts`,
> `apps/web/src/app/api/kanban/**`, `apps/web/src/app/dashboard/kanban/page.tsx`) contra esta
> especificação. Não substitui as seções anteriores — é o relato do que já existia, do que foi
> corrigido e do que ficou fora deste ciclo. Ver `STATUS_PROJETO.md` para o resumo executivo.

## 76.1 O que já estava implementado corretamente

Pull atômico com `SELECT ... FOR UPDATE` na coluna de destino (seção 37/48), WIP Limit
aplicado no backend de forma estrita para a operação `pullCard`, subcolunas `IN_PROGRESS`/`READY`
como Buffer (seção 8/9), política de urgência explícita e configurável via `KanbanPolicy`
(`urgent_policy`, seção 15-17), `KanbanCardMovement` como histórico imutável (seção 24), Research
Trace linkado ao card via `researchRunId`/`projectId` (seção 23), prioridade que ordena leitura
sem furar WIP (seção 28), e UI sem nenhum efeito de mouse-tracking (seção 41).

## 76.2 Bug corrigido

**Cards `BLOCKED` não contavam como WIP.** As contagens de WIP (`countActiveCardsInColumn`,
`pullCard`, `getBoardView`, `kanban-metrics.ts`) usavam `cardStatus in [READY, IN_PROGRESS]`,
excluindo `BLOCKED` — na prática, um card bloqueado liberava silenciosamente uma vaga para outro
card entrar, mascarando gargalos reais atrás de bloqueios, contrariando diretamente a seção 33
("Blocked ≠ WIP livre"). Corrigido introduzindo a constante canônica `WIP_ACTIVE_STATUSES =
[READY, IN_PROGRESS, BLOCKED]`, usada agora em todo o cálculo de WIP do board.

## 76.3 Evoluções implementadas neste Sprint

- **Classificação de gargalo em níveis** (seção 27): `bottleneck: boolean` foi complementado por
  `riskLevel: "NORMAL" | "WATCH" | "BOTTLENECK" | "CRITICAL"`, derivado deterministicamente de
  WIP no limite + presença de cards bloqueados na coluna + idade do buffer (`classifyRisk` em
  `kanban-repository.ts`). `bottleneck` foi mantido por compatibilidade.
- **Métricas de Buffer** (seção 9/10): `bufferCount` (cards em `READY` na coluna) e
  `oldestBufferAgeHours` (idade do card mais antigo no buffer), expostos tanto em `getBoardView`
  quanto em `getBoardMetrics`.
- **Waiting Time** (seção 20, distinto de Cycle Time): calculado a partir das movimentações
  `READY → IN_PROGRESS` dentro da mesma coluna — tempo real de espera no buffer antes de ser
  puxado, separado do tempo de execução.
- **Aging** (seção 22): `oldestOpenCardAgeHours` no nível do board — idade do card aberto (sem
  `completedAt`) mais antigo do sistema, útil para detectar itens esquecidos mesmo sem bloqueio.
- **Testes de concorrência real de Pull** (seção 37/48): dois `pullCard` disparados em paralelo
  (`Promise.allSettled`) contra uma coluna com WIP Limit=1 — exatamente um sucesso, um
  `WIP_LIMIT_REACHED`, confirmando que o `FOR UPDATE` serializa a corrida.
- **Teste do bug de WIP/BLOCKED**: card bloqueado sozinho satura o WIP da coluna; um segundo Pull
  para a mesma coluna é rejeitado.
- **UI**: colunas agora mostram o nível de risco (`Normal`/`Observar`/`Gargalo`/`Crítico`, em vez
  de só "cheio"/"não cheio") e a contagem/idade do buffer, sem introduzir nenhum efeito de mouse
  novo (mesmo padrão de tokens de `globals.css` já usado no resto do dashboard).

## 76.4 O que ficou fora deste ciclo (decisão consciente de escopo)

Não implementados neste Sprint: raia visual "Urgente" separada (hoje é só borda no card), uso do
campo `swimlane` na renderização (existe no schema/criação, mas `getBoardView` não agrupa por
ele), WIP dinâmico/experimental com histórico de alterações, endpoint de leitura de
`KanbanPolicy`, estrutura de Flow Review/feedback loops, e fluxos entre múltiplos boards
(`KanbanBoard` continua singleton). Esses itens permanecem descritos nas seções 15-21 e 30-32
deste documento como trabalho futuro — nenhum deles foi removido ou contradito, só não teve
código produzido ainda.
