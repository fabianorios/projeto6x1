/**
 * Passo 5 — helpers for the Results “dossiê” (accordion + cadastral filters).
 */

import { cnpjDigits, formatCnpjDisplay } from '../apdata/cnpj'
import type { PayrollRow } from '../engine/payroll'
import type { CostCenterResult } from '../engine/types'

export type DossierSectionId = 'executivo' | 'operacional' | 'cadastral'

export type DossierOpenState = Record<DossierSectionId, boolean>

export const DEFAULT_DOSSIER_OPEN: DossierOpenState = {
  executivo: true,
  operacional: true,
  cadastral: false,
}

export function expandAllDossier(): DossierOpenState {
  return { executivo: true, operacional: true, cadastral: true }
}

export function collapseAllDossier(): DossierOpenState {
  return { executivo: false, operacional: false, cadastral: false }
}

/** One-line C-level summary when Bloco Executivo is collapsed. */
export function executiveImpactSummary(opts: {
  monthlyDelta: number
  annualDelta: number
  currentHeadcount: number
  requiredHeadcount: number
  absorcaoLabel: string
  formatSignedBrl: (n: number) => string
}): string {
  const { formatSignedBrl: money } = opts
  return (
    `Impacto: folha ${money(opts.monthlyDelta)}/mês` +
    ` (${money(opts.annualDelta)}/ano)` +
    ` · HC ${opts.currentHeadcount}→${opts.requiredHeadcount}` +
    ` · ${opts.absorcaoLabel}`
  )
}

export interface DossierEstablishmentOption {
  /** Digits-only CNPJ key. */
  key: string
  label: string
  /** Centro de custo codes present under this establishment. */
  centroCustos: string[]
}

