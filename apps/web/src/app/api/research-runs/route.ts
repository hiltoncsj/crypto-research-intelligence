import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createResearchRun, listResearchRuns } from "@/lib/research-runs";
import { ResearchRunMode, ResearchRunTrigger } from "@crypto-research/shared";

// Sprint 4 (Fase 9/10): substitui o disparo síncrono do Sprint 3 (`/api/research-runs/manual`).
// POST cria a ResearchRun e enfileira o job BullMQ, responde rápido; o Worker processa fora
// da request HTTP.

const createSchema = z.object({
  mode: z.enum(["FULL", "INCREMENTAL"]).default("FULL"),
  trigger: z.enum(["MANUAL", "SCHEDULED", "SYSTEM"]).default("MANUAL"),
  projectIds: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const runs = await listResearchRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const run = await createResearchRun({
    mode: parsed.data.mode as ResearchRunMode,
    trigger: parsed.data.trigger as ResearchRunTrigger,
    projectSlugs: parsed.data.projectIds,
    requestedBy: session.user?.email ?? null,
  });

  return NextResponse.json({ run }, { status: 201 });
}
