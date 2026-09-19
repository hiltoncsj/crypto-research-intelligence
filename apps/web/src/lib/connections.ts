import { prisma } from "@crypto-research/database";
import { pingCoinGecko, pingDefiLlama, pingDefiLlamaPro } from "@crypto-research/defi-data";
import { decrypt, encrypt, maskSecret } from "@crypto-research/shared";

// Sprint 2 (Fase 14-16): camada de serviço para api_connections. Mantém a lógica de
// negócio (mascaramento, decisão de qual provider testar) fora das rotas HTTP, que só
// traduzem request/response.

// Sprint 11 (integração CoinGecko): segundo provider real — usa o mesmo mecanismo de
// ApiConnection (secret opcional) que já existia reservado para isso.
// Sprint 18 (TOKEN_UNLOCK — PRONTO, NÃO ATIVADO): terceiro provider real, mas diferente dos
// outros dois — EXIGE key (não é keyless, ver `KEYLESS_PROVIDERS` abaixo). Sem uma key aqui, o
// Research Worker nunca chama a DefiLlama Pro (ver `resolveDefiLlamaProApiKey` em
// packages/research-engine/src/pipeline.ts) — nenhum custo é incorrido até o usuário configurar
// isto explicitamente.
export const SUPPORTED_PROVIDERS = ["DEFILLAMA", "COINGECKO", "DEFILLAMA_PRO"] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// Providers que não exigem API key (seção 9 do plano de implementação): a conexão existe
// para rastrear status/teste, mas encryptedSecret pode ficar nulo. CoinGecko funciona sem key
// no tier gratuito — uma key opcional (Pro) só aumenta o rate limit. DEFILLAMA_PRO NÃO está
// nesta lista de propósito: sem secret, a run com essa conexão fica NOT_CONFIGURED (nunca testa
// a API paga sem uma key real).
const KEYLESS_PROVIDERS = new Set<SupportedProvider>(["DEFILLAMA", "COINGECKO"]);

export interface SanitizedConnection {
  id: string;
  provider: string;
  name: string;
  status: string;
  maskedIdentifier: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function sanitize(connection: {
  id: string;
  provider: string;
  name: string;
  status: string;
  encryptedSecret: string | null;
  lastTestedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SanitizedConnection {
  let maskedIdentifier: string | null = null;
  if (connection.encryptedSecret) {
    try {
      maskedIdentifier = maskSecret(decrypt(connection.encryptedSecret));
    } catch {
      // Nunca propaga o erro de decrypt para a API — apenas indica que não há máscara disponível.
      maskedIdentifier = "••••????";
    }
  }

  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    status: connection.status,
    maskedIdentifier,
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    lastError: connection.lastError,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function listConnections(): Promise<SanitizedConnection[]> {
  const connections = await prisma.apiConnection.findMany({ orderBy: { provider: "asc" } });
  return connections.map(sanitize);
}

export async function createConnection(input: {
  provider: string;
  name: string;
  secret?: string;
}): Promise<SanitizedConnection> {
  const encryptedSecret = input.secret ? encrypt(input.secret) : null;

  const connection = await prisma.apiConnection.upsert({
    where: { provider: input.provider },
    create: {
      provider: input.provider,
      name: input.name,
      encryptedSecret,
      status: "NOT_CONFIGURED",
    },
    update: {
      name: input.name,
      ...(encryptedSecret ? { encryptedSecret } : {}),
    },
  });

  return sanitize(connection);
}

export async function deleteConnection(id: string): Promise<void> {
  await prisma.apiConnection.delete({ where: { id } });
}

export class UnknownConnectionError extends Error {}
export class UnsupportedProviderError extends Error {}

/**
 * Testa a conexão de fato (Fase 16): decripta o segredo (se houver), chama o provider,
 * e atualiza status/lastTestedAt/lastError. Nunca loga o segredo decriptado.
 */
export async function testConnection(id: string): Promise<SanitizedConnection> {
  const connection = await prisma.apiConnection.findUnique({ where: { id } });
  if (!connection) {
    throw new UnknownConnectionError(`Conexão ${id} não encontrada.`);
  }

  if (!SUPPORTED_PROVIDERS.includes(connection.provider as SupportedProvider)) {
    throw new UnsupportedProviderError(`Provider ${connection.provider} não suportado ainda.`);
  }

  if (
    !connection.encryptedSecret &&
    !KEYLESS_PROVIDERS.has(connection.provider as SupportedProvider)
  ) {
    const updated = await prisma.apiConnection.update({
      where: { id },
      data: {
        status: "NOT_CONFIGURED",
        lastTestedAt: new Date(),
        lastError: "Nenhum secret configurado.",
      },
    });
    return sanitize(updated);
  }

  // Sprint 11: cada provider suportado testa a si mesmo — nunca decripta o secret aqui além
  // do necessário (a key só é passada adiante, nunca logada). Falha ao decriptar (secret
  // corrompido) é tratada como "sem key", não derruba o teste de conexão.
  let secret: string | null = null;
  if (connection.encryptedSecret) {
    try {
      secret = decrypt(connection.encryptedSecret);
    } catch {
      secret = null;
    }
  }
  // DEFILLAMA_PRO não é keyless (ver KEYLESS_PROVIDERS acima) — o guard de "Nenhum secret
  // configurado" já retornou mais acima quando não há encryptedSecret, então chegar aqui com
  // `secret === null` só acontece se o decrypt falhou (secret corrompido); `pingDefiLlamaPro`
  // trata isso como qualquer outra chamada HTTP sem key: erro reportado, nunca lançado.
  const raw =
    connection.provider === "COINGECKO"
      ? await pingCoinGecko(secret)
      : connection.provider === "DEFILLAMA_PRO"
        ? await pingDefiLlamaPro(secret ?? "")
        : await pingDefiLlama();

  const status = raw.error ? "ERROR" : "REAL";
  const updated = await prisma.apiConnection.update({
    where: { id },
    data: {
      status,
      lastTestedAt: new Date(),
      lastError: raw.error,
    },
  });

  return sanitize(updated);
}
