import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getProjectDashboardData,
  InvalidExternalIdentityError,
  ProjectNotFoundError,
  updateProjectExternalIdentity,
} from "@/lib/research";

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

// Sprint 19 (External Identity Mapping): único endpoint que escreve githubRepo/snapshotSpace.
// Reusa a MESMA autenticação de sessão já usada em todas as outras rotas admin deste app
// single-user (NextAuth Credentials) — não existe RBAC separado no sistema (ver CLAUDE.md), e
// criar um painel de permissões só para 2 campos seria abstração/complexidade desnecessária
// (Parte 22 do documento de especificação: "não criar sistema paralelo de permissões").
const patchSchema = z.object({
  githubRepo: z.string().min(1).max(200).nullable().optional(),
  snapshotSpace: z.string().min(1).max(200).nullable().optional(),
  discourseForumUrl: z.string().min(1).max(300).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await updateProjectExternalIdentity(context.params.slug, parsed.data);
  } catch (err) {
    if (err instanceof InvalidExternalIdentityError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }

  const data = await getProjectDashboardData(context.params.slug);
  return NextResponse.json({ project: data });
}
