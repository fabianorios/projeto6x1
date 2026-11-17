/**
 * POST /api/folha/aptools — Aptools Folha upload → parse (+ optional simulate).
 * Accepts multipart file, text/plain TAB/CSV body, or JSON { text, … }.
 * Does not persist Folha. Logs only counts + latency (no PII / no client names).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { ServerConfig } from "../config.js";
import {
  decodeAndParseFolhaBytes,
  MAX_FOLHA_UPLOAD_BYTES,
  parseFolhaTolerant,
  type FolhaEncoding,
} from "../lib/folha-parse.js";
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
  simulate,
  type PayrollParseIssue,
  type PayrollRow,
  type SimulationResult,
} from "../lib/shared-engine.js";

export type FolhaAptoolsRouteDeps = {
  config: ServerConfig;
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

function stripNome(rows: PayrollRow[]): PayrollRow[] {
  return rows.map((r) => ({ ...r, nome: null }));
}

function summarizeIssues(issues: PayrollParseIssue[]): PayrollParseIssue[] {
  return issues.slice(0, 50);
}

type ParsedUpload = {
  rows: PayrollRow[];
  issues: PayrollParseIssue[];
  encoding: FolhaEncoding | "text" | "json";
  charCount: number;
  parseMs: number;
};

type ExtractOk = {
  ok: true;
  parsed: ParsedUpload;
  wantSimulate: boolean;
  meta: unknown;
};

type ExtractErr = { ok: false; status: 400 | 413; error: string };

async function parseFromRequest(c: Context): Promise<ExtractOk | ExtractErr> {
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  let wantSimulate = truthyFlag(c.req.query("simulate"));
  let meta: unknown = undefined;

  if (contentType.includes("multipart/form-data")) {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.parseBody({ all: false })) as Record<
        string,
        unknown
      >;
    } catch {
      return { ok: false, status: 400, error: "Invalid multipart body" };
    }

    wantSimulate = wantSimulate || truthyFlag(body.simulate);
    if (typeof body.meta === "string" && body.meta.trim()) {
      try {
        meta = JSON.parse(body.meta);
      } catch {
        return {
          ok: false,
          status: 400,
          error: "Invalid meta JSON (simulate premises)",
        };
      }
    }

    const fileField =
      body.file ?? body.folha ?? body.upload ?? body.aptools ?? null;
    let bytes: Uint8Array | null = null;
    let textFallback: string | null = null;

    if (fileField instanceof File) {
      if (fileField.size > MAX_FOLHA_UPLOAD_BYTES) {
        return {
          ok: false,
          status: 413,
          error: `Upload too large (max ${MAX_FOLHA_UPLOAD_BYTES} bytes)`,
        };
      }
      bytes = new Uint8Array(await fileField.arrayBuffer());
    } else if (typeof body.text === "string") {
      textFallback = body.text;
    } else if (typeof fileField === "string") {
      textFallback = fileField;
    }

    if (bytes) {
      const parseStarted = Date.now();
      const { result, encoding, charCount } = decodeAndParseFolhaBytes(bytes);
      return {
        ok: true,
        wantSimulate,
        meta,
        parsed: {
          rows: stripNome(result.rows),
          issues: result.issues,
          encoding,
          charCount,
          parseMs: Date.now() - parseStarted,
        },
      };
    }
    if (textFallback != null) {
      if (Buffer.byteLength(textFallback, "utf8") > MAX_FOLHA_UPLOAD_BYTES) {
        return {
          ok: false,
          status: 413,
          error: `Upload too large (max ${MAX_FOLHA_UPLOAD_BYTES} bytes)`,
        };
      }
      const parseStarted = Date.now();
      const result = parseFolhaTolerant(textFallback);
      return {
        ok: true,
        wantSimulate,
        meta,
        parsed: {
          rows: stripNome(result.rows),
          issues: result.issues,
          encoding: "text",
          charCount: textFallback.length,
          parseMs: Date.now() - parseStarted,
        },
      };
    }
    return {
      ok: false,
      status: 400,
      error: "multipart must include file (or text) field",
    };
  }

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return { ok: false, status: 400, error: "Invalid JSON body" };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, status: 400, error: "JSON body required" };
    }
    const obj = raw as Record<string, unknown>;
    wantSimulate = wantSimulate || truthyFlag(obj.simulate);
    meta = obj;
    const text = typeof obj.text === "string" ? obj.text : null;
    if (text == null) {
      return {
        ok: false,
        status: 400,
        error: "JSON body must include text (Folha TAB/CSV contents)",
      };
    }
    if (Buffer.byteLength(text, "utf8") > MAX_FOLHA_UPLOAD_BYTES) {
      return {
        ok: false,
        status: 413,
        error: `Upload too large (max ${MAX_FOLHA_UPLOAD_BYTES} bytes)`,
      };
    }
    const parseStarted = Date.now();
    const result = parseFolhaTolerant(text);
    return {
      ok: true,
      wantSimulate,
      meta,
      parsed: {
        rows: stripNome(result.rows),
        issues: result.issues,
        encoding: "json",
        charCount: text.length,
        parseMs: Date.now() - parseStarted,
      },
    };
  }

  // text/plain, text/tab-separated-values, text/csv, or unspecified → raw body
  const text = await c.req.text();
  if (!text || !text.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Empty body — send multipart file or TAB/CSV text",
    };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_FOLHA_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `Upload too large (max ${MAX_FOLHA_UPLOAD_BYTES} bytes)`,
    };
  }
  wantSimulate =
    wantSimulate ||
    truthyFlag(c.req.header("x-simulate")) ||
    truthyFlag(c.req.query("simulate"));
  const parseStarted = Date.now();
  const result = parseFolhaTolerant(text);
  return {
    ok: true,
    wantSimulate,
    meta: undefined,
    parsed: {
      rows: stripNome(result.rows),
      issues: result.issues,
      encoding: "text",
      charCount: text.length,
      parseMs: Date.now() - parseStarted,
    },
  };
}

function buildSimulateBodyFromMeta(
  meta: unknown,
  payrollRows: PayrollRow[],
): SimulateBody | { error: string } {
  if (!meta || typeof meta !== "object") {
    return {
      error:
        "simulate=1 requires meta/JSON with scenarioId, sector, currentScale (same as POST /api/simulate)",
    };
  }
  const base = { ...(meta as Record<string, unknown>) };
  delete base.text;
  delete base.simulate;
  delete base.file;
  delete base.payrollRows;
  delete base.aggregates;
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
    return { error: `Invalid simulate meta: ${msg}` };
  }
  return parsed.data;
}

export function createFolhaAptoolsRoutes(_deps: FolhaAptoolsRouteDeps) {
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

    const extracted = await parseFromRequest(c);
    if (!extracted.ok) {
      return c.json({ ok: false, error: extracted.error }, extracted.status);
    }

    const { parsed, meta, wantSimulate } = extracted;

    if (parsed.rows.length === 0) {
      console.info("[folha/aptools]", {
        rowCount: 0,
        issueCount: parsed.issues.length,
        encoding: parsed.encoding,
        latencyMs: { parse: parsed.parseMs, total: Date.now() - totalStarted },
      });
      return c.json(
        {
          ok: false,
          error:
            parsed.issues[0]?.message ??
            "Nenhuma linha válida no arquivo. Verifique o export do Aptools (TXT TAB ou CSV).",
          parseWarnings: summarizeIssues(parsed.issues),
          rowCount: 0,
          latencyMs: {
            parse: parsed.parseMs,
            map: 0,
            total: Date.now() - totalStarted,
          },
        },
        400,
      );
    }

    if (parsed.rows.length > MAX_SIMULATE_ROWS) {
      return c.json(
        {
          ok: false,
          error: `Too many rows (max ${MAX_SIMULATE_ROWS} aggregated lines)`,
          rowCount: parsed.rows.length,
        },
        400,
      );
    }

    const mapStarted = Date.now();
    const payrollRows = parsed.rows.map((r, i) =>
      normalizePayrollRow(r as unknown as Record<string, unknown>, i),
    );
    const mapMs = Date.now() - mapStarted;
    const headcount = payrollRows.reduce((s, r) => s + r.quantidade, 0);
    const centers = new Set(
      payrollRows.map((r) => r.centroCusto).filter(Boolean),
    );

    if (!wantSimulate) {
      const totalMs = Date.now() - totalStarted;
      console.info("[folha/aptools]", {
        rowCount: payrollRows.length,
        centerCount: centers.size,
        headcount,
        encoding: parsed.encoding,
        simulate: false,
        latencyMs: {
          parse: parsed.parseMs,
          map: mapMs,
          total: totalMs,
        },
      });
      return c.json({
        ok: true,
        schemaVersion: 1,
        rowCount: payrollRows.length,
        headcount,
        centerCount: centers.size,
        encoding: parsed.encoding,
        parseWarnings: summarizeIssues(parsed.issues),
        issueCount: parsed.issues.length,
        payrollRows,
        latencyMs: {
          parse: parsed.parseMs,
          map: mapMs,
          total: totalMs,
        },
      });
    }

    const simBodyOrErr = buildSimulateBodyFromMeta(meta, payrollRows);
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
      console.error("[folha/aptools] engine error", {
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
        console.error("[folha/aptools] hierarchy seed error", {
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
    console.info("[folha/aptools]", {
      scenarioId: prepared.input.scenarioId,
      rowCount: payrollRows.length,
      centerCount: centers.size,
      headcount,
      encoding: parsed.encoding,
      simulate: true,
      latencyMs: {
        parse: parsed.parseMs,
        map: mapMs + prepared.mapLatencyMs,
        simulate: simulateMs,
        total: totalMs,
      },
    });

    const schemaVersion =
      meta &&
      typeof meta === "object" &&
      typeof (meta as { schemaVersion?: unknown }).schemaVersion === "number"
        ? (meta as { schemaVersion: number }).schemaVersion
        : 1;

    return c.json({
      ok: true,
      schemaVersion,
      rowCount: payrollRows.length,
      headcount,
      centerCount: centers.size,
      encoding: parsed.encoding,
      parseWarnings: summarizeIssues(parsed.issues),
      issueCount: parsed.issues.length,
      payrollRows,
      latencyMs: {
        parse: parsed.parseMs,
        map: mapMs + prepared.mapLatencyMs,
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
export function resetFolhaAptoolsRateLimiter() {
  limiter.reset();
}
