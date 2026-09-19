# Crypto Research Intelligence --- Master Roadmap & Specification

> **Documento mestre de especificação para desenvolvimento no Claude
> Code / VSCode.**
>
> Objetivo: construir uma plataforma de inteligência fundamentalista
> para criptoativos que execute pesquisas periódicas, descubra
> narrativas e catalisadores, analise crescimento de TVL, Fees, Revenue,
> usuários, capital institucional, tokenomics, valuation e value
> capture, audite os próprios resultados por meio de um **Second Brain**
> e mantenha todo o processo rastreável em um **Kanban de Research**.
>
> A segunda etapa do projeto incorporará **TradingView + Pine Script**,
> usando como base o curso _Learn TradingView Pine Script Programming
> From Scratch_, de Paul D. Mendes, para criar indicadores próprios que
> complementem a análise fundamentalista.
>
> **Princípio central:** o sistema não deve simplesmente procurar "as
> melhores criptos". Deve procurar onde existe **crescimento
> fundamental + entrada de capital + narrativa + catalisadores + captura
> de valor pelo token**, sempre distinguindo qualidade do protocolo de
> qualidade/oportunidade do token.

---

## 1. Visão do Produto

### Nome de trabalho

**Crypto Research Intelligence**

### Propósito

Criar um "research desk" automatizado para criptoativos, com interface
simples, visual e auditável, capaz de:

1.  Descobrir setores e narrativas relevantes.
2.  Identificar protocolos/criptoativos dentro dessas narrativas.
3.  Coletar dados quantitativos e qualitativos.
4.  Analisar TVL, crescimento, aceleração e distribuição por blockchain.
5.  Analisar Fees e Revenue e descobrir como o protocolo captura
    receita.
6.  Identificar qualidade e sustentabilidade da receita.
7.  Identificar usuários, volume e atividade quando os dados estiverem
    disponíveis.
8.  Pesquisar funding e Venture Capital.
9.  Identificar investidores, rodadas e capital total levantado.
10. Identificar redes/blockchains em que o projeto opera.
11. Avaliar tokenomics, FDV, market cap, emissão, unlocks e pressão de
    oferta.
12. Avaliar value capture pelo token.
13. Pesquisar catalisadores futuros.
14. Avaliar riscos e pontos que podem invalidar a tese.
15. Gerar Score de 0--100.
16. Gerar um nível de Confidence separado do Score.
17. Comparar projetos dentro de cada setor.
18. Detectar divergências entre preço e fundamentos.
19. Manter histórico das análises.
20. Alimentar um Kanban de pesquisa automaticamente.
21. Submeter resultados a um Second Brain adversarial.
22. Permitir que o Second Brain proponha melhorias para o próprio
    sistema.
23. Futuramente incorporar análise técnica e indicadores Pine Script.
24. Futuramente combinar fundamentos + on-chain + narrativa +
    catalisadores + análise técnica em um Opportunity Engine.

---

# 2. Princípio Fundamental de Análise

A plataforma deve responder:

> **Onde está ocorrendo crescimento fundamental + entrada de capital +
> narrativa relevante + catalisadores + captura de valor pelo token?**

Não utilizar apenas:

- preço;
- market cap;
- FDV;
- TVL absoluto;
- hype;
- seguidores;
- ranking de capitalização.

Essas métricas podem fazer parte da análise, mas nunca devem ser a tese
completa.

---

# 3. Arquitetura Conceitual

```text
                         CRYPTO RESEARCH INTELLIGENCE
                                      |
              +-----------------------+-----------------------+
              |                       |                       |
              v                       v                       v
        DATA COLLECTION          RESEARCH AGENT          SECOND BRAIN
              |                       |                       |
        +-----+------+          Fundamental Analysis     Auditoria
        |            |          Narrative Analysis        Crítica
        v            v          Catalyst Analysis         Melhorias
    Quantitative   Qualitative  Capital Analysis          Quality Control
        |            |                |
        +------------+----------------+
                     |
                     v
              NORMALIZATION
                     |
                     v
             SECTOR / NARRATIVE
                CLASSIFICATION
                     |
                     v
              SCORING ENGINE
                     |
          +----------+----------+
          |          |          |
          v          v          v
      Fundamental  Tokenomics  Valuation
                     |
                     v
                RISK ENGINE
                     |
                     v
                FINAL RANKING
                     |
          +----------+----------+
          |                     |
          v                     v
       DASHBOARD              REPORT
          |
          v
       KANBAN
          |
          v
    HISTORICAL DATABASE
          |
          v
       BACKTESTING
          |
          v
  FUTURE TRADING INTELLIGENCE
          |
          v
    PINE SCRIPT / TRADINGVIEW
```

---

# 4. Dashboard

O dashboard deve ser fácil de entender mesmo para uma pessoa que não
queira navegar por dezenas de tabelas.

## 4.1 Home

Elementos principais:

- Status do Agent.
- Data/hora da última análise.
- Próxima análise.
- Market Regime.
- Research Score médio.
- Quantidade de narrativas identificadas.
- Crescimento agregado de TVL.
- Crescimento agregado de Revenue.
- Capital levantado.
- Top Opportunities.
- Alertas.
- Second Brain.
- Atividade recente.

Exemplo conceitual:

```text
+-------------------------------------------------------------+
| CRYPTO RESEARCH AI                         AGENT ONLINE      |
+-------------------------------------------------------------+
|                                                             |
| Market Regime     Research Score      Last Analysis         |
| Risk On           78/100              15/09/2026             |
|                                                             |
+--------------+--------------+--------------+----------------+
| Narrativas   | TVL          | Revenue      | Capital        |
| 12           | +18.4%       | +27.1%       | $482M          |
+--------------+--------------+--------------+----------------+
|                                                             |
| TOP OPPORTUNITIES                                           |
|                                                             |
| #1 XYZ     RWA       92   HIGH CONFIDENCE                  |
| #2 ABC     DeFi      89   HIGH CONFIDENCE                  |
| #3 DEF     AI        86   MEDIUM CONFIDENCE                |
|                                                             |
+-------------------------------------------------------------+
| SECOND BRAIN                                                |
| Identifiquei 4 oportunidades de melhoria.                   |
| [Ver recomendações]                                         |
+-------------------------------------------------------------+
```

