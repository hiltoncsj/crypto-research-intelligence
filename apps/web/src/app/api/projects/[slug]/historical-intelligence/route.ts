import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@crypto-research/database";
import { computeFundamentalHistoricalIntelligence } from "@crypto-research/research-engine";

// Sprint 14 (Parte 22) — GET /api/research/historical/:projectId do prompt do sprint, adaptado
// para o padrão de rota já estabelecido no projeto (identificar por `slug`, não `projectId`,
// mesma convenção de /api/projects/[slug]/history e /report — "reutilizar a arquitetura
// existente", seção 22). Rota HTTP fina: só sessão + busca do projeto; todo o cálculo vem de
// `computeFundamentalHistoricalIntelligence` (research-engine), nada calculado aqui.
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const project = await prisma.project.findUnique({ where: { slug: context.params.slug } });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const intelligence = await computeFundamentalHistoricalIntelligence(project.id, project.slug);
  return NextResponse.json({ intelligence });
}
