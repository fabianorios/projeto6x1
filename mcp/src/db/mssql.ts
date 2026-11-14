import sql from "mssql";
import type { MssqlConfig } from "../config.js";
import { assertSelectOnly, bareTableName } from "../policy/select-only.js";
import type {
  ColumnInfo,
  DbClient,
  QueryParam,
  QueryResult,
} from "./types.js";

/** Scrub credential-like substrings from driver error text (LGPD). */
function scrubDriverError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(password|pwd|passwd|user|userid|uid)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/Login failed for user '[^']*'/gi, "Login failed for user '[redacted]'");
}

export class MssqlClient implements DbClient {
  readonly driver = "mssql" as const;
  private pool: sql.ConnectionPool | null = null;

  constructor(
    private readonly config: MssqlConfig,
    private readonly requestTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    if (this.pool?.connected) return;
    if (!this.config.user) {
      throw new Error(
        "MSSQL config incomplete: set MSSQL_USER (and password) in env",
      );
    }
    // Empty/whitespace → strictly undefined (never "").
    const database = this.config.database?.trim() || undefined;
    const connectTimeout = 10_000;
    const requestTimeout = 15_000;
    const pool = new sql.ConnectionPool({
      server: this.config.server,
      port: this.config.port,
      database,
      user: this.config.user,
      password: this.config.password,
      // Top-level mssql timeouts (tedious also reads options.connectTimeout).
      connectionTimeout: connectTimeout,
      requestTimeout:
        this.requestTimeoutMs > 0
          ? Math.min(this.requestTimeoutMs, requestTimeout)
          : requestTimeout,
      options: {
        // Always on for external/SaaS (self-signed) and TLS.
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout,
        requestTimeout,
      },
    });
    // Async driver errors must not crash the Node/Hono process.
    pool.on("error", (err) => {
      console.error("[mssql] pool error:", scrubDriverError(err));
    });
    this.pool = await pool.connect();
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /** Dirty-read isolation for ephemeral consulting extracts (SELECT-only). */
  async beginReadUncommitted(): Promise<void> {
    await this.connect();
    if (!this.pool) throw new Error("MSSQL pool not connected");
    await this.pool.request().batch(
      "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED",
    );
  }

  async query(
    sqlText: string,
    params: Record<string, QueryParam> = {},
  ): Promise<QueryResult> {
    const policy = assertSelectOnly(sqlText);
    if (!policy.ok) {
      throw new Error(`SQL blocked: ${policy.reason}`);
    }
    await this.connect();
    if (!this.pool) throw new Error("MSSQL pool not connected");

    const request = this.pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const result = await request.query(sqlText);
    const recordset = (result.recordset ?? []) as Record<string, unknown>[];
    const columns =
      recordset.length > 0 ? Object.keys(recordset[0]!) : [];

    const rows = recordset.map((row) => ({ ...row }));
    return { columns, rows, rowCount: rows.length };
  }

  async describeTable(table: string): Promise<ColumnInfo[]> {
    const name = bareTableName(table);
    const result = await this.query(
      `SELECT COLUMN_NAME AS name,
              DATA_TYPE AS dataType,
              CHARACTER_MAXIMUM_LENGTH AS maxLength,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS defaultValue
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
       ORDER BY ORDINAL_POSITION`,
      { tableName: name },
    );

    return result.rows.map((row) => ({
      name: String(row.name),
      dataType: String(row.dataType),
      maxLength:
        row.maxLength === null || row.maxLength === undefined
          ? null
          : Number(row.maxLength),
      nullable: String(row.isNullable).toUpperCase() === "YES",
      defaultValue:
        row.defaultValue === null || row.defaultValue === undefined
          ? null
          : String(row.defaultValue),
    }));
  }
}
