import {
  assertAllowlistedTable,
  assertSafeIdentifier,
  assertSelectOnly,
  clampLimit,
  type PolicyResult,
} from "../policy/select-only.js";
import type { QueryParam } from "../db/types.js";

export type SelectRowsInput = {
  table: string;
  columns?: string[];
  /** Equality filters only; values bound as parameters. */
  where?: Record<string, string | number | boolean | null>;
  orderBy?: string;
  /** ASC (default) or DESC when orderBy is set. */
  orderDir?: "ASC" | "DESC";
  limit?: number;
};

export type BuiltSelect =
  | {
      ok: true;
      sql: string;
      params: Record<string, QueryParam>;
      limit: number;
    }
  | { ok: false; reason: string };

/**
 * Build a single SELECT … FROM allowlisted table with TOP (MSSQL dialect).
 * Always runs through assertSelectOnly before returning ok.
 */
export function buildSelectRows(
  input: SelectRowsInput,
  maxRows: number,
  dialect: "mssql" | "oracle" = "mssql",
): BuiltSelect {
  const tableCheck = assertAllowlistedTable(input.table);
  if (!tableCheck.ok) return tableCheck;

  const limit = clampLimit(input.limit, maxRows);
  const params: Record<string, QueryParam> = {};

  let columnList = "*";
  if (input.columns && input.columns.length > 0) {
    const parts: string[] = [];
    for (const col of input.columns) {
      const id = assertSafeIdentifier(col, "column");
      if (!id.ok) return id;
      parts.push(col.trim());
    }
    columnList = parts.join(", ");
  }

  const whereParts: string[] = [];
  if (input.where) {
    let i = 0;
    for (const [col, value] of Object.entries(input.where)) {
      const id = assertSafeIdentifier(col, "where column");
      if (!id.ok) return id;
      const key = `w${i}`;
      i += 1;
      if (value === null) {
        whereParts.push(`${col.trim()} IS NULL`);
      } else {
        whereParts.push(`${col.trim()} = @${key}`);
        params[key] = value;
      }
    }
  }

  let orderClause = "";
  if (input.orderBy) {
    const id = assertSafeIdentifier(input.orderBy, "orderBy");
    if (!id.ok) return id;
    const dir = input.orderDir === "DESC" ? "DESC" : "ASC";
    orderClause = ` ORDER BY ${input.orderBy.trim()} ${dir}`;
  }

  const whereClause =
    whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";

  const table = input.table.trim();
  let sql: string;
  if (dialect === "oracle") {
    // Stub dialect: FETCH FIRST (Oracle 12c+)
    sql = `SELECT ${columnList} FROM ${table}${whereClause}${orderClause} FETCH FIRST ${limit} ROWS ONLY`;
  } else {
    sql = `SELECT TOP (${limit}) ${columnList} FROM ${table}${whereClause}${orderClause}`;
  }

  const policy = assertSelectOnly(sql);
  if (!policy.ok) return policy;

  return { ok: true, sql, params, limit };
}

export function policyError(result: PolicyResult): string {
  return result.ok ? "" : result.reason;
}
