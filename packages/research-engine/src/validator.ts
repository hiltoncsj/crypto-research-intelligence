import type {
  NormalizedMarketDataPoint,
  NormalizedTimeSeriesPoint,
} from "@crypto-research/defi-data";
import { DataQuality } from "@crypto-research/shared";

// Sprint 3 (Fase 5/6): valida um ponto de série temporal (TVL, Revenue ou Fees) ANTES da
// persistência. Nunca descarta silenciosamente — INVALID é rejeitado (não persiste),
// SUSPICIOUS é persistido com `quality: SUSPICIOUS` + motivo registrado (Fase 6: "não excluir
// automaticamente dados suspeitos sem registrar o motivo").

export type ValidationOutcome =
  | { status: "VALID" }
  | { status: "SUSPICIOUS"; reason: string }
  | { status: "INVALID"; reason: string }
  | { status: "MISSING"; reason: string };

/**
 * Limiar de variação diária considerada "suspeita" (Fase 6, exemplo: TVL de $100M para $4B em
 * 24h). 10x (900%) é um valor conservador — captura saltos claramente anômalos sem marcar
 * volatilidade normal de mercado como suspeita.
 */
const SUSPICIOUS_MULTIPLIER = 10;

export function validatePoint(
  point: NormalizedTimeSeriesPoint | null | undefined,
  previousValueUsd: number | null,
): ValidationOutcome {
  if (!point) {
    return { status: "MISSING", reason: "Ponto ausente na resposta da fonte" };
  }

  if (typeof point.valueUsd !== "number" || Number.isNaN(point.valueUsd)) {
    return { status: "INVALID", reason: "Valor não é um número válido" };
  }

  if (point.valueUsd < 0) {
    return { status: "INVALID", reason: `Valor negativo: ${point.valueUsd}` };
  }

  const timestamp = Date.parse(point.sourceTimestamp);
  if (Number.isNaN(timestamp)) {
    return { status: "INVALID", reason: `sourceTimestamp inválido: ${point.sourceTimestamp}` };
  }

  // Timestamp futuro (além de uma folga de 1 dia para timezones/relógios levemente
  // dessincronizados) indica dado estruturalmente inconsistente.
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (timestamp > Date.now() + oneDayMs) {
    return { status: "INVALID", reason: `sourceTimestamp no futuro: ${point.sourceTimestamp}` };
  }

  if (previousValueUsd !== null && previousValueUsd > 0) {
    const ratio = point.valueUsd / previousValueUsd;
    if (ratio >= SUSPICIOUS_MULTIPLIER || ratio <= 1 / SUSPICIOUS_MULTIPLIER) {
      return {
        status: "SUSPICIOUS",
        reason: `Variação de ${previousValueUsd} para ${point.valueUsd} (${ratio.toFixed(2)}x) excede o limiar de ${SUSPICIOUS_MULTIPLIER}x`,
      };
    }
  }

  return { status: "VALID" };
}

/**
 * Sprint 12 (Historical Market Data): valida um ponto de mercado (preço/market cap/volume) ANTES
 * da persistência. Mesmo contrato de `validatePoint`, adaptado para 3 campos independentemente
 * nullable (a CoinGecko pode ter preço sem volume, por exemplo — cada campo é validado
 * isoladamente, nunca todos exigidos juntos). MISSING só quando os TRÊS são null (ponto sem
 * nenhuma informação útil); um campo negativo/NaN individualmente já é INVALID (rejeita o ponto
 * inteiro — não persistimos "metade" de um ponto inconsistente). Suspicious usa o mesmo limiar de
 * salto de `validatePoint`, comparando `priceUsd` ao ponto anterior da mesma série (preço é o
 * sinal mais direto de anomalia; marketCap/volume derivam dele e tendem a saltar junto).
 */
export function validateMarketDataPoint(
  point: NormalizedMarketDataPoint | null | undefined,
  previousPriceUsd: number | null,
): ValidationOutcome {
  if (!point) {
    return { status: "MISSING", reason: "Ponto ausente na resposta da fonte" };
  }
  if (point.priceUsd === null && point.marketCapUsd === null && point.volumeUsd === null) {
    return {
      status: "MISSING",
      reason: "Nenhum campo (price/marketCap/volume) disponível para este ponto",
    };
  }

  for (const [name, value] of [
    ["priceUsd", point.priceUsd],
    ["marketCapUsd", point.marketCapUsd],
    ["volumeUsd", point.volumeUsd],
  ] as const) {
    if (value === null) continue;
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { status: "INVALID", reason: `${name} não é um número válido` };
    }
    if (value < 0) {
      return { status: "INVALID", reason: `${name} negativo: ${value}` };
    }
  }

  const timestamp = Date.parse(point.sourceTimestamp);
  if (Number.isNaN(timestamp)) {
    return { status: "INVALID", reason: `sourceTimestamp inválido: ${point.sourceTimestamp}` };
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (timestamp > Date.now() + oneDayMs) {
    return { status: "INVALID", reason: `sourceTimestamp no futuro: ${point.sourceTimestamp}` };
  }

  if (previousPriceUsd !== null && previousPriceUsd > 0 && point.priceUsd !== null) {
    const ratio = point.priceUsd / previousPriceUsd;
    if (ratio >= SUSPICIOUS_MULTIPLIER || ratio <= 1 / SUSPICIOUS_MULTIPLIER) {
      return {
        status: "SUSPICIOUS",
        reason: `Preço variou de ${previousPriceUsd} para ${point.priceUsd} (${ratio.toFixed(2)}x) excede o limiar de ${SUSPICIOUS_MULTIPLIER}x`,
      };
    }
  }

  return { status: "VALID" };
}

export function outcomeToQuality(
  outcome: Extract<ValidationOutcome, { status: "VALID" | "SUSPICIOUS" }>,
): DataQuality {
  return outcome.status === "VALID" ? DataQuality.VALID : DataQuality.SUSPICIOUS;
}
