import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCapitalRankingView } from "@/lib/scores";

// Capital Ranking — mede qualidade/histórico de captação (Institutional Capital Score), não é
// recomendação de investimento (mesma regra do Fundamental Ranking, ver rankings/fundamental).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const ranking = await getCapitalRankingView();
  return NextResponse.json({ ranking });
}