---

# 5. Menu Principal

```text
Dashboard

Research
  - Overview
  - Narrativas
  - Setores
  - Protocolos
  - Ranking

Fundamental
  - TVL
  - Fees
  - Revenue
  - Users
  - Volume
  - Valuation
  - Tokenomics
  - Value Capture

Capital
  - Funding
  - Venture Capital
  - Investors
  - Unlocks

Catalisadores

Second Brain

Kanban

Histórico

Configurações

Trading Intelligence (FASE 2)
  - Indicadores
  - Signals
  - Pine Scripts
```

A área Trading Intelligence pode existir desde a primeira versão como
módulo desativado/"Coming Soon", sem necessidade de implementar sua
lógica na Fase 1.

---

# 6. Configurações

## 6.1 API Keys

A plataforma deve permitir cadastrar e testar integrações.

Exemplo:

```text
API & DATA SOURCES

DefiLlama
[ Connected ]

OpenAI
[ Connected ]

CoinGecko
[ Add API Key ]

CryptoRank
[ Add API Key ]

Dune
[ Add API Key ]

Nansen
[ Add API Key ]

TradingView
[ Configure - Phase 2 ]
```

### Segurança

Nunca armazenar API Keys em texto puro.

Requisitos:

- criptografia em repouso;
- segredo separado de configurações normais;
- nunca expor chave completa no frontend;
- mascarar valores após o cadastro;
- logs nunca devem conter API Keys;
- permitir testar conexão;
- permitir revogar/substituir;
- separar credenciais por provider;
- usar `.env` apenas para bootstrap/segredos do ambiente quando
  apropriado;
- produção deve utilizar secret storage seguro quando disponível.

Exemplo de exibição:

```text
sk-••••••••••••8X92
```

---

# 7. Agendamento do Agent

Permitir:

- Manual;
- Diário;
- A cada 12 horas;
- Semanal;
- Quinzenal;
- Mensal;
- Customizado dentro dos limites suportados pelo scheduler.

Configuração:

```text
ANÁLISE AUTOMÁTICA

Frequência:
[ Semanal ]

Dia:
[ Segunda-feira ]

Horário:
[ 07:00 ]

Timezone:
[ America/Recife ]

Modo:
[ Incremental / Full Research ]
```

## 7.1 Full Research

Refaz o pipeline completo.

Usar:

- quando o usuário solicitar;
- periodicamente conforme configuração;
- quando houver mudança estrutural;
- quando o Second Brain recomendar.

## 7.2 Incremental Research

Pesquisar principalmente:

- dados que mudaram;
- novos catalisadores;
- alterações de TVL;
- alterações de Revenue;
- funding recente;
- novos investidores;
- unlocks;
- governance;
- novos deployments;
- mudanças de tokenomics;
- novas narrativas.

Objetivo: reduzir custo, latência e chamadas desnecessárias.

---

# 8. Pipeline de Research

```text
1. Scheduler
2. Research Run criado
3. Descoberta de narrativas
4. Classificação por setor
5. Seleção de projetos candidatos
6. Coleta de dados quantitativos
7. Coleta de dados qualitativos
8. Normalização
9. Cross-check
10. Fundamental Analysis
11. Capital Analysis
12. Tokenomics Analysis
13. Catalyst Analysis
14. Valuation
15. Risk Analysis
16. Score
17. Confidence
18. Second Brain
19. Ajustes/revisão
20. Ranking
21. Relatório
22. Kanban atualizado
23. Snapshot histórico
24. Publicação no dashboard
```

---

# 9. Setores e Narrativas

A plataforma deve trabalhar primeiro com setores/narrativas e depois com
ativos.

## 9.1 Infraestrutura

- Layer 1
- Layer 2
- Layer 3
- Data Availability
- Modular Blockchain
- Interoperabilidade
- Bridges
- Oracles
- RPC
- Sequencers
- Restaking
- Shared Security

## 9.2 DeFi

- Lending
- DEX
- Perpetuals
- Derivatives
- Liquid Staking
- Liquid Restaking
- Yield
- Stablecoins
- CDP
- Asset Management
- Structured Products

## 9.3 RWA

- Tokenização
- Treasuries
- Crédito privado
- Stablecoins
- Real Estate
- Commodities
- Fundos tokenizados

## 9.4 AI + Crypto

- AI Agents
- AI Infrastructure
- Decentralized Compute
- Inference
- Data
- AI Marketplaces
- Agent Economy

## 9.5 DePIN

- Compute
- Storage
- Wireless
- Mapping
- Sensors
- Physical Infrastructure

## 9.6 Consumer

- Gaming
- Social
- Prediction Markets
- Payments
- Wallets
- Creator Economy

## 9.7 Bitcoin

- Bitcoin L2
- BTCFi
- Restaking
- Staking
- Ordinals
- Bitcoin DeFi

### Regra

O sistema deve poder criar/identificar novas categorias quando detectar
uma narrativa emergente.

---

# 10. DefiLlama como Fonte Quantitativa Principal

Utilizar DefiLlama como fonte prioritária para:

- TVL;
- histórico de TVL;
- TVL por chain;
- Fees;
- Revenue;
- dados financeiros disponíveis;
- protocolos;
- chains;
- stablecoins;
- DEX volume;
- perpetuals;
- inflows/outflows quando disponíveis.

O sistema deve registrar:

- fonte;
- endpoint/referência;
- timestamp da consulta;
- timestamp do dado;
- período;
- unidade;
- metodologia;
- qualidade da fonte.

Não misturar indiscriminadamente:

- TVL;
- Fees;
- Revenue;
- token holder revenue.

Esses conceitos precisam permanecer separados.

---

# 11. Análise de TVL

Nunca usar somente TVL absoluto.

Calcular:

```text
TVL atual
TVL 7d
TVL 30d
TVL 90d
TVL 180d
TVL 1y
```

## 11.1 Crescimento

```text
TVL Growth 7d
TVL Growth 30d
TVL Growth 90d
```

## 11.2 Aceleração

Exemplo:

