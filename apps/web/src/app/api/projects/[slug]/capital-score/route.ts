import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectCapitalScoreData } from "@/lib/scores";

export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const data = await getProjectCapitalScoreData(context.params.slug);
  return NextResponse.json({ latest: data });
}
