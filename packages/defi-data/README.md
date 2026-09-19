# packages/defi-data

Collector DefiLlama (Sprint 2). Contém:

- `http-client.ts` — cliente HTTP genérico com timeout, retry (backoff exponencial) e
  distinção entre erros retryable (timeout, connection reset, 429, 5xx) e non-retryable
  (400/401/403, JSON malformado, domínio fora da allowlist).
- `client.ts` — `getProtocols()` (`GET /protocols`), `getProtocol(slug)`
  (`GET /protocol/{slug}`), `pingDefiLlama()` (usado pelo Test Connection).
- `adapter.ts` — normaliza a resposta bruta do DefiLlama em `NormalizedProtocolSummary`
  (independente do formato específico da API).
- `types.ts` — tipos do modelo normalizado e do formato bruto (parcial) do DefiLlama.

Único domínio permitido: `api.llama.fi` (allowlist anti-SSRF). DefiLlama não exige API key
para os endpoints usados aqui.

Escopo do Sprint 2: coletar e normalizar dados brutos. Cálculo de growth/TVL/Revenue e
persistência de snapshots ficam para `packages/research-engine` no Sprint 3.
