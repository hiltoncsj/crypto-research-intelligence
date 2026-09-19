"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useKanban, type ColumnView, type RiskLevel } from "@/components/KanbanProvider";

// Sprint 7 — Kanban Pull System (UI, seção 34-37 do prompt de implementação).
//
// Estilo: tokens extraídos de designer_system/design-system.html (accent teal, rounded-xl,
// hierarquia tipográfica, hover states simples) — SEM os efeitos de seção 35 proibidos
// (cursor customizado, glow seguindo o mouse, tilt 3D, parallax). Os hovers aqui só trocam
// cor/borda, nunca reagem à posição do cursor. A página mantém o mesmo fundo claro e HTML
// semântico simples das demais páginas do dashboard (rankings, settings) — não introduz um
// tema escuro paralelo só para esta tela (isso seria, na prática, um segundo design system).

const RISK_LABELS: Record<"NORMAL" | "WATCH" | "BOTTLENECK" | "CRITICAL", string> = {
  NORMAL: "Normal",
  WATCH: "Observar",
  BOTTLENECK: "Gargalo",
  CRITICAL: "Crítico",
};

const CARD_STATUS_LABEL: Record<string, string> = {
  READY: "Pronto",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueado",
  DONE: "Concluído",
};

const COLUMN_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  DISCOVERY: "Discovery",
  DATA_COLLECTION: "Data Collection",
  FUNDAMENTAL_ANALYSIS: "Fundamental Analysis",
  SCORING: "Scoring",
  PUBLISHED: "Published",
};

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}min`;
  return `${h.toFixed(1)}h`;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

// Cronômetro da coluna Data Collection (o gargalo real do pipeline, ver CLAUDE.md). Só existe
// um card ativo por vez nessa coluna (wipLimit: 1, worker roda com concurrency: 1), então é um
// cronômetro único e global, não por card. A média histórica vem de avgCycleTimeHours (seção
// 22 do Pull System, calculada em kanban-metrics.ts a partir de KanbanCardMovement) — nenhum
// estado novo é criado, só lido e comparado ao vivo no client.
function DataCollectionTimer({
  enteredColumnAt,
  avgHours,
}: {
  enteredColumnAt: string | null;
  avgHours: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enteredColumnAt) return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [enteredColumnAt]);

  // Sem card ativo (nenhuma tarefa em andamento em Data Collection agora): fica parado em
  // 00:00:00, pronto para reiniciar do zero assim que a próxima tarefa for puxada.
  const elapsedSeconds = enteredColumnAt ? (now - new Date(enteredColumnAt).getTime()) / 1000 : 0;
  const avgSeconds = avgHours !== null ? avgHours * 3600 : null;
  const isOverAverage = avgSeconds !== null && elapsedSeconds > avgSeconds;
  const color = !enteredColumnAt
    ? "var(--text-muted)"
    : avgSeconds === null
      ? "var(--text-muted)"
      : isOverAverage
        ? "#f87171"
        : "#34d399";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        marginLeft: "auto",
      }}
    >
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff" }}>
        {avgSeconds !== null ? formatClock(avgSeconds) : "—"}
      </span>
      <span style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.15, color }}>
        {formatClock(elapsedSeconds)}
      </span>
    </div>
  );
}

export default function KanbanPage() {
  // Dados e polling vêm do KanbanProvider (montado em dashboard/layout.tsx) — continuam
  // atualizando mesmo enquanto o usuário navega para outra subpágina do dashboard.
  const { board, metrics, error, reload } = useKanban();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleUnblock(cardId: string) {
    setActionError(null);
    const res = await fetch(`/api/kanban/cards/${cardId}/unblock`, { method: "POST" });
    if (!res.ok) {
      setActionError("Não foi possível desbloquear o card.");
      return;
    }
    reload();
  }

  // Pull System real (Sprint 7): só existe movimento para frente (Pull), e só quando o card já
  // está READY (buffer da etapa anterior) — nunca um "mover para trás" livre, nem drag-and-drop.
  async function handlePull(cardId: string, toColumnKey: string) {
    setActionError(null);
    const res = await fetch(`/api/kanban/cards/${cardId}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toColumnKey }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error ?? "Não foi possível puxar o card.");
      return;
    }
    reload();
  }

  if (error) return <p role="alert">{error}</p>;
  if (!board || !metrics) return <p>Carregando…</p>;

  const dataCollectionColumn = board.columns.find((c) => c.key === "DATA_COLLECTION");
  const dataCollectionActiveCard = dataCollectionColumn
    ? board.cards.find(
        (c) => c.columnId === dataCollectionColumn.id && c.cardStatus === "IN_PROGRESS",
      )
    : undefined;
  const dataCollectionAvgHours =
    metrics.columns.find((c) => c.columnKey === "DATA_COLLECTION")?.avgCycleTimeHours ?? null;

  return (
    <section>
      <style jsx>{`
        .board {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .column {
          flex: 0 0 260px;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 12px;
          background: var(--surface-2);
        }
        .column.risk-watch {
          border-color: rgba(96, 165, 250, 0.5);
        }
        .column.risk-bottleneck {
          border-color: rgba(251, 191, 36, 0.5);
          background: rgba(251, 191, 36, 0.06);
        }
        .column.risk-critical {
          border-color: rgba(248, 113, 113, 0.6);
          background: rgba(248, 113, 113, 0.08);
        }
        .risk-tag {
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .risk-tag.risk-watch {
          color: #60a5fa;
        }
        .risk-tag.risk-bottleneck {
          color: var(--warning);
        }
        .risk-tag.risk-critical {
          color: #f87171;
        }
        .buffer-info {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .column-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 8px;
        }
        .column-title {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--text);
        }
        .wip-badge {
          font-size: 0.8rem;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent-strong);
          border: 1px solid var(--accent-border);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .wip-badge.full {
          background: var(--warning-soft);
          color: var(--warning);
          border-color: rgba(251, 191, 36, 0.4);
        }
        .bottleneck-tag {
          font-size: 0.75rem;
          color: var(--warning);
          font-weight: 600;
        }
        .card {
          position: relative;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 8px 10px;
          margin-bottom: 8px;
          background: var(--surface);
          transition:
            border-color 0.15s ease,
            background-color 0.15s ease;
        }
        .rank-badge {
          position: absolute;
          top: 8px;
          right: 10px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 1px solid var(--accent-border);
          background: var(--accent-soft);
          color: var(--accent-strong);
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card:hover {
          border-color: var(--accent-border);
          background: var(--surface-3);
        }
        .card.blocked {
          border-color: rgba(248, 113, 113, 0.4);
          background: var(--danger-soft);
        }
        .card.urgent {
          border-left: 3px solid var(--warning);
        }
        .card-title {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text);
        }
        .card-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .unblock-btn {
          margin-top: 6px;
          font-size: 0.75rem;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid var(--accent);
          background: transparent;
          color: var(--accent-strong);
          cursor: pointer;
        }
        .unblock-btn:hover {
          background: var(--accent);
          color: #05221d;
        }
        .pull-btn {
          margin-top: 6px;
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid var(--accent);
          background: transparent;
          color: var(--accent-strong);
          cursor: pointer;
        }
        .pull-btn:hover {
          background: var(--accent);
          color: #05221d;
        }
        .pull-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .metrics-row {
          display: flex;
          align-items: center;
          gap: 24px;
          margin: 12px 0 20px;
          font-size: 0.9rem;
        }
      `}</style>

      <div className="section-label">Pipeline</div>
      <h1>Kanban — Research Pipeline</h1>
      <p style={{ fontStyle: "italic" }}>
        Pull System: cada coluna só recebe trabalho quando tem capacidade (WIP Limit aplicado no
        backend).
      </p>

      <div className="metrics-row">
        <span>
          Throughput (7d): <strong>{metrics.throughputLast7Days}</strong>
        </span>
        <span>
          Lead Time médio: <strong>{formatHours(metrics.avgLeadTimeHours)}</strong>
        </span>
        <span>
          Blocked Time médio: <strong>{formatHours(metrics.avgBlockedTimeHours)}</strong>
        </span>
        <span>
          Card aberto mais antigo: <strong>{formatHours(metrics.oldestOpenCardAgeHours)}</strong>
        </span>
        <DataCollectionTimer
          enteredColumnAt={dataCollectionActiveCard?.enteredColumnAt ?? null}
          avgHours={dataCollectionAvgHours}
        />
      </div>

      {actionError && <p role="alert">{actionError}</p>}

      <div className="board">
        {(() => {
          // Backlog não reflete o pipeline de pesquisa em execução (fica sempre vazio na
          // prática, ver TUTORIAL.md seção 17 — não é uma ferramenta de tarefas genérica) —
          // omitido do board para o primeiro card visível ser Discovery.
          const sortedColumns = board.columns
            .filter((c) => c.key !== "BACKLOG")
            .sort((a, b) => a.position - b.position);

          // Puxar (pull) continua operando por coluna REAL do backend (cada card avança um
          // passo real no pipeline) — este mapa preserva isso independente do agrupamento
          // visual abaixo.
          const nextRealColumnByColumnId = new Map<string, ColumnView>();
          sortedColumns.forEach((column, index) => {
            const next = sortedColumns[index + 1];
            if (next) nextRealColumnByColumnId.set(column.id, next);
          });

          // Fundamental Analysis e Scoring são etapas rápidas na prática (quase instantâneas
          // entre Data Collection e Published) — agrupadas em um único bloco visual, mas as
          // colunas reais (WIP/pull/bottleneck) permanecem intactas no backend.
          interface VisualGroup {
            key: string;
            label: string;
            columns: ColumnView[];
          }
          const visualGroups: VisualGroup[] = [];
          for (let i = 0; i < sortedColumns.length; i++) {
            const column = sortedColumns[i]!;
            const next = sortedColumns[i + 1];
            if (column.key === "FUNDAMENTAL_ANALYSIS" && next?.key === "SCORING") {
              visualGroups.push({
                key: "FUNDAMENTAL_ANALYSIS_SCORING",
                label: "Fundamental Analysis/ Scoring",
                columns: [column, next],
              });
              i++; // já consumiu o Scoring junto
            } else {
              visualGroups.push({
                key: column.key,
                label: COLUMN_LABELS[column.key] ?? column.name,
                columns: [column],
              });
            }
          }

          const RISK_ORDER: RiskLevel[] = ["NORMAL", "WATCH", "BOTTLENECK", "CRITICAL"];
          const worstRisk = (levels: RiskLevel[]): RiskLevel =>
            levels.reduce(
              (worst, level) =>
                RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(worst) ? level : worst,
              "NORMAL" as RiskLevel,
            );

          return visualGroups.map((group) => {
            const wip = group.columns.reduce((sum, c) => sum + c.wip, 0);
            const wipLimit = group.columns.every((c) => c.wipLimit !== null)
              ? group.columns.reduce((sum, c) => sum + (c.wipLimit ?? 0), 0)
              : null;
            const bottleneck = group.columns.some((c) => c.bottleneck);
            const riskLevel = worstRisk(group.columns.map((c) => c.riskLevel));
            const bufferCount = group.columns.reduce((sum, c) => sum + c.bufferCount, 0);
            const oldestBufferAgeHours = group.columns.reduce<number | null>(
              (oldest, c) =>
                c.oldestBufferAgeHours === null
                  ? oldest
                  : oldest === null
                    ? c.oldestBufferAgeHours
                    : Math.max(oldest, c.oldestBufferAgeHours),
              null,
            );
            const availableCapacity = group.columns.every((c) => c.availableCapacity !== null)
              ? group.columns.reduce((sum, c) => sum + (c.availableCapacity ?? 0), 0)
              : null;
            const columnIds = new Set(group.columns.map((c) => c.id));
            const cardsInGroup = board.cards.filter((c) => columnIds.has(c.columnId));
            const riskClass = riskLevel !== "NORMAL" ? ` risk-${riskLevel.toLowerCase()}` : "";

            return (
              <div key={group.key} className={`column${riskClass}`}>
                <div className="column-header">
                  <span className="column-title">{group.label}</span>
                  <span className={`wip-badge${bottleneck ? " full" : ""}`}>
                    {wip}
                    {wipLimit !== null ? ` / ${wipLimit}` : ""}
                  </span>
                </div>
                {riskLevel !== "NORMAL" && (
                  <div className={`risk-tag risk-${riskLevel.toLowerCase()}`}>
                    ⚠ {RISK_LABELS[riskLevel]}
                  </div>
                )}
                {availableCapacity !== null && availableCapacity > 0 && (
                  <div
                    style={{ fontSize: "0.75rem", color: "var(--accent-strong)", marginBottom: 6 }}
                  >
                    {availableCapacity} vaga(s) disponível(is)
                  </div>
                )}
                {bufferCount > 0 && (
                  <div className="buffer-info">
                    Buffer (Pronto): {bufferCount} · mais antigo:{" "}
                    {formatHours(oldestBufferAgeHours)}
                  </div>
                )}
                {cardsInGroup.map((card) => {
                  const nextColumn = nextRealColumnByColumnId.get(card.columnId) ?? null;
                  return (
                    <div
                      key={card.id}
                      className={`card${card.cardStatus === "BLOCKED" ? " blocked" : ""}${card.urgent ? " urgent" : ""}`}
                    >
                      {group.key === "PUBLISHED" && card.coinGeckoMarketCapRank !== null && (
                        <span
                          className="rank-badge"
                          title={`#${card.coinGeckoMarketCapRank} no ranking de market cap da CoinGecko`}
                        >
                          #{card.coinGeckoMarketCapRank}
                        </span>
                      )}
                      {nextColumn && (
                        <button
                          type="button"
                          className="pull-btn"
                          disabled={card.cardStatus !== "READY"}
                          title={
                            card.cardStatus === "READY"
                              ? `Puxar para ${COLUMN_LABELS[nextColumn.key] ?? nextColumn.name}`
                              : "Só é possível puxar cards no estado READY (buffer da etapa anterior)"
                          }
                          onClick={() => handlePull(card.id, nextColumn.key)}
                        >
                          → {COLUMN_LABELS[nextColumn.key] ?? nextColumn.name}
                        </button>
                      )}
                      <div className="card-title">
                        {card.projectSlug ? (
                          <Link href={`/dashboard/projects/${card.projectSlug}`}>{card.title}</Link>
                        ) : (
                          card.title
                        )}
                      </div>
                      <div className="card-meta">
                        {CARD_STATUS_LABEL[card.cardStatus] ?? card.cardStatus}
                        {card.urgent && " · URGENTE"}
                      </div>
                      {card.cardStatus === "BLOCKED" && (
                        <>
                          <div className="card-meta">Motivo: {card.blockedReason}</div>
                          <button className="unblock-btn" onClick={() => handleUnblock(card.id)}>
                            Desbloquear
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {cardsInGroup.length === 0 && (
                  <p style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Vazio</p>
                )}
              </div>
            );
          });
        })()}
      </div>
    </section>
  );
}
