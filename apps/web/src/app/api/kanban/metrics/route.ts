import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getKanbanMetrics } from "@/lib/kanban";

// Sprint 7 (seção 22 do Pull System): WIP Utilization, Cycle Time, Lead Time, Blocked Time,
// Throughput e detecção de gargalos por coluna.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const metrics = await getKanbanMetrics();
  return NextResponse.json(metrics);
}
