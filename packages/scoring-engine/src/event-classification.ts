// Sprint 20 (Auditable Event Classification Engine). Pura matemática/lógica de texto — sem
// I/O, sem DB, sem chamada externa, sem LLM (ver Fase 25: LLM classification é explicitamente
// FORA de escopo desta sprint; `FUTURE_LLM` só existe como valor reservado no enum de
// `classificationMethod`, nunca usado aqui). Mesma separação de camadas do resto do
// scoring-engine: quem persiste (`events-repository.ts`) decide QUANDO chamar isto; este
// arquivo só decide O QUE a classificação seria, dado um texto.
//
// PRINCÍPIO CENTRAL (Fase 8 do documento de especificação): nunca `if (text.includes("mainnet"))
// → MAINNET`. Toda regra exige um VERBO/AÇÃO junto da palavra-chave (launch/live/deployment/
// deployed/etc.) — "preparing for mainnet" e "how mainnet works" nunca casam com nenhuma regra
// abaixo, caem em OTHER corretamente (ver testes).
//
// Fontes ESTRUTURADAS (Snapshot/FundingRound/SecurityIncident/Listing-Delisting) NUNCA passam
// por esta engine — `events-repository.ts` já atribui a categoria diretamente para elas
// (`classificationMethod: STRUCTURED_SOURCE`). A engine só é chamada para fontes de texto livre
// (hoje: GitHub Releases). Isso é reforçado pela ARQUITETURA (a função nunca é invocada para
// essas fontes), não por uma regra especial de prioridade dentro da engine.

export type ClassificationConfidence = "HIGH" | "MEDIUM" | "LOW";

// Limite de segurança (Fase 6/21): nunca armazenar um trecho de evidência maior que isto —
// mesmo que o release/proposta tenha um corpo de texto enorme.
export const MAX_EVIDENCE_LENGTH = 160;
// Limite de segurança para o texto de ENTRADA da engine (Fase 21/22: nunca processar um corpo
// de texto arbitrariamente grande — releases do GitHub podem ter changelogs de milhares de
// caracteres). Regexes abaixo são todas simples (sem quantificadores aninhados/alternações
// catastróficas), mas truncar a entrada é uma segunda camada de defesa contra ReDoS/DoS barata.
export const MAX_CLASSIFICATION_INPUT_LENGTH = 4000;

export interface ClassificationInput {
  title: string;
  description?: string | null;
}

export interface ClassificationResult {
  category: string; // um valor de ResearchEventCategory, ou "OTHER"
  confidence: ClassificationConfidence;
  classificationMethod: "RULE";
  ruleId: string | null; // null quando nenhuma regra deu match (OTHER)
  evidence: string | null; // trecho do texto original que motivou a categoria escolhida
  // Fase 5: outras categorias que também tiveram alguma regra correspondente, mas não foram a
  // primária (ordem de prioridade fixa — ver PRIORITY_ORDER). Nunca persistido como evento
  // separado nesta sprint — só informativo/auditável.
  secondaryCandidates: string[];
}

interface ClassificationRule {
  id: string;
  category: string;
  confidence: ClassificationConfidence;
  patterns: RegExp[];
  // Se QUALQUER padrão aqui casar, a regra inteira é descartada mesmo que um `patterns` também
  // tenha casado — usado para separar "burn mechanism/proposal" (não é um burn real) de "tokens
  // were burned" (é).
  exclusionPatterns?: RegExp[];
}

// Ordem de prioridade fixa e determinística (Fase 4) — usada só para decidir qual categoria vira
// PRIMÁRIA quando mais de uma regra casa no mesmo texto (Fase 5). Ordem escolhida por
// especificidade/força de sinal: eventos de rede (mainnet/testnet/upgrade) antes de eventos de
// tokenomics, antes de eventos de produto/ecossistema, antes dos sinais mais fracos/ambíguos
// (integration/partnership, por último de propósito — mesma cautela do documento de
// especificação: "cuidado para não confundir qualquer menção externa com parceria formal").
const PRIORITY_ORDER = [
  "MAINNET",
  "TESTNET",
  "PROTOCOL_UPGRADE",
  "TOKEN_MIGRATION",
  "TOKEN_BURN",
  "TOKEN_BUYBACK",
  "STAKING",
  "NEW_CHAIN",
  "ECOSYSTEM_EXPANSION",
  "PRODUCT_LAUNCH",
  "INTEGRATION",
  "PARTNERSHIP",
];

