/**
 * SELECT-only SQL policy.
 * Defense in depth: also use a read-only DB account.
 */

/** DML/DDL/EXEC denylist. `REPLACE INTO` (MySQL) — not SQL REPLACE() string fn. */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|REPLACE\s+INTO|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|INTO\s+#|xp_|sp_|OPENROWSET|OPENDATASOURCE|BULK\s+INSERT|DBCC|BACKUP|RESTORE|SHUTDOWN|KILL|WAITFOR|WRITETEXT|UPDATETEXT)\b/i;

const SELECT_START = /^\s*(WITH\b[\s\S]+?\bSELECT\b|SELECT\b)/i;

/** Identifiers: letters, digits, underscore; optional schema.table */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

export type PolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Reject anything that is not a single SELECT / WITH…SELECT statement. */
export function assertSelectOnly(sql: string): PolicyResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty SQL" };
  }
  if (trimmed.includes(";")) {
    return { ok: false, reason: "multiple statements / semicolons not allowed" };
  }
  if (!SELECT_START.test(trimmed)) {
    return { ok: false, reason: "must start with SELECT or WITH … SELECT" };
  }
  if (FORBIDDEN.test(trimmed)) {
    return { ok: false, reason: "forbidden keyword (DML/DDL/EXEC)" };
  }
  return { ok: true };
}

/**
 * Seeded from docs/apdata-6x1-feasibility.md (Controle de Frequência / contratados).
 * Related schedule/domain tables included for diagnostic JOINs.
 */
export const DEFAULT_TABLE_ALLOWLIST = [
  "Horarios",
  "HorariosJornadas",
  "Jornadas",
  "TiposDiasPonto",
  "Contratados",
  /** Canonical extractor uses Contratos (Apdata folha) */
  "Contratos",
  "CentrosCustos",
  "Cargos",
  "QuantidadesHorasMes",
  "Folhas",
  "Locais",
  "Empresas",
  /** Tipo de vínculo CLT etc. (CON_CdiVinculo → VIN_*) */
  "Vinculos",
  /** Ramos de atividade (EMP_CdiRamoAtividadeEmpresa → RAE_*) */
  "RamosAtividadesEmpresas",
  "HorariosTiposDiasAT",
  "TiposEscalas",
  "TiposEscalasTrabalhos",
  /** VT cadastro (passe/dia) — never ConCalculoATransportes */
  "ConATransportes",
  "MeiosTransportesItens",
  /** VR plano tipo 53 (extractor canônico) */
  "PlanosBeneficiosValores",
] as const;

export type AllowlistedTable = (typeof DEFAULT_TABLE_ALLOWLIST)[number];

const ALLOWLIST_SET = new Set<string>(
  DEFAULT_TABLE_ALLOWLIST.map((t) => t.toLowerCase()),
);

export function isAllowlistedTable(table: string): boolean {
  const bare = bareTableName(table);
  return ALLOWLIST_SET.has(bare.toLowerCase());
}

/** Strip optional schema prefix: dbo.Horarios → Horarios */
export function bareTableName(table: string): string {
  const parts = table.trim().split(".");
  return parts[parts.length - 1] ?? table;
}

export function assertAllowlistedTable(table: string): PolicyResult {
  if (!IDENTIFIER.test(table.trim())) {
    return { ok: false, reason: `invalid table identifier: ${table}` };
  }
  if (!isAllowlistedTable(table)) {
    return {
      ok: false,
      reason: `table not in allowlist: ${bareTableName(table)}`,
    };
  }
  return { ok: true };
}

export function assertSafeIdentifier(
  name: string,
  kind = "identifier",
): PolicyResult {
  if (!IDENTIFIER.test(name.trim())) {
    return { ok: false, reason: `invalid ${kind}: ${name}` };
  }
  return { ok: true };
}

/** Clamp requested row limit to [1, maxRows]. */
export function clampLimit(
  requested: number | undefined,
  maxRows: number,
): number {
  const fallback = Math.min(100, maxRows);
  if (requested === undefined || Number.isNaN(requested)) {
    return fallback;
  }
  const n = Math.floor(requested);
  if (n < 1) return 1;
  if (n > maxRows) return maxRows;
  return n;
}
