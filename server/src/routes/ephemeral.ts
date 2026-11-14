/**
 * POST /api/query/ephemeral — volatile connection; never persists credentials.
 * Modes:
 *   - extract (default): official Apdata extractor → aggregate rows
 *   - catalog: allowlisted single-table SELECTs for CNPJ + ramos UI
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  assertSelectOnly,
  buildSelectRows,
  type SelectRowsInput,
} from "@projeto-6x1/mcp";
import {
  EPHEMERAL_CONN_FAIL_MSG,
  EPHEMERAL_TIMEOUT_MS,
  applyReadIsolation,
  createEphemeralClient,
  isEphemeralConnectionFailure,
  scrubCreds,
  scrubErrorText,
  type EphemeralCreds,
} from "../lib/ephemeral-db.js";
import {
  normalizeBenefitParams,
  skippedBenefitNotes,
} from "../lib/benefit-params.js";
import {
  buildExtractorQuery,
  getAptoolsExtractorScript,
} from "../lib/extractor-sql.js";
import {
  assertNoPiiColumns,
  mapExtractorRows,
} from "../lib/extractor-map.js";
import type { ServerConfig } from "../config.js";

const benefitParamsBodySchema = z
  .object({
    vrTipoBeneficio: z.number().int().nullable().optional(),
    vaTipoBeneficio: z.number().int().nullable().optional(),
    assistenciaMedicaTipo: z.number().int().nullable().optional(),
    assistenciaOdontologicaTipo: z.number().int().nullable().optional(),
    vaModoValor: z.enum(["DIA", "MES"]).optional(),
  })
  .optional();

const ephemeralSchema = z
  .object({
    engine: z.enum(["mssql", "oracle"]),
    host: z.string().min(1),
    port: z.number().int().positive().optional(),
    /** MSSQL: optional. Oracle: Service Name / SID (required via refine). */
    database: z.string().optional().default(""),
    user: z.string().min(1),
    password: z.string().min(1),
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional(),
    mode: z.enum(["extract", "catalog"]).optional().default("extract"),
    filters: z
      .object({
        cnpjs: z.array(z.string()).max(32).optional(),
      })
      .optional(),
    /** SqlProfile.benefitParams — binds @tipoVr / @tipoVa / … */
    benefitParams: benefitParamsBodySchema,
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

/** Situações excluídas do headcount (parity with client EXCLUDED_SITUACOES). */
const EXCLUDED_SITUACOES = [0, 2, 3, 99] as const;

const CATALOG_SELECTS: SelectRowsInput[] = [
  {
    table: "Empresas",
    columns: [
      "EMP_CdiEmpresa",
      "EMP_DssEmpresa",
      "EMP_NusCNPJPrefixo",
      "EMP_CdiRamoAtividadeEmpresa",
    ],
  },
  {
    table: "Locais",
    columns: [
      "LPC_CdiLocal",
      "LPC_CdiEmpresa",
      "LPC_D1sLocal",
      "LPC_NusCNPJSufixo",
    ],
  },
  {
    table: "Folhas",
    columns: ["FOL_CdiFolha", "FOL_CdiLocal"],
  },
  {
    table: "Contratados",
    columns: ["CON_CdiFolha", "CON_CdiSituacao", "CON_CdiVinculo"],
    whereNotIn: { CON_CdiSituacao: [...EXCLUDED_SITUACOES] },
  },
  {
    table: "Vinculos",
    columns: ["VIN_CdiVinculo", "VIN_D1sVinculo"],
  },
  {
    table: "RamosAtividadesEmpresas",
    columns: [
      "RAE_CdiRamoAtividadeEmpresa",
      "RAE_D1sRamoAtividadeEmpresa",
      "RAE_CosReferencia",
      "RAE_OplDesativado",
    ],
  },
];

export type EphemeralRoutesDeps = {
  config?: Pick<ServerConfig, "sqlMaxRows">;
};

const DEFAULT_MAX_ROWS = 5000;

