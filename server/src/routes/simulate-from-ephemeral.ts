/**
 * POST /api/simulate/from-ephemeral — Conexão Direta pipeline (P3).
 * Folha SELECT extract → map → optional simulate. Same Results DTO as Aptools/P1.
 * Credentials never persisted; SELECT-only; Folha timeout; no PII logs.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { assertSelectOnly } from "@projeto-6x1/mcp";
import type { ServerConfig } from "../config.js";
import {
  EPHEMERAL_CONN_FAIL_MSG,
  EPHEMERAL_FOLHA_TIMEOUT_MS,
  applyReadIsolation,
  createEphemeralClient,
  isEphemeralConnectionFailure,
  scrubCreds,
  scrubErrorText,
  type EphemeralCreds,
} from "../lib/ephemeral-db.js";
import {
  assertNoPiiColumns,
  mapExtractorRows,
  type ExtractorAggregateRow,
} from "../lib/extractor-map.js";
import { buildExtractorQuery } from "../lib/extractor-sql.js";
import { createRateLimiter } from "../lib/rate-limit.js";
import {
  MAX_SIMULATE_ROWS,
  normalizePayrollRow,
  prepareSimulateInput,
  simulateBodySchema,
  type SimulateBody,
} from "../lib/simulate-body.js";
import {
  buildApdataHierarchy,
  mapExtractorAggregatesToPayroll,
  simulate,
  type PayrollRow,
  type SimulationResult,
} from "../lib/shared-engine.js";

export type SimulateFromEphemeralExtractResult = {
  rows: ExtractorAggregateRow[];
  extractMs: number;
  timeoutMs: number;
  engine: "mssql" | "oracle";
};

export type SimulateFromEphemeralExtractFn = (args: {
  creds: EphemeralCreds;
  filters: {
    cnpjs?: string[];
    excludeSituacoes?: number[];
    incluirAfastados?: boolean;
    tipoRegimeTrabalhistaIds?: number[];
    categTrabeSocIds?: number[];
    somenteEmpregaticios?: boolean;
  };
}) => Promise<SimulateFromEphemeralExtractResult>;

export type SimulateFromEphemeralDeps = {
  config: ServerConfig;
  /** Test hook — inject Folha aggregates without a live DB. */
  extractFn?: SimulateFromEphemeralExtractFn;
};

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip")?.trim() || "local";
}

function truthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const filtersSchema = z
  .object({
    cnpjs: z.array(z.string()).max(32).optional(),
    excludeSituacoes: z.array(z.number().int()).max(64).optional(),
    incluirAfastados: z.boolean().optional(),
    tipoRegimeTrabalhistaIds: z.array(z.number().int()).max(64).optional(),
    categTrabeSocIds: z.array(z.number().int()).max(64).optional(),
    somenteEmpregaticios: z.boolean().optional(),
  })
  .optional();

const credsSchema = z
  .object({
    engine: z.enum(["mssql", "oracle"]),
    host: z.string().min(1),
    port: z.number().int().positive().optional(),
    database: z.string().optional().default(""),
    user: z.string().min(1),
    password: z.string().min(1),
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional(),
    filters: filtersSchema,
    simulate: z.union([z.boolean(), z.string(), z.number()]).optional(),
    /** Same premises as POST /api/simulate (without payrollRows / aggregates). */
    meta: z.record(z.string(), z.unknown()).optional(),
    schemaVersion: z.number().int().positive().optional(),
    scenarioId: z.string().optional(),
    sector: z.string().optional(),
    sectorLabel: z.string().optional(),
    sectorBufferPct: z.number().optional(),
    headcount: z.number().optional(),
    currentScale: z.string().optional(),
    averageMonthlySalary: z.number().optional(),
    units: z.number().optional(),
    shiftsPerDay: z.number().optional(),
    operatingHours: z.unknown().optional(),
    ohScopeRules: z.unknown().optional(),
    defaultRegimeFuncionamento: z.string().optional(),
    regimeFuncionamentoByCc: z.record(z.string(), z.string()).optional(),
    defaultTaxRegime: z.string().optional(),
    taxRegimeByCnpj: z.record(z.string(), z.string()).optional(),
    estrategiaAbsorcao: z.string().optional(),
    prefs: z
      .object({
        includeScheduleSuggestions: z.boolean().optional(),
        includeApdataHierarchySeed: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.engine === "oracle" && !data.database?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "database (Service Name / SID) is required for oracle",
        path: ["database"],
      });
    }
  });

