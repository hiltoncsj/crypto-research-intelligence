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

// Sprint 23 (Discourse Governance Intelligence): diferente de GitHub/Snapshot, o fórum de cada
// projeto vive em um DOMÍNIO PRÓPRIO (não um host fixo conhecido) — então a validação aqui não
// pode usar uma allowlist de hosts fixa. Em vez disso, valida a FORMA da URL: só HTTPS, sem
// userinfo (injeção de credencial via "user:pass@host"), sem IP literal privado/loopback, sem
// "localhost", hostname precisa ter pelo menos um ponto (rejeita hosts internos tipo
// "http://internal-service"). Curadoria continua manual — isto é defesa em profundidade, não
// uma garantia de que o admin não pode errar, mas impede as classes de erro mais óbvias (SSRF
// para localhost/rede interna/protocolo perigoso).
const PRIVATE_OR_LOOPBACK_HOST_RE =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|\[::1\]|::1)$/i;

export function isValidDiscourseForumUrl(value: string): boolean {
  if (value.includes(" ")) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase();
  if (PRIVATE_OR_LOOPBACK_HOST_RE.test(hostname)) return false;
  if (!hostname.includes(".")) return false;
  return true;
}

/** Origem normalizada (`https://host`), sem path/query/hash — a única parte da URL curada que
 * qualquer endpoint deste projeto deve usar para montar chamadas ao Discourse. */
export function discourseForumOrigin(validatedUrl: string): string {
  return new URL(validatedUrl).origin;
}
