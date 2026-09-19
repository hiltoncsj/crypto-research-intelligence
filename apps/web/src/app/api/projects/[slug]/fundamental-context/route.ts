import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { computeFundamentalContext, projectExists } from "@crypto-research/research-engine";

// Sprint 15 (Parte 12/27) — GET /api/projects/[slug]/fundamental-context. Mesmo padrão de
// rota fina; todo o cálculo/agregação vem de `computeFundamentalContext` (research-engine).
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const projectId = await projectExists(context.params.slug);
  if (!projectId) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const context_ = await computeFundamentalContext(projectId, context.params.slug);
  return NextResponse.json({ context: context_ });
}
