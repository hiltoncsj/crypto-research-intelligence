import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@crypto-research/database";
import { getEventImpactsForProject } from "@crypto-research/research-engine";

// Sprint 16 (Parte 27) — GET /api/projects/[slug]/event-impacts. Mesmo padrão de rota fina;
// todo o cálculo vem de `getEventImpactsForProject` (research-engine). Cobre
// "GET /api/research/projects/:projectId/event-impacts" do prompt do sprint, adaptado à
// convenção já estabelecida (identificar por slug, "reutilizar a arquitetura existente").
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const project = await prisma.project.findUnique({ where: { slug: context.params.slug } });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const impacts = await getEventImpactsForProject(project.id);
  return NextResponse.json({ impacts });
}
