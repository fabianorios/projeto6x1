/**
 * POST /api/simulate — run shared engine on the server.
 * P4 progressive: optional shell + GET filial / full from ephemeral cache.
 * Does not persist Folha. Logs only counts + latency (no PII).
 */

import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { createRateLimiter } from "../lib/rate-limit.js";
import {
  prepareSimulateInput,
  simulateBodySchema,
} from "../lib/simulate-body.js";
import {
  buildApdataHierarchy,
  simulate,
  type SimulationResult,
} from "../lib/shared-engine.js";
import {
  resetSimulateResultCache,
  simulateResultCache,
} from "../lib/simulate-result-cache.js";
import {
  buildProgressiveShell,
  shouldUseProgressivePayload,
  sliceFilialPayload,
} from "../../../src/utils/progressiveFilial.js";

export type SimulateRouteDeps = {
  config: ServerConfig;
};

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const SIMULATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSimulationId(raw: string): boolean {
  return SIMULATION_ID_RE.test(raw);
}

function clientKey(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip")?.trim() || "local";
}

function stripNome(result: SimulationResult): SimulationResult {
  if (!result.input.payrollRows) return result;
  return {
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

export function createSimulateRoutes(_deps: SimulateRouteDeps) {
  const app = new Hono();

  app.post("/", async (c) => {
    const totalStarted = Date.now();
    const rl = limiter.check(clientKey(c));
    if (!rl.ok) {
      c.header("Retry-After", String(rl.retryAfterSec));
      return c.json(
        {
          ok: false,
          error: "Rate limit exceeded. Retry shortly.",
        },
        429,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = simulateBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return c.json({ ok: false, error: `Invalid request: ${msg}` }, 400);
    }

    let prepared;
    try {
      prepared = prepareSimulateInput(parsed.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid payload";
      return c.json({ ok: false, error: message }, 400);
    }

    const simStarted = Date.now();
    let result: SimulationResult;
    try {
      result = simulate(prepared.input);
    } catch (err) {
      console.error("[simulate] engine error", {
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
      result = {
        ...result,
        scheduleSuggestions: [],
      };
    }

    let apdataHierarchy: unknown = undefined;
    if (prepared.prefs.includeApdataHierarchySeed) {
      try {
        apdataHierarchy = buildApdataHierarchy(result);
      } catch (err) {
        console.error("[simulate] hierarchy seed error", {
          scenarioId: prepared.input.scenarioId,
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    result = stripNome(result);

    const wantProgressive =
      prepared.prefs.progressivePayload && shouldUseProgressivePayload(result);

    let responseResult: SimulationResult = result;
    let simulationId: string | undefined;
    let filialIndex: ReturnType<typeof buildProgressiveShell>["filialIndex"] |
      undefined;
    let progressive = false;

    if (wantProgressive) {
      const bundle = buildProgressiveShell(result);
      const cached = simulateResultCache.put(result, {
        centerCount: result.byCostCenter.length,
        filialCount: bundle.filialIndex.length,
      });
      responseResult = bundle.shell;
      filialIndex = bundle.filialIndex;
      simulationId = cached.id;
      progressive = true;
    }

    const totalMs = Date.now() - totalStarted;
    console.info("[simulate]", {
      scenarioId: prepared.input.scenarioId,
      rowCount: prepared.rowCount,
      centerCount: prepared.centerCount,
      progressive,
      filialCount: filialIndex?.length,
      latencyMs: {
        map: prepared.mapLatencyMs,
        simulate: simulateMs,
        total: totalMs,
      },
    });

    return c.json({
      ok: true,
      schemaVersion: parsed.data.schemaVersion ?? 1,
      latencyMs: {
        map: prepared.mapLatencyMs,
        simulate: simulateMs,
        total: totalMs,
      },
      ruleVersionId: result.ruleVersion.id,
      result: responseResult,
      ...(progressive
        ? {
            progressive: true,
            simulationId,
            filialIndex,
          }
        : {}),
      ...(apdataHierarchy !== undefined ? { apdataHierarchy } : {}),
    });
  });

  /** Per-filial slice — calendars / CCs / suggestions for one CNPJ key. */
  app.get("/:simulationId/filial/:filialKey", async (c) => {
    const simulationId = c.req.param("simulationId");
    if (!isSimulationId(simulationId)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    const rl = limiter.check(clientKey(c));
    if (!rl.ok) {
      c.header("Retry-After", String(rl.retryAfterSec));
      return c.json({ ok: false, error: "Rate limit exceeded. Retry shortly." }, 429);
    }

    const filialKey = decodeURIComponent(c.req.param("filialKey"));
    const entry = simulateResultCache.get(simulationId);
    if (!entry) {
      return c.json(
        {
          ok: false,
          error:
            "Simulação expirada ou não encontrada. Gere os resultados novamente.",
        },
        404,
      );
    }

    const slice = sliceFilialPayload(entry.result, filialKey);
    console.info("[simulate:filial]", {
      centerCount: slice.centers.length,
      suggestionCount: slice.scheduleSuggestions.length,
      // filialKey may be CNPJ digits — identifier only, not a person name.
      filialKeyLen: filialKey.length,
    });

    return c.json({
      ok: true,
      simulationId: entry.id,
      filialKey: slice.filialKey,
      centers: slice.centers,
      scheduleSuggestions: slice.scheduleSuggestions,
    });
  });

  /** Full cached Results DTO (print / cadastral / export). */
  app.get("/:simulationId", async (c) => {
    const simulationId = c.req.param("simulationId");
    if (!isSimulationId(simulationId)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    const rl = limiter.check(clientKey(c));
    if (!rl.ok) {
      c.header("Retry-After", String(rl.retryAfterSec));
      return c.json({ ok: false, error: "Rate limit exceeded. Retry shortly." }, 429);
    }

    const entry = simulateResultCache.get(simulationId);
    if (!entry) {
      return c.json(
        {
          ok: false,
          error:
            "Simulação expirada ou não encontrada. Gere os resultados novamente.",
        },
        404,
      );
    }

    console.info("[simulate:full]", {
      centerCount: entry.centerCount,
      filialCount: entry.filialCount,
    });

    return c.json({
      ok: true,
      simulationId: entry.id,
      result: stripNome(entry.result),
    });
  });

  return app;
}

/** Test-only access to the shared limiter. */
export function resetSimulateRateLimiter() {
  limiter.reset();
}

/** Test-only: clear progressive simulation cache. */
export { resetSimulateResultCache };
