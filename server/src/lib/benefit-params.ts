/**
 * Per-SqlProfile benefit type codes (Apdata TiposBeneficios).
 * Codes vary by client — never hardcode tipo 53 in runnable SQL.
 * Primary code binds @tipo / :tipo; extras map beneficios_agg → slot.
 */

import type { SqlSlotId } from "./sql-profile-types.js";

export type VaModoValor = "DIA" | "MES";

export type BenefitSlotId = "vr" | "va" | "medica" | "odonto";

export type BenefitParams = {
  /** Vale-refeição / VR — primary code for SQL @tipo. Factory default 53. */
  vrTipoBeneficio: number | null;
  /** Vale-alimentação / VA — primary for SQL. Factory default 52. */
  vaTipoBeneficio: number | null;
  /** Assistência médica titular — primary for @tipoMedica. */
  assistenciaMedicaTipo: number | null;
  /** Assistência odontológica — primary for @tipoOdonto. */
  assistenciaOdontologicaTipo: number | null;
  /** Extra Apdata codes that also fold into each slot (beneficios_agg). */
  vrTiposExtras: number[];
  vaTiposExtras: number[];
  medicaTiposExtras: number[];
  odontoTiposExtras: number[];
  /** How VA amounts are interpreted by the engine. */
  vaModoValor: VaModoValor;
  /** Optional default amounts persisted on the profile (consultant seed). */
  vrValorDiaPadrao: number | null;
  vaValorMesPadrao: number | null;
  assistenciaMedicaValorMes: number | null;
  assistenciaOdontologicaValorMes: number | null;
  labels?: {
    vr?: string;
    va?: string;
    medica?: string;
    odontologica?: string;
  };
};

/** Factory / historical Apdata SaaS defaults (SQL still locked; tipos editable via duplicate-on-save). */
export const FACTORY_BENEFIT_PARAMS: BenefitParams = {
  vrTipoBeneficio: 53,
  vaTipoBeneficio: 52,
  assistenciaMedicaTipo: null,
  assistenciaOdontologicaTipo: null,
  vrTiposExtras: [],
  vaTiposExtras: [],
  medicaTiposExtras: [],
  odontoTiposExtras: [],
  vaModoValor: "MES",
  vrValorDiaPadrao: null,
  vaValorMesPadrao: null,
  assistenciaMedicaValorMes: null,
  assistenciaOdontologicaValorMes: null,
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

function parseTipoList(v: unknown): number[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    const out: number[] = [];
    for (const item of v) {
      const n = parseTipo(item);
      if (n != null && !out.includes(n)) out.push(n);
    }
    return out;
  }
  if (typeof v === "string") return parseTipoCodeList(v);
  const single = parseTipo(v);
  return single != null ? [single] : [];
}

function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n =
    typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Parse "53, 80" / "53;80" into unique non-negative ints. */
export function parseTipoCodeList(raw: string): number[] {
  const out: number[] = [];
  for (const part of String(raw ?? "").split(/[,;\s]+/)) {
    const t = part.trim();
    if (!t) continue;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n) || n < 0) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function formatTipoCodeList(
  primary: number | null,
  extras: readonly number[] = [],
): string {
  const codes = [
    ...(primary != null ? [primary] : []),
    ...extras.filter((c) => c !== primary),
  ];
  return codes.join(", ");
}

export function splitTipoCodeList(codes: readonly number[]): {
  primary: number | null;
  extras: number[];
} {
  if (codes.length === 0) return { primary: null, extras: [] };
  const [primary, ...rest] = codes;
  return { primary: primary ?? null, extras: rest };
}

