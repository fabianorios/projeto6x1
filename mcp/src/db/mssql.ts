import sql from "mssql";
import type { MssqlConfig } from "../config.js";
import { assertSelectOnly, bareTableName } from "../policy/select-only.js";
import type {
  ColumnInfo,
  DbClient,
  QueryParam,
  QueryResult,
} from "./types.js";

export class MssqlClient implements DbClient {
  readonly driver = "mssql" as const;
  private pool: sql.ConnectionPool | null = null;

  constructor(
    private readonly config: MssqlConfig,
    private readonly requestTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    if (this.pool?.connected) return;
    if (!this.config.database || !this.config.user) {
      throw new Error(
        "MSSQL config incomplete: set MSSQL_DATABASE and MSSQL_USER (and password) in env",
      );
    }
    this.pool = await new sql.ConnectionPool({
      server: this.config.server,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      options: {
        encrypt: this.config.encrypt,
        trustServerCertificate: this.config.trustServerCertificate,
      },
      requestTimeout: this.requestTimeoutMs,
      connectionTimeout: Math.min(this.requestTimeoutMs, 15_000),
    }).connect();
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
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
