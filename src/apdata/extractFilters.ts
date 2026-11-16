/**
 * Premissas / extract filters: Situações (PX-99) + Vínculos (PX-100).
 *
 * Situação default: exclude 0,2,3,99 (demitidos / placeholder / soft-delete).
 * "Incluir afastados" (default on): keeps other SIT_OplAfastamento=1 codes.
 * When off: also exclude codes with SIT_OplAfastamento=1 (demitidos already out).
 *
 * Vínculo: filter by governmental category + labor regime on Vinculos —
 *   VIN_CdiCategTrabeSoc → CategsTrabseSoc (SDK_OplVinculoEmpregaticio)
 *   VIN_CdiTipoRegimeTrabalhista → TiposRegimesTrabalhistas (default CLT=1)
 */

/** Default excluded situations (historical extract behavior). */
export const DEFAULT_EXCLUDED_SITUACOES = [0, 2, 3, 99] as const

/** eSocial TipoRegimeTrabalhista: 1 = CLT. */
export const DEFAULT_TIPO_REGIME_TRABALHISTA_IDS = [1] as const

export const MAX_FILTER_IDS = 64

export type SituacaoCatalogRow = {
  code: number
  label: string
  oplAfastamento: boolean
  oplRemuneracao?: boolean
  oplDesativado?: boolean
}

export type CategTrabeSocCatalogRow = {
  code: number
  label: string
  cos?: string
  oplVinculoEmpregaticio: boolean
}

export type TipoRegimeTrabalhistaCatalogRow = {
  code: number
  label: string
  cos?: string
}

export type ExtractFilterOptions = {
  /** Situações to exclude (NOT IN). Default [0,2,3,99]. */
  excludeSituacoes?: number[]
  /**
   * When false, also exclude Situacoes with SIT_OplAfastamento=1
   * (beyond the explicit exclude list). Default true.
   */
  incluirAfastados?: boolean
  /**
   * Selected TiposRegimesTrabalhistas codes (VIN_CdiTipoRegimeTrabalhista).
   * Default [1] (CLT). Empty = no regime filter (all regimes).
   */
  tipoRegimeTrabalhistaIds?: number[]
  /**
   * Selected CategsTrabseSoc codes (VIN_CdiCategTrabeSoc).
   * Default: empregatícios from catalog, or SQL flag when empty+empregaticiosOnly.
   */
  categTrabeSocIds?: number[]
  /**
   * When true and categTrabeSocIds is empty/undefined, SQL joins
   * CategsTrabseSoc with SDK_OplVinculoEmpregaticio=1.
   * Default true.
   */
  somenteEmpregaticios?: boolean
}

export type ResolvedExtractFilters = {
  excludeSituacoes: number[]
  incluirAfastados: boolean
  tipoRegimeTrabalhistaIds: number[]
  categTrabeSocIds: number[]
  /** Use SDK_OplVinculoEmpregaticio=1 join when no explicit category ids. */
  empregaticiosByFlag: boolean
  somenteEmpregaticios: boolean
}

