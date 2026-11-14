/**
 * Guards for Studio SQL slot tests: SELECT/WITH only, PII blocklist,
 * required contract columns.
 */

import { assertSelectOnly } from "@projeto-6x1/mcp";
import {
  SQL_SLOT_CONTRACT,
  type SqlSlotId,
} from "./sql-profile-types.js";

/** Forbidden PII identifiers (column names / SQL tokens). */
export const BLOCKED_PII_COLUMNS = [
  "fun_nosfuncionario",
  "fun_nuscpf",
  "fun_nuspis",
  "cpf",
  "nome",
  "pis",
  "matricula",
  "con_dssnome",
  "telefone",
  "email",
  "endereco",
] as const;

export function assertNoBlockedPiiInSql(sql: string): void {
  const lower = sql.toLowerCase();
  // Strip simple string literals to reduce false positives on comments/strings.
  const scrubbed = lower.replace(/'[^']*'/g, "''");
  for (const bad of BLOCKED_PII_COLUMNS) {
    const re = new RegExp(`(^|[^a-z0-9_])${bad}([^a-z0-9_]|$)`, "i");
    if (re.test(scrubbed)) {
      throw new Error(`PII column blocked in SQL: ${bad}`);
    }
  }
}

export function assertNoBlockedPiiColumns(columns: string[]): void {
  const lower = columns.map((c) => c.toLowerCase());
  for (const bad of BLOCKED_PII_COLUMNS) {
    if (lower.includes(bad)) {
      throw new Error(`PII column blocked in result: ${bad}`);
    }
  }
}

export function validateContractColumns(
  slot: SqlSlotId,
  columns: string[],
): { ok: true } | { ok: false; missing: string[] } {
  const required = SQL_SLOT_CONTRACT[slot];
  const lower = new Set(columns.map((c) => c.toLowerCase()));
  const missing = required.filter((c) => !lower.has(c.toLowerCase()));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

export function guardSlotSql(sql: string): { ok: true } | { ok: false; reason: string } {
  const policy = assertSelectOnly(sql);
  if (!policy.ok) return { ok: false, reason: policy.reason };
  try {
    assertNoBlockedPiiInSql(sql);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: true };
}

export const TEST_SLOT_MAX_ROWS = 10;
export const TEST_SLOT_TIMEOUT_MS = 15_000;
