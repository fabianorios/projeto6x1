/**
 * Public library exports for the Apdata read-only MCP package.
 */

export {
  assertSelectOnly,
  assertAllowlistedTable,
  assertSafeIdentifier,
  bareTableName,
  clampLimit,
  DEFAULT_TABLE_ALLOWLIST,
  isAllowlistedTable,
  type AllowlistedTable,
  type PolicyResult,
} from "./policy/select-only.js";

export { buildSelectRows, type BuiltSelect, type SelectRowsInput } from "./sql/build-select.js";
export { loadConfig, type AppConfig, type DbDriver } from "./config.js";
export {
  createDbClient,
  MssqlClient,
  OracleClient,
  type DbClient,
  type ColumnInfo,
  type QueryResult,
} from "./db/index.js";
export {
  createServer,
  SERVER_NAME,
  SERVER_VERSION,
} from "./mcp-app.js";

export const MCP_PACKAGE_VERSION = "0.1.0";
