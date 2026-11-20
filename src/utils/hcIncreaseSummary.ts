/**
 * Passo 5 — analytical tree of where headcount rises (baseline → proposed).
 * Nest: Filial → centro de custo → cargo. Only nodes with Δ HC > 0.
 *
 * Uses HC already computed on SimulationResult (`byCostCenter` / coverage) —
 * no re-run of absorption / scale heuristics in the SPA.
 */

import { cnpjDigits, formatCnpjDisplay } from '../apdata/cnpj'
import type { PayrollRow } from '../engine/payroll'
import type { CostCenterResult, SimulationResult } from '../engine/types'

export interface HcCountTriple {
  atual: number
  proposto: number
  delta: number
}

export interface HcCargoIncrease extends HcCountTriple {
  cargo: string
}

export interface HcCcIncrease extends HcCountTriple {
  centroCusto: string
  /** Optional CC description for display. */
  descCc?: string | null
  cargos: HcCargoIncrease[]
}

export interface HcFilialIncrease extends HcCountTriple {
  /** Digits-only CNPJ, or `__geral__` when no establishment. */
  key: string
  label: string
  centros: HcCcIncrease[]
}

export interface HcIncreaseSummary {
  filiais: HcFilialIncrease[]
  total: HcCountTriple
  /** True when cargo leaves were built from payroll rows. */
  hasCargoDetail: boolean
}

const GERAL_KEY = '__geral__'

function triple(atual: number, proposto: number): HcCountTriple {
  const a = Math.max(0, Math.round(atual))
  const p = Math.max(0, Math.round(proposto))
  return { atual: a, proposto: p, delta: p - a }
}

function filialLabelFromRows(dig: string, rows: PayrollRow[]): string {
  const sample = rows.find((r) => cnpjDigits(r.cnpjCompleto) === dig)
  const parts: string[] = []
  const filial = (sample?.codFilial ?? '').trim()
  if (filial) parts.push(`Filial ${filial}`)
  if (dig.length >= 8) {
    const prefixo = dig.slice(0, 8)
    const sufixo = dig.length >= 14 ? dig.slice(8, 14) : dig.slice(8)
    parts.push(formatCnpjDisplay(prefixo, sufixo))
  } else if (dig) {
    parts.push(dig)
  }
  return parts.join(' · ') || 'Filial'
}

function centerKey(c: CostCenterResult): string {
  const dig = cnpjDigits(c.cnpjCompleto)
  const cc = c.centroCusto.trim() || 'Geral'
  return dig.length >= 8 ? `${dig}\u0001${cc}` : `\u0001${cc}`
}

/**
 * Allocate a CC's proposed HC across cargos proportional to baseline qty.
 * Remainders go to the largest cargo so Σ leaves = CC proposed.
 */
function allocateProposedByCargo(
  cargos: { cargo: string; atual: number }[],
  proposedTotal: number,
): HcCargoIncrease[] {
  const atualSum = cargos.reduce((n, c) => n + c.atual, 0)
  if (cargos.length === 0 || atualSum <= 0) return []
  const raw = cargos.map((c) => ({
    cargo: c.cargo,
    atual: c.atual,
    proposto: (c.atual / atualSum) * proposedTotal,
  }))
  const floored = raw.map((c) => ({
    ...c,
    proposto: Math.floor(c.proposto),
  }))
  let rem =
    Math.max(0, Math.round(proposedTotal)) -
    floored.reduce((n, c) => n + c.proposto, 0)
  const order = [...floored.keys()].sort(
    (a, b) =>
      raw[b]!.proposto -
      floored[b]!.proposto -
      (raw[a]!.proposto - floored[a]!.proposto),
  )
  for (const idx of order) {
    if (rem <= 0) break
    floored[idx]!.proposto += 1
    rem -= 1
  }
  return floored
    .map((c) => ({ ...c, ...triple(c.atual, c.proposto) }))
    .filter((c) => c.delta > 0)
    .sort((a, b) => a.cargo.localeCompare(b.cargo, 'pt-BR'))
}

/**
 * Build Filial → CC → cargo tree listing only places where HC sobe.
 * Returns null when nothing increases (or no usable data).
 */
