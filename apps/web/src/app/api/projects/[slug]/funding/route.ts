import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectFundingData } from "@/lib/scores";

// Sprint 6 (Parte 15): dado bruto de funding (rounds + investidores conhecidos), não um score.
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const data = await getProjectFundingData(context.params.slug);
  if (data === null) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  return NextResponse.json(data);
}
