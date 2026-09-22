import { existsSync } from "node:fs";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

// Renderiza o Markdown do Project Report (packages/research-engine) como PDF para download.
// Não usa `puppeteer` (que baixa ~300MB de Chromium próprio) — usa `puppeteer-core` apontando
// para um Chrome/Edge já instalado na máquina, resolvido em `resolveBrowserExecutablePath`.
// Se nenhum navegador compatível for encontrado, falha explicitamente (nunca cai silenciosamente
// de volta para Markdown "fingindo" ser PDF).

const CANDIDATE_EXECUTABLE_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

export function resolveBrowserExecutablePath(): string {
  // `PDF_BROWSER_EXECUTABLE_PATH` (docs/V1_OPERATIONS.md) permite apontar para outro navegador
  // em ambientes onde nenhum dos caminhos padrão existe (ex.: container Linux de produção).
  const envPath = process.env.PDF_BROWSER_EXECUTABLE_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`PDF_BROWSER_EXECUTABLE_PATH aponta para um caminho inexistente: ${envPath}`);
    }
    return envPath;
  }
  const found = CANDIDATE_EXECUTABLE_PATHS.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      "Nenhum navegador Chrome/Edge encontrado para gerar PDF. Instale o Google Chrome ou o " +
        "Microsoft Edge, ou defina PDF_BROWSER_EXECUTABLE_PATH apontando para um executável " +
        "compatível (ver docs/V1_OPERATIONS.md).",
    );
  }
  return found;
}

// CSS mínimo só para legibilidade do PDF (sem tema/glow/tilt — convenção do CLAUDE.md contra
// efeitos do designer_system). Markdown puro do research-engine, sem HTML embutido.
const PDF_STYLESHEET = `
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px;
    line-height: 1.5; color: #1a1a1a; padding: 24px 32px; }
  h1 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 6px; }
  h2 { font-size: 17px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 14px; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f2f2f2; }
  code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
  pre { background: #f2f2f2; padding: 8px; overflow-x: auto; border-radius: 4px; }
  blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding: 0 12px; color: #555; }
  a { color: #0645ad; }
`;

export async function renderMarkdownReportToPdf(markdown: string, title: string): Promise<Buffer> {
  const executablePath = resolveBrowserExecutablePath();
  const bodyHtml = await marked.parse(markdown);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${PDF_STYLESHEET}</style></head><body>${bodyHtml}</body></html>`;

  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