```text
7d   +18%
30d  +42%
90d  +95%
```

Indicar aceleração ou desaceleração.

## 11.3 Qualidade do crescimento

Investigar:

- crescimento orgânico;
- incentivos;
- farming;
- airdrop farming;
- migração;
- nova chain;
- integração;
- novo produto;
- entrada institucional;
- stablecoin inflow;
- bridge inflow;
- market maker.

Não assumir que aumento de TVL = crescimento saudável.

---

# 12. TVL por Blockchain

Para cada protocolo:

```text
Ethereum
Arbitrum
Base
Optimism
Solana
BSC
Avalanche
outras
```

Mostrar:

- TVL por chain;
- participação percentual;
- crescimento por chain;
- concentração;
- novas chains adicionadas.

Pergunta analítica:

> Em qual ecossistema está acontecendo o crescimento?

---

# 13. Revenue e Fees

Separar:

```text
Fees
Revenue
Protocol Revenue
Token Holder Revenue
```

Registrar:

- Revenue 7d;
- Revenue 30d;
- Revenue 90d;
- Revenue anualizado;
- crescimento;
- tendência;
- origem.

---

# 14. Como o Projeto Ganha Dinheiro

Classificar a principal fonte de receita:

### DEX

Trading fees.

### Lending

Juros de empréstimos.

### Perpetuals

Trading fees/funding/serviços relacionados.

### Stablecoins

Yield sobre reservas, fees e outros mecanismos.

### L1/L2

Gas fees e serviços relacionados.

### Oracle

Taxas de utilização/assinatura.

### RWA

Issuance/management/serviços.

### Prediction Markets

Trading fees.

### Liquid Staking

Percentual da receita de staking.

### Outros

Descrever explicitamente.

---

# 15. Revenue Quality

Criar uma métrica independente.

Classificação sugerida:

```text
A = receita recorrente, diversificada e crescente
B = recorrente, mas volátil
C = dependente de incentivos
D = predominantemente não recorrente
```

Investigar:

- recorrência;
- diversificação;
- dependência de incentivos;
- dependência de token emission;
- concentração;
- sustentabilidade;
- margem quando disponível.

---

# 16. Incentives e Sustentabilidade Econômica

Criar:

```text
Economic Sustainability
```

Quando houver dados:

```text
Revenue
-
Incentives
=
Net Economic Activity
```

Se:

```text
Revenue = $10M
Incentives = $15M
```

marcar risco de crescimento comprado por incentivos.

Não interpretar essa fórmula como demonstração contábil completa; é um
indicador analítico simplificado.

---

# 17. Eficiência do Capital

Criar:

```text
TVL / Revenue
Revenue / TVL
Market Cap / Revenue
FDV / Revenue
Market Cap / TVL
```

Exemplo:

```text
TVL = $1B
Revenue anual = $100M

Revenue / TVL = 10%
TVL / Revenue = 10x
```

Comparar sempre dentro de grupos comparáveis.

---

# 18. Usuários e Atividade

Quando possível:

- Active Addresses;
- New Users;
- Transactions;
- Retained Users;
- Volume;
- Volume por usuário;
- crescimento de atividade.

### Crescimento saudável

```text
TVL ↑
Revenue ↑
Users ↑
Volume ↑
```

### Possível crescimento artificial

```text
TVL ↑
Revenue →
Users →
Volume ↓
```

---

# 19. Funding e Venture Capital

Para cada projeto:

```text
Total Raised
Seed
Private
Strategic
Series A
Series B
Token Sale
outras rodadas
```

Pesquisar:

- valor da rodada;
- data;
- lead investor;
- participantes;
- valuation quando disponível;
- capital total;
- investidores estratégicos.

## 19.1 Investidores

Exemplos de VCs a identificar quando aplicável:

- a16z
- Paradigm
- Coinbase Ventures
- Binance Labs
- Polychain
- Dragonfly
- Framework
- Pantera
- Multicoin
- Jump
- Galaxy
- outros.

Não interpretar presença de VC como garantia de sucesso.

---

# 20. Institutional Conviction

Criar indicador:

```text
Institutional Conviction
```

Considerar:

- qualidade dos investidores;
- número de rodadas;
- investidores recorrentes;
- capital levantado;
- participação de investidores estratégicos;
- recência do funding.

O indicador deve ser tratado como sinal de convicção institucional, não
como recomendação de compra.

---

# 21. Tokenomics

Coletar:

```text
Market Cap
Circulating Supply
Total Supply
Max Supply
FDV
Circulating %
Emission
Inflation
```

Avaliar:

- distribuição;
- team allocation;
- investor allocation;
- ecosystem;
- community;
- treasury;
- staking;
- burn;
- buyback;
- emissions.

---

# 22. Unlock Pressure

Coletar:

- próximo unlock;
- data;
- quantidade;
- percentual da supply circulante;
- valor estimado;
- categoria;
- team;
- investors;
- advisors;
- foundation;
- ecosystem;
- community.

Criar:

```text
Unlock / Circulating Supply
```

Classificação:

```text
Baixa
Moderada
Alta
Crítica
```

---

# 23. Value Capture

Essa é uma das métricas centrais.

Fluxo:

```text
USER FEES
    |
    v
PROTOCOL FEES
    |
    +--> LPs
    +--> Validators
    +--> Treasury
    +--> Team
    +--> Token Holders
    +--> Buyback
    +--> Burn
```

Criar:

```text
Token Holder Revenue
--------------------
Protocol Revenue
```

Exemplo:

```text
Protocol Revenue = $10M
Token holders = $6M

Value Capture = 60%
```

Se:

```text
Protocol Revenue = $10M
Token holders = $0
```

indicar:

> Protocolo pode ter excelente economia, mas o token pode ter captura de
> valor baixa ou nula.

---

# 24. Valuation

Calcular quando os dados permitirem:

```text
Market Cap / Revenue
FDV / Revenue
Market Cap / TVL
FDV / TVL
Revenue / TVL
```

Comparar com:

- pares do mesmo setor;
- histórico do próprio protocolo;
- médias/medianas do setor.

Não usar múltiplos isolados como decisão de investimento.

---

# 25. Catalisadores

