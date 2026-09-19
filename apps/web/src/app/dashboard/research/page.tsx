"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";

interface ResearchRun {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
  mode: "FULL" | "INCREMENTAL";
  trigger: "MANUAL" | "SCHEDULED" | "SYSTEM";
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  totalProjects: number;
  processedProjects: number;
  successfulProjects: number;
  failedProjects: number;
  suspiciousProjects: number;
  errorMessage: string | null;
  progress?: number;
}

interface ProjectListItem {
  slug: string;
  name: string;
}

// Sprint 8 (seção 40): visão mínima do Top 10 dinâmico desta Research Run — carregada sob
// demanda (não faz parte do polling da lista) para não pesar o GET /api/research-runs.
// Sprint "aprende com os dados" (selection-relevance.ts): `relevant`/`priorityPercentile` vêm
// do servidor, calculados contra a população histórica de priorityScore — nunca um limiar fixo
// no client. `relevanceOutcome` só existe quando o projeto já tinha se destacado ANTES (não
// nesta run) — confirma (com dados reais do Diff Engine) se aquele destaque se sustentou.
interface RelevanceOutcomeView {
  previouslyHighlighted: boolean;
  sinceRunId: string | null;
  scoreDeltas: { label: string; delta: number }[];
  tvlChangePct: number | null;
}

interface ResearchRunSelectionView {
  rank: number;
  priorityScore: string;
  globalScore: string | null;
  growthMomentum: string | null;
  capitalMomentum: string | null;
  selectionReason: string[];
  priorityPercentile: number | null;
  relevant: boolean;
  relevanceOutcome: RelevanceOutcomeView | null;
  project: { slug: string; name: string };
}

const STATUS_BADGE: Record<ResearchRun["status"], string> = {
  QUEUED: "badge",
  RUNNING: "badge-accent",
  COMPLETED: "badge-accent",
  PARTIAL: "badge-warning",
  FAILED: "badge-danger",
  CANCELLED: "badge",
};

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

