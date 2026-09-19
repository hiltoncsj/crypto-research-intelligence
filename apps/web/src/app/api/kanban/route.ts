import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createCard, getKanbanBoard } from "@/lib/kanban";

// Sprint 7: GET retorna o board completo (colunas com WIP/capacidade + cards) — seção 36 do
// Pull System ("a interface deve deixar evidente CAPACITY/WIP/READY/..."). POST cria um card
// manual direto no BACKLOG (seção 18/28 — criação simples, sem estar associado a um projeto).

const createCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().optional(),
  swimlane: z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const board = await getKanbanBoard();
  return NextResponse.json(board);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const card = await createCard(parsed.data, session.user?.email ?? null);
  return NextResponse.json({ card }, { status: 201 });
}