Pesquisar:

- Mainnet;
- Testnet;
- upgrades;
- V2/V3/V4;
- listings;
- integrações;
- partnerships;
- token launch;
- airdrops;
- governance votes;
- novas chains;
- institutional adoption;
- regulatory developments;
- novos produtos;
- buybacks;
- burns;
- staking;
- revenue sharing.

Cada catalyst deve ter:

```text
Impacto
Probabilidade
Horizonte
Fonte
Data esperada
Status
```

Exemplo:

```text
Catalyst: Mainnet Upgrade
Impacto: Alto
Probabilidade: Alta
Horizonte: 30 dias
```

---

# 26. Riscos

Para cada projeto procurar:

- unlock próximo;
- inflação;
- concentração de tokens;
- baixa liquidez;
- dependência de incentivos;
- dependência de uma única chain;
- dependência de uma única fonte de receita;
- baixa value capture;
- FDV excessivo;
- competição;
- risco regulatório;
- risco de smart contract;
- bridge risk;
- centralização;
- governança;
- dependência de market makers;
- dependência de grants;
- queda de usuários;
- queda de volume.

---

# 27. Divergência Fundamental vs Preço

Criar módulo específico.

### Divergência positiva

```text
TVL       +45%
Revenue   +70%
Users     +38%
Token      +5%
```

Resultado:

> Fundamental momentum superior ao preço.

### Divergência negativa

```text
Token     +80%
TVL        +5%
Revenue   -10%
Users      -3%
```

Resultado:

> Preço crescendo significativamente acima dos fundamentos.

Essa informação deve aparecer no dashboard.

---

# 28. Score 0--100

Score inicial recomendado:

## Fundamental --- 30 pontos

```text
TVL Growth             8
Revenue Growth         7
Fees/Revenue           5
Users/Activity         5
Capital Efficiency    5
```

## Tokenomics --- 20 pontos

```text
Value Capture           8
Supply/Unlocks          5
FDV/MC                  3
Emission                2
Buyback/Burn            2
```

## Capital Institucional --- 15 pontos

```text
Total Funding           5
VC Quality              5
Recent Funding          3
Strategic Investors     2
```

## Narrative --- 15 pontos

```text
Sector Momentum         5
Market Attention        3
Institutional Narrative 3
Competitive Position    4
```

## Catalysts --- 10 pontos

```text
Near-term Catalyst      5
Potential Impact        3
Probability             2
```

## Valuation --- 10 pontos

```text
MC/Revenue              3
FDV/Revenue             2
MC/TVL                  2
Revenue/TVL             3
```

Total:

```text
100 pontos
```

---

# 29. Confidence Score

Nunca confundir:

```text
Score = qualidade/oportunidade estimada
Confidence = confiança nos dados e na conclusão
```

Exemplo:

```text
Score: 92
Confidence: 55%
```

é diferente de:

```text
Score: 88
Confidence: 96%
```

Confidence considerar:

- completude dos dados;
- qualidade das fontes;
- recência;
- cross-validation;
- quantidade de dados estimados;
- consistência entre fontes.

---

# 30. Rankings

Não criar apenas um ranking.

Criar pelo menos três:

## Growth

Projetos com maior aceleração:

- TVL;
- Revenue;
- Users;
- Volume.

## Value

Projetos com:

- Revenue alto;
- valuation relativamente baixo;
- value capture alto;
- boa eficiência de capital.

## Narrative

Projetos com:

- narrativa forte;
- capital entrando;
- catalisadores;
- posicionamento;
- VC backing.

### Conviction Score

Combinar:

```text
Growth
+
Value
+
Narrative
+
Risk
+
Confidence
```

---

# 31. Research Report

Relatório semanal deve começar com panorama.

```text
CRYPTO FUNDAMENTALS WEEKLY REPORT

Semana: DD/MM/YYYY

Market Regime

Narrativa #1
Narrativa #2
Narrativa #3

Top Opportunities

1. XYZ
2. ABC
3. DEF
```

Para cada ativo:

```text
Projeto
Token
Setor
Narrativa

TVL
TVL Growth
Revenue
Revenue Growth
Fees
Users
Volume

Funding
VCs
Capital total

Chains

Tokenomics
Unlocks
FDV
Market Cap

Value Capture

Catalysts

Risks

Fundamental vs Price Divergence

Score
Confidence

Bull Case
Bear Case
Conclusion
```

---

# 32. Research Trace

Toda conclusão deve ser rastreável.

Ao clicar em:

```text
XYZ Score = 91
```

mostrar:

```text
TVL Growth       +42%
Source            DefiLlama

Revenue Growth   +67%
Source            DefiLlama

Funding          $120M
Sources           ...

VCs              Paradigm / a16z / ...
Sources           ...

Chains           Ethereum / Base / Arbitrum

Value Capture    73%

Confidence       94%
```

Nunca gerar conclusão sem registrar a evidência utilizada.

---

# 33. Kanban

O Kanban é o pipeline operacional do Research.

Colunas:

```text
BACKLOG
DISCOVERY
DATA COLLECTION
FUNDAMENTAL ANALYSIS
CROSS-CHECK
SECOND BRAIN
SCORING
FINAL REVIEW
PUBLISHED
```

Cada card deve conter:

```text
Project
Sector
Narrative
Reason for Research
Progress
Checklist
Score
Confidence
Current Stage
Created At
Updated At
Research Run
```

Exemplo:

```text
XYZ

RWA

████████░░ 80%

TVL                 ✓
Revenue             ✓
Funding             ✓
VC                  ✓
Chains              ✓
Tokenomics          ⚠
Catalysts           ✓
Second Brain        ⏳

Score: 89
```

---

# 34. Kanban Automatizado

O Agent deve criar cards automaticamente.

Exemplo:

```text
[NEW]

Research XYZ

Reason:
TVL +42% / 30d
Revenue +67% / 30d
Narrative: RWA
```

Ao terminar coleta:

```text
DATA COLLECTION
```

Depois:

```text
FUNDAMENTAL ANALYSIS
```

Depois:

```text
SECOND BRAIN
```

Depois:

```text
PUBLISHED
```

O Kanban deve funcionar como trilha visual da pesquisa.

