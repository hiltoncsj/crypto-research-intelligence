import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getFundamentalRankingView } from "@/lib/scores";

// Sprint 5 (Fase 20/21): "Fundamental Ranking" — nunca "Best Investment"/"Buy"/"Strong Buy".
// Mede força fundamental observável, não é recomendação de investimento (Fase 21/33).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const ranking = await getFundamentalRankingView();
  return NextResponse.json({ ranking });
}