export function createEphemeralRoutes(deps: EphemeralRoutesDeps = {}) {
  const app = new Hono();
  const maxRows = deps.config?.sqlMaxRows ?? DEFAULT_MAX_ROWS;

  /** Aptools copy helpers — no DB connection. */
  app.get("/extractor-sql", (c) => {
    const engine = (c.req.query("engine") ?? "mssql").toLowerCase();
    const dialect = engine === "oracle" ? "oracle" : "mssql";
    return c.json({
      engine: dialect,
      sql: getAptoolsExtractorScript(dialect),
      note: "Official Apdata extractor (LGPD-safe aggregates). Benefit tipos inlined from factory defaults (VR=53, VA=52); customize via SqlProfile.benefitParams.",
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
      // MSSQL: empty → undefined (login default DB). Oracle: required non-empty (refined).
      database: data.database?.trim() || undefined,
      user: data.user,
      password: data.password,
      encrypt: data.encrypt,
      trustServerCertificate: data.trustServerCertificate,
    };

    const client = createEphemeralClient(creds, EPHEMERAL_TIMEOUT_MS);
    const started = Date.now();
    const mode = data.mode ?? "extract";

    try {
      await applyReadIsolation(client);

      if (mode === "catalog") {
        const tables: Record<
          string,
          {
            columns: string[];
            rows: Record<string, unknown>[];
            rowCount: number;
            sql: string;
          }
        > = {};

        const deadline = started + EPHEMERAL_TIMEOUT_MS;
        for (const sel of CATALOG_SELECTS) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            throw new Error(
              `ephemeral catalog timeout (${EPHEMERAL_TIMEOUT_MS}ms)`,
            );
          }
          const built = buildSelectRows(sel, maxRows, client.driver);
          if (!built.ok) {
            scrubCreds(creds);
            return c.json({ error: built.reason }, 400);
          }
          const policy = assertSelectOnly(built.sql);
          if (!policy.ok) {
            scrubCreds(creds);
            return c.json({ error: `SQL blocked: ${policy.reason}` }, 400);
          }
          const result = await Promise.race([
            client.query(built.sql, built.params),
            new Promise<never>((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `ephemeral catalog timeout (${EPHEMERAL_TIMEOUT_MS}ms)`,
                    ),
                  ),
                Math.max(1, remaining),
              );
            }),
          ]);
          tables[sel.table] = {
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount,
            sql: built.sql,
          };
        }

        return c.json({
          ok: true,
          mode: "catalog",
          engine: data.engine,
          timeoutMs: EPHEMERAL_TIMEOUT_MS,
          latencyMs: Date.now() - started,
          tables,
          note: "Ephemeral catalog connection destroyed after response. Credentials were not persisted.",
        });
      }

      const benefitParams = normalizeBenefitParams(data.benefitParams);
      const { sql, params } = buildExtractorQuery(data.engine, {
        ...(data.filters ?? {}),
        benefitParams,
      });
      const policy = assertSelectOnly(sql);
      if (!policy.ok) {
        scrubCreds(creds);
        return c.json({ error: `SQL blocked: ${policy.reason}` }, 400);
      }

      const result = await Promise.race([
        client.query(sql, params),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `ephemeral query timeout (${EPHEMERAL_TIMEOUT_MS}ms)`,
                ),
              ),
            EPHEMERAL_TIMEOUT_MS,
          );
        }),
      ]);

      assertNoPiiColumns(result.columns);
      const rows = mapExtractorRows(result.rows);

      return c.json({
        ok: true,
        mode: "extract",
        engine: data.engine,
        timeoutMs: EPHEMERAL_TIMEOUT_MS,
        latencyMs: Date.now() - started,
        rowCount: rows.length,
        boundBenefitParams: {
          tipoVr: params.tipoVr,
          tipoVa: params.tipoVa,
          tipoMedica: params.tipoMedica,
          tipoOdonto: params.tipoOdonto,
        },
        skippedBenefits: skippedBenefitNotes(benefitParams),
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
          "qtd_passes_dia_medio",
          "va_valor_medio",
          "assist_medica_mes",
          "assist_odonto_mes",
          "dias_trabalho_mes_atual",
        ],
        rows,
        note: "Ephemeral connection destroyed after response. Credentials were not persisted. Benefit @tipo* bound from benefitParams (sentinel -1 = skip).",
      });
    } catch (err) {
      // Connection/login/network → 422 JSON (never Nginx/Cloudflare 502 HTML).
      const secrets = [creds.password, creds.user];
      if (isEphemeralConnectionFailure(err)) {
        return c.json(
          {
            ok: false,
            error: EPHEMERAL_CONN_FAIL_MSG,
            engine: data.engine,
            mode,
            latencyMs: Date.now() - started,
          },
          422,
        );
      }
      const raw = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          ok: false,
          error: scrubErrorText(raw, secrets),
          engine: data.engine,
          mode,
          latencyMs: Date.now() - started,
        },
        400,
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
