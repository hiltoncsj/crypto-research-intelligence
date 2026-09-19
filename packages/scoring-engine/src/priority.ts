// Sprint 8 (Top 10 Selection — ver TOP10_SELECTION_SPEC.md): Research Priority é uma dimensão
// DISTINTA do Score (seção 19/27 do Sprint 8) — responde "este projeto merece pesquisa
// detalhada NESTE ciclo?", não "este projeto é bom?". Mesma filosofia de `confidence.ts`:
// fórmula simples, auditável, versionada, sem tuning fino por enquanto.
//
// priority-v1 = média dos componentes DISPONÍVEIS entre {Score, Growth Momentum, Capital
// Momentum}, cada um normalizado para 0-100 antes de combinar (seção 24: "normalizar antes de
// somar, nunca somar escalas incompatíveis"). Um componente ausente (ex.: projeto nunca captou
// funding) é EXCLUÍDO da média, nunca tratado como 0 — 0 seria inventar um valor (seção 22/49:
// "não transformar ausência de dado em zero").

export const PRIORITY_MODEL_VERSION = "priority-v1";

export interface PriorityComponentInputs {
  /** 0-100, já a razão totalScore/maxScore do FundamentalScore mais recente. `null` se o
   * projeto ainda não foi pesquisado em nenhuma Research Run anterior. */
  score: number | null;
  /** Growth30d do TVL em PONTOS PERCENTUAIS, mesma convenção de `calculateGrowth`
   * (packages/research-engine/src/metrics.ts): 35 = +35%, não 0.35. `null` se não há série de
   * TVL suficiente. */
  growth30d: number | null;
  /** Dias desde a rodada de funding mais recente conhecida. `null` se nunca houve funding
   * registrado (não confundir com 0, que significaria "captou hoje"). */
  daysSinceLastRaise: number | null;
}

export interface PriorityResult {
  priorityScore: number; // 0-100
  modelVersion: string;
  components: {
    score: number | null;
    growthMomentum: number | null; // normalizado 0-100
    capitalMomentum: number | null; // normalizado 0-100
  };
  /** Derivado mecanicamente dos componentes acima (>=70 em cada) — nunca texto narrativo
   * inventado (seção 41 do Sprint 8: "não gerar texto narrativo inventado"). */
  reasons: string[];
}

// Seção 24: normalização min/max bounded — a mais simples e robusta para os dados disponíveis.
// Sprint 9 (correção): `growth30d` chega em pontos percentuais (convenção de `calculateGrowth`),
// não fração — o clamp precisa estar na mesma escala, senão qualquer crescimento de poucos %
// já saturava a normalização em 100 (bug real do Sprint 8, corrigido aqui).
const GROWTH_CLAMP_PERCENT = 50; // ±50% em 30 dias já satura a normalização.
const CAPITAL_MOMENTUM_FULL_DAYS = 30; // captação nos últimos 30 dias = momentum máximo (100).
const CAPITAL_MOMENTUM_ZERO_DAYS = 365; // >=1 ano desde a última captação = momentum mínimo (0).
const REASON_THRESHOLD = 70;

function normalizeGrowthMomentum(growth30d: number | null): number | null {
  if (growth30d === null) return null;
  const clamped = Math.max(-GROWTH_CLAMP_PERCENT, Math.min(GROWTH_CLAMP_PERCENT, growth30d));
  return ((clamped + GROWTH_CLAMP_PERCENT) / (2 * GROWTH_CLAMP_PERCENT)) * 100;
}

function normalizeCapitalMomentum(daysSinceLastRaise: number | null): number | null {
  if (daysSinceLastRaise === null) return null;
  if (daysSinceLastRaise <= CAPITAL_MOMENTUM_FULL_DAYS) return 100;
  if (daysSinceLastRaise >= CAPITAL_MOMENTUM_ZERO_DAYS) return 0;
  const span = CAPITAL_MOMENTUM_ZERO_DAYS - CAPITAL_MOMENTUM_FULL_DAYS;
  return 100 - ((daysSinceLastRaise - CAPITAL_MOMENTUM_FULL_DAYS) / span) * 100;
}

export function calculateResearchPriority(input: PriorityComponentInputs): PriorityResult {
  const growthMomentum = normalizeGrowthMomentum(input.growth30d);
  const capitalMomentum = normalizeCapitalMomentum(input.daysSinceLastRaise);
  const score = input.score;

  const available = [score, growthMomentum, capitalMomentum].filter((v): v is number => v !== null);
  const priorityScore =
    available.length > 0 ? available.reduce((sum, v) => sum + v, 0) / available.length : 0;

  const reasons: string[] = [];
  if (score !== null && score >= REASON_THRESHOLD) reasons.push("High Score");
  if (growthMomentum !== null && growthMomentum >= REASON_THRESHOLD)
    reasons.push("Strong Growth Momentum");
  if (capitalMomentum !== null && capitalMomentum >= REASON_THRESHOLD)
    reasons.push("Strong Capital Momentum");
  if (reasons.length === 0 && available.length > 0) reasons.push("Baseline Priority");
  if (available.length === 0) reasons.push("No Signal Yet — Newly Discovered");

  return {
    priorityScore: Math.round(priorityScore * 100) / 100,
    modelVersion: PRIORITY_MODEL_VERSION,
    components: { score, growthMomentum, capitalMomentum },
    reasons,
  };
}
