import type { OracleConfig } from "../config.js";
import type {
  ColumnInfo,
  DbClient,
  QueryParam,
  QueryResult,
} from "./types.js";

/**
 * Oracle stub — connection wiring deferred.
 * MSSQL is the first supported driver for Apdata TEMP / folha reads.
 */
export class OracleClient implements DbClient {
  readonly driver = "oracle" as const;

  constructor(
    _config: OracleConfig,
    _requestTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    throw new Error(
      "Oracle driver is a stub. Set DB_DRIVER=mssql for the supported path, or implement oracledb later.",
    );
  }

  async close(): Promise<void> {
    // no-op
  }

  async query(
    _sqlText: string,
    _params?: Record<string, QueryParam>,
  ): Promise<QueryResult> {
    await this.connect();
    return { columns: [], rows: [], rowCount: 0 };
  }

  async describeTable(_table: string): Promise<ColumnInfo[]> {
    await this.connect();
    return [];
  }
}
