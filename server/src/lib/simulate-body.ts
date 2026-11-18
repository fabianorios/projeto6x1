/**
 * Validate / normalize POST /api/simulate bodies.
 * LGPD: force nome=null; never log row contents.
 */

import { z } from "zod";
import {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  emptyPayrollExtras,
  isEstrategiaAbsorcao,
  isRegimeFuncionamento,
  isTaxRegime,
  mapExtractorAggregatesToPayroll,
  prepareOHScopeRulesForInput,
  type ExtractorAggregate,
  type OperatingHours,
  type PayrollRow,
  type ScenarioId,
  type SimulationInput,
} from "./shared-engine.js";

export const MAX_SIMULATE_ROWS = 50_000;

const SCENARIO_IDS = [
  "status_quo",
  "fase1_2026_42h",
  "fase2_2027_40h",
  "stress_test_4x3",
  "pec_draft_conservative",
  "pec_draft_aggressive",
] as const;

const dayHoursSchema = z.object({
  openHour: z.number(),
  closeHour: z.number(),
  closed: z.boolean().optional(),
});

const operatingHoursSchema = z.object({
  default: dayHoursSchema,
  mon: dayHoursSchema.optional(),
  tue: dayHoursSchema.optional(),
  wed: dayHoursSchema.optional(),
  thu: dayHoursSchema.optional(),
  fri: dayHoursSchema.optional(),
  sat: dayHoursSchema.optional(),
  sun: dayHoursSchema.optional(),
  byWeekday: z.record(z.string(), dayHoursSchema).optional(),
});

const ohScopeWindowSchema = z.object({
  abertura: z.string().min(1),
  fechamento: z.string().min(1),
  dias_semana: z.array(z.number().int().min(0).max(6)),
});

const ohScopeRuleSchema = z.object({
  scope_type: z.enum(["global", "publico", "centro_custo", "cargo"]),
  target_value: z.string(),
  operating_hours: ohScopeWindowSchema,
});

const prefsSchema = z
  .object({
    includeScheduleSuggestions: z.boolean().optional(),
    includeApdataHierarchySeed: z.boolean().optional(),
  })
  .optional();

/** Loose payroll row — fill defaults; strip PII. */
const payrollRowSchema = z.record(z.string(), z.unknown());

const aggregateSchema = z.record(z.string(), z.unknown());

export const simulateBodySchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    scenarioId: z.enum(SCENARIO_IDS),
    sector: z.string().min(1),
    sectorLabel: z.string().optional(),
    sectorBufferPct: z.number().optional(),
    headcount: z.number().optional(),
    currentScale: z.string().min(1),
    averageMonthlySalary: z.number().optional(),
    units: z.number().optional(),
    shiftsPerDay: z.number().optional(),
    operatingHours: operatingHoursSchema.optional(),
    /** Segmented OH rules (Etapa 1 DTO). Omit → global operatingHours only. */
    ohScopeRules: z.array(ohScopeRuleSchema).optional(),
    defaultRegimeFuncionamento: z.string().optional(),
    regimeFuncionamentoByCc: z.record(z.string(), z.string()).optional(),
    defaultTaxRegime: z.string().optional(),
    taxRegimeByCnpj: z.record(z.string(), z.string()).optional(),
    estrategiaAbsorcao: z.string().optional(),
    payrollRows: z.array(payrollRowSchema).optional(),
    /** Extractor aggregates — mapped server-side when payrollRows omitted. */
    aggregates: z.array(aggregateSchema).optional(),
    prefs: prefsSchema,
  })
  .refine(
    (b) =>
      (b.payrollRows != null && b.payrollRows.length > 0) ||
      (b.aggregates != null && b.aggregates.length > 0) ||
      (b.headcount != null && b.headcount > 0),
    {
      message:
        "Provide payrollRows, aggregates, or headcount > 0 for wizard-only simulate",
    },
  );