/** Unique Filial/CNPJ options from imported payroll (LGPD: no person names). */
export function dossierEstablishmentOptions(
  rows: PayrollRow[] | undefined | null,
): DossierEstablishmentOption[] {
  if (!rows?.length) return []
  const map = new Map<
    string,
    { key: string; label: string; ccs: Set<string> }
  >()
  for (const r of rows) {
    const dig = cnpjDigits(r.cnpjCompleto)
    if (!dig || dig.length < 8) continue
    const prefixo = dig.slice(0, 8)
    const sufixo = dig.length >= 14 ? dig.slice(8, 14) : dig.slice(8)
    const labelParts: string[] = []
    const filial = (r.codFilial ?? '').trim()
    if (filial) labelParts.push(`Filial ${filial}`)
    labelParts.push(formatCnpjDisplay(prefixo, sufixo))
    const label = labelParts.join(' · ')
    let entry = map.get(dig)
    if (!entry) {
      entry = { key: dig, label, ccs: new Set() }
      map.set(dig, entry)
    }
    const cc = (r.codCc ?? r.centroCusto ?? '').trim()
    if (cc) entry.ccs.add(cc)
  }
  return [...map.values()]
    .map((e) => ({
      key: e.key,
      label: e.label,
      centroCustos: [...e.ccs].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/** Centro de custo options for cadastral filter. */
export function dossierCentroCustoOptions(
  byCostCenter: CostCenterResult[],
  payrollRows?: PayrollRow[] | null,
): string[] {
  const set = new Set<string>()
  for (const c of byCostCenter) {
    const cc = c.centroCusto.trim()
    if (cc) set.add(cc)
  }
  if (payrollRows) {
    for (const r of payrollRows) {
      const cc = (r.codCc ?? r.centroCusto ?? '').trim()
      if (cc) set.add(cc)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * Which CC codes remain visible given Filial/CNPJ + CC filters.
 * Empty filter string = no restriction on that axis.
 */
export function resolveVisibleCentroCustos(opts: {
  allCentroCustos: string[]
  establishments: DossierEstablishmentOption[]
  filterCnpjKey: string
  filterCc: string
}): string[] | null {
  const { allCentroCustos, establishments, filterCnpjKey, filterCc } = opts
  let allowed: Set<string> | null = null

  if (filterCnpjKey) {
    const est = establishments.find((e) => e.key === filterCnpjKey)
    if (!est) return []
    allowed = new Set(est.centroCustos)
  }

  if (filterCc) {
    if (allowed) {
      return allowed.has(filterCc) ? [filterCc] : []
    }
    return allCentroCustos.includes(filterCc) ? [filterCc] : []
  }

  if (allowed) {
    return allCentroCustos.filter((cc) => allowed!.has(cc))
  }
  return null
}

export const OPERACIONAL_SEM_CNPJ_KEY = '__sem_cnpj__'

export interface OperacionalFilialGroup {
  /** Digits-only CNPJ, or {@link OPERACIONAL_SEM_CNPJ_KEY}. */
  key: string
  /** UI label (`Filial … · CNPJ` or “Sem CNPJ / filial”). */
  label: string
  centroCustos: string[]
  centers: CostCenterResult[]
}

/**
 * Group Seção 2 (Bloco Operacional) cost centers by Filial/CNPJ in scope.
 * Prefer `CostCenterResult.cnpjCompleto`; fall back to payroll establishment map.
 * Centers without CNPJ land in a single “Sem CNPJ” bucket (only if needed).
 */
export function groupOperacionalByCnpj(opts: {
  centers: CostCenterResult[]
  payrollRows?: PayrollRow[] | null
}): OperacionalFilialGroup[] {
  const { centers, payrollRows } = opts
  if (!centers.length) return []

  const establishments = dossierEstablishmentOptions(payrollRows)
  const labelByKey = new Map(establishments.map((e) => [e.key, e.label]))
  const ccToKey = new Map<string, string>()
  for (const est of establishments) {
    for (const cc of est.centroCustos) {
      if (!ccToKey.has(cc)) ccToKey.set(cc, est.key)
    }
  }

  const buckets = new Map<string, OperacionalFilialGroup>()

  function ensure(key: string, label: string): OperacionalFilialGroup {
    let g = buckets.get(key)
    if (!g) {
      g = { key, label, centroCustos: [], centers: [] }
      buckets.set(key, g)
    }
    return g
  }

  for (const cc of centers) {
    const fromCc = cnpjDigits(cc.cnpjCompleto)
    const fromMap = ccToKey.get(cc.centroCusto.trim()) ?? ''
    const key =
      fromCc.length >= 8
        ? fromCc
        : fromMap.length >= 8
          ? fromMap
          : OPERACIONAL_SEM_CNPJ_KEY
    const label =
      key === OPERACIONAL_SEM_CNPJ_KEY
        ? 'Sem CNPJ / filial'
        : (labelByKey.get(key) ??
          formatCnpjDisplay(key.slice(0, 8), key.slice(8, 14)))
    const g = ensure(key, label)
    g.centers.push(cc)
    const code = cc.centroCusto.trim()
    if (code && !g.centroCustos.includes(code)) g.centroCustos.push(code)
  }

  const groups = [...buckets.values()].map((g) => ({
    ...g,
    centroCustos: [...g.centroCustos].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
  }))

  groups.sort((a, b) => {
    if (a.key === OPERACIONAL_SEM_CNPJ_KEY) return 1
    if (b.key === OPERACIONAL_SEM_CNPJ_KEY) return -1
    return a.label.localeCompare(b.label, 'pt-BR')
  })
  return groups
}

/** Compact turma/jornada summary for one filial group (or whole sim). */
export function summarizeOperacionalTurmas(
  centers: CostCenterResult[],
): {
  crewCount: number
  totalHeadcount: number
  dailyCoverageNeed: number
  regimes: string[]
} {
  let crewCount = 0
  let totalHeadcount = 0
  let dailyCoverageNeed = 0
  const regimes = new Set<string>()
  for (const c of centers) {
    const d = c.distribuicaoTurmas
    if (d) {
      crewCount += d.crewCount
      totalHeadcount += d.totalHeadcount
      dailyCoverageNeed += d.dailyCoverageNeed
      regimes.add(d.regime)
    } else {
      totalHeadcount += c.requiredHeadcount
    }
    if (c.regimeFuncionamento) regimes.add(c.regimeFuncionamento)
  }
  return {
    crewCount,
    totalHeadcount,
    dailyCoverageNeed,
    regimes: [...regimes],
  }
}