---

# 35. Second Brain

O Second Brain NÃO deve ser apenas outro chatbot.

Ele deve funcionar como:

> **auditor adversarial + estrategista de melhoria do sistema.**

## 35.1 Perguntas

Quando Research Agent disser:

> XYZ é excelente.

Second Brain pergunta:

- Por quê?
- Qual evidência?
- A fonte é confiável?
- Os dados estão atualizados?
- O crescimento é orgânico?
- Há incentivos?
- Existe unlock?
- O token captura valor?
- Há concorrente melhor?
- A valuation é justificável?
- A narrativa está saturada?
- Existe risco oculto?
- A tese poderia estar errada?

---

# 36. Second Brain --- Detecção de Problemas

Pesquisar:

```text
Dados inconsistentes
Dados antigos
Fontes fracas
Revenue mal interpretado
TVL artificial
Incentivos excessivos
Unlock próximo
VC selling pressure
FDV alto
Token sem value capture
Narrativa saturada
Concorrente superior
Dependência de uma chain
```

---

# 37. Second Brain --- Melhorias

O Second Brain pode gerar:

```text
SYSTEM IMPROVEMENTS

Prioridade: Alta

Adicionar:
Revenue Quality Score

Motivo:
Muitos projetos possuem revenue dependente de incentivos.

Impacto esperado:
Alto

Status:
Create Task
```

Outro:

```text
Adicionar:
TVL Organic Growth Score

Motivo:
TVL isolado não distingue capital incentivado de capital orgânico.
```

Ao aprovar:

```text
Second Brain
    |
    v
Improvement Proposal
    |
    v
Create Kanban Task
    |
    v
BACKLOG
```

---

# 38. Ciclo de Autoaperfeiçoamento

```text
Research Agent
      |
      v
Research
      |
      v
Second Brain
      |
      v
Detects weakness
      |
      v
Improvement Proposal
      |
      v
Kanban
      |
      v
Implementation
      |
      v
New Research
```

O sistema não deve alterar automaticamente regras críticas de scoring
sem aprovação. Melhorias devem ter:

- proposta;
- justificativa;
- impacto;
- prioridade;
- aprovação;
- versão;
- rollback.

---

# 39. Histórico

Salvar cada Research Run.

Exemplo:

```text
Week 1
XYZ Score 71

Week 2
XYZ Score 77

Week 3
XYZ Score 83

Week 4
XYZ Score 91
```

Criar:

```text
Fundamental Momentum
```

Exemplo:

```text
Score +20 em 4 semanas
```

Isso permite descobrir aceleração fundamental antes de atenção
generalizada do mercado.

---

# 40. Backtesting

Registrar:

```text
Research Date
Project
Score
Confidence
TVL
Revenue
Market Cap
Token Price
Narrative
Catalysts
```

Depois medir:

```text
+7d
+30d
+90d
```

Comparar com benchmarks apropriados.

Perguntas:

- Score \>85 gerou outperformance?
- Confidence alta melhorou a precisão?
- TVL Growth é realmente preditivo?
- Revenue Growth é mais útil?
- Value Capture melhora o resultado?
- Unlock Pressure reduz performance?
- Narrative Score funciona?
- Catalysts funcionam?
- Qual combinação de métricas apresenta maior poder explicativo?

Não transformar backtesting em garantia de retorno futuro.

---

# 41. Fontes de Dados

## Tier 1 --- Quantitativo

- DefiLlama
- CoinGecko
- CoinMarketCap
- DEX Screener

## Tier 2 --- On-chain

- Artemis
- Dune
- Nansen
- Arkham
- Token Terminal

## Tier 3 --- Funding

- DefiLlama Raises
- CryptoRank
- Messari
- Crunchbase quando aplicável
- sites oficiais de VCs
- anúncios oficiais
- press releases

## Tier 4 --- Qualitativo

- documentação oficial;
- governance;
- blog;
- X;
- Discord;
- GitHub;
- notícias.

### Regra de fontes

Priorizar fontes primárias.

Não utilizar uma única fonte quando o dado for crítico.

Quando possível:

```text
Source A
+
Source B
=
Cross-validation
```

---

# 42. Qualidade dos Dados

Cada dado deve ter:

```text
value
unit
source
source_url/reference
retrieved_at
data_timestamp
period
confidence
```

Classificação:

```text
HIGH
MEDIUM
LOW
ESTIMATED
```

Nunca preencher ausência com valor inventado.

Se não houver dado:

```text
N/A
```

e explicar por quê.

---

# 43. Anti-Hallucination Rules

O Agent NÃO pode:

- inventar funding;
- inventar VC;
- inventar valuation;
- inventar Revenue;
- inventar TVL;
- inventar investidores;
- inventar catalisadores;
- inventar unlocks;
- assumir value capture;
- apresentar estimativa como dado oficial.

Toda afirmação factual relevante deve possuir fonte.

Quando houver estimativa:

```text
ESTIMATED
```

deve aparecer claramente.

---

# 44. Arquitetura Técnica Recomendada

Como o projeto deve ser preparado para crescimento e futura integração
com o ecossistema de agentes, utilizar arquitetura modular.

```text
crypto-research/

apps/
  dashboard/
  research-agent/
  second-brain/
  scheduler/

packages/
  database/
  defi-data/
  market-data/
  funding-data/
  research-engine/
  scoring-engine/
  tokenomics/
  catalysts/
  kanban/
  ai/
  shared/

infrastructure/
  postgres/
  redis/
  workers/
```

Stack sugerida:

- Next.js;
- TypeScript;
- PostgreSQL;
- Redis;
- BullMQ;
- API integrations;
- AI provider abstraction;
- Docker;
- scheduler/workers;
- observability/logging.

Não acoplar o sistema a um único provedor de IA.

---

# 45. Fluxo Técnico

