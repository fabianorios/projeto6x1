import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cascadeHeOnDivisor,
  planAbsorption,
} from './absorption'
import { distributeCrews } from './crew-distribution'
import { parsePayrollCsv } from './payroll'
import {
  RULE_VERSIONS,
  listScenarios,
  normalizeScenarioId,
} from './rules'
import { listSuggestableCodes } from './schedule-policy'
import { simulate } from './simulate'
import { DEFAULT_OPERATING_HOURS } from './operating-hours'
import { HE_LEGAL_CAP_HOURS_MONTH } from '../types'
import type { SimulationInput } from './types'

function baseInput(
  overrides: Partial<SimulationInput> = {},
): SimulationInput {
  return {
    sector: 'varejo',
    headcount: 100,
    currentScale: '6x1',
    averageMonthlySalary: 2200,
    units: 1,
    shiftsPerDay: 1,
    scenarioId: 'fase1_2026_42h',
    operatingHours: DEFAULT_OPERATING_HOURS,
    ...overrides,
  }
}

describe('scenarios v2', () => {
  it('exposes exactly the four SPEC scenarios', () => {
    const ids = listScenarios().map((r) => r.params.scenarioId)
    assert.deepEqual(ids.sort(), [
      'fase1_2026_42h',
      'fase2_2027_40h',
      'status_quo',
      'stress_test_4x3',
    ])
  })

  it('maps legacy pec_draft_* IDs', () => {
    assert.equal(normalizeScenarioId('pec_draft_conservative'), 'fase1_2026_42h')
    assert.equal(normalizeScenarioId('pec_draft_aggressive'), 'stress_test_4x3')
  })

  it('sets salary divisors 220/210/200/180', () => {
    assert.equal(RULE_VERSIONS.status_quo.params.salaryDivisor, 220)
    assert.equal(RULE_VERSIONS.fase1_2026_42h.params.salaryDivisor, 210)
    assert.equal(RULE_VERSIONS.fase2_2027_40h.params.salaryDivisor, 200)
    assert.equal(RULE_VERSIONS.stress_test_4x3.params.salaryDivisor, 180)
  })

  it('suggests 4x3 only under stress_test_4x3', () => {
    assert.ok(!listSuggestableCodes('fase1_2026_42h', '6x1').includes('4x3'))
    assert.ok(listSuggestableCodes('stress_test_4x3', '6x1').includes('4x3'))
  })
})

describe('salary divisor HE cascade', () => {
  it('raises HE cost when divisor drops 220→210', () => {
    const r = cascadeHeOnDivisor({
      averageMonthlySalary: 2200,
      heHoursExisting: 20,
      scenarioDivisor: 210,
    })
    assert.equal(r.baselineDivisor, 220)
    assert.equal(r.scenarioDivisor, 210)
    assert.ok(r.hourlyScenario > r.hourlyBaseline)
    assert.ok(r.heCostDelta > 0)
  })
})

describe('HE legal cap absorption', () => {
  it('caps HORA_EXTRA_MAXIMA at 44h × current HC', () => {
    const plan = planAbsorption({
      estrategia: 'HORA_EXTRA_MAXIMA',
      currentHeadcount: 10,
      gapHeadcount: 5,
      averageMonthlySalary: 2200,
      scenarioDivisor: 210,
    })
    assert.equal(plan.heCapHours, 10 * HE_LEGAL_CAP_HOURS_MONTH)
    assert.ok(plan.heHoursUsed <= plan.heCapHours)
    assert.equal(plan.heCapReached, true)
    assert.ok(plan.hiresHeadcount > 0)
  })

  it('CONTRATACAO_INTEGRAL hires full gap without HE', () => {
    const plan = planAbsorption({
      estrategia: 'CONTRATACAO_INTEGRAL',
      currentHeadcount: 10,
      gapHeadcount: 4,
      averageMonthlySalary: 2200,
      scenarioDivisor: 210,
    })
    assert.equal(plan.heHoursUsed, 0)
    assert.equal(plan.hiresHeadcount, 4)
    assert.equal(plan.heCapReached, false)
  })

  it('HIBRIDO_INTERMITENTE uses HE then intermittent', () => {
    const plan = planAbsorption({
      estrategia: 'HIBRIDO_INTERMITENTE',
      currentHeadcount: 10,
      gapHeadcount: 5,
      averageMonthlySalary: 2200,
      scenarioDivisor: 210,
    })
    assert.ok(plan.heHoursUsed > 0)
    assert.equal(plan.hiresHeadcount, 0)
    assert.ok(plan.intermittentHeadcount > 0)
  })
})

