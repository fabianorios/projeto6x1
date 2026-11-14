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
  /** MSSQL database name, or Oracle service name. */
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

export const EPHEMERAL_TIMEOUT_MS = 15_000;

export function createEphemeralClient(
  creds: EphemeralCreds,
  timeoutMs: number = EPHEMERAL_TIMEOUT_MS,
): DbClient {
  if (creds.engine === "oracle") {
    return new OracleClient(
      {
        host: creds.host,
        port: creds.port,
        serviceName: creds.database,
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
      database: creds.database,
      user: creds.user,
      password: creds.password,
      encrypt: creds.encrypt !== false,
      trustServerCertificate: Boolean(creds.trustServerCertificate),
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
