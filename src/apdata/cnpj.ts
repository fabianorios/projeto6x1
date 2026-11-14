/**
 * CNPJ establishment helpers (Apdata Empresas × Locais).
 *
 * Join path:
 *   Contratados.CON_CdiFolha → Folhas.FOL_CdiFolha
 *   Folhas.FOL_CdiLocal → Locais.LOC_CdiLocal
 *   Locais.LOC_CdiEmpresa → Empresas.EMP_CdiEmpresa
 *   CNPJ = Empresas.EMP_NusCNPJPrefixo + Locais.LOC_NusCNPJSufixo
 *
 * UI labels (admin runtime OK — LGPD):
 *   Empresas.EMP_DssEmpresa  → razão social
 *   Locais.LOC_D1sLocal      → nome da filial
 *   Display: `Razão · Filial · CNPJ formatado`
 *
 * Do not hardcode real client names in git / fixtures / docs.
 */

/** Situações excluídas do headcount / export (user rule). */
export const EXCLUDED_SITUACOES = [0, 2, 3, 99] as const

export type ExcludedSituacao = (typeof EXCLUDED_SITUACOES)[number]

export function isIncludedSituacao(sit: number | null | undefined): boolean {
  if (sit === null || sit === undefined || !Number.isFinite(sit)) return false
  return !(EXCLUDED_SITUACOES as readonly number[]).includes(sit)
}

/** Strip punctuation / spaces → digits only. */
export function cnpjDigits(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).replace(/\D/g, '')
}

/**
 * Stable establishment key: 14 digits when possible (raiz 8 + filial 4 + DV 2).
 * Falls back to prefixDigits|suffixDigits when lengths differ from the mask.
 */
export function establishmentKey(
  prefixo: string | null | undefined,
  sufixo: string | null | undefined,
): string {
  const p = cnpjDigits(prefixo)
  const s = cnpjDigits(sufixo)
  if (!p && !s) return ''
  if (p.length === 8 && s.length === 6) return `${p}${s}`
  return `${p}|${s}`
}

/** Display XX.XXX.XXX/XXXX-NN when digits allow; else raw parts. */
export function formatCnpjDisplay(
  prefixo: string | null | undefined,
  sufixo: string | null | undefined,
): string {
  const p = cnpjDigits(prefixo)
  const s = cnpjDigits(sufixo)
  if (p.length === 8 && s.length === 6) {
    return `${p.slice(0, 2)}.${p.slice(2, 5)}.${p.slice(5, 8)}/${s.slice(0, 4)}-${s.slice(4)}`
  }
  const rawP = String(prefixo ?? '').trim()
  const rawS = String(sufixo ?? '').trim()
  if (rawP && rawS) return `${rawP}/${rawS}`
  return rawP || rawS || '(sem CNPJ)'
}

/**
 * Multi-select label: `Razão · Filial · CNPJ`.
 * Omits empty name parts; always ends with formatted CNPJ when resolvable.
 */
export function formatEstablishmentLabel(opts: {
  razaoSocial?: string | null
  nomeFilial?: string | null
  prefixo: string | null | undefined
  sufixo: string | null | undefined
}): string {
  const cnpj = formatCnpjDisplay(opts.prefixo, opts.sufixo)
  const parts: string[] = []
  const razao = (opts.razaoSocial ?? '').trim()
  const filial = (opts.nomeFilial ?? '').trim()
  if (razao) parts.push(razao)
  if (filial) parts.push(filial)
  parts.push(cnpj)
  return parts.join(' · ')
}

export type Establishment = {
  /** Stable key for multi-select (digits). */
  key: string
  localId: number
  empresaId: number
  /** Empresas.EMP_CdiRamoAtividadeEmpresa (0 when unset). */
  ramoId: number
  folhaIds: number[]
  prefixo: string
  sufixo: string
  razaoSocial: string
  nomeFilial: string
  /** `Razão · Filial · CNPJ` for UI. */
  label: string
}

export type EmpresaRow = {
  empresaId: number
  prefixo: string
  razaoSocial?: string | null
  ramoId?: number | null
}

export type LocalRow = {
  localId: number
  empresaId: number
  sufixo: string
  nomeFilial?: string | null
}

export type FolhaRow = {
  folhaId: number
  localId: number
}

/**
 * Build establishments present in Folhas (reachable via join).
 * One row per Local that has ≥1 Folha and a resolvable Empresa prefix.
 */
export function buildEstablishments(
  empresas: EmpresaRow[],
  locais: LocalRow[],
  folhas: FolhaRow[],
): Establishment[] {
  const empById = new Map<number, EmpresaRow>()
  for (const e of empresas) {
    if (!Number.isFinite(e.empresaId)) continue
    empById.set(e.empresaId, e)
  }

  const folhasByLocal = new Map<number, number[]>()
  for (const f of folhas) {
    if (!Number.isFinite(f.folhaId) || !Number.isFinite(f.localId)) continue
    const list = folhasByLocal.get(f.localId) ?? []
    list.push(f.folhaId)
    folhasByLocal.set(f.localId, list)
  }

  const out: Establishment[] = []
  for (const loc of locais) {
    if (!Number.isFinite(loc.localId) || !Number.isFinite(loc.empresaId)) continue
    const folhaIds = folhasByLocal.get(loc.localId)
    if (!folhaIds || folhaIds.length === 0) continue
    const emp = empById.get(loc.empresaId)
    if (!emp) continue
    const key = establishmentKey(emp.prefixo, loc.sufixo)
    if (!key) continue
    const razaoSocial = (emp.razaoSocial ?? '').trim()
    const nomeFilial = (loc.nomeFilial ?? '').trim()
    const ramoId =
      emp.ramoId != null && Number.isFinite(emp.ramoId) ? Number(emp.ramoId) : 0
    out.push({
      key,
      localId: loc.localId,
      empresaId: loc.empresaId,
      ramoId,
      folhaIds: [...folhaIds],
      prefixo: emp.prefixo,
      sufixo: loc.sufixo,
      razaoSocial,
      nomeFilial,
      label: formatEstablishmentLabel({
        razaoSocial,
        nomeFilial,
        prefixo: emp.prefixo,
        sufixo: loc.sufixo,
      }),
    })
  }

  out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  return out
}

/** Map folhaId → establishment key for client-side Contratados filter. */
export function folhaToEstablishmentKey(
  establishments: Establishment[],
): Map<number, string> {
  const map = new Map<number, string>()
  for (const e of establishments) {
    for (const fid of e.folhaIds) {
      map.set(fid, e.key)
    }
  }
  return map
}
