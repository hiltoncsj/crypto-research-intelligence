import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { markUrgent, KanbanPullError } from "@/lib/kanban";

// Sprint 7 (seção 14 do Pull System): urgente exige justificativa e respeita a política de
// limite por período (`maxUrgentItems`/`periodDays`) — nunca "fura qualquer regra".
const urgentSchema = z.object({ reason: z.string().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = urgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Justificativa é obrigatória para marcar como urgente." },
      { status: 400 },
    );
  }

  try {
    const card = await markUrgent(params.id, parsed.data.reason, session.user?.email ?? null);
    return NextResponse.json({ card });
  } catch (err) {
    if (err instanceof KanbanPullError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 429 });
    }
    throw err;
  }
}
