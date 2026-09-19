import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listProjectsWithData } from "@/lib/research";

// Sprint 3: lista os projetos que já têm ao menos um snapshot persistido — usado pela UI
// para saber quais links de detalhe (/dashboard/projects/[slug]) mostrar.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const projects = await listProjectsWithData();
  return NextResponse.json({ projects });
}
