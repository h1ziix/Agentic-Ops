import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors";
const encryptedSchema = z.object({ version: z.literal(1), nonce: z.string(), tag: z.string(), ciphertext: z.string() }).strict();
export type EncryptionContext = { workspaceId: string; connectionId: string; provider: string };
function key() {
  const encoded = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new AppError("integration_configuration", "Configure INTEGRATION_TOKEN_ENCRYPTION_KEY with 32 random bytes in base64.");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32) throw new AppError("integration_configuration");
  return decoded;
}
const aad = (c: EncryptionContext) => Buffer.from(JSON.stringify([1, c.workspaceId, c.connectionId, c.provider]));
export function encryptSecret(value: string, context: EncryptionContext): string {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), nonce); cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
export function decryptSecret(value: string, context: EncryptionContext): string {
  try {
    const v = encryptedSchema.parse(JSON.parse(value)); const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(v.nonce, "base64"));
    cipher.setAAD(aad(context)); cipher.setAuthTag(Buffer.from(v.tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(v.ciphertext, "base64")), cipher.final()]).toString("utf8");
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError("integration_configuration", "Integration credentials could not be decrypted. Ask the owner to reconnect."); }
}
export function assertEncryptionConfigured() { key(); }
