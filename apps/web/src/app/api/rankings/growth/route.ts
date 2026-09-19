import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getGrowthRankingView } from "@/lib/scores";

// Growth Ranking — mede momentum de crescimento (TVL growth30d), não é recomendação de
// investimento (mesma regra do Fundamental Ranking, ver rankings/fundamental).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const ranking = await getGrowthRankingView();
  return NextResponse.json({ ranking });
}
