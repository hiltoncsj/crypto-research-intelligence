import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDashboardFundamentalView } from "@/lib/dashboard";

// Sprint 14 (Parte 18-22) — combina Research Overview + Data Health + Fundamental Movement +
// Divergences numa resposta só (cobre GET /api/dashboard/fundamental e
// GET /api/dashboard/data-health do prompt do sprint — um endpoint reaproveitável pela Home
// inteira em vez de 2 rotas quase idênticas, seção 22: "reutilizar a arquitetura existente").
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const view = await getDashboardFundamentalView();
  return NextResponse.json(view);
}