export type SimulateBody = z.infer<typeof simulateBodySchema>;

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Normalize a client PayrollRow-like object; always clear nome (LGPD). */
export function normalizePayrollRow(
  raw: Record<string, unknown>,
  index: number,
): PayrollRow {
  const extras = emptyPayrollExtras();
  const qty = Math.max(1, asNumber(raw.quantidade, 1));
  return {
    cargo: String(raw.cargo ?? "NAO_INFORMADO").trim() || "NAO_INFORMADO",
    salario: asNumber(raw.salario, 0),
    cargaHorariaMensal: asNumber(raw.cargaHorariaMensal, 220),
    cargaHorariaSemanal: asNumber(raw.cargaHorariaSemanal, 44),
    centroCusto: String(raw.centroCusto ?? "SEM_CC").trim() || "SEM_CC",
    vrValorDia: asNullableNumber(raw.vrValorDia),
    vrDiasMesAtual: asNullableNumber(raw.vrDiasMesAtual),
    vtValorDia: asNullableNumber(raw.vtValorDia),
    vtDiasMesAtual: asNullableNumber(raw.vtDiasMesAtual),
    nome: null,
    quantidade: qty,
    escalaAtual: asNullableString(raw.escalaAtual),
    sourceLine: asNumber(raw.sourceLine, index + 2),
    ...extras,
    codEmpresa: asNullableString(raw.codEmpresa) ?? extras.codEmpresa,
    codFilial: asNullableString(raw.codFilial) ?? extras.codFilial,
    cnpjCompleto: asNullableString(raw.cnpjCompleto) ?? extras.cnpjCompleto,
    codCc: asNullableString(raw.codCc) ?? extras.codCc,
    descCc: asNullableString(raw.descCc) ?? extras.descCc,
    codCargo: asNullableString(raw.codCargo) ?? extras.codCargo,
    descCargo: asNullableString(raw.descCargo) ?? extras.descCargo,
    codVinculo: asNullableString(raw.codVinculo) ?? extras.codVinculo,
    codHorarioAtual:
      asNullableString(raw.codHorarioAtual) ?? extras.codHorarioAtual,
    horarioTrabalhoAtual:
      asNullableString(raw.horarioTrabalhoAtual) ?? extras.horarioTrabalhoAtual,
    heMediaMensalHoras: asNumber(raw.heMediaMensalHoras, 0),
    regimeFuncionamento:
      typeof raw.regimeFuncionamento === "string" &&
      isRegimeFuncionamento(raw.regimeFuncionamento)
        ? raw.regimeFuncionamento
        : extras.regimeFuncionamento,
    massaSalarialBase: asNullableNumber(raw.massaSalarialBase),
    modoDiasVr:
      raw.modoDiasVr === "ESCALA" ||
      raw.modoDiasVr === "FIXO_MES" ||
      raw.modoDiasVr === "CALENDARIO_LOCAL"
        ? raw.modoDiasVr
        : extras.modoDiasVr,
    modoDiasVt:
      raw.modoDiasVt === "ESCALA" ||
      raw.modoDiasVt === "FIXO_MES" ||
      raw.modoDiasVt === "CALENDARIO_LOCAL"
        ? raw.modoDiasVt
        : extras.modoDiasVt,
    diasBaseMesVr: asNullableNumber(raw.diasBaseMesVr),
    diasBaseMesVt: asNullableNumber(raw.diasBaseMesVt),
    vaValorDia: asNullableNumber(raw.vaValorDia),
    vaValorMes: asNullableNumber(raw.vaValorMes),
    vaModoValor:
      raw.vaModoValor === "DIA" || raw.vaModoValor === "MES"
        ? raw.vaModoValor
        : extras.vaModoValor,
    assistMedicaMes: asNullableNumber(raw.assistMedicaMes),
    assistOdontoMes: asNullableNumber(raw.assistOdontoMes),
    benefits: Array.isArray(raw.benefits)
      ? (raw.benefits as PayrollRow["benefits"])
      : [],
  };
}

function resolveTax(raw: string | undefined) {
  if (raw && isTaxRegime(raw)) return raw;
  return DEFAULT_TAX_REGIME;
}

function resolveAbsorcao(raw: string | undefined) {
  if (raw && isEstrategiaAbsorcao(raw)) return raw;
  return DEFAULT_ESTRATEGIA_ABSORCAO;
}

