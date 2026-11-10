/**
 * MCP package entry (scaffold only).
 * Real tools (ping, export_payroll_rows, …) land in a later delivery.
 */

export {
  assertSelectOnly,
  DEFAULT_TABLE_ALLOWLIST,
  type PolicyResult,
} from "./policy/select-only.js";

export const MCP_SCAFFOLD_VERSION = "0.0.0";
