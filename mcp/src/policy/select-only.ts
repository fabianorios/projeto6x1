/**
 * SELECT-only SQL policy stub.
 * Defense in depth: also use a read-only DB account.
 */

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|REPLACE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|INTO\s+#|xp_|sp_)\b/i;

const SELECT_START = /^\s*(WITH\b[\s\S]+?\bSELECT\b|SELECT\b)/i;

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

/** Table allowlist stub — expand when wiring real Apdata reads. */
export const DEFAULT_TABLE_ALLOWLIST = [
  "Contratados",
  "Cargos",
  "CentrosCustos",
  "Folhas",
  "Horarios",
  "HorariosJornadas",
  "Jornadas",
  "TiposDiasPonto",
  "QuantidadesHorasMes",
  "HorariosTiposDiasAT",
  "TiposEscalas",
  "TiposEscalasTrabalhos",
] as const;
