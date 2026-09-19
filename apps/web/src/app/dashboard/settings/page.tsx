"use client";

import { useEffect, useState } from "react";

interface Connection {
  id: string;
  provider: string;
  name: string;
  status: string;
  maskedIdentifier: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
}

// Sprint 11: CoinGecko passou a ser um provider real (packages/defi-data/src/coingecko-client.ts,
// já ligado ao pipeline) — `implemented: false` aqui estava desatualizado e escondia a conexão
// já suportada pelo backend (SUPPORTED_PROVIDERS em apps/web/src/lib/connections.ts).
// Sprint 18: DEFILLAMA_PRO — provider real (packages/defi-data/src/client.ts, getTokenUnlocks),
// mas PRONTO e NÃO ATIVADO até uma key ser configurada aqui. Diferente de DEFILLAMA/COINGECKO,
// não é keyless: sem secret, a conexão fica NOT_CONFIGURED e o Research Worker nunca chama a
// API paga (ver CATALYSTS_RISKS_SOURCE_AUDIT.md — TOKEN_UNLOCK).
const KNOWN_PROVIDERS = [
  { provider: "DEFILLAMA", name: "DefiLlama", implemented: true },
  { provider: "COINGECKO", name: "CoinGecko", implemented: true },
  {
    provider: "DEFILLAMA_PRO",
    name: "DefiLlama Pro (Token Unlocks — opcional, pago)",
    implemented: true,
  },
  { provider: "CRYPTORANK", name: "CryptoRank", implemented: false },
  { provider: "DUNE", name: "Dune", implemented: false },
  { provider: "NANSEN", name: "Nansen", implemented: false },
  { provider: "OPENAI", name: "OpenAI", implemented: false },
];

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/connections");
    if (res.ok) {
      const data = await res.json();
      setConnections(data.connections);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function ensureConnection(provider: string, name: string) {
    await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, name }),
    });
    await refresh();
  }

  async function handleTest(id: string) {
    setTestingId(id);
    await fetch(`/api/connections/${id}/test`, { method: "POST" });
    await refresh();
    setTestingId(null);
  }

  if (loading) {
    return <p>Carregando…</p>;
  }

  const STATUS_BADGE: Record<string, string> = {
    REAL: "badge-accent",
    NOT_CONFIGURED: "badge",
    ERROR: "badge-danger",
    PARTIAL: "badge-warning",
    MOCK: "badge-warning",
    UNAVAILABLE: "badge-danger",
  };

  const STATUS_LABEL: Record<string, string> = {
    REAL: "Real",
    NOT_CONFIGURED: "Não configurado",
    ERROR: "Erro",
    PARTIAL: "Parcial",
    MOCK: "Mock",
    UNAVAILABLE: "Indisponível",
  };

  return (
    <section>
      <div className="section-label">Configurações</div>
      <h1>APIs e Fontes de Dados</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {KNOWN_PROVIDERS.map(({ provider, name, implemented }) => {
          if (!implemented) {
            return (
              <div key={provider} className="card" style={{ opacity: 0.5 }}>
                <strong>{name}</strong>
                <p style={{ margin: "4px 0 0" }}>Não implementado neste sprint.</p>
              </div>
            );
          }

          const connection = connections.find((c) => c.provider === provider);
          const status = connection ? connection.status : "NOT_CONFIGURED";

          return (
            <div key={provider} className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <strong>{name}</strong>
                <span className={`badge ${STATUS_BADGE[status] ?? "badge"}`}>
                  {STATUS_LABEL[status] ?? status}
                  {connection?.maskedIdentifier ? ` · ${connection.maskedIdentifier}` : ""}
                </span>
              </div>
              {connection?.lastTestedAt && (
                <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                  Último teste: {new Date(connection.lastTestedAt).toLocaleString()}
                </p>
              )}
              {connection?.lastError && (
                <p role="alert" style={{ marginTop: 8 }}>
                  Erro: {connection.lastError}
                </p>
              )}

              <div style={{ marginTop: 12 }}>
                {!connection ? (
                  <button onClick={() => ensureConnection(provider, name)}>Configurar</button>
                ) : (
                  <button
                    disabled={testingId === connection.id}
                    onClick={() => handleTest(connection.id)}
                  >
                    {testingId === connection.id ? "Testando…" : "Testar Conexão"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
