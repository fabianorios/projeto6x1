import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'
import { simulate } from '../engine/simulate'
import { OPERACIONAL_SEM_CNPJ_KEY } from './resultsDossier'
import {
  PROGRESSIVE_MIN_FILIAIS,
  buildFilialIndex,
  buildProgressiveShell,
  mergeOpenFilialSlices,
  shouldUseProgressivePayload,
  sliceFilialPayload,
} from './progressiveFilial'

function row(
  centroCusto: string,
  cnpjCompleto: string,
  qty: number,
): Parameters<typeof simulate>[0]['payrollRows'] extends
  | (infer R)[]
  | undefined
  ? R
  : never {
  return {
    cargo: 'OPERADOR',
    salario: 2500,
    quantidade: qty,
    centroCusto,
    descCc: `CC ${centroCusto}`,
    cnpjCompleto,
    codHorarioAtual: 'H01',
    horarioTrabalhoAtual: '06:00-14:12',
    escalaAtual: '6x1',
    vrValorDia: 32,
    vtValorDia: 8.5,
    nome: null,
  }
}

function multiFilialResult() {
  return simulate({
    sector: 'varejo',
    sectorLabel: 'Varejo',
    sectorBufferPct: 8,
    headcount: 20,
    currentScale: '6x1',
    averageMonthlySalary: 2500,
    units: 1,
    shiftsPerDay: 2,
    operatingHours: DEFAULT_OPERATING_HOURS,
    scenarioId: 'fase1_2026_42h',
    defaultRegimeFuncionamento: 'SEG_SEX',
    payrollRows: [
      row('1001', '00000000000191', 8),
      row('1002', '00000000000191', 4),
      row('2001', '11111111000191', 5),
      row('3001', '22222222000191', 3),
    ],
  })
}

describe('progressiveFilial (P4)', () => {
  it('builds index with ≥2 filiais and strips shell payloads', () => {
    const full = multiFilialResult()
    assert.ok(full.byCostCenter.length >= 3)
    assert.equal(shouldUseProgressivePayload(full), true)
    assert.ok(PROGRESSIVE_MIN_FILIAIS >= 2)

    const index = buildFilialIndex(full)
    assert.ok(index.length >= 3)
    assert.ok(index.every((e) => e.centerCount > 0 && e.key.length > 0))

    const { shell, filialIndex, progressive } = buildProgressiveShell(full)
    assert.equal(progressive, true)
    assert.equal(shell.byCostCenter.length, 0)
    assert.equal(shell.scheduleSuggestions.length, 0)
    assert.equal(shell.input.payrollRows, undefined)
    assert.equal(filialIndex.length, index.length)
    // KPIs preserved
    assert.equal(shell.cost.monthlyDelta, full.cost.monthlyDelta)
    assert.equal(shell.coverage.requiredHeadcount, full.coverage.requiredHeadcount)
  })

  it('slices one filial without leaking other CNPJs', () => {
    const full = multiFilialResult()
    const index = buildFilialIndex(full)
    const target = index.find((e) => e.key !== OPERACIONAL_SEM_CNPJ_KEY)!
    const slice = sliceFilialPayload(full, target.key)
    assert.equal(slice.filialKey, target.key)
    assert.equal(slice.centers.length, target.centerCount)
    assert.ok(
      slice.centers.every((c) => {
        const dig = (c.cnpjCompleto ?? '').replace(/\D/g, '')
        return dig === target.key || dig.length < 8
      }),
    )

    const merged = mergeOpenFilialSlices(buildProgressiveShell(full).shell, [
      slice,
    ])
    assert.equal(merged.byCostCenter.length, slice.centers.length)
  })

  it('does not progressive-shell a single-filial result', () => {
    const full = simulate({
      sector: 'varejo',
      headcount: 10,
      currentScale: '6x1',
      averageMonthlySalary: 2500,
      units: 1,
      shiftsPerDay: 2,
      operatingHours: DEFAULT_OPERATING_HOURS,
      scenarioId: 'fase1_2026_42h',
      payrollRows: [
        row('1001', '00000000000191', 6),
        row('1002', '00000000000191', 4),
      ],
    })
    assert.equal(shouldUseProgressivePayload(full), false)
  })
})
