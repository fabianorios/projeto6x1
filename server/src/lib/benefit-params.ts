/**
 * Per-SqlProfile benefit type codes (Apdata TiposBeneficios).
 * Codes vary by client — never hardcode tipo 53 in runnable SQL.
 */

import type { SqlSlotId } from "./sql-profile-types.js";

export type VaModoValor = "DIA" | "MES";

export type BenefitParams = {
  /** Vale-refeição / VR — valor/dia. Factory default 53. */
  vrTipoBeneficio: number | null;
  /** Vale-alimentação / VA — dia or mês per vaModoValor. Factory default 52. */
  vaTipoBeneficio: number | null;
  /** Assistência médica titular — custo fixo/mês (HC). */
  assistenciaMedicaTipo: number | null;
  /** Assistência odontológica — custo fixo/mês (HC). */
  assistenciaOdontologicaTipo: number | null;
  /** How VA amounts are interpreted by the engine. */
  vaModoValor: VaModoValor;
  labels?: {
    vr?: string;
    va?: string;
    medica?: string;
    odontologica?: string;
  };
};

/** Factory / historical Apdata SaaS defaults (editable only on custom profiles). */
export const FACTORY_BENEFIT_PARAMS: BenefitParams = {
  vrTipoBeneficio: 53,
  vaTipoBeneficio: 52,
  assistenciaMedicaTipo: null,
  assistenciaOdontologicaTipo: null,
  vaModoValor: "MES",
  labels: {
    vr: "Vale-Refeição",
    va: "Vale-Alimentação",
    medica: "Assistência médica titular",
    odontologica: "Assistência odontológica",
  },
};

export function defaultBenefitParams(): BenefitParams {
  return structuredClone(FACTORY_BENEFIT_PARAMS);
}

function parseTipo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function normalizeBenefitParams(
  raw: unknown | undefined | null,
): BenefitParams {
  const base = defaultBenefitParams();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const modo = o.vaModoValor === "DIA" || o.vaModoValor === "MES"
    ? o.vaModoValor
    : base.vaModoValor;
  const labelsRaw =
    o.labels && typeof o.labels === "object"
      ? (o.labels as Record<string, unknown>)
      : undefined;
  return {
    vrTipoBeneficio:
      "vrTipoBeneficio" in o ? parseTipo(o.vrTipoBeneficio) : base.vrTipoBeneficio,
    vaTipoBeneficio:
      "vaTipoBeneficio" in o ? parseTipo(o.vaTipoBeneficio) : base.vaTipoBeneficio,
    assistenciaMedicaTipo:
      "assistenciaMedicaTipo" in o
        ? parseTipo(o.assistenciaMedicaTipo)
        : base.assistenciaMedicaTipo,
    assistenciaOdontologicaTipo:
      "assistenciaOdontologicaTipo" in o
        ? parseTipo(o.assistenciaOdontologicaTipo)
        : base.assistenciaOdontologicaTipo,
    vaModoValor: modo,
    labels: {
      vr: labelsRaw?.vr != null ? String(labelsRaw.vr) : base.labels?.vr,
      va: labelsRaw?.va != null ? String(labelsRaw.va) : base.labels?.va,
      medica:
        labelsRaw?.medica != null
          ? String(labelsRaw.medica)
          : base.labels?.medica,
      odontologica:
        labelsRaw?.odontologica != null
          ? String(labelsRaw.odontologica)
          : base.labels?.odontologica,
    },
  };
}

export type SqlDialectLite = "mssql" | "oracle";

/**
 * Bind map for a Studio slot (parameterized — no string concat of tipo).
 * Returns null tipo keys when unset so callers can skip / warn.
 */
export function bindParamsForSlot(
  slot: SqlSlotId,
  dialect: SqlDialectLite,
  params: BenefitParams,
): { params: Record<string, number>; missing: string[] } {
  const out: Record<string, number> = {};
  const missing: string[] = [];
  const ph = (name: string) => (dialect === "oracle" ? name : name);

  if (slot === "REGRA_VR") {
    if (params.vrTipoBeneficio == null) missing.push("vrTipoBeneficio");
    else out[ph("tipo")] = params.vrTipoBeneficio;
  } else if (slot === "REGRA_VA") {
    if (params.vaTipoBeneficio == null) missing.push("vaTipoBeneficio");
    else out[ph("tipo")] = params.vaTipoBeneficio;
  } else if (slot === "REGRA_FIXOS") {
    if (params.assistenciaMedicaTipo == null) {
      missing.push("assistenciaMedicaTipo");
    } else {
      out[ph("tipoMedica")] = params.assistenciaMedicaTipo;
    }
    if (params.assistenciaOdontologicaTipo == null) {
      missing.push("assistenciaOdontologicaTipo");
    } else {
      out[ph("tipoOdonto")] = params.assistenciaOdontologicaTipo;
    }
  }
  return { params: out, missing };
}

/**
 * Extractor / Aptools binds for VR (and optional VA) tipo codes.
 * Null tipos are omitted — SQL uses optional filters via sentinel -1 skip.
 */
export function bindParamsForExtractor(
  dialect: SqlDialectLite,
  params: BenefitParams,
): Record<string, number> {
  const out: Record<string, number> = {};
  // Sentinel -1 → CTE matches nothing (skip benefit) without dynamic SQL.
  out.tipoVr = params.vrTipoBeneficio ?? -1;
  out.tipoVa = params.vaTipoBeneficio ?? -1;
  out.tipoMedica = params.assistenciaMedicaTipo ?? -1;
  out.tipoOdonto = params.assistenciaOdontologicaTipo ?? -1;
  void dialect;
  return out;
}

/** UI / notes: which benefits are skipped because tipo is null. */
export function skippedBenefitNotes(params: BenefitParams): string[] {
  const notes: string[] = [];
  if (params.vrTipoBeneficio == null) {
    notes.push("VR: tipo não cadastrado — benefício ignorado.");
  }
  if (params.vaTipoBeneficio == null) {
    notes.push("VA: tipo não cadastrado — benefício ignorado.");
  }
  if (params.assistenciaMedicaTipo == null) {
    notes.push("Assistência médica: tipo não cadastrado — ignorada no HC.");
  }
  if (params.assistenciaOdontologicaTipo == null) {
    notes.push("Assistência odontológica: tipo não cadastrado — ignorada no HC.");
  }
  return notes;
}

/**
 * Placeholder token as it appears in SQL templates.
 * MSSQL: @tipo / Oracle: :tipo
 */
export function tipoPlaceholder(
  dialect: SqlDialectLite,
  name: string = "tipo",
): string {
  return dialect === "oracle" ? `:${name}` : `@${name}`;
}