```text
Scheduler
   |
   v
BullMQ
   |
   v
Research Worker
   |
   +--> DefiLlama
   +--> Market APIs
   +--> Funding APIs
   +--> News/Search
   +--> Official Sources
   |
   v
Normalizer
   |
   v
PostgreSQL
   |
   v
Analysis Engine
   |
   +--> Fundamental
   +--> Narrative
   +--> Capital
   +--> Tokenomics
   +--> Catalysts
   +--> Valuation
   +--> Risk
   |
   v
Scoring Engine
   |
   v
Second Brain
   |
   v
Final Review
   |
   +--> Dashboard
   +--> Kanban
   +--> Report
   +--> Historical Snapshot
```

---

# 46. Modelo de Dados Inicial

Entidades recomendadas:

```text
projects
protocols
tokens
chains
sectors
narratives

tvl_snapshots
revenue_snapshots
fee_snapshots
user_snapshots
volume_snapshots

funding_rounds
investors
venture_capitals
token_unlocks
tokenomics

catalysts
research_runs
research_findings
research_sources

scores
score_history

second_brain_reviews
improvement_proposals

kanban_boards
kanban_columns
kanban_cards
kanban_events

api_connections
agent_settings

pine_indicators
technical_signals
```

---

# 47. Snapshot Imutável de Research

Não salvar somente o resultado final.

Salvar também os dados utilizados para produzir o resultado.

Exemplo:

```text
Research Run #20260915

TVL:
$1.42B

TVL 30d:
+48%

Revenue:
$38.2M

Revenue Growth:
+61%

Funding:
$120M

Score:
91

Confidence:
94%

Sources:
DefiLlama
Official docs
VC announcements
...
```

Isso permite responder no futuro:

> "Por que o Agent deu Score 91 para XYZ naquela semana?"

---

# 48. Estado do Research

Cada projeto deve ter estado:

```text
DISCOVERED
DATA_PENDING
DATA_COMPLETE
ANALYZING
CROSS_CHECK
SECOND_BRAIN
SCORED
FINAL_REVIEW
PUBLISHED
ARCHIVED
```

---

# 49. Dashboard --- Página de Narrativas

Mostrar:

```text
Narrative
TVL Growth
Revenue Growth
Capital Inflow
Number of Projects
Average Score
Average Confidence
Catalysts
Risk
Momentum
```

Exemplo:

```text
RWA
TVL       +18%
Revenue  +27%
Capital   +$420M
Score     91
```

---

# 50. Dashboard --- Página do Projeto

Estrutura:

```text
HEADER

XYZ
RWA
Score 92
Confidence 94%

OVERVIEW

TVL
Revenue
Users
Volume
Market Cap
FDV

FUNDAMENTALS

TVL Chart
Revenue Chart
Users Chart

CAPITAL

Funding
VCs
Rounds

TOKENOMICS

Supply
Unlocks
Emissions
Value Capture

CHAINS

Ethereum
Base
Arbitrum

CATALYSTS

Next 30/60/90 days

RISKS

...

SECOND BRAIN

...

RESEARCH TRACE

...

HISTORICAL SCORE

...
```

---

# 51. Alertas

Criar alertas para:

- TVL acceleration;
- Revenue acceleration;
- sudden TVL decline;
- revenue decline;
- major funding;
- major catalyst;
- major unlock;
- value capture change;
- score crossing threshold;
- confidence falling;
- data source failure.

Exemplo:

```text
🔥 FUNDAMENTAL ALERT

XYZ

TVL 30d: +52%
Revenue 30d: +71%

Score:
74 → 89

Reason:
TVL + Revenue acceleration
```

---

# 52. Segunda Fase --- Trading Intelligence

A análise técnica será incorporada depois que o núcleo fundamentalista
estiver estável.

Base:

> _Learn TradingView Pine Script Programming From Scratch --- Paul D.
> Mendes_

Objetivos:

- aprender Pine Script;
- criar indicadores próprios;
- testar indicadores;
- documentar parâmetros;
- integrar sinais ao dashboard;
- combinar sinais técnicos com fundamentos.

---

# 53. Indicadores Técnicos Futuramente

## Momentum

- RSI;
- MACD;
- ROC;
- Momentum;
- Trend Strength.

## Volume

- Volume anomaly;
- OBV;
- Volume Profile;
- Volume Expansion.

## Volatilidade

- ATR;
- Bollinger Bands;
- Volatility Regime.

## Tendência

- EMA;
- SMA;
- Supertrend;
- ADX.

## Estrutura

- Higher High;
- Higher Low;
- Lower High;
- Lower Low;
- Breakout;
- Support;
- Resistance.

---

# 54. Indicadores Próprios

Não limitar a plataforma a indicadores tradicionais.

Criar indicadores específicos para cripto fundamentalista.

## Fundamental Momentum Indicator

Combinar:

```text
TVL Growth
+
Revenue Growth
+
User Growth
+
Volume Growth
```

Resultado:

```text
Fundamental Momentum = 82/100
```

---

# 55. Fundamental vs Price Divergence

Indicador futuro:

```text
Fundamentals = 85
Price        = 48

Positive Divergence
```

ou:

```text
Fundamentals = 42
Price        = 87

Negative Divergence
```

---

# 56. Opportunity Engine --- Fase 3

Combinar:

```text
Fundamental
+
On-chain
+
Narrative
+
Catalyst
+
Technical
+
Valuation
+
Risk
+
Confidence
```

Resultado:

```text
CRYPTO OPPORTUNITY SCORE

91/100

HIGH CONVICTION
```

---

# 57. Separar "Boa Empresa" de "Bom Trade"

Essa distinção deve ser permanente.

Projeto Fundamentos Técnica Interpretação

---

XYZ 94 91 Forte
ABC 91 43 Bom projeto / esperar entrada
DEF 47 92 Trade técnico / fundamentos fracos
GHI 31 28 Baixa qualidade

Não utilizar "Score alto" como sinônimo automático de "comprar".

---

# 58. Fases de Desenvolvimento

## FASE 0 --- Specification

- documento mestre;
- arquitetura;
- banco;
- UX;
- contratos de dados;
- regras de scoring;
- segurança.

## FASE 1 --- Crypto Research Core

Implementar:

- dashboard;
- configurações;
- API Keys;
- scheduler;
- DefiLlama;
- TVL;
- Fees;
- Revenue;
- Funding;
- VC;
- Chains;
- Tokenomics;
- Unlocks;
- Catalysts;
- Ranking;
- Score;
- Confidence;
- Research Trace;
- histórico.

