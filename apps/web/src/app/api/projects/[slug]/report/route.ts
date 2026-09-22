import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { renderMarkdownReportToPdf } from "@/lib/report-pdf";
import { generateProjectReport, logReportEvent } from "@crypto-research/research-engine";

// Sprint 9 (Project Report): gerado sob demanda a partir do banco (nunca reconsulta DefiLlama —
// seção 39). O conteúdo continua sendo o Markdown do research-engine (fonte de verdade); esta
// rota só renderiza esse mesmo Markdown como PDF para download (`report-pdf.ts`) — nunca gera
// texto diferente do que `generateProjectReport` produziu.
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
  const filename = `${report.slug}-research-report-${dateStamp}.pdf`;

  let pdf: Buffer;
  try {
    pdf = await renderMarkdownReportToPdf(report.markdown, `${report.slug} — Research Report`);
  } catch (error) {
    logReportEvent("report.pdf_generation_failed", {
      slug: report.slug,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF do relatório. Verifique os logs do servidor." },
      { status: 500 },
    );
  }

  logReportEvent("report.downloaded", { slug: report.slug, filename });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
