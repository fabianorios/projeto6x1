/**
 * Passo 5 — analytical tree of where headcount rises (baseline → proposed).
 * Nest: Filial → centro de custo → cargo. Only nodes with Δ HC > 0.
 */

import { cnpjDigits, formatCnpjDisplay } from '../apdata/cnpj'
import { planAbsorption } from '../engine/absorption'
import {
  requiredHeadcountAfterFactor,
  resolveRegime,
} from '../engine/crew-distribution'
import type { PayrollRow } from '../engine/payroll'
import { parseScale } from '../engine/scale'
import { calibrationFromSector } from '../engine/sectors'
import type { SimulationResult } from '../engine/types'
import { DEFAULT_ESTRATEGIA_ABSORCAO } from '../types'

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

function filialLabelFromRows(
  dig: string,
  rows: PayrollRow[],
): string {
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

function proposedHeadcountForGroup(opts: {
  current: number
  headcountFactor: number
  preserveCurrentScale: boolean
  regime: ReturnType<typeof resolveRegime>
  targetWorkDays: number
  estrategia: SimulationResult['absorption']['estrategia']
  averageMonthlySalary: number
  salaryDivisor: number
}): number {
  const requiredIdeal = requiredHeadcountAfterFactor(
    opts.current,
    opts.headcountFactor,
    {
      preserveCurrentScale: opts.preserveCurrentScale,
      regime: opts.regime,
      targetWorkDays: opts.targetWorkDays,
    },
  )
  const gap = opts.preserveCurrentScale
    ? 0
    : Math.max(0, requiredIdeal - opts.current)
  const plan = planAbsorption({
    estrategia: opts.estrategia ?? DEFAULT_ESTRATEGIA_ABSORCAO,
    currentHeadcount: opts.current,
    gapHeadcount: gap,
    averageMonthlySalary: opts.averageMonthlySalary,
    scenarioDivisor: opts.salaryDivisor,
  })
  return opts.current + plan.effectiveAdditionalHeadcount
}

/**
 * Build Filial → CC → cargo tree listing only places where HC sobe.
 * Returns null when nothing increases (or no usable data).
 */
export function buildHcIncreaseSummary(
  result: SimulationResult,
): HcIncreaseSummary | null {
  const { input, ruleVersion, coverage, absorption } = result
  const params = ruleVersion.params
  const rows = input.payrollRows

  const currentScale = parseScale(input.currentScale)
  const targetScale = params.preserveCurrentScale
    ? currentScale
    : params.targetScale
  const safeTarget =
    targetScale.workRatio > 0 ? targetScale.workRatio : currentScale.workRatio
  const scaleFactor =
    safeTarget > 0 ? currentScale.workRatio / safeTarget : 1
  const sector = calibrationFromSector(input.sector, input.sectorBufferPct)
  const rawHeadcountFactor =
    scaleFactor * (1 + params.coverageBuffer) * sector.staffingFriction

  const estrategia =
    absorption.estrategia ??
    input.estrategiaAbsorcao ??
    DEFAULT_ESTRATEGIA_ABSORCAO
  const salaryDivisor = params.salaryDivisor
  const avgSalary = input.averageMonthlySalary

  if (rows && rows.length > 0) {
    type Acc = {
      quantidade: number
      salaryMass: number
      regimeVotes: Map<string, number>
      codFilial: string | null
    }
    const map = new Map<string, Acc>()

    for (const row of rows) {
      const dig = cnpjDigits(row.cnpjCompleto)
      const cc = (row.centroCusto || row.codCc || 'Geral').trim() || 'Geral'
      const cargo = (row.cargo || row.descCargo || 'Sem cargo').trim() || 'Sem cargo'
      const key = `${dig}\u0001${cc}\u0001${cargo}`
      let acc = map.get(key)
      if (!acc) {
        acc = {
          quantidade: 0,
          salaryMass: 0,
          regimeVotes: new Map(),
          codFilial: row.codFilial,
        }
        map.set(key, acc)
      }
      const qty = Math.max(0, Math.round(row.quantidade))
      acc.quantidade += qty
      acc.salaryMass += row.salario * qty
      const regime = resolveRegime(
        input.regimeFuncionamentoByCc?.[cc] ??
          row.regimeFuncionamento ??
          input.defaultRegimeFuncionamento,
      )
      acc.regimeVotes.set(
        regime,
        (acc.regimeVotes.get(regime) ?? 0) + qty,
      )
      if (!acc.codFilial && row.codFilial) acc.codFilial = row.codFilial
    }

    type CargoLeaf = HcCargoIncrease & { dig: string; cc: string }
    const leaves: CargoLeaf[] = []

    for (const [key, acc] of map) {
      const [dig, cc, cargo] = key.split('\u0001') as [string, string, string]
      let topRegime = resolveRegime(input.defaultRegimeFuncionamento)
      let topVotes = -1
      for (const [reg, votes] of acc.regimeVotes) {
        if (votes > topVotes) {
          topVotes = votes
          topRegime = resolveRegime(reg as ReturnType<typeof resolveRegime>)
        }
      }
      const groupAvg =
        acc.quantidade > 0 ? acc.salaryMass / acc.quantidade : avgSalary
      const proposto = proposedHeadcountForGroup({
        current: acc.quantidade,
        headcountFactor: rawHeadcountFactor,
        preserveCurrentScale: params.preserveCurrentScale,
        regime: topRegime,
        targetWorkDays: targetScale.workDays,
        estrategia,
        averageMonthlySalary: groupAvg,
        salaryDivisor,
      })
      const t = triple(acc.quantidade, proposto)
      if (t.delta <= 0) continue
      leaves.push({
        dig,
        cc,
        cargo,
        ...t,
      })
    }

    if (leaves.length === 0) return null

    const hasAnyCnpj = leaves.some((l) => l.dig.length >= 8)

    // Nest Filial → CC → cargo
    const filialMap = new Map<
      string,
      {
        label: string
        ccMap: Map<string, { cargos: HcCargoIncrease[] }>
      }
    >()

    for (const leaf of leaves) {
      const filialKey = leaf.dig.length >= 8 ? leaf.dig : GERAL_KEY
      let filial = filialMap.get(filialKey)
      if (!filial) {
        const label =
          filialKey === GERAL_KEY
            ? hasAnyCnpj
              ? 'Sem CNPJ / filial'
              : 'Geral'
            : filialLabelFromRows(filialKey, rows)
        filial = { label, ccMap: new Map() }
        filialMap.set(filialKey, filial)
      }
      let ccEntry = filial.ccMap.get(leaf.cc)
      if (!ccEntry) {
        ccEntry = { cargos: [] }
        filial.ccMap.set(leaf.cc, ccEntry)
      }
      ccEntry.cargos.push({
        cargo: leaf.cargo,
        atual: leaf.atual,
        proposto: leaf.proposto,
        delta: leaf.delta,
      })
    }

    const filiais: HcFilialIncrease[] = [...filialMap.entries()]
      .map(([key, f]) => {
        const centros: HcCcIncrease[] = [...f.ccMap.entries()]
          .map(([centroCusto, { cargos }]) => {
            const sortedCargos = [...cargos].sort((a, b) =>
              a.cargo.localeCompare(b.cargo, 'pt-BR'),
            )
            const atual = sortedCargos.reduce((n, c) => n + c.atual, 0)
            const proposto = sortedCargos.reduce((n, c) => n + c.proposto, 0)
            return {
              centroCusto,
              cargos: sortedCargos,
              ...triple(atual, proposto),
            }
          })
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
      hasCargoDetail: true,
    }
  }

  // No payroll: single Geral line when macro HC sobe.
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