// Fase 3 — regras determinísticas. Todos os padrões são case-insensitive, simples (sem
// quantificadores aninhados — seguro contra ReDoS) e exigem um VERBO/estado junto da
// palavra-chave, nunca a palavra-chave isolada.
const RULES: ClassificationRule[] = [
  {
    // Sprint 22 (Multi-Sector Event Source Expansion): v2 — removido o padrão bare "mainnet
    // deployment" (e o equivalente testnet abaixo), que era `v1`. Causa: 26 falsos positivos
    // REAIS confirmados em produção (Stargate, projeto de bridge cross-chain) — changelogs
    // automáticos de release (changesets bot) usam a frase "<ChainName> mainnet deployment"
    // para descrever ROTINA de adicionar suporte a uma nova chain (ex.: "InjectiveEVM mainnet
    // deployment", "Cronos zkEVM mainnet deployment"), não um anúncio de que O PRÓPRIO
    // protocolo lançou em mainnet. Confirmado lendo o corpo real de 2 releases via GitHub API
    // nesta sprint (ver SPRINT_22_IMPLEMENTATION_REPORT.md, seção "OTHER Analysis"/"Rules
    // Changed"). As demais frases (is live/launched/goes live) são muito mais específicas de
    // um anúncio real e não apresentaram esse problema — mantidas.
    id: "mainnet-launch-v2",
    category: "MAINNET",
    confidence: "HIGH",
    patterns: [
      /\bmainnet\s+is\s+(now\s+)?live\b/i,
      /\bmainnet\s+(has\s+)?launch(es|ed)?\b/i,
      /\bmainnet\s+goes\s+live\b/i,
      /\blançamento\s+da\s+mainnet\b/i,
      /\bmainnet\s+lançada\b/i,
      /\bmainnet\s+está\s+no\s+ar\b/i,
    ],
  },
  {
    // Sprint 22: v2 — mesmo motivo do `mainnet-launch-v2` acima (2 falsos positivos reais
    // confirmados: "Avalanche Fuji testnet configuration"/"Monad testnet deployment" em
    // changelogs automáticos do Stargate).
    id: "testnet-launch-v2",
    category: "TESTNET",
    confidence: "HIGH",
    patterns: [
      /\btestnet\s+launch(es|ed)?\b/i,
      /\btestnet\s+is\s+(now\s+)?live\b/i,
      /\bpublic\s+testnet\s+launch(es|ed)?\b/i,
    ],
  },
  {
    id: "protocol-upgrade-v1",
    category: "PROTOCOL_UPGRADE",
    confidence: "HIGH",
    patterns: [
      /\bprotocol\s+upgrade\b/i,
      /\bnetwork\s+upgrade\b/i,
      /\bupgrade\s+deploy(ed)?\b/i,
      /\bupgrade\s+activat(ed|ion)\b/i,
      /\bhard\s*fork\b/i,
      /\bsoft\s*fork\b/i,
      /\bmajor\s+protocol\s+upgrade\b/i,
    ],
  },
  {
    id: "token-migration-v1",
    category: "TOKEN_MIGRATION",
    confidence: "HIGH",
    patterns: [
      /\btoken\s+migration\b/i,
      /\bmigration\s+begins\b/i,
      /\bmigrate\s+tokens\b/i,
      /\bmigration\s+to\b/i,
      /\btoken\s+swap\b/i,
      /\btoken\s+conversion\b/i,
    ],
  },
  {
    id: "token-burn-v1",
    category: "TOKEN_BURN",
    confidence: "HIGH",
    patterns: [
      /\btoken\s+burn\b/i,
      /\btokens?\s+(were\s+|have\s+been\s+)?burned\b/i,
      /\bburn\s+event\b/i,
      /\bburned\s+tokens\b/i,
    ],
    exclusionPatterns: [/\bburn\s+(mechanism|proposal)\b/i],
  },
  {
    id: "token-buyback-v1",
    category: "TOKEN_BUYBACK",
    confidence: "HIGH",
    patterns: [
      /\btoken\s+buyback\b/i,
      /\bbuyback\s+completed\b/i,
      /\brepurchase\b/i,
      /\btoken\s+repurchase\b/i,
    ],
  },
  {
    id: "staking-launch-v1",
    category: "STAKING",
    confidence: "HIGH",
    patterns: [
      /\bstaking\s+launch(ed)?\b/i,
      /\bstaking\s+program\s+launched\b/i,
      /\bstaking\s+goes\s+live\b/i,
      /\bstaking\s+activated\b/i,
    ],
  },
  {
    id: "new-chain-v1",
    category: "NEW_CHAIN",
    confidence: "HIGH",
    patterns: [
      /\bnew\s+chain\s+launch(ed)?\b/i,
      /\bchain\s+launch\b/i,
      /\bnew\s+blockchain\b/i,
      /\bnew\s+network\s+launched\b/i,
    ],
  },
  {
    id: "ecosystem-expansion-v1",
    category: "ECOSYSTEM_EXPANSION",
    confidence: "MEDIUM",
    patterns: [
      /\bexpanding\s+ecosystem\b/i,
      /\becosystem\s+expansion\b/i,
      /\blaunching\s+on\b/i,
      /\bexpands?\s+to\b/i,
      /\bdeployed\s+on\b/i,
    ],
  },
  {
    id: "product-launch-v1",
    category: "PRODUCT_LAUNCH",
    confidence: "MEDIUM",
    patterns: [
      /\bproduct\s+launch\b/i,
      /\bnew\s+product\b/i,
      /\blaunching\s+our\s+product\b/i,
      /\bproduct\s+goes\s+live\b/i,
    ],
  },
  {
    id: "integration-v1",
    category: "INTEGRATION",
    confidence: "MEDIUM",
    patterns: [
      /\bintegrated\s+with\b/i,
      /\bintegration\s+with\b/i,
      /\bnow\s+integrated\b/i,
      /\bintegration\s+is\s+live\b/i,
    ],
  },
  {
    id: "partnership-v1",
    category: "PARTNERSHIP",
    confidence: "MEDIUM",
    patterns: [
      /\bpartnered\s+with\b/i,
      /\bstrategic\s+partnership\b/i,
      /\bcollaboration\s+with\b/i,
      /\bpartnership\b/i,
    ],
  },
];

