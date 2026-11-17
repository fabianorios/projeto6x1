/**
 * POST /api/simulate — run shared engine on the server.
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

export type SimulateRouteDeps = {
  config: ServerConfig;
};

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

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

    // Strip nome from echoed input (defense in depth).
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
    console.info("[simulate]", {
      scenarioId: prepared.input.scenarioId,
      rowCount: prepared.rowCount,
      centerCount: prepared.centerCount,
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
      result,
      ...(apdataHierarchy !== undefined ? { apdataHierarchy } : {}),
    });
  });

  return app;
}

/** Test-only access to the shared limiter. */
export function resetSimulateRateLimiter() {
  limiter.reset();
}
