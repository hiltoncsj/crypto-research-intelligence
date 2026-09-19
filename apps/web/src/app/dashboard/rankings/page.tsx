"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Sprint 5 (Fase 20/21): "Fundamental Ranking" — mede força fundamental observável a partir de
// métricas quantitativas já coletadas. NUNCA renomear para "Best Investment"/"Buy"/"Strong
// Buy" — regra inegociável da Fase 21 (evitar linguagem de recomendação financeira). Mesma regra
// se aplica a Capital Ranking e Growth Ranking abaixo.
interface ScoreRankingEntry {
  projectId: string;
  slug: string;
  name: string;
  sectorName: string;
  totalScore: number;
  maxScore: number;
  confidence: number;
  createdAt: string;
}

interface GrowthRankingEntry {
  projectId: string;
  slug: string;
  name: string;
  sectorName: string;
  growth30d: number;
  createdAt: string;
}

type RankingKind = "fundamental" | "capital" | "growth";

const TABS: Array<{ kind: RankingKind; label: string; endpoint: string; caption: string }> = [
  {
    kind: "fundamental",
    label: "Fundamental",
    endpoint: "/api/rankings/fundamental",
    caption: "Ordenado por Fundamental Score — não é recomendação de investimento.",
  },
  {
    kind: "capital",
    label: "Capital",
    endpoint: "/api/rankings/capital",
    caption: "Ordenado por Institutional Capital Score — não é recomendação de investimento.",
  },
  {
    kind: "growth",
    label: "Growth",
    endpoint: "/api/rankings/growth",
    caption: "Ordenado por crescimento de TVL em 30 dias — não é recomendação de investimento.",
  },
];

function ScoreRankingTable({
  ranking,
  scoreLabel,
}: {
  ranking: ScoreRankingEntry[];
  scoreLabel: string;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ padding: "12px 16px" }}>#</th>
          <th style={{ padding: "12px 16px" }}>Projeto</th>
          <th style={{ padding: "12px 16px" }}>Setor</th>
          <th style={{ padding: "12px 16px" }}>{scoreLabel}</th>
          <th style={{ padding: "12px 16px" }}>Confidence</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((entry, index) => (
          <tr key={entry.projectId}>
            <td style={{ padding: "10px 16px" }}>{index + 1}</td>
            <td style={{ padding: "10px 16px" }}>
              <Link href={`/dashboard/projects/${entry.slug}`}>{entry.name}</Link>
            </td>
            <td style={{ padding: "10px 16px" }}>{entry.sectorName}</td>
            <td style={{ padding: "10px 16px" }}>
              {entry.totalScore.toFixed(1)} / {entry.maxScore}
            </td>
            <td style={{ padding: "10px 16px" }}>
              <span className="badge badge-accent">{entry.confidence.toFixed(0)}%</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GrowthRankingTable({ ranking }: { ranking: GrowthRankingEntry[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ padding: "12px 16px" }}>#</th>
          <th style={{ padding: "12px 16px" }}>Projeto</th>
          <th style={{ padding: "12px 16px" }}>Setor</th>
          <th style={{ padding: "12px 16px" }}>Growth 30d (TVL)</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((entry, index) => (
          <tr key={entry.projectId}>
            <td style={{ padding: "10px 16px" }}>{index + 1}</td>
            <td style={{ padding: "10px 16px" }}>
              <Link href={`/dashboard/projects/${entry.slug}`}>{entry.name}</Link>
            </td>
            <td style={{ padding: "10px 16px" }}>{entry.sectorName}</td>
            <td style={{ padding: "10px 16px" }}>
              <span className="badge badge-accent">
                {entry.growth30d >= 0 ? "+" : ""}
                {entry.growth30d.toFixed(1)}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RankingsPage() {
  const [activeTab, setActiveTab] = useState<RankingKind>("fundamental");
  // `rankingTab` amarra o dado carregado à aba a que ele pertence — sem isso, o render que
  // acontece no clique (activeTab já novo, mas ranking ainda com o shape da aba anterior, já
  // que o useEffect abaixo só limpa `ranking` depois desse primeiro render) tentava desenhar
  // dados de Fundamental/Capital (sem `growth30d`) na tabela de Growth.
  const [rankingTab, setRankingTab] = useState<RankingKind | null>(null);
  const [ranking, setRanking] = useState<ScoreRankingEntry[] | GrowthRankingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTabConfig = TABS.find((t) => t.kind === activeTab)!;

  useEffect(() => {
    let stale = false;
    setError(null);
    fetch(activeTabConfig.endpoint)
      .then(async (res) => {
        if (stale) return; // resposta de uma aba que já não é mais a ativa — descartada
        if (!res.ok) {
          setError("Erro ao carregar ranking.");
          return;
        }
        const body = await res.json();
        setRanking(body.ranking);
        setRankingTab(activeTab);
      })
      .catch(() => {
        if (!stale) setError("Erro ao carregar ranking.");
      });
    return () => {
      stale = true;
    };
  }, [activeTab, activeTabConfig.endpoint]);

  const rankingReady = rankingTab === activeTab ? ranking : null;

  return (
    <section>
      <div className="section-label">Rankings</div>
      <h1>{activeTabConfig.label} Ranking</h1>
      <p style={{ fontStyle: "italic" }}>{activeTabConfig.caption}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => setActiveTab(tab.kind)}
            className={tab.kind === activeTab ? "badge badge-accent" : "badge"}
            style={{ cursor: "pointer", border: "none" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && !rankingReady && <p>Carregando…</p>}
      {rankingReady && rankingReady.length === 0 && (
        <p>Nenhum projeto com dado suficiente ainda.</p>
      )}

      {rankingReady && rankingReady.length > 0 && (
        <div className="card-lg" style={{ padding: 0, overflow: "hidden" }}>
          {activeTab === "growth" ? (
            <GrowthRankingTable ranking={rankingReady as GrowthRankingEntry[]} />
          ) : (
            <ScoreRankingTable
              ranking={rankingReady as ScoreRankingEntry[]}
              scoreLabel={
                activeTab === "capital" ? "Institutional Capital Score" : "Fundamental Score"
              }
            />
          )}
        </div>
      )}
    </section>
  );
}