## FASE 1.5 --- Second Brain

- auditoria;
- crítica;
- inconsistências;
- melhorias;
- Improvement Proposals;
- Kanban integrado.

## FASE 1.6 --- Research Intelligence

- histórico;
- divergências;
- momentum;
- backtesting;
- comparação setorial.

## FASE 2 --- Pine Script / TradingView

- estudo estruturado do curso;
- primeiros indicadores;
- indicadores personalizados;
- sinais;
- integração.

## FASE 3 --- Combined Intelligence

- Fundamental Score;
- Technical Score;
- Opportunity Score;
- sinais compostos;
- backtesting.

---

# 59. Ordem de Implementação Recomendada

### Sprint 1

- repository;
- Next.js;
- TypeScript;
- PostgreSQL;
- Redis;
- Docker;
- arquitetura;
- migrations;
- base dashboard.

### Sprint 2

- API connections;
- secret management;
- DefiLlama integration;
- data ingestion;
- snapshots.

### Sprint 3

- TVL;
- Revenue;
- Fees;
- Chains;
- basic ranking.

### Sprint 4

- Funding;
- VC;
- Tokenomics;
- Unlocks;
- Catalysts.

### Sprint 5

- Scoring;
- Confidence;
- valuation;
- value capture;
- research trace.

### Sprint 6

- Kanban;
- Research pipeline;
- scheduler;
- automatic cards.

### Sprint 7

- Second Brain;
- audit;
- improvement proposals.

### Sprint 8

- Historical analysis;
- divergence;
- backtesting.

### Sprint 9+

- Pine Script;
- TradingView;
- Technical Intelligence.

---

# 60. Definition of Done --- Fase 1

A Fase 1 somente deve ser considerada pronta quando:

- [ ] Dashboard funcional;
- [ ] API Keys seguras;
- [ ] Scheduler funcional;
- [ ] Full Research funcional;
- [ ] Incremental Research funcional;
- [ ] DefiLlama integrado;
- [ ] TVL histórico;
- [ ] TVL por chain;
- [ ] Fees;
- [ ] Revenue;
- [ ] Revenue Quality;
- [ ] Funding;
- [ ] VC;
- [ ] Chains;
- [ ] Tokenomics;
- [ ] Unlocks;
- [ ] Value Capture;
- [ ] Valuation;
- [ ] Catalysts;
- [ ] Risks;
- [ ] Score 0--100;
- [ ] Confidence;
- [ ] Ranking por setor;
- [ ] Ranking Growth;
- [ ] Ranking Value;
- [ ] Ranking Narrative;
- [ ] Research Trace;
- [ ] Kanban;
- [ ] Histórico;
- [ ] logs;
- [ ] tratamento de falhas;
- [ ] testes;
- [ ] documentação.

---

# 61. Definition of Done --- Second Brain

- [ ] recebe o resultado completo da pesquisa;
- [ ] verifica fontes;
- [ ] procura inconsistências;
- [ ] questiona a tese;
- [ ] identifica riscos;
- [ ] compara projetos;
- [ ] avalia qualidade do Score;
- [ ] gera recomendações;
- [ ] gera Improvement Proposals;
- [ ] cria cards no Kanban mediante aprovação;
- [ ] mantém histórico das melhorias;
- [ ] possui versionamento;
- [ ] não altera regras críticas automaticamente.

---

# 62. Definition of Done --- Fase 2

- [ ] Conteúdo do curso convertido em plano de implementação;
- [ ] Pine Script básico dominado;
- [ ] Indicadores tradicionais implementados;
- [ ] Indicadores personalizados;
- [ ] testes;
- [ ] documentação;
- [ ] integração TradingView;
- [ ] Technical Score;
- [ ] sinais;
- [ ] histórico;
- [ ] backtesting.

---

# 63. Regras para Claude Code

Claude Code deve tratar este documento como **especificação mestre**,
mas não deve implementar tudo de uma vez.

Antes de modificar código:

1.  Inspecionar o repositório.
2.  Identificar stack existente.
3.  Identificar integrações reais.
4.  Identificar mocks.
5.  Identificar dívida técnica.
6.  Verificar estrutura de banco.
7.  Verificar variáveis de ambiente.
8.  Verificar testes existentes.
9.  Criar plano de execução.
10. Implementar em pequenos incrementos.
11. Testar cada incremento.
12. Atualizar documentação.
13. Atualizar Kanban.
14. Fazer auditoria.
15. Somente depois avançar para a próxima etapa.

### Proibições

Claude Code não deve:

- criar dados falsos;
- criar APIs fictícias apresentadas como reais;
- esconder erros;
- ignorar falhas de integração;
- hardcodear API Keys;
- armazenar secrets em texto puro;
- alterar scoring crítico sem documentar;
- criar "mock data" em produção sem sinalização;
- declarar integração funcional sem teste real.

---

# 64. Regra de Dados Reais vs Mock

Toda integração deve ter status:

```text
REAL
PARTIAL
MOCK
UNAVAILABLE
ERROR
```

No dashboard:

```text
DefiLlama     REAL
CoinGecko     REAL
Nansen        NOT CONFIGURED
```

Nunca apresentar mock como dado real.

---

# 65. Observabilidade

Registrar:

- Research Run;
- duração;
- APIs chamadas;
- erros;
- retries;
- quantidade de projetos;
- quantidade de dados coletados;
- fontes;
- custo estimado de IA quando disponível;
- Score;
- Confidence;
- Second Brain result;
- melhorias.

Dashboard administrativo:

```text
Last Run
Duration
Projects
Sources
Errors
API Calls
AI Cost
```

---

# 66. Tratamento de Falhas

Se uma fonte falhar:

```text
DefiLlama ERROR
```

o sistema deve:

1.  registrar;
2.  retry quando apropriado;
3.  tentar fonte alternativa quando configurada;
4.  reduzir Confidence;
5.  não inventar o dado;
6.  marcar o campo como indisponível;
7.  informar no Research Trace.

---

# 67. Princípios de UX

O usuário deve conseguir responder rapidamente:

