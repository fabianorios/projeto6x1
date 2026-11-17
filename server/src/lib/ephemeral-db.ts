/**
 * Ephemeral multi-DB clients — credentials live only in memory for one request.
 * Never write password to disk / logs.
 */

import {
  MssqlClient,
  OracleClient,
  type DbClient,
} from "@projeto-6x1/mcp";

export type EphemeralEngine = "mssql" | "oracle";

export type EphemeralCreds = {
  engine: EphemeralEngine;
  host: string;
  port: number;
  /**
   * MSSQL: optional database (driver uses the login default when omitted).
   * Oracle: required service name / SID.
   */
  database?: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

/** Catalog / CNPJ+ramos probes — keep snappy. */
export const EPHEMERAL_TIMEOUT_MS = 15_000;

/**
 * Folha extract (Conexão Direta) — large bases often exceed 15s on the
 * benefits/VT/horário CTEs. Dedicated ceiling so catalog stays short (P0).
 */
export const EPHEMERAL_FOLHA_TIMEOUT_MS = 60_000;

/** Clear PT message for firewall/timeout/login failures (no driver internals). */
export const EPHEMERAL_CONN_FAIL_MSG =
  "Falha de conexão com o servidor SQL: timeout ou acesso bloqueado pelo firewall";

const CONNECTION_CODES = new Set([
  "ELOGIN",
  "ETIMEOUT",
  "ESOCKET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function collectErrorParts(err: unknown): { codes: string[]; text: string } {
  const codes: string[] = [];
  const chunks: string[] = [];
  let cur: unknown = err;
  const seen = new Set<unknown>();
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const obj = cur as {
      code?: unknown;
      number?: unknown;
      name?: unknown;
      message?: unknown;
      originalError?: unknown;
      cause?: unknown;
      precedingErrors?: unknown;
    };
    if (typeof obj.code === "string" && obj.code) codes.push(obj.code);
    if (typeof obj.name === "string" && obj.name) chunks.push(obj.name);
    if (typeof obj.message === "string" && obj.message) chunks.push(obj.message);
    if (typeof obj.number === "number") chunks.push(String(obj.number));
    if (Array.isArray(obj.precedingErrors)) {
      for (const p of obj.precedingErrors) {
        const nested = collectErrorParts(p);
        codes.push(...nested.codes);
        chunks.push(nested.text);
      }
    }
    cur = obj.originalError ?? obj.cause ?? null;
  }
  if (!chunks.length && err != null) chunks.push(String(err));
  return { codes, text: chunks.join(" ") };
}

/**
 * True for network / login / socket failures from tedious/mssql (and similar).
 * These must map to HTTP 4xx — never Nginx/Cloudflare 502 HTML.
 */
export function isEphemeralConnectionFailure(err: unknown): boolean {
  const { codes, text } = collectErrorParts(err);
  if (codes.some((c) => CONNECTION_CODES.has(c.toUpperCase()))) return true;
  const lower = text.toLowerCase();
  if (
    /login failed|connectionerror|connect\s*etimeout|failed to connect|could not connect|socket hang up|getaddrinfo|econnrefused|timeout|firewall|server is unreachable|no connection could be made/i.test(
      lower,
    )
  ) {
    return true;
  }
  // App-level ephemeral timeouts
  if (/ephemeral (catalog |query )?timeout/i.test(text)) return true;
  return false;
}

/**
 * Remove passwords / usernames from error strings before JSON or logs (LGPD).
 * Secrets shorter than 4 chars are skipped — e.g. user `sa` must not corrupt
 * table names like `Empresas` → `Empre[redacted]s`.
 */
export function scrubErrorText(
  text: string,
  secrets: readonly string[] = [],
): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    if (out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  out = out.replace(
    /(password|pwd|passwd|user|userid|uid)\s*[=:]\s*\S+/gi,
    "$1=[redacted]",
  );
  out = out.replace(
    /Login failed for user '[^']*'/gi,
    "Login failed for user '[redacted]'",
  );
  return out;
}

export function createEphemeralClient(
  creds: EphemeralCreds,
  timeoutMs: number = EPHEMERAL_TIMEOUT_MS,
): DbClient {
  if (creds.engine === "oracle") {
    const serviceName = creds.database?.trim();
    if (!serviceName) {
      throw new Error("Oracle service name / SID is required");
    }
    return new OracleClient(
      {
        host: creds.host,
        port: creds.port,
        serviceName,
        user: creds.user,
        password: creds.password,
      },
      timeoutMs,
    );
  }

  return new MssqlClient(
    {
      server: creds.host,
      port: creds.port,
      // Empty → undefined so the driver uses the login's default database.
      database: creds.database?.trim() || undefined,
      user: creds.user,
      password: creds.password,
      // Always TLS + trust self-signed SaaS certs for direct ephemeral connects.
      encrypt: true,
      trustServerCertificate: true,
    },
    timeoutMs,
  );
}

/** Apply dialect isolation for ephemeral consulting extracts. */
export async function applyReadIsolation(client: DbClient): Promise<void> {
  if (client.driver === "mssql" && client.beginReadUncommitted) {
    await client.beginReadUncommitted();
    return;
  }
  if (client.driver === "oracle" && client.beginReadOnly) {
    await client.beginReadOnly();
  }
}

/** Best-effort wipe of in-memory password after the request. */
export function scrubCreds(creds: EphemeralCreds): void {
  try {
    (creds as { password: string }).password = "";
  } catch {
    // ignore
  }
}
