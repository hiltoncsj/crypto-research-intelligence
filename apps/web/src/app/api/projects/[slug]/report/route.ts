import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateProjectReport, logReportEvent } from "@crypto-research/research-engine";

// Sprint 9 (Project Report): gerado sob demanda a partir do banco (nunca reconsulta DefiLlama —
// seção 39) e retornado como Markdown para download direto (seção 34/35).
//
// Segurança (seção 36): `context.params.slug` nunca é usado para montar um caminho de
// filesystem — só como valor de bind numa query Prisma (`where: { slug }`), então não há
// superfície de path traversal aqui; o roteamento do Next.js já trata o segmento da URL como um
// parâmetro de string opaco, não como um caminho.
export async function GET(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const report = await generateProjectReport(context.params.slug);
  if (!report) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const dateStamp = report.generatedAt.slice(0, 10);
  const filename = `${report.slug}-research-report-${dateStamp}.md`;

  logReportEvent("report.downloaded", { slug: report.slug, filename });

  return new NextResponse(report.markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
