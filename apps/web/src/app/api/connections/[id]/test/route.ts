import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  testConnection,
  UnknownConnectionError,
  UnsupportedProviderError,
} from "@/lib/connections";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const connection = await testConnection(params.id);
    return NextResponse.json({ connection });
  } catch (err) {
    if (err instanceof UnknownConnectionError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof UnsupportedProviderError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Falha ao testar conexão." }, { status: 500 });
  }
}