/** All Apdata codes mapped to a slot (primary first). */
export function allTiposForSlot(
  params: BenefitParams,
  slot: BenefitSlotId,
): number[] {
  if (slot === "vr") {
    return [
      ...(params.vrTipoBeneficio != null ? [params.vrTipoBeneficio] : []),
      ...params.vrTiposExtras.filter((c) => c !== params.vrTipoBeneficio),
    ];
  }
  if (slot === "va") {
    return [
      ...(params.vaTipoBeneficio != null ? [params.vaTipoBeneficio] : []),
      ...params.vaTiposExtras.filter((c) => c !== params.vaTipoBeneficio),
    ];
  }
  if (slot === "medica") {
    return [
      ...(params.assistenciaMedicaTipo != null
        ? [params.assistenciaMedicaTipo]
        : []),
      ...params.medicaTiposExtras.filter(
        (c) => c !== params.assistenciaMedicaTipo,
      ),
    ];
  }
  return [
    ...(params.assistenciaOdontologicaTipo != null
      ? [params.assistenciaOdontologicaTipo]
      : []),
    ...params.odontoTiposExtras.filter(
      (c) => c !== params.assistenciaOdontologicaTipo,
    ),
  ];
}

/** Which slot a benefit codigo maps to via profile params (null = use keywords). */
export function slotForBenefitCodigo(
  codigo: string | number,
  params: BenefitParams,
): BenefitSlotId | null {
  const n =
    typeof codigo === "number" ? codigo : Number.parseInt(String(codigo), 10);
  if (!Number.isFinite(n)) return null;
  for (const slot of ["vr", "va", "medica", "odonto"] as const) {
    if (allTiposForSlot(params, slot).includes(n)) return slot;
  }
  return null;
}

export function normalizeBenefitParams(
  raw: unknown | undefined | null,
): BenefitParams {
  const base = defaultBenefitParams();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const modo =
    o.vaModoValor === "DIA" || o.vaModoValor === "MES"
      ? o.vaModoValor
      : base.vaModoValor;
  const labelsRaw =
    o.labels && typeof o.labels === "object"
      ? (o.labels as Record<string, unknown>)
      : undefined;

  const vrPrimary =
    "vrTipoBeneficio" in o ? parseTipo(o.vrTipoBeneficio) : base.vrTipoBeneficio;
  const vaPrimary =
    "vaTipoBeneficio" in o ? parseTipo(o.vaTipoBeneficio) : base.vaTipoBeneficio;
  const medPrimary =
    "assistenciaMedicaTipo" in o
      ? parseTipo(o.assistenciaMedicaTipo)
      : base.assistenciaMedicaTipo;
  const odPrimary =
    "assistenciaOdontologicaTipo" in o
      ? parseTipo(o.assistenciaOdontologicaTipo)
      : base.assistenciaOdontologicaTipo;

  return {
    vrTipoBeneficio: vrPrimary,
    vaTipoBeneficio: vaPrimary,
    assistenciaMedicaTipo: medPrimary,
    assistenciaOdontologicaTipo: odPrimary,
    vrTiposExtras: parseTipoList(
      "vrTiposExtras" in o ? o.vrTiposExtras : base.vrTiposExtras,
    ).filter((c) => c !== vrPrimary),
    vaTiposExtras: parseTipoList(
      "vaTiposExtras" in o ? o.vaTiposExtras : base.vaTiposExtras,
    ).filter((c) => c !== vaPrimary),
    medicaTiposExtras: parseTipoList(
      "medicaTiposExtras" in o ? o.medicaTiposExtras : base.medicaTiposExtras,
    ).filter((c) => c !== medPrimary),
    odontoTiposExtras: parseTipoList(
      "odontoTiposExtras" in o ? o.odontoTiposExtras : base.odontoTiposExtras,
    ).filter((c) => c !== odPrimary),
    vaModoValor: modo,
    vrValorDiaPadrao:
      "vrValorDiaPadrao" in o
        ? parseAmount(o.vrValorDiaPadrao)
        : base.vrValorDiaPadrao,
    vaValorMesPadrao:
      "vaValorMesPadrao" in o
        ? parseAmount(o.vaValorMesPadrao)
        : base.vaValorMesPadrao,
    assistenciaMedicaValorMes:
      "assistenciaMedicaValorMes" in o
        ? parseAmount(o.assistenciaMedicaValorMes)
        : base.assistenciaMedicaValorMes,
    assistenciaOdontologicaValorMes:
      "assistenciaOdontologicaValorMes" in o
        ? parseAmount(o.assistenciaOdontologicaValorMes)
        : base.assistenciaOdontologicaValorMes,
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
    notes.push(
      "Assistência odontológica: tipo não cadastrado — ignorada no HC.",
    );
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
