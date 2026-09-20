import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Sprint 2: encryption service isolado, usado para proteger `api_connections.encrypted_secret`.
// Vive em packages/shared (não em packages/database) porque é uma preocupação transversal —
// qualquer worker/script futuro que precise ler/gravar secrets usa o mesmo módulo, sem
// depender do Prisma Client.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // recomendado para GCM
const KEY_LENGTH_BYTES = 32; // AES-256
const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits, tamanho completo do GCM
const CURRENT_VERSION = 1;

export class EncryptionConfigError extends Error {}
export class DecryptionError extends Error {}

interface EncryptedPayloadV1 {
  v: 1;
  alg: "aes-256-gcm";
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
}

function getMasterKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionConfigError("MASTER_ENCRYPTION_KEY não configurada.");
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "hex");
  } catch {
    throw new EncryptionConfigError("MASTER_ENCRYPTION_KEY não é um hex válido.");
  }

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new EncryptionConfigError(
      `MASTER_ENCRYPTION_KEY deve ter ${KEY_LENGTH_BYTES} bytes (${KEY_LENGTH_BYTES * 2} chars hex); recebido ${key.length} bytes.`,
    );
  }

  return key;
}

/**
 * Criptografa um segredo em texto plano e retorna um payload versionado serializado
 * (JSON em base64) contendo tudo que é necessário para descriptografar depois:
 * versão do formato, algoritmo, IV, authTag e ciphertext. Um novo IV é gerado a cada chamada.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new TypeError("encrypt() requer uma string não vazia.");
  }

  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayloadV1 = {
    v: CURRENT_VERSION,
    alg: ALGORITHM,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/**
 * Descriptografa um payload gerado por encrypt(). Lança DecryptionError se o payload
 * estiver malformado, com versão/algoritmo desconhecido, ou se autenticação (authTag)
 * falhar — o que cobre tanto corrupção quanto adulteração deliberada do ciphertext,
 * do authTag ou do IV.
 */
export function decrypt(payload: string): string {
  const key = getMasterKey();

  let parsed: EncryptedPayloadV1;
  try {
    const json = Buffer.from(payload, "base64").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    throw new DecryptionError("Payload malformado (não é JSON/base64 válido).");
  }

  if (
    !parsed ||
    parsed.v !== CURRENT_VERSION ||
    parsed.alg !== ALGORITHM ||
    typeof parsed.iv !== "string" ||
    typeof parsed.authTag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new DecryptionError("Payload malformado ou versão/algoritmo não suportado.");
  }

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  try {
    iv = Buffer.from(parsed.iv, "hex");
    authTag = Buffer.from(parsed.authTag, "hex");
    ciphertext = Buffer.from(parsed.ciphertext, "hex");
  } catch {
    throw new DecryptionError("Payload malformado (campos hex inválidos).");
  }

  // authTag DEVE ter exatamente 16 bytes: tags truncadas são aceitas pelo decipher do Node e
  // enfraquecem a autenticação do GCM (auditoria: 4/8/12/15 bytes eram aceitos).
  if (
    iv.length !== IV_LENGTH_BYTES ||
    authTag.length !== AUTH_TAG_LENGTH_BYTES ||
    ciphertext.length === 0
  ) {
    throw new DecryptionError("Payload malformado (tamanhos de campo inválidos).");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Autenticação falhou (ciphertext/authTag/IV adulterados) ou chave incorreta.
    throw new DecryptionError("Falha ao descriptografar: dados adulterados ou chave inválida.");
  }
}

/** Máscara segura para exibição (ex: "••••8X92"), nunca revela o valor completo. */
export function maskSecret(plaintext: string): string {
  const visible = plaintext.slice(-4);
  return `••••${visible}`;
}

// Exportado apenas para uso em testes que precisam comparar buffers em tempo constante
// sem reimplementar a lógica — não é usado no fluxo de encrypt/decrypt em si.
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
