/**
 * Extract filter resolution (parity with src/apdata/extractFilters.ts).
 * Situação NOT IN + optional afastados; vínculo via regime + categoria eSocial.
 */

export const DEFAULT_EXCLUDED_SITUACOES = [0, 2, 3, 99] as const;
export const DEFAULT_TIPO_REGIME_TRABALHISTA_IDS = [1] as const;
export const MAX_FILTER_IDS = 64;

export type ExtractFilterOptions = {
  excludeSituacoes?: number[];
  incluirAfastados?: boolean;
  tipoRegimeTrabalhistaIds?: number[];
  categTrabeSocIds?: number[];
  somenteEmpregaticios?: boolean;
};

export type ResolvedExtractFilters = {
  excludeSituacoes: number[];
  incluirAfastados: boolean;
  tipoRegimeTrabalhistaIds: number[];
  categTrabeSocIds: number[];
  empregaticiosByFlag: boolean;
  somenteEmpregaticios: boolean;
};

function uniqFiniteInts(
  values: number[] | undefined,
  max = MAX_FILTER_IDS,
): number[] {
  if (!values?.length) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const n = Math.trunc(Number(v));
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

export function resolveExtractFilters(
  opts: ExtractFilterOptions = {},
): ResolvedExtractFilters {
  const excludeSituacoes =
    opts.excludeSituacoes != null
      ? uniqFiniteInts(opts.excludeSituacoes)
      : [...DEFAULT_EXCLUDED_SITUACOES];
  const incluirAfastados = opts.incluirAfastados !== false;
  const somenteEmpregaticios = opts.somenteEmpregaticios !== false;
  const tipoRegimeTrabalhistaIds =
    opts.tipoRegimeTrabalhistaIds != null
      ? uniqFiniteInts(opts.tipoRegimeTrabalhistaIds)
      : [...DEFAULT_TIPO_REGIME_TRABALHISTA_IDS];
  const categTrabeSocIds = uniqFiniteInts(opts.categTrabeSocIds);
  const empregaticiosByFlag =
    somenteEmpregaticios && categTrabeSocIds.length === 0;
  return {
    excludeSituacoes,
    incluirAfastados,
    tipoRegimeTrabalhistaIds,
    categTrabeSocIds,
    empregaticiosByFlag,
    somenteEmpregaticios,
  };
}

export function buildSituacaoSqlPredicate(
  resolved: ResolvedExtractFilters,
  dialect: "mssql" | "oracle",
): string {
  const isnull = dialect === "oracle" ? "NVL" : "ISNULL";
  const excl = resolved.excludeSituacoes.length
    ? resolved.excludeSituacoes.join(", ")
    : [...DEFAULT_EXCLUDED_SITUACOES].join(", ");
  let sql = `c.CON_CdiSituacao NOT IN (${excl})`;
  if (!resolved.incluirAfastados) {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM Situacoes s_af
      WHERE s_af.SIT_CdiSituacao = c.CON_CdiSituacao
        AND ${isnull}(s_af.SIT_OplAfastamento, 0) = 1
    )`;
  }
  return sql;
}

export function buildVinculoSqlJoins(
  resolved: ResolvedExtractFilters,
  dialect: "mssql" | "oracle",
): string {
  const isnull = dialect === "oracle" ? "NVL" : "ISNULL";
  const parts = [
    "INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo",
  ];
  if (resolved.empregaticiosByFlag) {
    parts.push(
      `INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND ${isnull}(cts.SDK_OplVinculoEmpregaticio, 0) = 1`,
    );
  }
  return parts.join("\n");
}

export function buildVinculoSqlPredicate(
  resolved: ResolvedExtractFilters,
): string {
  const parts: string[] = [];
  if (resolved.tipoRegimeTrabalhistaIds.length > 0) {
    parts.push(
      `v.VIN_CdiTipoRegimeTrabalhista IN (${resolved.tipoRegimeTrabalhistaIds.join(", ")})`,
    );
  }
  if (resolved.categTrabeSocIds.length > 0) {
    parts.push(
      `v.VIN_CdiCategTrabeSoc IN (${resolved.categTrabeSocIds.join(", ")})`,
    );
  }
  return parts.length ? parts.join(" AND ") : "1=1";
}
