/**
 * POST /api/query/ephemeral — volatile connection; never persists credentials.
 */

import { Hono } from "hono";
import { z } from "zod";
import { assertSelectOnly } from "@projeto-6x1/mcp";
import {
  EPHEMERAL_TIMEOUT_MS,
  applyReadIsolation,
  createEphemeralClient,
  scrubCreds,
  type EphemeralCreds,
} from "../lib/ephemeral-db.js";
import {
  buildExtractorQuery,
  getAptoolsExtractorScript,
} from "../lib/extractor-sql.js";
import {
  assertNoPiiColumns,
  mapExtractorRows,
} from "../lib/extractor-map.js";

const ephemeralSchema = z.object({
  engine: z.enum(["mssql", "oracle"]),
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  encrypt: z.boolean().optional(),
  trustServerCertificate: z.boolean().optional(),
  filters: z
    .object({
      cnpjs: z.array(z.string()).max(32).optional(),
    })
    .optional(),
});

export function createEphemeralRoutes() {
  const app = new Hono();

  /** Aptools copy helpers — no DB connection. */
  app.get("/extractor-sql", (c) => {
    const engine = (c.req.query("engine") ?? "mssql").toLowerCase();
    const dialect = engine === "oracle" ? "oracle" : "mssql";
    return c.json({
      engine: dialect,
      sql: getAptoolsExtractorScript(dialect),
      note: "Official Apdata extractor (LGPD-safe aggregates). Copy into Aptools.",
    });
  });

  app.post("/ephemeral", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const parsed = ephemeralSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }

    const data = parsed.data;
    const defaultPort = data.engine === "oracle" ? 1521 : 1433;
    const creds: EphemeralCreds = {
      engine: data.engine,
      host: data.host,
      port: data.port ?? defaultPort,
      database: data.database,
      user: data.user,
      password: data.password,
      encrypt: data.encrypt,
      trustServerCertificate: data.trustServerCertificate,
    };

    const { sql, params } = buildExtractorQuery(data.engine, data.filters ?? {});
    const policy = assertSelectOnly(sql);
    if (!policy.ok) {
      scrubCreds(creds);
      return c.json({ error: `SQL blocked: ${policy.reason}` }, 400);
    }

    const client = createEphemeralClient(creds, EPHEMERAL_TIMEOUT_MS);
    const started = Date.now();

    try {
      await applyReadIsolation(client);
      const result = await Promise.race([
        client.query(sql, params),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`ephemeral query timeout (${EPHEMERAL_TIMEOUT_MS}ms)`)),
            EPHEMERAL_TIMEOUT_MS,
          );
        }),
      ]);

      assertNoPiiColumns(result.columns);
      const rows = mapExtractorRows(result.rows);

      return c.json({
        ok: true,
        engine: data.engine,
        timeoutMs: EPHEMERAL_TIMEOUT_MS,
        latencyMs: Date.now() - started,
        rowCount: rows.length,
        columns: [
          "cod_empresa",
          "cod_filial",
          "cnpj_completo",
          "cod_cc",
          "cod_cargo",
          "desc_cargo",
          "cod_vinculo",
          "cod_horario_atual",
          "escala_atual",
          "carga_semanal_atual",
          "qtd_colaboradores",
          "massa_salarial_base",
          "vr_dia_medio",
          "vt_dia_medio",
          "dias_trabalho_mes_atual",
        ],
        rows,
        note: "Ephemeral connection destroyed after response. Credentials were not persisted.",
      });
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          engine: data.engine,
          latencyMs: Date.now() - started,
        },
        502,
      );
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
      scrubCreds(creds);
      // Drop reference to request password field if present
      if (body && typeof body === "object" && body !== null && "password" in body) {
        try {
          (body as { password: string }).password = "";
        } catch {
          // ignore
        }
      }
    }
  });

  return app;
}
