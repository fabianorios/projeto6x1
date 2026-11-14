/**
 * Oracle DbClient using node-oracledb Thin mode (no Instant Client).
 */

import oracledb from "oracledb";
import type { OracleConfig } from "../config.js";
import { assertSelectOnly, bareTableName } from "../policy/select-only.js";
import type {
  ColumnInfo,
  DbClient,
  QueryParam,
  QueryResult,
} from "./types.js";

/** Ensure Thin mode (default when Instant Client is absent). */
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

export class OracleClient implements DbClient {
  readonly driver = "oracle" as const;
  private connection: oracledb.Connection | null = null;

  constructor(
    private readonly config: OracleConfig,
    private readonly requestTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    if (this.connection) return;
    if (!this.config.serviceName || !this.config.user) {
      throw new Error(
        "Oracle config incomplete: set service name and user (and password)",
      );
    }
    this.connection = await oracledb.getConnection({
      user: this.config.user,
      password: this.config.password,
      connectString: `${this.config.host}:${this.config.port}/${this.config.serviceName}`,
    });
    // Soft callTimeout when supported by the driver version.
    try {
      (this.connection as { callTimeout?: number }).callTimeout =
        this.requestTimeoutMs;
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } finally {
        this.connection = null;
      }
    }
  }

  /**
   * Begin a READ ONLY transaction (ephemeral / consulting reads).
   * No-op if already connected without an open txn.
   */
  async beginReadOnly(): Promise<void> {
    await this.connect();
    if (!this.connection) throw new Error("Oracle connection missing");
    await this.connection.execute(`SET TRANSACTION READ ONLY`);
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
    if (!this.connection) throw new Error("Oracle connection missing");

    const binds: Record<string, string | number | boolean | null | Date> = {};
    for (const [key, value] of Object.entries(params)) {
      binds[key] = value;
    }

    const result = await this.connection.execute(
      sqlText,
      binds as oracledb.BindParameters,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: 50_000,
      },
    );

    const rows = ((result.rows ?? []) as Record<string, unknown>[]).map(
      (row) => ({ ...row }),
    );
    const columns =
      rows.length > 0
        ? Object.keys(rows[0]!)
        : (result.metaData ?? []).map((m: { name: string }) => m.name);

    return { columns, rows, rowCount: rows.length };
  }

  async describeTable(table: string): Promise<ColumnInfo[]> {
    const name = bareTableName(table).toUpperCase();
    const result = await this.query(
      `SELECT COLUMN_NAME AS "name",
              DATA_TYPE AS "dataType",
              DATA_LENGTH AS "maxLength",
              NULLABLE AS "isNullable",
              DATA_DEFAULT AS "defaultValue"
       FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME = :tableName
       ORDER BY COLUMN_ID`,
      { tableName: name },
    );

    return result.rows.map((row) => ({
      name: String(row.name),
      dataType: String(row.dataType),
      maxLength:
        row.maxLength === null || row.maxLength === undefined
          ? null
          : Number(row.maxLength),
      nullable: String(row.isNullable).toUpperCase() === "Y",
      defaultValue:
        row.defaultValue === null || row.defaultValue === undefined
          ? null
          : String(row.defaultValue),
    }));
  }
}
