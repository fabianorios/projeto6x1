/**
 * Server config from environment.
 * Secrets stay in .env — never commit real values.
 */

export type ServerConfig = {
  port: number;
  host: string;
  /** 32-byte key as hex (64 chars) or base64. Required in production. */
  encryptionKey: Buffer;
  dataDir: string;
  sqlTimeoutMs: number;
  sqlMaxRows: number;
  corsOrigin: string;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse ENCRYPTION_KEY: 64-char hex or base64 that decodes to 32 bytes. */
export function parseEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  if (!value) {
    throw new Error(
      "ENCRYPTION_KEY is required (32-byte hex or base64). See server/.env.example",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  const fromB64 = Buffer.from(value, "base64");
  if (fromB64.length === 32) {
    return fromB64;
  }
  throw new Error(
    "ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64). Generate: openssl rand -hex 32",
  );
}

export function loadServerConfig(): ServerConfig {
  const keyRaw = env("ENCRYPTION_KEY");
  // Dev-only fallback so local `npm run dev` works without .env; never use in prod.
  const encryptionKey =
    keyRaw.length > 0
      ? parseEncryptionKey(keyRaw)
      : parseEncryptionKey(
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        );

  if (!keyRaw && process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY is required when NODE_ENV=production");
  }

  return {
    port: envInt("PORT", 8787),
    host: env("HOST", "127.0.0.1"),
    encryptionKey,
    dataDir: env("DATA_DIR", "./data"),
    sqlTimeoutMs: envInt("SQL_TIMEOUT_MS", 15_000),
    sqlMaxRows: envInt("SQL_MAX_ROWS", 5_000),
    corsOrigin: env("CORS_ORIGIN", "*"),
  };
}
