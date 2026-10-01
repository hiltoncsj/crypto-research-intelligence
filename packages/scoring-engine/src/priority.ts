// Sprint 8 (Top 10 Selection — ver TOP10_SELECTION_SPEC.md): Research Priority é uma dimensão
// DISTINTA do Score (seção 19/27 do Sprint 8) — responde "este projeto merece pesquisa
// detalhada NESTE ciclo?", não "este projeto é bom?". Mesma filosofia de `confidence.ts`:
// fórmula simples, auditável, versionada, sem tuning fino por enquanto.
//
// Prioridade = média dos componentes DISPONÍVEIS entre {Score, Growth Momentum, Capital
// Momentum}, cada um normalizado para 0-100 antes de combinar (seção 24: "normalizar antes de
// somar, nunca somar escalas incompatíveis"). Um componente ausente (ex.: projeto nunca captou
// funding) é EXCLUÍDO da média, nunca tratado como 0 — 0 seria inventar um valor (seção 22/49:
// "não transformar ausência de dado em zero").
//
// priority-v2 (2026-10-01): Growth Momentum passa a vir do `change_7d` de GET /protocols da
// DefiLlama (mesma fonte e janela para TODO o universo), em vez do growth30d da série de
// `tvl_snapshots`. Motivo: a série só existe para projetos que já passaram por pesquisa
// detalhada, então projetos nunca pesquisados ficavam com prioridade 0 e o Top 10 se
// perpetuava (os mesmos 10 em todas as runs). Usar 7d só para quem não tem série misturaria
// janelas diferentes no mesmo ranking — por isso a janela de 7d vale para todos.

export const PRIORITY_MODEL_VERSION = "priority-v2";

export interface PriorityComponentInputs {
  /** 0-100, já a razão totalScore/maxScore do FundamentalScore mais recente. `null` se o
   * projeto ainda não foi pesquisado em nenhuma Research Run anterior. */
  score: number | null;
  /** Variação do TVL em 7 dias em PONTOS PERCENTUAIS (12 = +12%, não 0.12), como a DefiLlama
   * devolve em `change_7d`. `null` se a fonte não trouxe o valor para o projeto. */
  growth7d: number | null;
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
// ±20% em 7 dias satura a normalização (priority-v1 usava ±50% em 30 dias). Escolha de
// calibração, não derivada de dado: mantém a mesma ordem de grandeza por dia e evita que um
// salto de poucos % numa semana já valha 100.
const GROWTH_CLAMP_PERCENT = 20;
const CAPITAL_MOMENTUM_FULL_DAYS = 30; // captação nos últimos 30 dias = momentum máximo (100).
const CAPITAL_MOMENTUM_ZERO_DAYS = 365; // >=1 ano desde a última captação = momentum mínimo (0).
const REASON_THRESHOLD = 70;

function normalizeGrowthMomentum(growth7d: number | null): number | null {
  if (growth7d === null) return null;
  const clamped = Math.max(-GROWTH_CLAMP_PERCENT, Math.min(GROWTH_CLAMP_PERCENT, growth7d));
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
  const growthMomentum = normalizeGrowthMomentum(input.growth7d);
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