1.  O que está acontecendo?
2.  Qual narrativa está forte?
3.  Quais projetos estão se destacando?
4.  Por quê?
5.  Como eles ganham dinheiro?
6.  Quem investiu?
7.  Quanto capital receberam?
8.  Onde estão operando?
9.  Qual o risco?
10. O token captura valor?
11. Qual é o próximo catalisador?
12. O Score é confiável?
13. O que o Second Brain está questionando?

---

# 68. Linguagem do Dashboard

Interface principal em **português do Brasil**.

Termos técnicos que são universalmente utilizados podem permanecer em
inglês quando isso melhorar a precisão:

- TVL;
- Revenue;
- Fees;
- Market Cap;
- FDV;
- Unlock;
- Funding;
- Venture Capital;
- Catalyst;
- Value Capture;
- Score;
- Confidence;
- Backtesting;
- Pine Script;
- TradingView.

Sempre que necessário, apresentar explicação em português.

---

# 69. Princípios de Investimento do Sistema

O sistema é uma ferramenta de research, não um oráculo.

Nunca afirmar:

- "vai subir";
- "garante retorno";
- "compra obrigatória";
- "risco zero".

Preferir:

- "fundamentos fortes";
- "melhora de momentum fundamental";
- "valuation relativamente atrativo";
- "risco elevado de unlock";
- "divergência positiva";
- "tese depende de X";
- "confidence baixa devido a Y".

---

# 70. Roadmap Futuro

Após estabilizar o núcleo:

```text
Crypto Research
       |
       +--> Second Brain
       |
       +--> Historical Intelligence
       |
       +--> Backtesting
       |
       +--> Pine Script
       |
       +--> TradingView
       |
       +--> Technical Signals
       |
       +--> Opportunity Engine
       |
       +--> Automated Research Desk
```

---

# 71. Prompt Inicial para Claude Code

Use o seguinte prompt ao iniciar o desenvolvimento:

```text
Você é o engenheiro principal responsável por implementar o projeto
Crypto Research Intelligence.

Leia primeiro o arquivo:
Crypto_Research_Intelligence_Master_Roadmap.md

Este arquivo é a especificação mestre do produto.

NÃO implemente todo o projeto de uma vez.

Primeiro faça uma auditoria completa do repositório atual:

1. stack;
2. arquitetura;
3. banco de dados;
4. infraestrutura;
5. APIs;
6. variáveis de ambiente;
7. integrações reais;
8. mocks;
9. testes;
10. segurança;
11. pontos de dívida técnica.

Depois apresente:

- arquitetura atual;
- arquitetura recomendada;
- gaps;
- riscos;
- dependências;
- ordem de implementação;
- plano por sprints.

Não altere código antes dessa auditoria.

Depois da aprovação, implemente incrementalmente.

Para cada etapa:

1. planeje;
2. implemente;
3. teste;
4. valide;
5. documente;
6. atualize o Kanban;
7. faça uma mini-auditoria;
8. somente então avance.

Prioridades:

- dados reais;
- rastreabilidade;
- segurança;
- modularidade;
- observabilidade;
- testes;
- UX simples;
- possibilidade de evolução para Pine Script/TradingView.

Nunca invente dados.

Nunca apresente mock como integração real.

Toda conclusão de research deve possuir fonte.

Toda API Key deve ser protegida.

O Second Brain deve funcionar como auditor adversarial e mecanismo de melhoria do sistema.

Não implementar Trading Intelligence/Pine Script na Fase 1, mas projetar as interfaces e entidades necessárias para sua futura integração.

Ao final de cada sprint informe:

- o que foi implementado;
- arquivos alterados;
- banco alterado;
- testes executados;
- resultado dos testes;
- problemas encontrados;
- próximos passos;
- status do Kanban.
```

---

# 72. Próximo Passo Oficial

O próximo passo do projeto deve ser:

> **Auditar o repositório atual no VSCode e mapear a arquitetura
> existente antes de começar a implementação.**

Depois:

```text
AUDIT
  ↓
ARCHITECTURE
  ↓
DATABASE
  ↓
DATA SOURCES
  ↓
MVP
  ↓
IMPLEMENTATION
```

A primeira versão deve priorizar **Research Core + Dashboard + Kanban**,
deixando Pine Script preparado arquiteturalmente para a segunda fase.

---

## Documento de referência

Este arquivo deve ser tratado como documento vivo.

Sempre que uma decisão estrutural for tomada:

1.  atualizar este Markdown;
2.  registrar a decisão;
3.  registrar o motivo;
4.  atualizar o roadmap;
5.  atualizar o Kanban;
6.  atualizar a arquitetura quando necessário.

---

# 73. Extensão Futura — Knowledge Base, Discovery, Top 10 e Histórico

Registrado após os Sprints 1-7 (Research Core, Scoring, Kanban Pull System já implementados —
ver `STATUS_PROJETO.md`). Esta seção documenta uma extensão arquitetural planejada, **não
implementada ainda**, que evolui o sistema de "coleta + score de uma lista fixa" para uma
plataforma de descoberta e conhecimento contínuo sobre o mercado cripto.

Especificação completa, auditoria de estado real, e menor evolução arquitetural proposta para
cada peça estão em documentos dedicados (não duplicados aqui):

- `CRYPTO_RESEARCH_INTELLIGENCE_GUIDE.md`
- `DATA_DICTIONARY.md`
- `TUTORIAL.md`
- `PROJECT_DISCOVERY_SPEC.md`
- `TOP10_SELECTION_SPEC.md`
- `RESEARCH_HISTORY_SPEC.md`
- `PROJECT_RESEARCH_REPORT_SPEC.md`

Princípio orientador: preservar tudo que já funciona (schema, APIs, histórico append-only,
Kanban Pull System), nunca substituir dado real por mock, e evoluir a menor superfície de
schema/código necessária em cada etapa — sem implementar Second Brain, Pine Script, TradingView,
Backtesting, Multi-tenant ou Opportunity Engine neste ciclo.

**Versão inicial:** 1.0\
**Status:** Especificação mestre\
**Fase atual:** Planejamento / Auditoria\
**Próxima etapa:** Auditoria do repositório e arquitetura existente
