// Sprint 2 (Fase 10/11 do plano): cliente HTTP genérico com timeout, retry com backoff
// exponencial, e diferenciação entre erros retryable e non-retryable. Não é específico do
// DefiLlama — outros collectors futuros (CoinGecko, etc.) podem reutilizar isto.

export interface RawCollectorResponse<T = unknown> {
  provider: string;
  endpoint: string;
  fetchedAt: string; // ISO timestamp da coleta
  httpStatus: number | null; // null quando a request nem chegou a responder (timeout/rede)
  payload: T | null;
  error: string | null; // presente quando a coleta falhou definitivamente (todas as tentativas)
}

export class HttpClientError extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(message: string, options: { retryable: boolean; httpStatus: number | null }) {
    super(message);
    this.name = "HttpClientError";
    this.retryable = options.retryable;
    this.httpStatus = options.httpStatus;
  }
}

interface FetchWithRetryOptions {
  provider: string;
  endpoint: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  allowlist?: string[]; // domínios permitidos — proteção anti-SSRF (Fase 9 do plano, seção 10 do CRYPTO_RESEARCH_IMPLEMENTATION_PLAN)
  // Sprint 11 (integração CoinGecko): header opcional de autenticação (ex.: `x-cg-pro-api-key`)
  // — nenhum provider usava isso até agora (DefiLlama é keyless). Nunca logado.
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;

function isRetryableStatus(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpClientError) return err.retryable;
  // Timeouts (AbortError) e falhas de conexão (fetch lança TypeError) são retryable.
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError")) {
    return true;
  }
  return false;
}

function assertAllowedDomain(url: string, allowlist: string[] | undefined): void {
  if (!allowlist || allowlist.length === 0) return;
  const { hostname } = new URL(url);
  if (!allowlist.includes(hostname)) {
    throw new HttpClientError(`Domínio não permitido: ${hostname}`, {
      retryable: false,
      httpStatus: null,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Faz uma requisição GET com timeout e retry (backoff exponencial), retornando sempre um
 * RawCollectorResponse — nunca lança exceção silenciosamente: falhas (após esgotar as
 * tentativas) vêm no campo `error`, nunca inventamos payload. Log seguro: nunca loga corpo
 * de resposta bruto nem headers de autenticação.
 */
export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  options: FetchWithRetryOptions,
): Promise<RawCollectorResponse<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  assertAllowedDomain(url, options.allowlist);

  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal, headers: options.headers });
      lastStatus = response.status;

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const err = new HttpClientError(`HTTP ${response.status} em ${options.endpoint}`, {
          retryable,
          httpStatus: response.status,
        });
        if (!retryable || attempt === maxAttempts) {
          return {
            provider: options.provider,
            endpoint: options.endpoint,
            fetchedAt: new Date().toISOString(),
            httpStatus: response.status,
            payload: null,
            error: err.message,
          };
        }
        lastError = err;
        await sleep(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }

      let json: T;
      try {
        json = (await response.json()) as T;
      } catch {
        // JSON inválido não é retryable — a resposta veio, só está malformada.
        return {
          provider: options.provider,
          endpoint: options.endpoint,
          fetchedAt: new Date().toISOString(),
          httpStatus: response.status,
          payload: null,
          error: `Resposta JSON inválida em ${options.endpoint}`,
        };
      }

      if (json === null || json === undefined) {
        return {
          provider: options.provider,
          endpoint: options.endpoint,
          fetchedAt: new Date().toISOString(),
          httpStatus: response.status,
          payload: null,
          error: `Resposta vazia em ${options.endpoint}`,
        };
      }

      return {
        provider: options.provider,
        endpoint: options.endpoint,
        fetchedAt: new Date().toISOString(),
        httpStatus: response.status,
        payload: json,
        error: null,
      };
    } catch (err) {
      lastError = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === maxAttempts) {
        const message =
          err instanceof Error && err.name === "AbortError"
            ? `Timeout após ${timeoutMs}ms em ${options.endpoint}`
            : err instanceof Error
              ? err.message
              : "Erro desconhecido";
        return {
          provider: options.provider,
          endpoint: options.endpoint,
          fetchedAt: new Date().toISOString(),
          httpStatus: lastStatus,
          payload: null,
          error: message,
        };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  // Inalcançável na prática (o loop sempre retorna dentro de si), mas mantém o tipo de retorno seguro.
  return {
    provider: options.provider,
    endpoint: options.endpoint,
    fetchedAt: new Date().toISOString(),
    httpStatus: lastStatus,
    payload: null,
    error: lastError instanceof Error ? lastError.message : "Falha desconhecida",
  };
}