describe('crew distribution', () => {
  it('SEG_SEX uses a single 5x2 crew', () => {
    const d = distributeCrews('SEG_SEX', 20)
    assert.equal(d.crewCount, 1)
    assert.equal(d.crews[0].escala, '5x2')
    assert.equal(d.totalHeadcount, 20)
  })

  it('CONTINUO_7D builds 7 rotating 5x2 crews', () => {
    const d = distributeCrews('CONTINUO_7D', 35)
    assert.equal(d.crewCount, 7)
    assert.equal(d.crews.length, 7)
    assert.ok(d.crews.every((c) => c.escala === '5x2'))
    assert.equal(d.crews[0].workDays.length, 5)
    assert.equal(d.crews[0].restDays.length, 2)
    // daily coverage = 5 × crewSize
    assert.equal(d.dailyCoverageNeed, (d.totalHeadcount / 7) * 5)
  })
})

describe('payroll CSV backward-compat + extractor columns', () => {
  it('parses legacy layout with SPEC extras defaulted', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual',
      'Operador;2200;220;44;Loja-01;8;6x1',
    ].join('\n')
    const { rows, issues } = parsePayrollCsv(csv)
    assert.equal(issues.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operador')
    assert.equal(rows[0].heMediaMensalHoras, 0)
    assert.equal(rows[0].codEmpresa, null)
    assert.equal(rows[0].cnpjCompleto, null)
  })

  it('parses native extractor columns (BR numbers)', () => {
    const csv = [
      'cod_empresa;cod_filial;cnpj_completo;cod_cc;cod_cargo;desc_cargo;cod_vinculo;cod_horario_atual;escala_atual;carga_semanal_atual;qtd_colaboradores;massa_salarial_base;vr_dia_medio;vt_dia_medio;dias_trabalho_mes_atual',
      '1;1;12345678000190;CC-01;10;Operador;1;5;6x1;44;2;4.400,00;32,00;15,00;26',
    ].join('\n')
    const { rows, issues } = parsePayrollCsv(csv)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operador')
    assert.equal(rows[0].centroCusto, 'CC-01')
    assert.equal(rows[0].quantidade, 2)
    assert.equal(rows[0].salario, 2200)
    assert.equal(rows[0].vrValorDia, 32)
    assert.equal(rows[0].vtValorDia, 15)
    assert.equal(rows[0].vrDiasMesAtual, 26)
    assert.equal(rows[0].cnpjCompleto, '12345678000190')
  })
})

describe('simulate() v2 wiring', () => {
  it('status_quo keeps additional HC at 0', () => {
    const r = simulate(baseInput({ scenarioId: 'status_quo' }))
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(r.ruleVersion.params.salaryDivisor, 220)
  })

  it('fase1 increases HC and uses divisor 210', () => {
    const r = simulate(baseInput({ scenarioId: 'fase1_2026_42h' }))
    assert.ok(r.coverage.additionalHeadcount > 0)
    assert.equal(r.heCascade.scenarioDivisor, 210)
    assert.equal(r.charges.taxRegime, 'LUCRO_PRESUMIDO')
  })

  it('HORA_EXTRA_MAXIMA can show heCap badge state', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        headcount: 10,
        estrategiaAbsorcao: 'HORA_EXTRA_MAXIMA',
      }),
    )
    assert.ok(r.absorption.heCapHours === 10 * HE_LEGAL_CAP_HOURS_MONTH)
    assert.equal(r.absorption.estrategia, 'HORA_EXTRA_MAXIMA')
  })

  it('attaches CONTINUO_7D turma distribution', () => {
    const r = simulate(
      baseInput({
        defaultRegimeFuncionamento: 'CONTINUO_7D',
      }),
    )
    assert.equal(r.distribuicaoTurmas.regime, 'CONTINUO_7D')
    assert.equal(r.distribuicaoTurmas.crewCount, 7)
  })
})
