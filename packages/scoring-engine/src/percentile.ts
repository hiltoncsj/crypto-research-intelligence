import { MIN_PEER_SAMPLE_SIZE } from "./weights";

// Sprint 5 (Fase 6/7/8): percentile rank determinístico, dentro do contexto apropriado
// (setor/categoria) — quem monta o array `peers` é a camada de persistência (que conhece o
// setor do projeto); esta função é pura e não sabe nada sobre setores/banco.
//
// Fórmula: percentile(value, peers) = (count(peer < value) + 0.5 * count(peer == value)) /
// total * 100. É a "fractional rank" clássica — atribui 50 ao valor mediano de uma amostra
// ímpar, nunca dá 100 ao máximo nem 0 ao mínimo de uma amostra com >1 elemento distinto
// (Fase 7: nunca gerar NaN/Infinity; extremos não viram confiança falsa de "melhor/pior
// possível", só "melhor/pior da amostra observada").
//
// `peers` DEVE incluir o próprio valor do projeto sendo avaliado (a amostra é "todos os
// projetos comparáveis", não "os outros") — isso é responsabilidade de quem chama.

export function percentileRank(value: number, peers: readonly number[]): number | null {
  if (!Number.isFinite(value)) return null;

  const finitePeers = peers.filter((p) => Number.isFinite(p));
  if (finitePeers.length < MIN_PEER_SAMPLE_SIZE) {
    // Fase 8: amostra insuficiente → percentile não confiável, nunca inventado.
    return null;
  }

  let lessThan = 0;
  let equalTo = 0;
  for (const peer of finitePeers) {
    if (peer < value) lessThan += 1;
    else if (peer === value) equalTo += 1;
  }

  const rank = ((lessThan + 0.5 * equalTo) / finitePeers.length) * 100;
  // Clamp defensivo contra erro de ponto flutuante (nunca deveria sair de [0,100]).
  return Math.min(100, Math.max(0, rank));
}