function extractEvidence(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const snippet = match[0].trim();
  return snippet.length > MAX_EVIDENCE_LENGTH
    ? `${snippet.slice(0, MAX_EVIDENCE_LENGTH)}…`
    : snippet;
}

/**
 * Classifica um evento de texto livre (título + descrição) usando SÓ as regras determinísticas
 * acima — nunca LLM, nunca opinião. Quando nenhuma regra tem evidência suficiente, retorna
 * `OTHER`/`LOW` (Fase 8: "é melhor OTHER + baixa incerteza do que categoria errada + falsa
 * precisão"). Nunca lança.
 */
export function classifyEvent(input: ClassificationInput): ClassificationResult {
  const raw = `${input.title ?? ""}\n${input.description ?? ""}`.trim();
  const text = raw.slice(0, MAX_CLASSIFICATION_INPUT_LENGTH);

  if (text.length === 0) {
    return {
      category: "OTHER",
      confidence: "LOW",
      classificationMethod: "RULE",
      ruleId: null,
      evidence: null,
      secondaryCandidates: [],
    };
  }

  const matches: Array<{ rule: ClassificationRule; evidence: string }> = [];

  for (const rule of RULES) {
    if (rule.exclusionPatterns?.some((p) => p.test(text))) continue;
    for (const pattern of rule.patterns) {
      const evidence = extractEvidence(text, pattern);
      if (evidence) {
        matches.push({ rule, evidence });
        break; // um match já basta para esta regra — não precisa testar os demais patterns dela
      }
    }
  }

  if (matches.length === 0) {
    return {
      category: "OTHER",
      confidence: "LOW",
      classificationMethod: "RULE",
      ruleId: null,
      evidence: null,
      secondaryCandidates: [],
    };
  }

  // Categoria primária = a de maior prioridade dentre as que deram match (PRIORITY_ORDER),
  // nunca a ordem de definição das regras nem a ordem de aparição no texto — determinístico.
  matches.sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.rule.category) - PRIORITY_ORDER.indexOf(b.rule.category),
  );
  const primary = matches[0];
  if (!primary) {
    // Inalcançável (matches.length > 0 já checado acima), mantém o tipo seguro.
    return {
      category: "OTHER",
      confidence: "LOW",
      classificationMethod: "RULE",
      ruleId: null,
      evidence: null,
      secondaryCandidates: [],
    };
  }

  const secondaryCandidates = [...new Set(matches.slice(1).map((m) => m.rule.category))].filter(
    (c) => c !== primary.rule.category,
  );

  return {
    category: primary.rule.category,
    confidence: primary.rule.confidence,
    classificationMethod: "RULE",
    ruleId: primary.rule.id,
    evidence: primary.evidence,
    secondaryCandidates,
  };
}