export function buildHcIncreaseSummary(
  result: SimulationResult,
): HcIncreaseSummary | null {
  const { input, coverage, byCostCenter } = result
  const rows = input.payrollRows

  const risingCenters = byCostCenter.filter((c) => c.additionalHeadcount > 0)
  if (risingCenters.length > 0) {
    const hasAnyCnpj = risingCenters.some(
      (c) => cnpjDigits(c.cnpjCompleto).length >= 8,
    )
    const rowsByCenter = new Map<string, PayrollRow[]>()
    if (rows?.length) {
      for (const row of rows) {
        const dig = cnpjDigits(row.cnpjCompleto)
        const cc = (row.centroCusto || row.codCc || 'Geral').trim() || 'Geral'
        const key = dig.length >= 8 ? `${dig}\u0001${cc}` : `\u0001${cc}`
        const list = rowsByCenter.get(key) ?? []
        list.push(row)
        rowsByCenter.set(key, list)
      }
    }

    const filialMap = new Map<
      string,
      {
        label: string
        centros: HcCcIncrease[]
      }
    >()

    for (const center of risingCenters) {
      const dig = cnpjDigits(center.cnpjCompleto)
      const filialKey = dig.length >= 8 ? dig : GERAL_KEY
      let filial = filialMap.get(filialKey)
      if (!filial) {
        const label =
          filialKey === GERAL_KEY
            ? hasAnyCnpj
              ? 'Sem CNPJ / filial'
              : 'Geral'
            : rows?.length
              ? filialLabelFromRows(filialKey, rows)
              : formatCnpjDisplay(filialKey.slice(0, 8), filialKey.slice(8, 14))
        filial = { label, centros: [] }
        filialMap.set(filialKey, filial)
      }

      const key = centerKey(center)
      const centerRows = rowsByCenter.get(key) ?? []
      const cargoQty = new Map<string, number>()
      for (const row of centerRows) {
        const cargo =
          (row.cargo || row.descCargo || 'Sem cargo').trim() || 'Sem cargo'
        const qty = Math.max(0, Math.round(row.quantidade))
        cargoQty.set(cargo, (cargoQty.get(cargo) ?? 0) + qty)
      }
      const cargoLeaves = allocateProposedByCargo(
        [...cargoQty.entries()].map(([cargo, atual]) => ({ cargo, atual })),
        center.requiredHeadcount,
      )

      filial.centros.push({
        centroCusto: center.centroCusto,
        descCc: center.descCc ?? null,
        cargos: cargoLeaves,
        ...triple(center.currentHeadcount, center.requiredHeadcount),
      })
    }

    const filiais: HcFilialIncrease[] = [...filialMap.entries()]
      .map(([key, f]) => {
        const centros = [...f.centros]
          .filter((c) => c.delta > 0)
          .sort((a, b) =>
            a.centroCusto.localeCompare(b.centroCusto, 'pt-BR'),
          )
        const atual = centros.reduce((n, c) => n + c.atual, 0)
        const proposto = centros.reduce((n, c) => n + c.proposto, 0)
        return {
          key,
          label: f.label,
          centros,
          ...triple(atual, proposto),
        }
      })
      .filter((f) => f.delta > 0)
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    if (filiais.length === 0) return null

    const totalAtual = filiais.reduce((n, f) => n + f.atual, 0)
    const totalProposto = filiais.reduce((n, f) => n + f.proposto, 0)
    return {
      filiais,
      total: triple(totalAtual, totalProposto),
      hasCargoDetail: Boolean(rows?.length),
    }
  }

  // No CC breakdown: single Geral line when macro HC sobe.
  if (coverage.additionalHeadcount <= 0) return null
  const t = triple(coverage.currentHeadcount, coverage.requiredHeadcount)
  if (t.delta <= 0) return null

  return {
    filiais: [
      {
        key: GERAL_KEY,
        label: 'Geral',
        centros: [
          {
            centroCusto: 'Geral',
            cargos: [],
            ...t,
          },
        ],
        ...t,
      },
    ],
    total: t,
    hasCargoDetail: false,
  }
}

/** Compact PT-BR count: `10 → 12 (+2)`. */
export function formatHcTriple(t: HcCountTriple): string {
  const sign = t.delta > 0 ? '+' : t.delta < 0 ? '−' : ''
  const abs = Math.abs(t.delta)
  return `${t.atual} → ${t.proposto} (${sign}${abs})`
}