// Labels em PT-BR para os valores brutos dos enums (Prisma) exibidos diretamente na tabela.
const STATUS_LABEL: Record<ResearchRun["status"], string> = {
  QUEUED: "Na fila",
  RUNNING: "Em execução",
  COMPLETED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const MODE_LABEL: Record<ResearchRun["mode"], string> = {
  FULL: "Completa",
  INCREMENTAL: "Incremental",
};

const TRIGGER_LABEL: Record<ResearchRun["trigger"], string> = {
  MANUAL: "Manual",
  SCHEDULED: "Agendada",
  SYSTEM: "Sistema",
};

// Só para exibição no texto do tooltip — a decisão real de "relevant" já vem pronta do servidor
// (selection-relevance.ts, RELEVANCE_PERCENTILE_THRESHOLD). Mantido em sincronia manualmente
// porque este é um componente client e o package research-engine não deve entrar no bundle do
// browser (usa Prisma).
const RELEVANCE_PERCENTILE_THRESHOLD = 90;

function formatOutcomeLine(outcome: RelevanceOutcomeView): string {
  const parts: string[] = [];
  for (const d of outcome.scoreDeltas) {
    const sign = d.delta >= 0 ? "+" : "";
    parts.push(`${d.label} Score ${sign}${d.delta.toFixed(1)}`);
  }
  if (outcome.tvlChangePct !== null) {
    const sign = outcome.tvlChangePct >= 0 ? "+" : "";
    parts.push(`TVL ${sign}${outcome.tvlChangePct.toFixed(1)}%`);
  }
  if (parts.length === 0) {
    return "Já se destacou antes, mas ainda não há uma Research Run nova o suficiente pra confirmar o resultado.";
  }
  return `Confirmação: desde o último destaque, ${parts.join(", ")}.`;
}

function relevanceTooltipContent(s: ResearchRunSelectionView) {
  const outcome = s.relevanceOutcome;
  return {
    oQueE: `${s.project.name} está no percentil ${s.priorityPercentile?.toFixed(0)} de Priority — ou seja, tem uma prioridade mais alta que ${s.priorityPercentile?.toFixed(0)}% de todas as seleções já feitas pelo sistema até hoje (limiar de destaque: percentil ${RELEVANCE_PERCENTILE_THRESHOLD}). Esse corte é recalculado a cada Research Run nova — não é um número fixo, ele se recalibra sozinho conforme mais dados entram.`,
    porQueColetamos:
      "Comparar contra a própria população histórica (em vez de um número fixo tipo '≥70') evita destacar demais quando o mercado inteiro está aquecido, e evita destacar de menos quando está tudo estagnado — o destaque sempre reflete 'raro AGORA', não um limiar arbitrário.",
    comoInterpretar: outcome?.previouslyHighlighted
      ? `Como analisar: ${formatOutcomeLine(outcome)} Isso é um dado real, calculado pelo Diff Engine (comparação entre a Research Run em que o projeto se destacou pela primeira vez e a mais recente) — não uma previsão, é o que já aconteceu. Ainda assim, confira o Confidence do Score antes de decidir qualquer coisa, e nunca trate isso como recomendação de compra.`
      : "Como analisar: (1) abra o perfil do projeto e confira o Confidence ao lado do Fundamental Score — percentil alto com Confidence baixa ainda pede cautela. (2) veja a série histórica de TVL (Research History) pra confirmar que o crescimento é consistente. (3) confira Funding pra entender se o Capital Momentum reflete algo relevante. Esta é a primeira vez que este projeto cruza o limiar — ainda não há uma run futura pra confirmar se o destaque se sustentou; volte aqui depois da próxima Research Run pra ver a confirmação.",
    limitacoes:
      "Baseado só em sinais quantitativos (TVL/Score/Funding) — não captura Tokenomics (unlocks, distribuição, hoje parcialmente N/A), riscos de segurança, nem contexto qualitativo. Nunca é recomendação de compra/venda.",
  };
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// Sprint 4 (Fase 10/11/12): a run passou a ser assíncrona — POST cria + enfileira, e o
// dashboard faz polling em GET /api/research-runs para acompanhar o progresso, sem WebSocket
// (Fase 12: "não implementar WebSocket neste sprint").
export default function ResearchPage() {
  const [mode, setMode] = useState<"FULL" | "INCREMENTAL">("FULL");
  const [creating, setCreating] = useState(false);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selections, setSelections] = useState<ResearchRunSelectionView[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refreshRuns() {
    const res = await fetch("/api/research-runs");
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs);
    }
  }

  async function refreshProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
    }
  }

  useEffect(() => {
    refreshRuns();
    refreshProjects();
  }, []);

  useEffect(() => {
    const hasActive = runs.some((r) => ACTIVE_STATUSES.has(r.status));
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => {
        refreshRuns();
        refreshProjects();
      }, 3000);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runs]);

  async function handleRun() {
    setCreating(true);
    await fetch("/api/research-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, trigger: "MANUAL" }),
    });
    await refreshRuns();
    setCreating(false);
  }

  async function handleCancel(id: string) {
    await fetch(`/api/research-runs/${id}/cancel`, { method: "POST" });
    await refreshRuns();
  }

  async function toggleTop10(id: string) {
    if (expandedRunId === id) {
      setExpandedRunId(null);
      setSelections(null);
      return;
    }
    setExpandedRunId(id);
    setSelections(null);
    const res = await fetch(`/api/research-runs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelections(data.run.selections ?? []);
    }
  }

  return (
    <section>
      <h1>Execuções de Pesquisa</h1>
      <p>
        Cria uma Research Run (persistida em <code>research_runs</code>) e a enfileira no BullMQ — o
        Research Worker processa fora da requisição HTTP.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value as "FULL" | "INCREMENTAL")}>
          <option value="FULL">Completa</option>
          <option value="INCREMENTAL">Incremental</option>
        </select>
        <button onClick={handleRun} disabled={creating}>
          {creating ? "Criando…" : "Rodar Pesquisa"}
        </button>
      </div>

      <h2>Execuções</h2>
      {runs.length === 0 ? (
        <p>Nenhuma Execução de Pesquisa ainda.</p>
      ) : (
        <table className="card-lg" style={{ padding: 0, display: "table", overflow: "hidden" }}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>Situação</th>
              <th style={cellStyle}>Modo</th>
              <th style={cellStyle}>Gatilho</th>
              <th style={cellStyle}>Duração</th>
              <th style={cellStyle}>Projetos</th>
              <th style={cellStyle}>Sucesso</th>
              <th style={cellStyle}>Falha</th>
              <th style={cellStyle}>Suspeitos</th>
              <th style={cellStyle}>Erro</th>
              <th style={cellStyle}>Ação</th>
              <th style={cellStyle}>Top 10</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <Fragment key={run.id}>
                <tr>
                  <td style={cellStyle} title={run.id}>
                    {run.id.slice(0, 8)}
                  </td>
                  <td style={cellStyle}>
                    <span className={`badge ${STATUS_BADGE[run.status]}`}>
                      {STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td style={cellStyle}>{MODE_LABEL[run.mode]}</td>
                  <td style={cellStyle}>{TRIGGER_LABEL[run.trigger]}</td>
                  <td style={cellStyle}>{formatDuration(run.startedAt, run.finishedAt)}</td>
                  <td style={cellStyle}>
                    {run.processedProjects}/{run.totalProjects}
                  </td>
                  <td style={cellStyle}>{run.successfulProjects}</td>
                  <td style={cellStyle}>{run.failedProjects}</td>
                  <td style={cellStyle}>{run.suspiciousProjects}</td>
                  <td style={cellStyle}>{run.errorMessage ?? "—"}</td>
                  <td style={cellStyle}>
                    {ACTIVE_STATUSES.has(run.status) ? (
                      <button onClick={() => handleCancel(run.id)}>Cancelar</button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => toggleTop10(run.id)}>
                      {expandedRunId === run.id ? "Ocultar" : "Ver"}
                    </button>
                  </td>
                </tr>
                {expandedRunId === run.id && (
                  <tr>
                    <td style={cellStyle} colSpan={11}>
                      {selections === null ? (
                        <p>Carregando…</p>
                      ) : selections.length === 0 ? (
                        <p>
                          Sem seleção dinâmica registrada para esta run (run com{" "}
                          <code>projectIds</code> explícitos, ou anterior ao Sprint 8).
                        </p>
                      ) : (
                        <table style={{ width: "100%" }}>
                          <thead>
                            <tr>
                              <th style={cellStyle}>#</th>
                              <th style={cellStyle}>Projeto</th>
                              <th style={cellStyle}>Prioridade</th>
                              <th style={cellStyle}>Score</th>
                              <th style={cellStyle}>Momentum de Crescimento</th>
                              <th style={cellStyle}>Momentum de Capital</th>
                              <th style={cellStyle}>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selections.map((s) => {
                              return (
                                <tr
                                  key={s.project.slug}
                                  style={
                                    s.relevant
                                      ? {
                                          background: "var(--success-soft)",
                                          borderLeft: "3px solid var(--success-border)",
                                        }
                                      : undefined
                                  }
                                >
                                  <td style={cellStyle}>{s.rank}</td>
                                  <td style={cellStyle}>
                                    <Link href={`/dashboard/projects/${s.project.slug}`}>
                                      {s.project.name}
                                    </Link>
                                    {s.relevant && (
                                      <InfoTooltip content={relevanceTooltipContent(s)} />
                                    )}
                                  </td>
                                  <td style={cellStyle}>{s.priorityScore}</td>
                                  <td style={cellStyle}>{s.globalScore ?? "—"}</td>
                                  <td style={cellStyle}>{s.growthMomentum ?? "—"}</td>
                                  <td style={cellStyle}>{s.capitalMomentum ?? "—"}</td>
                                  <td style={cellStyle}>{s.selectionReason.join(", ")}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 24 }}>
        <h2>Projetos com dados</h2>
        {projects.length === 0 ? (
          <p>Nenhum projeto processado ainda.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.slug}>
                <Link href={`/dashboard/projects/${p.slug}`}>{p.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const cellStyle: CSSProperties = { border: "1px solid #ccc", padding: 6, textAlign: "left" };
