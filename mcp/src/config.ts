/**
 * Connection and guard settings from environment.
 * Secrets stay in env / Cursor MCP config — never in Git.
 */

export type DbDriver = "mssql" | "oracle";

export type MssqlConfig = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export type OracleConfig = {
  host: string;
  port: number;
  serviceName: string;
  user: string;
  password: string;
};

export type AppConfig = {
  driver: DbDriver;
  mssql: MssqlConfig;
  oracle: OracleConfig;
  sqlTimeoutMs: number;
  sqlMaxRows: number;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true" || v === "yes";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): AppConfig {
  const driverRaw = env("DB_DRIVER", "mssql").toLowerCase();
  const driver: DbDriver = driverRaw === "oracle" ? "oracle" : "mssql";

  return {
    driver,
    mssql: {
      server: env("MSSQL_SERVER", "localhost"),
      port: envInt("MSSQL_PORT", 1433),
      database: env("MSSQL_DATABASE", ""),
      user: env("MSSQL_USER", ""),
      password: env("MSSQL_PASSWORD", ""),
      encrypt: envBool("MSSQL_ENCRYPT", true),
      trustServerCertificate: envBool("MSSQL_TRUST_SERVER_CERTIFICATE", false),
    },
    oracle: {
      host: env("ORACLE_HOST", "localhost"),
      port: envInt("ORACLE_PORT", 1521),
      serviceName: env("ORACLE_SERVICE_NAME", ""),
      user: env("ORACLE_USER", ""),
      password: env("ORACLE_PASSWORD", ""),
    },
    sqlTimeoutMs: envInt("SQL_TIMEOUT_MS", 15_000),
    sqlMaxRows: envInt("SQL_MAX_ROWS", 5_000),
  };
}
