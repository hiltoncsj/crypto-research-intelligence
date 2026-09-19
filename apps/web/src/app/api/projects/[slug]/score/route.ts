import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectScoreData } from "@/lib/scores";

// Sprint 5 (Fase 19): Fundamental Score + histórico de um projeto — mesmo padrão de
// /api/projects/[slug] (Sprint 3): rota fina, autenticada, delega para lib/scores.ts.
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const data = await getProjectScoreData(context.params.slug);
  if (!data) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  return NextResponse.json(data);
}
