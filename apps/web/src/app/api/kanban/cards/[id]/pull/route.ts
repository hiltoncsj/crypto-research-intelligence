import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { pullCardToColumn, KanbanPullError } from "@/lib/kanban";
import { KanbanColumnKey } from "@crypto-research/shared";

// Sprint 7 (seção 11/48 do Pull System): PULL explícito — move um card READY (buffer) para a
// próxima coluna, com WIP Limit aplicado no backend dentro de uma transação atômica (dois
// agentes não podem puxar o mesmo card, nem estourar o WIP por corrida — seção 48).

const pullSchema = z.object({
  toColumnKey: z.nativeEnum(KanbanColumnKey),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = pullSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const card = await pullCardToColumn(
      params.id,
      parsed.data.toColumnKey,
      session.user?.email ?? null,
    );
    return NextResponse.json({ card });
  } catch (err) {
    if (err instanceof KanbanPullError) {
      // Seção 37: "se uma movimentação for inválida, não executar e informar claramente o
      // motivo" — nunca um 500 genérico para uma regra de negócio esperada.
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
