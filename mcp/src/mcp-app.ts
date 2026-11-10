/**
 * MCP tool registration (no stdio bootstrap).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DbClient } from "./db/types.js";
import {
  assertAllowlistedTable,
  DEFAULT_TABLE_ALLOWLIST,
  isAllowlistedTable,
} from "./policy/select-only.js";
import { buildSelectRows } from "./sql/build-select.js";

export const SERVER_NAME = "apdata-folha-readonly";
export const SERVER_VERSION = "0.1.0";

function textResult(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

export function createServer(getClient: () => DbClient, maxRows: number) {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_tables",
    {
      title: "List allowlisted tables",
      description:
        "List Apdata tables allowed for read-only access (allowlist from feasibility). Optional name filter (substring, case-insensitive).",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe("Optional substring filter on table name"),
      },
    },
    async ({ filter }) => {
      const needle = filter?.trim().toLowerCase() ?? "";
      const tables = DEFAULT_TABLE_ALLOWLIST.filter((t) =>
        needle ? t.toLowerCase().includes(needle) : true,
      );
      return textResult({
        tables,
        count: tables.length,
        note: "Only allowlisted tables can be described or queried.",
      });
    },
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe table columns",
      description:
        "Describe columns of an allowlisted Apdata table (INFORMATION_SCHEMA on MSSQL).",
      inputSchema: {
        table: z
          .string()
          .describe("Allowlisted table name, e.g. Horarios or Contratados"),
      },
    },
    async ({ table }) => {
      const check = assertAllowlistedTable(table);
      if (!check.ok) {
        return textResult({ error: check.reason }, true);
      }
      try {
        const client = getClient();
        const columns = await client.describeTable(table);
        return textResult({
          table: table.trim(),
          driver: client.driver,
          columns,
          columnCount: columns.length,
        });
      } catch (err) {
        return textResult(
          { error: err instanceof Error ? err.message : String(err) },
          true,
        );
      }
    },
  );

  server.registerTool(
    "select_rows",
    {
      title: "Select rows (read-only)",
      description:
        "Run a parameterized SELECT on an allowlisted table. INSERT/UPDATE/DELETE/DDL are blocked. LIMIT/TOP is always enforced (capped by SQL_MAX_ROWS). Do not select PII columns (names, CPF) by default — LGPD.",
      inputSchema: {
        table: z.string().describe("Allowlisted table name"),
        columns: z
          .array(z.string())
          .optional()
          .describe(
            "Column names; omit for * (prefer explicit non-PII columns)",
          ),
        where: z
          .record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean(), z.null()]),
          )
          .optional()
          .describe("Equality filters only (bound as parameters)"),
        orderBy: z.string().optional().describe("Optional ORDER BY column"),
        orderDir: z.enum(["ASC", "DESC"]).optional(),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Max rows to return (capped at ${maxRows})`),
      },
    },
    async (args) => {
      if (!isAllowlistedTable(args.table)) {
        return textResult(
          { error: `table not in allowlist: ${args.table}` },
          true,
        );
      }
      try {
        const client = getClient();
        const built = buildSelectRows(
          {
            table: args.table,
            columns: args.columns,
            where: args.where,
            orderBy: args.orderBy,
            orderDir: args.orderDir,
            limit: args.limit,
          },
          maxRows,
          client.driver,
        );
        if (!built.ok) {
          return textResult({ error: built.reason }, true);
        }
        const result = await client.query(built.sql, built.params);
        return textResult({
          table: args.table.trim(),
          sql: built.sql,
          limit: built.limit,
          rowCount: result.rowCount,
          columns: result.columns,
          rows: result.rows,
        });
      } catch (err) {
        return textResult(
          { error: err instanceof Error ? err.message : String(err) },
          true,
        );
      }
    },
  );

  return server;
}
