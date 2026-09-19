import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectTokenomicsScoreData } from "@/lib/scores";

// Sprint 6 (Parte 15): mesmo padrão de /api/projects/[slug]/score (Sprint 5).
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const data = await getProjectTokenomicsScoreData(context.params.slug);
  return NextResponse.json({ latest: data });
}
