/**
 * AES-256-GCM helpers for secrets at rest.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/** Encrypt plaintext → base64(iv | tag | ciphertext). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("encryption key must be 32 bytes");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypt base64(iv | tag | ciphertext) → plaintext. */
export function decryptSecret(payload: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("encryption key must be 32 bytes");
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("invalid ciphertext");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Mask for UI: never reveal the real password after save. */
export function maskPassword(hasPassword: boolean): string {
  return hasPassword ? "••••••••" : "";
}
