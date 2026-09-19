import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@crypto-research/database";
import { diffResearchRuns, getProjectHistory } from "@crypto-research/research-engine";

// Sprint 9 (Research History + Changelog): agrega snapshots/scores já persistidos em janelas
// 7/30/90/180d, e inclui o changelog (diff entre as duas Research Runs mais recentes) na mesma
// resposta — evita um terceiro endpoint só para isso (rota HTTP fina, lógica em research-engine).
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const history = await getProjectHistory(context.params.slug);
  if (!history) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { slug: context.params.slug } });
  const diff = await diffResearchRuns(project.id);

  return NextResponse.json({ history, changelog: diff.entries });
}
