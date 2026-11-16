/**
 * CRUD + live slot test for SqlProfiles.
 * POST /api/query/test-slot — SELECT/WITH only, ≤10 rows, contract + PII guards.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import { createClientForEnvironment } from "../lib/db.js";
import {
  applyReadIsolation,
  createEphemeralClient,
  scrubCreds,
  type EphemeralCreds,
} from "../lib/ephemeral-db.js";
import type { EnvironmentStore } from "../lib/store.js";
import {
  bindParamsForSlot,
  normalizeBenefitParams,
  skippedBenefitNotes,
} from "../lib/benefit-params.js";
import {
  FACTORY_PROFILE_ID,
} from "../lib/sql-profile-defaults.js";
import {
  SQL_SLOT_CONTRACT,
  SQL_SLOT_IDS,
  isSqlSlotId,
  type SqlSlotId,
  type SqlSlotQueries,
} from "../lib/sql-profile-types.js";
import type { SqlProfilesStore } from "../lib/sql-profiles-store.js";
import {
  TEST_SLOT_MAX_ROWS,
  TEST_SLOT_TIMEOUT_MS,
  assertNoBlockedPiiColumns,
  guardSlotSql,
  validateContractColumns,
} from "../lib/sql-slot-guard.js";

const slotQueriesSchema = z.object({
  mssql: z.string().min(1),
  oracle: z.string().min(1),
});

const slotsSchema = z.object({
  ESTABELECIMENTOS: slotQueriesSchema,
  FOLHA_E_ESCALAS: slotQueriesSchema,
  TIPOS_BENEFICIOS: slotQueriesSchema,
  REGRA_VR: slotQueriesSchema,
  REGRA_VA: slotQueriesSchema,
  REGRA_VT: slotQueriesSchema,
  REGRA_FIXOS: slotQueriesSchema,
  INDICES_ENCARGOS: slotQueriesSchema,
});

const tipoListSchema = z.array(z.number().int().nonnegative()).optional();
const amountSchema = z.number().nonnegative().nullable().optional();

const benefitParamsSchema = z
  .object({
    vrTipoBeneficio: z.number().int().nonnegative().nullable(),
    vaTipoBeneficio: z.number().int().nonnegative().nullable(),
    assistenciaMedicaTipo: z.number().int().nonnegative().nullable(),
    assistenciaOdontologicaTipo: z.number().int().nonnegative().nullable(),
    vrTiposExtras: tipoListSchema,
    vaTiposExtras: tipoListSchema,
    medicaTiposExtras: tipoListSchema,
    odontoTiposExtras: tipoListSchema,
    vaModoValor: z.enum(["DIA", "MES"]).optional(),
    vrValorDiaPadrao: amountSchema,
    vaValorMesPadrao: amountSchema,
    assistenciaMedicaValorMes: amountSchema,
    assistenciaOdontologicaValorMes: amountSchema,
    labels: z
      .object({
        vr: z.string().optional(),
        va: z.string().optional(),
        medica: z.string().optional(),
        odontologica: z.string().optional(),
      })
      .optional(),
  })
  .optional();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slots: slotsSchema.optional(),
  benefitParams: benefitParamsSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slots: slotsSchema.optional(),
  benefitParams: benefitParamsSchema,
});

const duplicateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

const ephemeralCredsSchema = z.object({
  engine: z.enum(["mssql", "oracle"]),
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  encrypt: z.boolean().optional(),
  trustServerCertificate: z.boolean().optional(),
});

const testSlotSchema = z.object({
  profileId: z.string().min(1).optional(),
  slot: z.string().min(1),
  dialect: z.enum(["mssql", "oracle"]).optional(),
  /** Override SQL for draft editor (not persisted until save). */
  sql: z.string().min(1).optional(),
  /** Draft benefitParams (tipos) — used for @tipo binds without saving first. */
  benefitParams: benefitParamsSchema,
  environmentId: z.string().uuid().optional(),
  connection: ephemeralCredsSchema.optional(),
});

export type SqlProfileRoutesDeps = {
  store: EnvironmentStore;
  profiles: SqlProfilesStore;
  config: ServerConfig;
};

