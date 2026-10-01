import { calculateResearchPriority } from "@crypto-research/scoring-engine";
import { describe, expect, it } from "vitest";

import { pickTopWithTies, type ScoredCandidate } from "../src/selection";

// Corte do Top N com empates (pickTopWithTies é pura — sem banco). Regra pedida pelo usuário em
// 2026-10-01: empate no corte nunca é decidido pelo slug — todos os empatados entram.

function candidate(
  slug: string,
  inputs: { score?: number | null; growth7d?: number | null; daysSinceLastRaise?: number | null },
): ScoredCandidate {
  const base = {
    projectId: slug,
    slug,
    score: inputs.score ?? null,
    growth7d: inputs.growth7d ?? null,
    daysSinceLastRaise: inputs.daysSinceLastRaise ?? null,
  };
  return { ...base, ...calculateResearchPriority(base) };
}

describe("pickTopWithTies", () => {
  it("empate exato no corte estende a seleção (Top 2 vira Top 3) e empatados dividem o rank", () => {
    const { selected } = pickTopWithTies(
      [
        candidate("a", { score: 90 }),
        candidate("c", { score: 50 }),
        candidate("b", { score: 50 }),
        candidate("d", { score: 10 }),
      ],
      2,
    );
    expect(selected.map((s) => [s.slug, s.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
    ]);
  });

  it("sem empate no corte, seleciona exatamente topN", () => {
    const { selected } = pickTopWithTies(
      [candidate("a", { score: 90 }), candidate("b", { score: 60 }), candidate("c", { score: 50 })],
      2,
    );
    expect(selected.map((s) => s.slug)).toEqual(["a", "b"]);
  });

  it("growth acima do clamp não empata: o growth7d bruto desempata", () => {
    // +40% e +25% satisfazem o clamp de ±20% — ambos valem 100 de Growth Momentum.
    const { selected } = pickTopWithTies(
      [candidate("low", { growth7d: 25 }), candidate("high", { growth7d: 40 })],
      1,
    );
    expect(selected.map((s) => s.slug)).toEqual(["high"]);
  });

  it("captação mais recente desempata quando o capital momentum satura em 100", () => {
    const { selected } = pickTopWithTies(
      [
        candidate("older", { daysSinceLastRaise: 20 }),
        candidate("newer", { daysSinceLastRaise: 3 }),
      ],
      1,
    );
    expect(selected.map((s) => s.slug)).toEqual(["newer"]);
  });

  it("candidato sem nenhum sinal nunca entra, nem para completar topN", () => {
    const { selected } = pickTopWithTies(
      [candidate("signal", { score: 30 }), candidate("none-1", {}), candidate("none-2", {})],
      10,
    );
    expect(selected.map((s) => s.slug)).toEqual(["signal"]);
  });
});
