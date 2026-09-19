import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { blockCard } from "@/lib/kanban";

const blockSchema = z.object({ reason: z.string().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = blockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Motivo do bloqueio é obrigatório." }, { status: 400 });
  }

  const card = await blockCard(params.id, parsed.data.reason, session.user?.email ?? null);
  return NextResponse.json({ card });
}