function resolveRegime(raw: string | undefined) {
  if (raw && isRegimeFuncionamento(raw)) return raw;
  return DEFAULT_REGIME_FUNCIONAMENTO;
}

export type PreparedSimulate = {
  input: SimulationInput;
  prefs: {
    includeScheduleSuggestions: boolean;
    includeApdataHierarchySeed: boolean;
  };
  mapLatencyMs: number;
  rowCount: number;
  centerCount: number;
};

export function prepareSimulateInput(body: SimulateBody): PreparedSimulate {
  const mapStarted = Date.now();
  let payrollRows: PayrollRow[] | undefined;

  if (body.payrollRows && body.payrollRows.length > 0) {
    if (body.payrollRows.length > MAX_SIMULATE_ROWS) {
      throw new Error(
        `Too many payrollRows (max ${MAX_SIMULATE_ROWS} aggregated lines)`,
      );
    }
    payrollRows = body.payrollRows.map((r, i) =>
      normalizePayrollRow(r as Record<string, unknown>, i),
    );
  } else if (body.aggregates && body.aggregates.length > 0) {
    if (body.aggregates.length > MAX_SIMULATE_ROWS) {
      throw new Error(
        `Too many aggregates (max ${MAX_SIMULATE_ROWS} aggregated lines)`,
      );
    }
    payrollRows = mapExtractorAggregatesToPayroll(
      body.aggregates as ExtractorAggregate[],
    );
  }

  const mapLatencyMs = Date.now() - mapStarted;
  const headcount =
    body.headcount ??
    payrollRows?.reduce((s, r) => s + r.quantidade, 0) ??
    1;
  const averageMonthlySalary = body.averageMonthlySalary ?? 2200;

  const taxRegimeByCnpj: Record<string, ReturnType<typeof resolveTax>> = {};
  if (body.taxRegimeByCnpj) {
    for (const [k, v] of Object.entries(body.taxRegimeByCnpj)) {
      if (isTaxRegime(v)) taxRegimeByCnpj[k] = v;
    }
  }
  const regimeFuncionamentoByCc: Record<
    string,
    ReturnType<typeof resolveRegime>
  > = {};
  if (body.regimeFuncionamentoByCc) {
    for (const [k, v] of Object.entries(body.regimeFuncionamentoByCc)) {
      if (isRegimeFuncionamento(v)) regimeFuncionamentoByCc[k] = v;
    }
  }

  const operatingHours = (body.operatingHours ??
    DEFAULT_OPERATING_HOURS) as OperatingHours;
  const ohScopeRules = prepareOHScopeRulesForInput(
    body.ohScopeRules,
    operatingHours,
  );

  const input: SimulationInput = {
    sector: body.sector,
    sectorLabel: body.sectorLabel?.trim() || undefined,
    sectorBufferPct: body.sectorBufferPct,
    headcount: headcount > 0 ? headcount : 1,
    currentScale: body.currentScale,
    averageMonthlySalary,
    units: body.units ?? 1,
    shiftsPerDay: body.shiftsPerDay ?? 2,
    scenarioId: body.scenarioId as ScenarioId,
    operatingHours,
    ohScopeRules,
    payrollRows,
    defaultTaxRegime: resolveTax(body.defaultTaxRegime),
    taxRegimeByCnpj:
      Object.keys(taxRegimeByCnpj).length > 0 ? taxRegimeByCnpj : undefined,
    estrategiaAbsorcao: resolveAbsorcao(body.estrategiaAbsorcao),
    defaultRegimeFuncionamento: resolveRegime(body.defaultRegimeFuncionamento),
    regimeFuncionamentoByCc:
      Object.keys(regimeFuncionamentoByCc).length > 0
        ? regimeFuncionamentoByCc
        : undefined,
  };

  const centers = new Set(
    (payrollRows ?? []).map((r) => r.centroCusto).filter(Boolean),
  );

  return {
    input,
    prefs: {
      includeScheduleSuggestions:
        body.prefs?.includeScheduleSuggestions !== false,
      includeApdataHierarchySeed:
        body.prefs?.includeApdataHierarchySeed === true,
    },
    mapLatencyMs,
    rowCount: payrollRows?.length ?? 0,
    centerCount: centers.size,
  };
}
