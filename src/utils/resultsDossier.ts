/**
 * Passo 5 — helpers for the Results “dossiê” (accordion + cadastral filters).
 */

import { cnpjDigits, formatCnpjDisplay } from '../apdata/cnpj'
import {
  formatCentroCustoCodeDesc,
  type PayrollRow,
} from '../engine/payroll'
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
  /** Signed numeric formatter (pt-BR separators; no R$ — PX-130). */
  formatSigned: (n: number) => string
}): string {
  const { formatSigned: signed } = opts
  return (
    `Impacto: folha ${signed(opts.monthlyDelta)}/mês` +
    ` (${signed(opts.annualDelta)}/ano)` +
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

export interface DossierCentroCustoOption {
  /** Filter key — prefer `cod_cc`, else `centro_custo`. */
  key: string
  /** Dual label: `CODE — Descrição` when both exist. */
  label: string
  code: string
  desc: string
}

/** Centro de custo options for Results filter (código + descrição). */
export function dossierCentroCustoOptions(
  byCostCenter: CostCenterResult[],
  payrollRows?: PayrollRow[] | null,
): DossierCentroCustoOption[] {
  const map = new Map<string, DossierCentroCustoOption>()

  function upsert(opts: {
    key: string
    code: string
    desc: string
  }) {
    const key = opts.key.trim()
    if (!key) return
    const prev = map.get(key)
    const desc = opts.desc.trim() || prev?.desc || ''
    const code = opts.code.trim() || prev?.code || key
    map.set(key, {
      key,
      code,
      desc,
      label: formatCentroCustoCodeDesc({
        codCc: code,
        centroCusto: key,
        descCc: desc,
      }),
    })
  }

  for (const c of byCostCenter) {
    const key = (c.codCc ?? c.centroCusto ?? '').trim() || c.centroCusto.trim()
    upsert({
      key: key || c.centroCusto.trim(),
      code: (c.codCc ?? c.centroCusto ?? '').trim(),
      desc: (c.descCc ?? '').trim(),
    })
  }
  if (payrollRows) {
    for (const r of payrollRows) {
      const key = (r.codCc ?? r.centroCusto ?? '').trim()
      if (!key) continue
      upsert({
        key,
        code: (r.codCc ?? r.centroCusto ?? '').trim(),
        desc: (r.descCc ?? '').trim(),
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
  )
}

/** Keys only — for hierarchy / resolveVisible helpers. */
export function dossierCentroCustoKeys(
  options: DossierCentroCustoOption[],
): string[] {
  return options.map((o) => o.key)
}

/**
 * True when a cost-center row matches the CC filter/search string.
 * Exact key/code match, or case-insensitive substring on code / description.
 */
export function centroCustoMatchesSearch(
  c: {
    centroCusto?: string | null
    codCc?: string | null
    descCc?: string | null
  },
  filterCc: string,
): boolean {
  const q = filterCc.trim()
  if (!q) return true
  const key = (c.centroCusto ?? '').trim()
  const code = (c.codCc ?? c.centroCusto ?? '').trim()
  const desc = (c.descCc ?? '').trim()
  if (key === q || code === q) return true
  const nq = q.toLocaleLowerCase('pt-BR')
  if (code.toLocaleLowerCase('pt-BR').includes(nq)) return true
  if (key.toLocaleLowerCase('pt-BR').includes(nq)) return true
  if (desc.toLocaleLowerCase('pt-BR').includes(nq)) return true
  return false
}

export interface DossierSindicatoOption {
  /** Digits/code key from Folha `cod_sindicato`. */
  key: string
  label: string
}

/** Unique Sindicato options from Folha / CC aggregates (collective framing). */
export function dossierSindicatoOptions(
  byCostCenter: CostCenterResult[],
  payrollRows?: PayrollRow[] | null,
): DossierSindicatoOption[] {
  const map = new Map<string, string>()
  for (const c of byCostCenter) {
    const key = (c.codSindicato ?? '').trim()
    if (!key || key === '0') continue
    const nome = (c.nomeSindicato ?? '').trim()
    map.set(key, nome || `Sindicato ${key}`)
  }
  if (payrollRows) {
    for (const r of payrollRows) {
      const key = (r.codSindicato ?? '').trim()
      if (!key || key === '0') continue
      const nome = (r.nomeSindicato ?? '').trim()
      if (!map.has(key) || nome) {
        map.set(key, nome || map.get(key) || `Sindicato ${key}`)
      }
    }
  }
  return [...map.entries()]
    .map(([key, label]) => ({
      key,
      label: label.includes(key) ? label : `${label} (${key})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/**
 * Filter CostCenterResult rows by Filial/CNPJ, CC (code/desc search),
 * and/or Sindicato. Empty string on an axis = no restriction. Uses dominant
 * sindicato on CC plus Folha rows when present (pass-through without
 * regrouping HC).
 */
export function filterCostCentersByDossier(opts: {
  centers: CostCenterResult[]
  payrollRows?: PayrollRow[] | null
  filterCnpjKey?: string
  filterCc?: string
  filterSindicatoKey?: string
}): CostCenterResult[] {
  const {
    centers,
    payrollRows,
    filterCnpjKey = '',
    filterCc = '',
    filterSindicatoKey = '',
  } = opts

  let allowedBySindicato: Set<string> | null = null
  if (filterSindicatoKey && payrollRows?.length) {
    allowedBySindicato = new Set()
    for (const r of payrollRows) {
      const cod = (r.codSindicato ?? '').trim()
      if (cod !== filterSindicatoKey) continue
      const dig = cnpjDigits(r.cnpjCompleto)
      const cc = (r.centroCusto ?? '').trim()
      if (cc) {
        allowedBySindicato.add(
          dig.length >= 8 ? `${dig}\u0001${cc}` : cc,
        )
      }
    }
  }

  return centers.filter((c) => {
    if (filterCnpjKey) {
      const dig = cnpjDigits(c.cnpjCompleto)
      if (dig !== filterCnpjKey) return false
    }
    if (filterCc && !centroCustoMatchesSearch(c, filterCc)) {
      // Folha may carry desc_cc when the CC aggregate does not.
      if (payrollRows?.length) {
        const dig = cnpjDigits(c.cnpjCompleto)
        const key = c.centroCusto.trim()
        const hit = payrollRows.some((r) => {
          const rCc = (r.centroCusto ?? r.codCc ?? '').trim()
          if (rCc !== key && (r.codCc ?? '').trim() !== key) return false
          if (dig.length >= 8) {
            const rDig = cnpjDigits(r.cnpjCompleto)
            if (rDig.length >= 8 && rDig !== dig) return false
          }
          return centroCustoMatchesSearch(
            {
              centroCusto: r.centroCusto,
              codCc: r.codCc,
              descCc: r.descCc ?? c.descCc,
            },
            filterCc,
          )
        })
        if (!hit) return false
      } else {
        return false
      }
    }
    if (filterSindicatoKey) {
      const cod = (c.codSindicato ?? '').trim()
      if (cod === filterSindicatoKey) return true
      if (allowedBySindicato) {
        const dig = cnpjDigits(c.cnpjCompleto)
        const key =
          dig.length >= 8
            ? `${dig}\u0001${c.centroCusto.trim()}`
            : c.centroCusto.trim()
        return allowedBySindicato.has(key)
      }
      return false
    }
    return true
  })
}

/**
 * Which CC codes remain visible given Filial/CNPJ + CC filters.
 * Empty filter string = no restriction on that axis.
 * `filterCc` accepts exact key or substring search on code/desc via
 * `ccOptions` when provided.
 */
export function resolveVisibleCentroCustos(opts: {
  allCentroCustos: string[]
  establishments: DossierEstablishmentOption[]
  filterCnpjKey: string
  filterCc: string
  ccOptions?: DossierCentroCustoOption[]
}): string[] | null {
  const {
    allCentroCustos,
    establishments,
    filterCnpjKey,
    filterCc,
    ccOptions,
  } = opts
  let allowed: Set<string> | null = null

  if (filterCnpjKey) {
    const est = establishments.find((e) => e.key === filterCnpjKey)
    if (!est) return []
    allowed = new Set(est.centroCustos)
  }

  if (filterCc) {
    const q = filterCc.trim()
    const matched = allCentroCustos.filter((cc) => {
      if (cc === q) return true
      const opt = ccOptions?.find((o) => o.key === cc)
      if (!opt) {
        return cc.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR'))
      }
      return centroCustoMatchesSearch(
        { centroCusto: opt.key, codCc: opt.code, descCc: opt.desc },
        q,
      )
    })
    if (allowed) {
      return matched.filter((cc) => allowed!.has(cc))
    }
    return matched
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

/** CC bucket with horário slices nested underneath (never siblings of Filial). */
export interface OperacionalCcGroup {
  centroCusto: string
  /** Optional CC description from Folha (CCU_D1sCentroCusto). */
  descCc?: string | null
  /** One entry per horário under this CC (sorted by codHorarioAtual). */
  horarios: CostCenterResult[]
}

/** Sort key: Filial (CNPJ) → CC → horário. */
export function compareFilialCcHorario(
  a: CostCenterResult,
  b: CostCenterResult,
): number {
  const ca = cnpjDigits(a.cnpjCompleto)
  const cb = cnpjDigits(b.cnpjCompleto)
  if (ca !== cb) return ca.localeCompare(cb)
  const ccCmp = a.centroCusto
    .trim()
    .localeCompare(b.centroCusto.trim(), 'pt-BR')
  if (ccCmp !== 0) return ccCmp
  return (a.codHorarioAtual ?? '')
    .trim()
    .localeCompare((b.codHorarioAtual ?? '').trim(), 'pt-BR')
}

/**
 * Nest horário slices under centro de custo (within one Filial).
 * Same CC code with multiple horários → one CC group, many horário children.
 */
export function nestCentersByCc(
  centers: CostCenterResult[],
): OperacionalCcGroup[] {
  const map = new Map<string, CostCenterResult[]>()
  for (const c of centers) {
    const key = c.centroCusto.trim() || 'SEM_CC'
    const list = map.get(key) ?? []
    list.push(c)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([centroCusto, list]) => ({
      centroCusto,
      descCc:
        list.find((c) => (c.descCc ?? '').trim())?.descCc?.trim() || null,
      horarios: [...list].sort((a, b) =>
        (a.codHorarioAtual ?? '')
          .trim()
          .localeCompare((b.codHorarioAtual ?? '').trim(), 'pt-BR'),
      ),
    }))
}

export interface HierarchyFilialCcHorarioGroup {
  key: string
  label: string
  centroCustos: OperacionalCcGroup[]
}

/**
 * Full review tree: Filial → CC → horário.
 * Used by Apdata hierarchy / Quadro nesting whenever CNPJ is present.
 */
export function groupFilialCcHorario(opts: {
  centers: CostCenterResult[]
  payrollRows?: PayrollRow[] | null
}): HierarchyFilialCcHorarioGroup[] {
  return groupOperacionalByCnpj(opts).map((g) => ({
    key: g.key,
    label: g.label,
    centroCustos: nestCentersByCc(g.centers),
  }))
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
    centers: [...g.centers].sort(compareFilialCcHorario),
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

/** True when Seção 2 should render per-filial accordion (≥1 real CNPJ). */
export function shouldShowFilialAccordion(
  groups: OperacionalFilialGroup[],
): boolean {
  return groups.some((g) => g.key !== OPERACIONAL_SEM_CNPJ_KEY)
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
