import { fetchJsonWithRetry } from "./http-client";

// Sprint 17: tradução real de texto (descrição de projeto vinda da CoinGecko, em inglês) para
// PT-BR, via MyMemory Translation API (https://mymemory.translated.net) — gratuita, sem chave,
// testada ao vivo antes de integrar (GET /get?q=...&langpair=en|pt-BR, HTTP 200, tradução
// correta). Sem chave, o limite documentado é de ~500 caracteres por requisição — por isso o
// texto é dividido em blocos por sentença (nunca no meio de uma palavra) e traduzido em
// múltiplas chamadas, remontado na ordem original. Nunca fabrica tradução: qualquer falha (rede,
// HTTP, JSON) propaga `null` para o bloco, e o texto final só é retornado se TODOS os blocos
// traduziram com sucesso — caso contrário `translateToPortuguese` retorna `null` e quem chama
// deve cair de volta para o texto original em inglês, nunca exibir uma tradução parcial.

const MYMEMORY_ALLOWLIST = ["api.mymemory.translated.net"];
const MAX_CHUNK_CHARS = 450;

interface MyMemoryResponse {
  responseStatus: number | string;
  responseData?: { translatedText?: string };
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  // Sentença isolada ainda maior que o limite (raro): corta em pedaços fixos como último recurso.
  return chunks.flatMap((chunk) =>
    chunk.length > maxChars
      ? (chunk.match(new RegExp(`.{1,${maxChars}}`, "g")) ?? [chunk])
      : [chunk],
  );
}

async function translateChunk(chunk: string): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|pt-BR`;
  const result = await fetchJsonWithRetry<MyMemoryResponse>(url, {
    provider: "mymemory",
    endpoint: "/get",
    allowlist: MYMEMORY_ALLOWLIST,
    maxAttempts: 2,
  });
  if (result.error || !result.payload) return null;
  const translated = result.payload.responseData?.translatedText;
  if (!translated) return null;
  return translated;
}

/**
 * Traduz um texto (potencialmente longo) para PT-BR. Retorna `null` se o texto de entrada for
 * `null`/vazio ou se qualquer bloco falhar ao traduzir — nunca retorna uma tradução parcial ou
 * fabricada.
 */
export async function translateToPortuguese(text: string | null): Promise<string | null> {
  if (!text || text.trim().length === 0) return null;

  const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
  const translated: string[] = [];
  for (const chunk of chunks) {
    const result = await translateChunk(chunk);
    if (result === null) return null;
    translated.push(result);
  }
  return translated.join(" ");
}
