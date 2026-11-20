import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulate } from '../engine/simulate'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'
import { parsePayrollCsv } from '../engine/payroll'
import type { SimulationInput } from '../engine/types'
import {
  buildHcIncreaseSummary,
  formatHcTriple,
} from './hcIncreaseSummary'

function baseInput(
  overrides: Partial<SimulationInput> = {},
): SimulationInput {
  return {
    sector: 'varejo',
    headcount: 20,
    currentScale: '6x1',
    averageMonthlySalary: 2500,
    units: 1,
    shiftsPerDay: 1,
    scenarioId: 'fase1_2026_42h',
    operatingHours: DEFAULT_OPERATING_HOURS,
    defaultRegimeFuncionamento: 'CONTINUO_7D',
    ...overrides,
  }
}

describe('buildHcIncreaseSummary', () => {
  it('returns null when SEG_SEX keeps HC flat', () => {
    const r = simulate(
      baseInput({
        headcount: 10,
        defaultRegimeFuncionamento: 'SEG_SEX',
      }),
    )
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(buildHcIncreaseSummary(r), null)
  })

  it('lists Filial → CC → cargo where CONTINUO HC sobe', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual;cnpj_completo;cod_filial;regime_funcionamento',
      'Operador;2200;220;44;CC-OP;8;6x1;12345678000190;1;CONTINUO_7D',
      'Auxiliar;1800;220;44;CC-OP;4;6x1;12345678000190;1;CONTINUO_7D',
      'Operador;2200;220;44;CC-ADM;2;6x1;12345678000190;1;SEG_SEX',
      'Caixa;2000;220;44;CC-OP;5;6x1;98765432000111;2;CONTINUO_7D',
    ].join('\n')
    const { rows, issues } = parsePayrollCsv(csv)
    assert.equal(issues.length, 0, JSON.stringify(issues))

    const r = simulate(
      baseInput({
        payrollRows: rows,
        defaultRegimeFuncionamento: 'CONTINUO_7D',
      }),
    )
    const summary = buildHcIncreaseSummary(r)
    assert.ok(summary, 'expected HC increases')
    assert.equal(summary.hasCargoDetail, true)
    assert.ok(summary.total.delta > 0)
    assert.ok(summary.filiais.length >= 1)

    const f1 = summary.filiais.find((f) => f.key === '12345678000190')
    assert.ok(f1, 'filial 1 present')
    const ccOp = f1.centros.find((c) => c.centroCusto === 'CC-OP')
    assert.ok(ccOp, 'CC-OP with increase')
    assert.ok(ccOp.cargos.some((c) => c.cargo === 'Operador' && c.delta > 0))
    assert.ok(ccOp.cargos.some((c) => c.cargo === 'Auxiliar' && c.delta > 0))

    // SEG_SEX CC-ADM should not appear (folga fixa waiver)
    assert.equal(
      f1.centros.some((c) => c.centroCusto === 'CC-ADM'),
      false,
    )

    const f2 = summary.filiais.find((f) => f.key === '98765432000111')
    assert.ok(f2, 'filial 2 present')
    assert.ok(f2.centros[0]?.cargos.some((c) => c.cargo === 'Caixa'))
  })

  it('falls back to Geral when no payroll and HC sobe', () => {
    const r = simulate(
      baseInput({
        headcount: 20,
        defaultRegimeFuncionamento: 'CONTINUO_7D',
      }),
    )
    assert.ok(r.coverage.additionalHeadcount > 0)
    const summary = buildHcIncreaseSummary(r)
    assert.ok(summary)
    assert.equal(summary.hasCargoDetail, false)
    assert.equal(summary.filiais.length, 1)
    assert.equal(summary.filiais[0]!.label, 'Geral')
    assert.equal(summary.total.delta, r.coverage.additionalHeadcount)
  })

  it('formatHcTriple is PT-BR readable', () => {
    assert.equal(formatHcTriple({ atual: 8, proposto: 11, delta: 3 }), '8 → 11 (+3)')
  })
})
