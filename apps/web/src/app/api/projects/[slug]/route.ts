import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectDashboardData } from "@/lib/research";

export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const data = await getProjectDashboardData(context.params.slug);
  if (!data) {
    return NextResponse.json(
      { error: "Projeto não encontrado ou sem dados ainda." },
      { status: 404 },
    );
  }

  return NextResponse.json({ project: data });
}
