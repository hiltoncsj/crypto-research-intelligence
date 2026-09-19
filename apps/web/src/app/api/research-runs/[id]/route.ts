import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getResearchRun } from "@/lib/research-runs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const run = await getResearchRun(params.id);
  if (!run) {
    return NextResponse.json({ error: "Research Run não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ run });
}
