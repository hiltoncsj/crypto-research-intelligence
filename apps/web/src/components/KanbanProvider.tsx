"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Montado em dashboard/layout.tsx (fora de {children}) para o polling do Kanban continuar
// rodando enquanto o usuário navega entre subpáginas do dashboard — sem isso, cada troca de
// rota desmonta a página e cancela o setInterval (ver KanbanPage antes desta mudança). Só é
// desmontado se o usuário sair do /dashboard inteiro (ex.: logout) — não é background "de
// verdade" fora disso, o que exigiria Service Worker/WebSocket (fora do padrão do projeto,
// ver CLAUDE.md: "sem WebSocket/Event Bus no Kanban").

export type RiskLevel = "NORMAL" | "WATCH" | "BOTTLENECK" | "CRITICAL";

export interface ColumnView {
  id: string;
  key: string;
  name: string;
  position: number;
  wipLimit: number | null;
  wip: number;
  availableCapacity: number | null;
  bottleneck: boolean;
  riskLevel: RiskLevel;
  bufferCount: number;
  oldestBufferAgeHours: number | null;
}

export interface CardViewDto {
  id: string;
  columnId: string;
  cardStatus: string;
  title: string;
  projectSlug: string | null;
  coinGeckoMarketCapRank: number | null;
  urgent: boolean;
  urgentReason: string | null;
  blockedReason: string | null;
  priority: number;
  enteredColumnAt: string;
}

export interface BoardDto {
  boardId: string;
  boardName: string;
  columns: ColumnView[];
  cards: CardViewDto[];
}

export interface ColumnMetricDto {
  columnKey: string;
  avgCycleTimeHours: number | null;
}

export interface MetricsDto {
  throughputLast7Days: number;
  avgLeadTimeHours: number | null;
  avgBlockedTimeHours: number | null;
  oldestOpenCardAgeHours: number | null;
  bottlenecks: string[];
  columns: ColumnMetricDto[];
}

interface KanbanContextValue {
  board: BoardDto | null;
  metrics: MetricsDto | null;
  error: string | null;
  reload: () => Promise<void>;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<BoardDto | null>(null);
  const [metrics, setMetrics] = useState<MetricsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [boardRes, metricsRes] = await Promise.all([
        fetch("/api/kanban"),
        fetch("/api/kanban/metrics"),
      ]);
      if (!boardRes.ok || !metricsRes.ok) {
        setError("Erro ao carregar o board.");
        return;
      }
      setBoard(await boardRes.json());
      setMetrics(await metricsRes.json());
      setError(null);
    } catch {
      setError("Erro ao carregar o board.");
    }
  }, []);

  useEffect(() => {
    reload();
    const intervalId = setInterval(reload, 30_000);
    return () => clearInterval(intervalId);
  }, [reload]);

  return (
    <KanbanContext.Provider value={{ board, metrics, error, reload }}>
      {children}
    </KanbanContext.Provider>
  );
}

export function useKanban(): KanbanContextValue {
  const ctx = useContext(KanbanContext);
  if (!ctx) throw new Error("useKanban precisa estar dentro de <KanbanProvider>.");
  return ctx;
}
