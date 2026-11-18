/**
 * Pure index/lookup for Apdata Sindicatos (SIN_*) + QuantidadesHorasMes (HMV_*)
 * associated to a Contratado via CON_CdiSindicato / CON_CdiQuantidadeHoraMes.
 * Used by modular Conexão Direta export and Etapa 5 fixture tests.
 */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export type SindicatoInfo = { nome: string; cnpj: string }
export type HmvInfo = { mensal: number | null; semanal: number | null }

export type ResolvedSindicatoHmv = {
  codSindicato: string | null
  nomeSindicato: string | null
  cnpjSindicato: string | null
  cargaMensal: number
  cargaSemanal: number
}

/** Index Sindicatos rows by SIN_CdiSindicato. */
export function indexSindicatoRows(
  rows: Record<string, unknown>[],
): Map<number, SindicatoInfo> {
  const byId = new Map<number, SindicatoInfo>()
  for (const r of rows) {
    const id = num(r.SIN_CdiSindicato)
    if (id === null) continue
    byId.set(id, {
      nome: str(r.SIN_D1sNome) || 'SEM_SINDICATO',
      cnpj: str(r.SIN_NusCNPJ),
    })
  }
  return byId
}

/** Index QuantidadesHorasMes rows by HMV_CdiQuantidadeHoraMes. */
export function indexHmvRows(
  rows: Record<string, unknown>[],
): Map<number, HmvInfo> {
  const byId = new Map<number, HmvInfo>()
  for (const r of rows) {
    const id = num(r.HMV_CdiQuantidadeHoraMes)
    if (id === null) continue
    byId.set(id, {
      mensal: num(r.HMV_QtnQuantidadeHoraMes),
      semanal: num(r.HMV_QtnHorasSemanal),
    })
  }
  return byId
}

/**
 * Resolve sindicato + Horas Base for one Contratado using FK ids.
 * Defaults: carga mensal 220 / semanal 44 when HMV missing.
 */
export function resolveSindicatoHmvForContratado(
  opts: {
    conCdiSindicato: number | null
    conCdiQuantidadeHoraMes: number | null
  },
  sindicatoById: Map<number, SindicatoInfo>,
  hmvById: Map<number, HmvInfo>,
): ResolvedSindicatoHmv {
  const sindicatoId = opts.conCdiSindicato
  const hmvId = opts.conCdiQuantidadeHoraMes
  const hasSindicato = sindicatoId != null && sindicatoId > 0
  const sin = hasSindicato ? sindicatoById.get(sindicatoId) : undefined
  const hmv = hmvId !== null ? hmvById.get(hmvId) : undefined
  const codSindicato = hasSindicato ? String(sindicatoId) : null
  return {
    codSindicato,
    nomeSindicato: sin?.nome ?? (codSindicato ? 'SEM_SINDICATO' : null),
    cnpjSindicato: sin?.cnpj || null,
    cargaMensal: hmv?.mensal ?? 220,
    cargaSemanal: hmv?.semanal ?? 44,
  }
}