function uniqFiniteInts(values: number[] | undefined, max = MAX_FILTER_IDS): number[] {
  if (!values?.length) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    const n = Math.trunc(Number(v))
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

export function resolveExtractFilters(
  opts: ExtractFilterOptions = {},
): ResolvedExtractFilters {
  const excludeSituacoes =
    opts.excludeSituacoes != null
      ? uniqFiniteInts(opts.excludeSituacoes)
      : [...DEFAULT_EXCLUDED_SITUACOES]
  const incluirAfastados = opts.incluirAfastados !== false
  const somenteEmpregaticios = opts.somenteEmpregaticios !== false
  const tipoRegimeTrabalhistaIds =
    opts.tipoRegimeTrabalhistaIds != null
      ? uniqFiniteInts(opts.tipoRegimeTrabalhistaIds)
      : [...DEFAULT_TIPO_REGIME_TRABALHISTA_IDS]
  const categTrabeSocIds = uniqFiniteInts(opts.categTrabeSocIds)
  const empregaticiosByFlag =
    somenteEmpregaticios && categTrabeSocIds.length === 0
  return {
    excludeSituacoes,
    incluirAfastados,
    tipoRegimeTrabalhistaIds,
    categTrabeSocIds,
    empregaticiosByFlag,
    somenteEmpregaticios,
  }
}

/** Default category selection from catalog (empregatícios only). */
export function defaultCategTrabeSocIds(
  catalog: CategTrabeSocCatalogRow[],
): number[] {
  return catalog
    .filter((r) => r.oplVinculoEmpregaticio && Number.isFinite(r.code))
    .map((r) => r.code)
}

export function isIncludedSituacao(
  sit: number | null | undefined,
  opts: {
    excludeSituacoes?: number[]
    incluirAfastados?: boolean
    /** When incluirAfastados=false, codes with OplAfastamento=1 (from catalog). */
    afastamentoCodes?: number[]
  } = {},
): boolean {
  if (sit === null || sit === undefined || !Number.isFinite(sit)) return false
  const excluded = new Set(
    opts.excludeSituacoes ?? [...DEFAULT_EXCLUDED_SITUACOES],
  )
  if (excluded.has(sit)) return false
  if (opts.incluirAfastados === false && opts.afastamentoCodes?.length) {
    if (opts.afastamentoCodes.includes(sit)) return false
  }
  return true
}

/**
 * Literal SQL fragments for Aptools paste (integer lists only — no string concat of user text).
 * Placeholders consumed by extractor builders:
 *   __SITUACAO_PREDICATE__  — full AND/WHERE predicate on alias `c`
 *   __VINCULO_JOINS__       — JOIN Vinculos [+ Categs…] after Contratados alias `c`
 *   __VINCULO_PREDICATE__   — AND … on `v` / `cts`
 */
export function buildSituacaoSqlPredicate(
  resolved: ResolvedExtractFilters,
  dialect: 'mssql' | 'oracle',
): string {
  const isnull = dialect === 'oracle' ? 'NVL' : 'ISNULL'
  const excl = resolved.excludeSituacoes.length
    ? resolved.excludeSituacoes.join(', ')
    : [...DEFAULT_EXCLUDED_SITUACOES].join(', ')
  let sql = `c.CON_CdiSituacao NOT IN (${excl})`
  if (!resolved.incluirAfastados) {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM Situacoes s_af
      WHERE s_af.SIT_CdiSituacao = c.CON_CdiSituacao
        AND ${isnull}(s_af.SIT_OplAfastamento, 0) = 1
    )`
  }
  return sql
}

export function buildVinculoSqlJoins(
  resolved: ResolvedExtractFilters,
  dialect: 'mssql' | 'oracle',
): string {
  const isnull = dialect === 'oracle' ? 'NVL' : 'ISNULL'
  const parts = [
    'INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo',
  ]
  if (resolved.empregaticiosByFlag) {
    parts.push(
      `INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND ${isnull}(cts.SDK_OplVinculoEmpregaticio, 0) = 1`,
    )
  }
  return parts.join('\n')
}

export function buildVinculoSqlPredicate(
  resolved: ResolvedExtractFilters,
): string {
  const parts: string[] = []
  if (resolved.tipoRegimeTrabalhistaIds.length > 0) {
    parts.push(
      `v.VIN_CdiTipoRegimeTrabalhista IN (${resolved.tipoRegimeTrabalhistaIds.join(', ')})`,
    )
  }
  if (resolved.categTrabeSocIds.length > 0) {
    parts.push(
      `v.VIN_CdiCategTrabeSoc IN (${resolved.categTrabeSocIds.join(', ')})`,
    )
  }
  return parts.length ? parts.join(' AND ') : '1=1'
}

/** Helper text for Premissas UI (PT). */
export const SITUACAO_FILTER_HELP =
  'Padrão: exclui 0 (Nenhuma), 2/3 (demitidos) e 99 (excluído lógico). ' +
  '“Incluir afastados” ligado mantém licenças/afastamentos (SIT_OplAfastamento=1 além de 0/2/3/99). ' +
  'Desligado: exclui também essas situações — demitidos já ficam de fora pela lista padrão.'

export const VINCULO_FILTER_HELP =
  'Filtro por categoria eSocial (VIN_CdiCategTrabeSoc) e regime trabalhista (VIN_CdiTipoRegimeTrabalhista). ' +
  'Padrão: regime CLT (1) e categorias com vínculo empregatício (SDK_OplVinculoEmpregaticio=1). ' +
  'Estagiário / autônomo / não empregatícios ficam de fora até serem marcados.'
