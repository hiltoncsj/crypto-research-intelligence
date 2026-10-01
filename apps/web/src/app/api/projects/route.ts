import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listProjectsWithData } from "@/lib/research";

// Lista os projetos já pesquisados (têm Fundamental Score), com a data da última atualização —
// usado pela UI para os links de detalhe (/dashboard/projects/[slug]). Ver listProjectsWithData.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const projects = await listProjectsWithData();
  return NextResponse.json({ projects });
}