async function defaultExtract(
  args: Parameters<SimulateFromEphemeralExtractFn>[0],
): Promise<SimulateFromEphemeralExtractResult> {
  const timeoutMs = EPHEMERAL_FOLHA_TIMEOUT_MS;
  const client = createEphemeralClient(args.creds, timeoutMs);
  const started = Date.now();
  try {
    await applyReadIsolation(client);
    const { sql, params } = buildExtractorQuery(args.creds.engine, {
      ...(args.filters ?? {}),
    });
    const policy = assertSelectOnly(sql);
    if (!policy.ok) {
      throw new Error(`SQL blocked: ${policy.reason}`);
    }
    const result = await Promise.race([
      client.query(sql, params),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(`ephemeral query timeout (${timeoutMs}ms)`),
            ),
          timeoutMs,
        );
      }),
    ]);
    assertNoPiiColumns(result.columns);
    return {
      rows: mapExtractorRows(result.rows),
      extractMs: Date.now() - started,
      timeoutMs,
      engine: args.creds.engine,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

function stripNome(rows: PayrollRow[]): PayrollRow[] {
  return rows.map((r) => ({ ...r, nome: null }));
}

function buildSimulateBody(
  data: z.infer<typeof credsSchema>,
  payrollRows: PayrollRow[],
): SimulateBody | { error: string } {
  const meta =
    data.meta && typeof data.meta === "object" ? { ...data.meta } : {};
  const base: Record<string, unknown> = {
    schemaVersion: data.schemaVersion,
    scenarioId: data.scenarioId,
    sector: data.sector,
    sectorLabel: data.sectorLabel,
    sectorBufferPct: data.sectorBufferPct,
    headcount: data.headcount,
    currentScale: data.currentScale,
    averageMonthlySalary: data.averageMonthlySalary,
    units: data.units,
    shiftsPerDay: data.shiftsPerDay,
    operatingHours: data.operatingHours,
    ohScopeRules: data.ohScopeRules,
    defaultRegimeFuncionamento: data.defaultRegimeFuncionamento,
    regimeFuncionamentoByCc: data.regimeFuncionamentoByCc,
    defaultTaxRegime: data.defaultTaxRegime,
    taxRegimeByCnpj: data.taxRegimeByCnpj,
    estrategiaAbsorcao: data.estrategiaAbsorcao,
    prefs: data.prefs,
    ...meta,
  };
  // Drop anything that would bypass Folha from this request.
  delete base.payrollRows;
  delete base.aggregates;
  delete base.password;
  delete base.user;
  delete base.host;
  delete base.engine;
  delete base.filters;
  delete base.simulate;
  delete base.meta;
  delete base.text;
  delete base.file;

  const candidate = {
    ...base,
    payrollRows: payrollRows.map((r) => ({ ...r, nome: null })),
  };
  const parsed = simulateBodySchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "meta"}: ${i.message}`)
      .join("; ");
    return {
      error: `Invalid simulate meta: ${msg}. Provide scenarioId, sector, currentScale (same as POST /api/simulate).`,
    };
  }
  return parsed.data;
}

export function createSimulateFromEphemeralRoutes(
  deps: SimulateFromEphemeralDeps,
) {
  const app = new Hono();
  const extractFn = deps.extractFn ?? defaultExtract;

  app.post("/", async (c) => {
    const totalStarted = Date.now();
    const rl = limiter.check(clientKey(c));
    if (!rl.ok) {
      c.header("Retry-After", String(rl.retryAfterSec));
      return c.json(
        { ok: false, error: "Rate limit exceeded. Retry shortly." },
        429,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = credsSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "invalid body",
        },
        400,
      );
    }

    const data = parsed.data;
    const defaultPort = data.engine === "oracle" ? 1521 : 1433;
    const creds: EphemeralCreds = {
      engine: data.engine,
      host: data.host,
      port: data.port ?? defaultPort,
      database: data.database?.trim() || undefined,
      user: data.user,
      password: data.password,
      encrypt: data.encrypt,
      trustServerCertificate: data.trustServerCertificate,
    };
    /** Simulate when flag or nested meta premises are present (Aptools parity). */
    const doSimulate = truthyFlag(data.simulate) || data.meta != null;

    try {
      let extracted: SimulateFromEphemeralExtractResult;
      try {
        extracted = await extractFn({
          creds,
          filters: data.filters ?? {},
        });
      } catch (err) {
        const secrets = [creds.password, creds.user];
        if (isEphemeralConnectionFailure(err)) {
          return c.json(
            {
              ok: false,
              error: EPHEMERAL_CONN_FAIL_MSG,
              engine: data.engine,
              latencyMs: {
                extract: Date.now() - totalStarted,
                map: 0,
                total: Date.now() - totalStarted,
              },
            },
            422,
          );
        }
        const rawMsg = err instanceof Error ? err.message : String(err);
        return c.json(
          {
            ok: false,
            error: scrubErrorText(rawMsg, secrets),
            engine: data.engine,
            latencyMs: {
              extract: Date.now() - totalStarted,
              map: 0,
              total: Date.now() - totalStarted,
            },
          },
          400,
        );
      }

      if (extracted.rows.length === 0) {
        console.info("[simulate/from-ephemeral]", {
          rowCount: 0,
          engine: extracted.engine,
          simulate: false,
          latencyMs: {
            extract: extracted.extractMs,
            map: 0,
            total: Date.now() - totalStarted,
          },
        });
        return c.json(
          {
            ok: false,
            error:
              "Extrator efêmero não retornou linhas após filtros. Ajuste o escopo CNPJ / vínculos.",
            rowCount: 0,
            engine: extracted.engine,
            timeoutMs: extracted.timeoutMs,
            latencyMs: {
              extract: extracted.extractMs,
              map: 0,
              total: Date.now() - totalStarted,
            },
          },
          400,
        );
      }

      if (extracted.rows.length > MAX_SIMULATE_ROWS) {
        return c.json(
          {
            ok: false,
            error: `Too many rows (max ${MAX_SIMULATE_ROWS} aggregated lines)`,
            rowCount: extracted.rows.length,
          },
          400,
        );
      }

      const mapStarted = Date.now();
      const mapped = mapExtractorAggregatesToPayroll(extracted.rows);
      const payrollRows = stripNome(
        mapped.map((r, i) =>
          normalizePayrollRow(r as unknown as Record<string, unknown>, i),
        ),
      );
      const mapMs = Date.now() - mapStarted;
      const headcount = payrollRows.reduce((s, r) => s + r.quantidade, 0);
      const centers = new Set(
        payrollRows.map((r) => r.centroCusto).filter(Boolean),
      );

      if (!doSimulate) {
        const totalMs = Date.now() - totalStarted;
        console.info("[simulate/from-ephemeral]", {
          rowCount: payrollRows.length,
          centerCount: centers.size,
          headcount,
          engine: extracted.engine,
          simulate: false,
          latencyMs: {
            extract: extracted.extractMs,
            map: mapMs,
            total: totalMs,
          },
        });
        return c.json({
          ok: true,
          schemaVersion: data.schemaVersion ?? 1,
          engine: extracted.engine,
          timeoutMs: extracted.timeoutMs,
          rowCount: payrollRows.length,
          headcount,
          centerCount: centers.size,
          payrollRows,
          latencyMs: {
            extract: extracted.extractMs,
            map: mapMs,
            total: totalMs,
          },
          note: "Ephemeral connection destroyed after response. Credentials were not persisted. Folha not stored.",
        });
      }

      const simBodyOrErr = buildSimulateBody(data, payrollRows);
      if ("error" in simBodyOrErr) {
        return c.json({ ok: false, error: simBodyOrErr.error }, 400);
      }

      let prepared;
      try {
        prepared = prepareSimulateInput(simBodyOrErr);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid payload";
        return c.json({ ok: false, error: message }, 400);
      }

      const simStarted = Date.now();
      let result: SimulationResult;
      try {
        result = simulate(prepared.input);
      } catch (err) {
        console.error("[simulate/from-ephemeral] engine error", {
          scenarioId: prepared.input.scenarioId,
          rowCount: prepared.rowCount,
          centerCount: prepared.centerCount,
          message: err instanceof Error ? err.message : "unknown",
        });
        return c.json(
          { ok: false, error: "Simulation failed on server" },
          500,
        );
      }
      const simulateMs = Date.now() - simStarted;

      if (!prepared.prefs.includeScheduleSuggestions) {
        result = { ...result, scheduleSuggestions: [] };
      }

      let apdataHierarchy: unknown = undefined;
      if (prepared.prefs.includeApdataHierarchySeed) {
        try {
          apdataHierarchy = buildApdataHierarchy(result);
        } catch (err) {
          console.error("[simulate/from-ephemeral] hierarchy seed error", {
            scenarioId: prepared.input.scenarioId,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      if (result.input.payrollRows) {
        result = {
          ...result,
          input: {
            ...result.input,
            payrollRows: result.input.payrollRows.map((r) => ({
              ...r,
              nome: null,
            })),
          },
        };
      }

      const totalMs = Date.now() - totalStarted;
      console.info("[simulate/from-ephemeral]", {
        scenarioId: prepared.input.scenarioId,
        rowCount: payrollRows.length,
        centerCount: centers.size,
        headcount,
        engine: extracted.engine,
        simulate: true,
        latencyMs: {
          extract: extracted.extractMs,
          map: mapMs + prepared.mapLatencyMs,
          simulate: simulateMs,
          total: totalMs,
        },
      });

      return c.json({
        ok: true,
        schemaVersion: simBodyOrErr.schemaVersion ?? data.schemaVersion ?? 1,
        engine: extracted.engine,
        timeoutMs: extracted.timeoutMs,
        rowCount: payrollRows.length,
        headcount,
        centerCount: centers.size,
        payrollRows,
        latencyMs: {
          extract: extracted.extractMs,
          map: mapMs + prepared.mapLatencyMs,
          simulate: simulateMs,
          total: totalMs,
        },
        ruleVersionId: result.ruleVersion.id,
        result,
        ...(apdataHierarchy !== undefined ? { apdataHierarchy } : {}),
        note: "Ephemeral connection destroyed after response. Credentials were not persisted. Folha not stored.",
      });
    } finally {
      scrubCreds(creds);
      if (raw && typeof raw === "object" && raw !== null && "password" in raw) {
        try {
          (raw as { password: string }).password = "";
        } catch {
          // ignore
        }
      }
    }
  });

  return app;
}

/** Test-only access to the shared limiter. */
export function resetSimulateFromEphemeralRateLimiter() {
  limiter.reset();
}
