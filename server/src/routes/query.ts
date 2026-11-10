/**
 * SELECT-only proxy — reuses MCP allowlist + buildSelectRows.
 * No DML/DDL path exists here.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  DEFAULT_TABLE_ALLOWLIST,
  buildSelectRows,
  isAllowlistedTable,
} from "@projeto-6x1/mcp";
import type { EnvironmentStore } from "../lib/store.js";
import { createClientForEnvironment } from "../lib/db.js";
import type { ServerConfig } from "../config.js";

const selectSchema = z.object({
  environmentId: z.string().uuid().optional(),
  table: z.string().min(1),
  columns: z.array(z.string()).optional(),
  where: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  orderBy: z.string().optional(),
  orderDir: z.enum(["ASC", "DESC"]).optional(),
  limit: z.number().int().positive().optional(),
});

export type QueryRoutesDeps = {
  store: EnvironmentStore;
  config: ServerConfig;
};

export function createQueryRoutes(deps: QueryRoutesDeps) {
  const app = new Hono();
  const { store, config } = deps;

  app.get("/tables", (c) => {
    return c.json({
      tables: [...DEFAULT_TABLE_ALLOWLIST],
      count: DEFAULT_TABLE_ALLOWLIST.length,
      note: "Only allowlisted tables can be queried (SELECT-only).",
    });
  });

  app.post("/select", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const parsed = selectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }

    const args = parsed.data;
    if (!isAllowlistedTable(args.table)) {
      return c.json({ error: `table not in allowlist: ${args.table}` }, 400);
    }

    const envId =
      args.environmentId ?? (await store.getActiveId()) ?? undefined;
    if (!envId) {
      return c.json(
        { error: "no active environment — create/select one in Ambientes" },
        400,
      );
    }

    const record = await store.getRecord(envId);
    if (!record) {
      return c.json({ error: "environment not found" }, 404);
    }

    const client = createClientForEnvironment(
      record,
      store,
      config.sqlTimeoutMs,
    );

    const built = buildSelectRows(
      {
        table: args.table,
        columns: args.columns,
        where: args.where,
        orderBy: args.orderBy,
        orderDir: args.orderDir,
        limit: args.limit,
      },
      config.sqlMaxRows,
      client.driver,
    );

    if (!built.ok) {
      return c.json({ error: built.reason }, 400);
    }

    try {
      const result = await client.query(built.sql, built.params);
      await client.close();
      return c.json({
        environmentId: envId,
        table: args.table.trim(),
        sql: built.sql,
        limit: built.limit,
        rowCount: result.rowCount,
        columns: result.columns,
        rows: result.rows,
      });
    } catch (err) {
      try {
        await client.close();
      } catch {
        // ignore
      }
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  });

  return app;
}
