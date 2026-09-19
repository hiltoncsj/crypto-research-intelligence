// Sprint 19 (External Identity Mapping): validadores anti-SSRF para os dois identificadores
// externos curados manualmente (Project.githubRepo/Project.snapshotSpace). Usados em DOIS
// pontos — na API de curadoria (apps/web, antes de persistir) e de novo aqui em defi-data (antes
// de qualquer client montar uma URL) — defesa em profundidade: mesmo que um valor inválido já
// exista no banco por algum motivo, o client nunca o usa para montar uma requisição.
//
// Formato exigido: "owner/repo" para GitHub (sem protocolo, sem host, sem query string) e um
// slug simples para Snapshot (ex.: "ens.eth", sem protocolo/host). Qualquer coisa com "://",
// espaço, ou caracteres fora do allowlist é rejeitada — nunca aceito como URL arbitrária
// (Parte 21 do documento de especificação: proibido "javascript:", "file:", IP interno,
// "localhost", injeção de credencial).

const GITHUB_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;
const SNAPSHOT_SPACE_RE = /^[a-z0-9](?:[a-z0-9.-]{0,99})$/i;

export function isValidGithubRepo(value: string): boolean {
  if (value.includes("://") || value.includes(" ") || value.includes("..")) return false;
  return GITHUB_REPO_RE.test(value);
}

export function isValidSnapshotSpace(value: string): boolean {
  if (value.includes("://") || value.includes(" ") || value.includes("..")) return false;
  return SNAPSHOT_SPACE_RE.test(value);
}
