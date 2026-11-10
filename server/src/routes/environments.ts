import { Hono } from "hono";
import { z } from "zod";
import type { EnvironmentStore } from "../lib/store.js";
import { createClientForEnvironment, testConnection } from "../lib/db.js";
import type { ServerConfig } from "../config.js";

const engineSchema = z.enum(["mssql", "oracle"]);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  engine: engineSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().positive().optional(),
  database: z.string().min(1).max(255),
  user: z.string().min(1).max(255),
  password: z.string().min(1),
  encrypt: z.boolean().optional(),
  trustServerCertificate: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  engine: engineSchema.optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().positive().optional(),
  database: z.string().min(1).max(255).optional(),
  user: z.string().min(1).max(255).optional(),
  /** Empty / omit keeps the stored password. */
  password: z.string().optional(),
  encrypt: z.boolean().optional(),
  trustServerCertificate: z.boolean().optional(),
});

export type EnvRoutesDeps = {
  store: EnvironmentStore;
  config: ServerConfig;
};

export function createEnvironmentRoutes(deps: EnvRoutesDeps) {
  const app = new Hono();
  const { store, config } = deps;

  app.get("/", async (c) => {
    const environments = await store.list();
    return c.json({ environments });
  });

  app.get("/active", async (c) => {
    const active = await store.getActive();
    return c.json({ environment: active });
  });

  app.get("/:id", async (c) => {
    const env = await store.get(c.req.param("id"));
    if (!env) return c.json({ error: "environment not found" }, 404);
    return c.json({ environment: env });
  });

  app.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);
    }
    try {
      const environment = await store.create(parsed.data);
      return c.json({ environment }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  app.put("/:id", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);
    }
    try {
      const environment = await store.update(c.req.param("id"), parsed.data);
      return c.json({ environment });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("not found") ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.delete("/:id", async (c) => {
    const ok = await store.remove(c.req.param("id"));
    if (!ok) return c.json({ error: "environment not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/:id/activate", async (c) => {
    try {
      const environment = await store.setActive(c.req.param("id"));
      return c.json({ environment });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        404,
      );
    }
  });

  app.post("/:id/test", async (c) => {
    const record = await store.getRecord(c.req.param("id"));
    if (!record) return c.json({ error: "environment not found" }, 404);
    const client = createClientForEnvironment(
      record,
      store,
      config.sqlTimeoutMs,
    );
    const result = await testConnection(client);
    if (result.ok) {
      return c.json(result);
    }
    return c.json(result, 502);
  });

  return app;
}
