import { normalizeDiscourseTopic } from "./adapter";
import { discourseForumOrigin, isValidDiscourseForumUrl } from "./external-identity";
import { fetchJsonWithRetry, type RawCollectorResponse } from "./http-client";
import type { NormalizedDiscourseTopic, RawDiscourseTopic, RawDiscourseTopicDetail } from "./types";

// Sprint 23 (Discourse Governance Intelligence). Confirmado AO VIVO em 2026-09-19 contra
// governance.aave.com e gov.uniswap.org. Keyless (Discourse não exige autenticação para ler
// tópicos públicos). Diferente de GitHub/Snapshot, o host NÃO é fixo — cada projeto tem seu
// próprio fórum, curado manualmente e validado (`isValidDiscourseForumUrl`) antes de qualquer
// chamada. `fetchJsonWithRetry` recebe o host real (não um allowlist fixo) como `allowlist` de
// UM elemento — mesma função de proteção, só que o valor permitido é dinâmico por chamada em
// vez de uma constante do módulo.
const PROVIDER = "DISCOURSE";

// Limites de segurança (Fase 7/23): nunca baixar histórico ilimitado nem carregar tudo em
// memória de uma vez. `/latest.json` do Discourse pagina ~30 tópicos por página nativamente
// (parâmetro `page`); limitamos a paginação da LISTAGEM e, separadamente, o número total de
// tópicos que buscamos o corpo completo (1 request HTTP extra por tópico — `/t/{id}.json`).
const MAX_LISTING_PAGES = 2;
const MAX_TOPICS_PER_RUN = 40;

export interface DiscourseCollectorResult {
  raw: RawCollectorResponse<unknown>;
  normalized: NormalizedDiscourseTopic[] | null;
  pages: number;
}

/** Remove tags HTML do `cooked` do Discourse (Markdown renderizado em HTML pelo servidor) —
 * usado SÓ para alimentar a Classification Engine em texto puro, nunca para exibir/renderizar
 * de volta como HTML (ver DISCOURSE_SOURCE_ARCHITECTURE.md, "Segurança"). Não é um parser HTML
 * completo — suficiente para extrair texto para correspondência de regex, nunca reinterpretado
 * como markup confiável em nenhum outro lugar do sistema. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca tópicos reais de um fórum Discourse (paginado, com limite de segurança) e, para cada
 * um (até `MAX_TOPICS_PER_RUN`), busca o detalhe (`/t/{id}.json`) para obter o corpo do primeiro
 * post. `forumUrl` é revalidado aqui (defesa em profundidade — mesmo padrão de
 * `github-client.ts`/`snapshot-client.ts`) antes de montar qualquer URL.
 */
export async function getDiscourseTopics(forumUrl: string): Promise<DiscourseCollectorResult> {
  if (!isValidDiscourseForumUrl(forumUrl)) {
    return {
      raw: {
        provider: PROVIDER,
        endpoint: "",
        fetchedAt: new Date().toISOString(),
        httpStatus: null,
        payload: null,
        error: `discourseForumUrl inválido: ${forumUrl}`,
      },
      normalized: null,
      pages: 0,
    };
  }

  const origin = discourseForumOrigin(forumUrl);
  const host = new URL(origin).hostname;
  const allTopics: RawDiscourseTopic[] = [];
  let lastRaw: RawCollectorResponse<unknown> | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
    const endpoint = `/latest.json${page > 0 ? `?page=${page}` : ""}`;
    const raw = await fetchJsonWithRetry<{ topic_list?: { topics?: RawDiscourseTopic[] } }>(
      `${origin}${endpoint}`,
      { provider: PROVIDER, endpoint, allowlist: [host] },
    );
    lastRaw = raw;
    pagesFetched += 1;

    if (raw.error || raw.payload === null) break;
    const topics = raw.payload.topic_list?.topics;
    if (!Array.isArray(topics) || topics.length === 0) break;

    allTopics.push(...topics);
    if (allTopics.length >= MAX_TOPICS_PER_RUN) break;
  }

  if (!lastRaw) {
    lastRaw = {
      provider: PROVIDER,
      endpoint: "/latest.json",
      fetchedAt: new Date().toISOString(),
      httpStatus: null,
      payload: null,
      error: null,
    };
  }

  if (lastRaw.error && allTopics.length === 0) {
    return { raw: lastRaw, normalized: null, pages: pagesFetched };
  }

  const cappedTopics = allTopics.slice(0, MAX_TOPICS_PER_RUN);
  const normalized: NormalizedDiscourseTopic[] = [];
  const retrievedAt = lastRaw.fetchedAt;

  for (const topic of cappedTopics) {
    const detailEndpoint = `/t/${topic.id}.json`;
    const detailRaw = await fetchJsonWithRetry<RawDiscourseTopicDetail>(
      `${origin}${detailEndpoint}`,
      { provider: PROVIDER, endpoint: detailEndpoint, allowlist: [host] },
    );
    // Falha ao buscar o detalhe de UM tópico nunca aborta os demais — isolamento por item,
    // mesmo padrão do resto do sistema. O tópico simplesmente não entra na lista normalizada.
    if (detailRaw.error || detailRaw.payload === null) continue;

    const item = normalizeDiscourseTopic(detailRaw.payload, origin, retrievedAt, stripHtml);
    if (item) normalized.push(item);
  }

  return {
    raw: { ...lastRaw, error: null, payload: allTopics },
    normalized,
    pages: pagesFetched,
  };
}
