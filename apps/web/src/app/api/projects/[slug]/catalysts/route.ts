import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@crypto-research/database";
import { getCatalysts } from "@crypto-research/research-engine";

// Sprint 15 (Parte 27) — GET /api/projects/[slug]/catalysts. Mesmo padrão de rota fina.
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const project = await prisma.project.findUnique({ where: { slug: context.params.slug } });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const catalysts = await getCatalysts(project.id);
  return NextResponse.json({ catalysts });
}
