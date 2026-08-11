import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KDF_SALT = Buffer.from("english-review/integration-credentials/v1", "utf8");
const KDF_INFO = Buffer.from("aes-256-gcm/server-side-secrets", "utf8");

function encryptionKey(): Buffer {
  const rootSecret =
    process.env.INTEGRATION_SECRET_KEY?.trim() ||
    process.env.WORKER_TOKEN_PEPPER?.trim();

  if (!rootSecret) {
    throw new Error(
      "Missing INTEGRATION_SECRET_KEY (or WORKER_TOKEN_PEPPER fallback).",
    );
  }

  // Hash arbitrary-length configuration first, then use a context-bound HKDF so
  // the resulting key cannot be confused with keys used for other purposes.
  const inputKeyMaterial = createHash("sha256")
    .update(rootSecret, "utf8")
    .digest();

  return Buffer.from(
    hkdfSync("sha256", inputKeyMaterial, KDF_SALT, KDF_INFO, KEY_BYTES),
  );
}

function associatedData(userId: string, provider: string): Buffer {
  return Buffer.from(`${FORMAT_VERSION}\0${userId}\0${provider}`, "utf8");
}

/** Encrypt a provider secret and bind it to the owning user/provider row. */
export function encryptIntegrationSecret(
  plaintext: string,
  userId: string,
  provider: string,
): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty integration secret.");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(associatedData(userId, provider));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt a provider secret. Authentication failures intentionally stay generic. */
export function decryptIntegrationSecret(
  encrypted: string,
  userId: string,
  provider: string,
): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
    encrypted.split(".");

  if (
    version !== FORMAT_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error("Invalid encrypted integration secret.");
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const authTag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== IV_BYTES || authTag.length !== 16 || !ciphertext.length) {
      throw new Error("Invalid encrypted integration secret.");
    }

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAAD(associatedData(userId, provider));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt integration secret.");
  }
}
