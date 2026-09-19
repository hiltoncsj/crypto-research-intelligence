import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createConnection, listConnections, SUPPORTED_PROVIDERS } from "@/lib/connections";

const createSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  name: z.string().min(1).max(100),
  secret: z.string().min(1).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const connections = await listConnections();
  return NextResponse.json({ connections });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const connection = await createConnection(parsed.data);
  return NextResponse.json({ connection }, { status: 201 });
}