function limitSql(sql: string, dialect: "mssql" | "oracle", max: number): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (dialect === "mssql") {
    if (/\bTOP\s*\(/i.test(trimmed) || /\bTOP\s+\d+/i.test(trimmed)) {
      return trimmed;
    }
    // Inject TOP after SELECT / SELECT DISTINCT
    return trimmed.replace(
      /^(\s*WITH[\s\S]+?\))\s*SELECT\b/i,
      `$1\nSELECT TOP (${max})`,
    ).replace(
      /^(\s*)SELECT(\s+DISTINCT)?\b/i,
      (_m, sp: string, dist?: string) =>
        `${sp}SELECT${dist ?? ""} TOP (${max})`,
    );
  }
  // Oracle: wrap if no FETCH/ROWNUM
  if (/\bFETCH\s+FIRST\b/i.test(trimmed) || /\bROWNUM\b/i.test(trimmed)) {
    return trimmed;
  }
  return `SELECT * FROM (${trimmed}) q_slot_limit WHERE ROWNUM <= ${max}`;
}

export function createSqlProfileRoutes(deps: SqlProfileRoutesDeps) {
  const app = new Hono();
  const { store, profiles, config } = deps;

  app.get("/", async (c) => {
    const list = await profiles.list();
    const active = await profiles.getActive();
    return c.json({
      profiles: list,
      activeId: active?.id ?? null,
      factoryId: FACTORY_PROFILE_ID,
      contracts: SQL_SLOT_CONTRACT,
      slots: SQL_SLOT_IDS,
    });
  });

  app.get("/:id", async (c) => {
    const profile = await profiles.get(c.req.param("id"));
    if (!profile) return c.json({ error: "profile not found" }, 404);
    return c.json({ profile, contracts: SQL_SLOT_CONTRACT });
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
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }
    try {
      const factory = await profiles.get(FACTORY_PROFILE_ID);
      const slots =
        (parsed.data.slots as Record<SqlSlotId, SqlSlotQueries> | undefined) ??
        factory!.slots;
      const created = await profiles.create({
        name: parsed.data.name,
        slots,
        benefitParams: parsed.data.benefitParams
          ? normalizeBenefitParams(parsed.data.benefitParams)
          : undefined,
      });
      return c.json({ profile: created }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  app.post("/:id/duplicate", async (c) => {
    let body: unknown = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = duplicateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }
    try {
      const dup = await profiles.duplicate(
        c.req.param("id"),
        parsed.data.name,
      );
      return c.json({ profile: dup }, 201);
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
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }
    try {
      const updated = await profiles.update(c.req.param("id"), {
        name: parsed.data.name,
        slots: parsed.data.slots as
          | Record<SqlSlotId, SqlSlotQueries>
          | undefined,
        benefitParams: parsed.data.benefitParams
          ? normalizeBenefitParams(parsed.data.benefitParams)
          : undefined,
      });
      return c.json({ profile: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("read-only") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post("/:id/activate", async (c) => {
    try {
      const profile = await profiles.setActive(c.req.param("id"));
      return c.json({ profile, activeId: profile.id });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        404,
      );
    }
  });

  app.delete("/:id", async (c) => {
    try {
      await profiles.remove(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("factory") ? 403 : 404;
      return c.json({ error: msg }, status);
    }
  });

  return app;
}

/** Mounted under /api/query — test one SQL block live. */
export function createTestSlotRoute(deps: SqlProfileRoutesDeps) {
  const app = new Hono();
  const { store, profiles, config } = deps;

  app.post("/test-slot", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const parsed = testSlotSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "invalid body" },
        400,
      );
    }

    const args = parsed.data;
    if (!isSqlSlotId(args.slot)) {
      return c.json({ error: `unknown slot: ${args.slot}` }, 400);
    }
    const slot = args.slot;

    let dialect: "mssql" | "oracle" = args.dialect ?? "mssql";
    let sql = args.sql?.trim() ?? "";
    const profileId =
      args.profileId ??
      (await profiles.getActive())?.id ??
      FACTORY_PROFILE_ID;
    let profile = await profiles.get(profileId);
    if (!profile) return c.json({ error: "profile not found" }, 404);

    if (!sql) {
      sql = profile.slots[slot][dialect];
    }

    const guard = guardSlotSql(sql);
    if (!guard.ok) {
      return c.json({ error: `SQL blocked: ${guard.reason}` }, 400);
    }

    type Client = ReturnType<typeof createEphemeralClient>;
    let client: Client | null = null;
    let creds: EphemeralCreds | null = null;
    const started = Date.now();

    try {
      if (args.connection) {
        const defaultPort =
          args.connection.engine === "oracle" ? 1521 : 1433;
        dialect = args.connection.engine;
        if (!args.sql) {
          sql = profile.slots[slot][dialect];
          const g2 = guardSlotSql(sql);
          if (!g2.ok) {
            return c.json({ error: `SQL blocked: ${g2.reason}` }, 400);
          }
        }
        creds = {
          engine: args.connection.engine,
          host: args.connection.host,
          port: args.connection.port ?? defaultPort,
          database: args.connection.database,
          user: args.connection.user,
          password: args.connection.password,
          encrypt: args.connection.encrypt,
          trustServerCertificate: args.connection.trustServerCertificate,
        };
        client = createEphemeralClient(creds, TEST_SLOT_TIMEOUT_MS);
      } else {
        const envId =
          args.environmentId ?? (await store.getActiveId()) ?? undefined;
        if (!envId) {
          return c.json(
            {
              error:
                "no connection — provide connection (ephemeral) or activate an environment",
            },
            400,
          );
        }
        const record = await store.getRecord(envId);
        if (!record) return c.json({ error: "environment not found" }, 404);
        dialect = record.engine;
        if (!args.sql) {
          sql = profile.slots[slot][dialect];
          const g2 = guardSlotSql(sql);
          if (!g2.ok) {
            return c.json({ error: `SQL blocked: ${g2.reason}` }, 400);
          }
        }
        client = createClientForEnvironment(
          record,
          store,
          Math.min(config.sqlTimeoutMs, TEST_SLOT_TIMEOUT_MS),
        );
      }

      const benefitParams = normalizeBenefitParams(
        args.benefitParams ?? profile.benefitParams,
      );
      const bound = bindParamsForSlot(slot, dialect, benefitParams);
      // REGRA_FIXOS may run with one of two tipos; warn but still bind what exists.
      if (
        (slot === "REGRA_VR" || slot === "REGRA_VA") &&
        bound.missing.length > 0
      ) {
        return c.json(
          {
            error: `Tipo de benefício não cadastrado no perfil (${bound.missing.join(", ")}). Cadastre em Tipos de benefício (cliente) ou deixe o slot sem uso.`,
            skipped: skippedBenefitNotes(benefitParams),
          },
          400,
        );
      }
      if (slot === "REGRA_FIXOS" && bound.missing.length === 2) {
        return c.json(
          {
            error:
              "Assistência médica e odontológica sem tipo no perfil — benefícios fixos ignorados.",
            skipped: skippedBenefitNotes(benefitParams),
          },
          400,
        );
      }
      // Bind missing FIXOS tipos as sentinel -1 (no rows for that CTE).
      const queryParams: Record<string, number> = { ...bound.params };
      if (slot === "REGRA_FIXOS") {
        if (queryParams.tipoMedica === undefined) queryParams.tipoMedica = -1;
        if (queryParams.tipoOdonto === undefined) queryParams.tipoOdonto = -1;
      }

      const limited = limitSql(sql, dialect, TEST_SLOT_MAX_ROWS);
      await applyReadIsolation(client);
      const result = await Promise.race([
        client.query(limited, queryParams),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(`test-slot timeout (${TEST_SLOT_TIMEOUT_MS}ms)`),
              ),
            TEST_SLOT_TIMEOUT_MS,
          );
        }),
      ]);

      assertNoBlockedPiiColumns(result.columns);
      const contract = validateContractColumns(slot, result.columns);
      const rows = result.rows.slice(0, TEST_SLOT_MAX_ROWS);

      return c.json({
        ok: contract.ok,
        slot,
        dialect,
        timeoutMs: TEST_SLOT_TIMEOUT_MS,
        latencyMs: Date.now() - started,
        maxRows: TEST_SLOT_MAX_ROWS,
        rowCount: rows.length,
        columns: result.columns,
        rows,
        boundParams: queryParams,
        skippedBenefits: skippedBenefitNotes(benefitParams),
        contract: {
          required: SQL_SLOT_CONTRACT[slot],
          ok: contract.ok,
          missing: contract.ok ? [] : contract.missing,
        },
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    } finally {
      if (creds) scrubCreds(creds);
      if (client) {
        try {
          await client.close();
        } catch {
          // ignore
        }
      }
    }
  });

  return app;
}
