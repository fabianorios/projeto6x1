import type { AppConfig } from "../config.js";
import { MssqlClient } from "./mssql.js";
import { OracleClient } from "./oracle.js";
import type { DbClient } from "./types.js";

export type { ColumnInfo, DbClient, QueryParam, QueryResult } from "./types.js";
export { MssqlClient } from "./mssql.js";
export { OracleClient } from "./oracle.js";

export function createDbClient(config: AppConfig): DbClient {
  if (config.driver === "oracle") {
    return new OracleClient(config.oracle, config.sqlTimeoutMs);
  }
  return new MssqlClient(config.mssql, config.sqlTimeoutMs);
}
