/**
 * Build MCP DbClient from a stored environment (decrypted password).
 */

import {
  MssqlClient,
  OracleClient,
  type DbClient,
} from "@projeto-6x1/mcp";
import type { EnvironmentRecord } from "./types.js";
import type { EnvironmentStore } from "./store.js";

export function createClientForEnvironment(
  record: EnvironmentRecord,
  store: EnvironmentStore,
  sqlTimeoutMs: number,
): DbClient {
  const password = store.decryptPassword(record);

  if (record.engine === "oracle") {
    return new OracleClient(
      {
        host: record.host,
        port: record.port,
        serviceName: record.database,
        user: record.user,
        password,
      },
      sqlTimeoutMs,
    );
  }

  return new MssqlClient(
    {
      server: record.host,
      port: record.port,
      database: record.database,
      user: record.user,
      password,
      encrypt: record.encrypt !== false,
      trustServerCertificate: Boolean(record.trustServerCertificate),
    },
    sqlTimeoutMs,
  );
}

/** Probe connectivity with a SELECT-only statement (no DML). */
export async function testConnection(
  client: DbClient,
): Promise<{ ok: true; latencyMs: number; driver: string } | { ok: false; error: string; driver: string }> {
  const started = Date.now();
  try {
    await client.connect();
    if (client.driver === "mssql") {
      await client.query("SELECT 1 AS ok");
    } else {
      // Oracle stub will throw on connect — surface that clearly.
      await client.connect();
    }
    await client.close();
    return {
      ok: true,
      latencyMs: Date.now() - started,
      driver: client.driver,
    };
  } catch (err) {
    try {
      await client.close();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      driver: client.driver,
    };
  }
}
