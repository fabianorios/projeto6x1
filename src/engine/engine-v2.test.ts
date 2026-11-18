import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cascadeHeOnDivisor,
  planAbsorption,
} from './absorption'
import {
  assignCrewWindowIndices,
  distributeCrews,
  distributeExactCounts,
  fixedOffTargetCoversOperatingDays,
  requiredHeadcountAfterFactor,
  staffedWindowCountForCoverage,
} from './crew-distribution'
import { applyTurmaHourLabels } from './apdata-hierarchy'
import { DEFAULT_OPERATING_HOURS, resolveShiftWindows } from './operating-hours'
import { formatHorarioAtualLabel, parsePayrollCsv } from './payroll'
import {
  RULE_VERSIONS,
  listScenarios,
  normalizeScenarioId,
} from './rules'
import { listSuggestableCodes } from './schedule-policy'
import { simulate } from './simulate'
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
    assert.equal(d.totalHeadcount, 35)
    // daily coverage ≈ HC × 5/7 (exact when divisible by 7)
    assert.equal(d.dailyCoverageNeed, (d.totalHeadcount / 7) * 5)
  })

  it('CONTINUO_7D preserves exact HC (no ceil×7 invent)', () => {
    const d1 = distributeCrews('CONTINUO_7D', 1)
    assert.equal(d1.totalHeadcount, 1)
    assert.equal(
      d1.crews.reduce((s, c) => s + c.headcount, 0),
      1,
    )
    assert.equal(d1.dailyCoverageNeed, 1)

    const d8 = distributeCrews('CONTINUO_7D', 8)
    assert.equal(d8.totalHeadcount, 8)
    assert.equal(
      d8.crews.reduce((s, c) => s + c.headcount, 0),
      8,
    )
    // Must not inflate to 14 (old ceil(8/7)*7 bug that showed 1→2 per turma)
    assert.ok(d8.crews.every((c) => c.headcount <= 2))
    assert.equal(d8.crews.filter((c) => c.headcount === 2).length, 1)
    assert.equal(d8.dailyCoverageNeed, Math.round((8 * 5) / 7))
  })

  it('distributeExactCounts never invents beyond total', () => {
    assert.deepEqual(distributeExactCounts(1, 2), [1, 0])
    assert.deepEqual(distributeExactCounts(10, 2), [5, 5])
    assert.deepEqual(distributeExactCounts(8, 7), [2, 1, 1, 1, 1, 1, 1])
    assert.equal(
      distributeExactCounts(3, 4).reduce((a, b) => a + b, 0),
      3,
    )
  })

  it('fixed-off SEG_SEX→5×2 waives scale factor; CONTINUO multi keeps it', () => {
    assert.equal(fixedOffTargetCoversOperatingDays('SEG_SEX', 5), true)
    assert.equal(fixedOffTargetCoversOperatingDays('SEG_SEX', 4), false)
    assert.equal(fixedOffTargetCoversOperatingDays('CONTINUO_7D', 5), false)
    assert.equal(
      requiredHeadcountAfterFactor(1, 1.26, {
        preserveCurrentScale: false,
        regime: 'SEG_SEX',
        targetWorkDays: 5,
      }),
      1,
    )
    // Single collaborator CONTINUO→5×2: tiles ≠ posts → keep HC=1
    assert.equal(
      requiredHeadcountAfterFactor(1, 1.26, {
        preserveCurrentScale: false,
        regime: 'CONTINUO_7D',
        targetWorkDays: 5,
      }),
      1,
    )
    // Larger CONTINUO roster still takes the factor
    assert.equal(
      requiredHeadcountAfterFactor(8, 1.26, {
        preserveCurrentScale: false,
        regime: 'CONTINUO_7D',
        targetWorkDays: 5,
      }),
      11,
    )
    // CONTINUO→4×3 still inflates even for HC=1
    assert.equal(
      requiredHeadcountAfterFactor(1, 1.5, {
        preserveCurrentScale: false,
        regime: 'CONTINUO_7D',
        targetWorkDays: 4,
      }),
      2,
    )
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
      'cod_empresa;cod_filial;cnpj_completo;cod_cc;desc_cc;cod_cargo;desc_cargo;cod_vinculo;cod_horario_atual;escala_atual;carga_semanal_atual;qtd_colaboradores;massa_salarial_base;vr_dia_medio;vt_dia_medio;dias_trabalho_mes_atual',
      '1;1;12345678000190;CC-01;Operacoes Loja;10;Operador;1;5;6x1;44;2;4.400,00;32,00;15,00;26',
    ].join('\n')
    const { rows, issues } = parsePayrollCsv(csv)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operador')
    assert.equal(rows[0].centroCusto, 'CC-01')
    assert.equal(rows[0].codCc, 'CC-01')
    assert.equal(rows[0].descCc, 'Operacoes Loja')
    assert.equal(rows[0].quantidade, 2)
    assert.equal(rows[0].salario, 2200)
    assert.equal(rows[0].vrValorDia, 32)
    assert.equal(rows[0].vtValorDia, 15)
    assert.equal(rows[0].vrDiasMesAtual, 26)
    assert.equal(rows[0].cnpjCompleto, '12345678000190')
  })

  it('parses native extractor without desc_cc (backward compatible)', () => {
    const csv = [
      'cod_empresa;cod_filial;cnpj_completo;cod_cc;cod_cargo;desc_cargo;cod_vinculo;cod_horario_atual;escala_atual;carga_semanal_atual;qtd_colaboradores;massa_salarial_base;vr_dia_medio;vt_dia_medio;dias_trabalho_mes_atual',
      '1;1;12345678000190;CC-01;10;Operador;1;5;6x1;44;2;4.400,00;32,00;15,00;26',
    ].join('\n')
    const { rows, issues } = parsePayrollCsv(csv)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows[0].codCc, 'CC-01')
    assert.equal(rows[0].descCc, null)
  })
})

describe('simulate() v2 wiring', () => {
  it('status_quo keeps additional HC at 0', () => {
    const r = simulate(baseInput({ scenarioId: 'status_quo' }))
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(r.ruleVersion.params.salaryDivisor, 220)
  })

  it('fase1 increases HC on CONTINUO_7D and uses divisor 210', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        defaultRegimeFuncionamento: 'CONTINUO_7D',
      }),
    )
    assert.ok(r.coverage.additionalHeadcount > 0)
    assert.equal(r.heCascade.scenarioDivisor, 210)
    assert.equal(r.charges.taxRegime, 'LUCRO_PRESUMIDO')
  })

  it('fase1 SEG_SEX folga fixa keeps HC (no ceil 1.2 invent)', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        headcount: 1,
        defaultRegimeFuncionamento: 'SEG_SEX',
      }),
    )
    assert.equal(r.coverage.currentHeadcount, 1)
    assert.equal(r.coverage.requiredHeadcount, 1)
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(r.coverage.headcountFactor, 1)
  })

  it('fase1 CONTINUO HC=1 + two OH tiles keeps HC (no 1→2 invent)', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        headcount: 1,
        defaultRegimeFuncionamento: 'CONTINUO_7D',
        operatingHours: DEFAULT_OPERATING_HOURS, // 09–21 → 2 tiles
      }),
    )
    assert.equal(r.coverage.currentHeadcount, 1)
    assert.equal(r.coverage.requiredHeadcount, 1)
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(r.distribuicaoTurmas.totalHeadcount, 1)
    assert.equal(r.distribuicaoTurmas.dailyCoverageNeed, 1)
    const nonZero = r.distribuicaoTurmas.crews.filter((c) => c.headcount > 0)
    assert.equal(nonZero.length, 1)

    const windows = resolveShiftWindows(DEFAULT_OPERATING_HOURS, 1)
    assert.ok(windows.length >= 2, 'OH 09–21 yields two tiles')
    const labeled = applyTurmaHourLabels(
      r.distribuicaoTurmas.crews,
      windows,
      '58001320',
      { dailyCoverageNeed: r.distribuicaoTurmas.dailyCoverageNeed },
    )
    const staffed = labeled.filter((c) => c.headcount > 0)
    assert.equal(staffed.length, 1)
    assert.match(staffed[0]!.label, /^09:00–17:00/)
    // Second tile must not receive the single person
    assert.ok(!staffed.some((c) => /13:00–21:00/.test(c.label)))
  })

  it('assignCrewWindowIndices packs small roster onto first tile', () => {
    assert.equal(staffedWindowCountForCoverage(2, 1, 1), 1)
    assert.equal(staffedWindowCountForCoverage(2, 2, 1), 1)
    assert.equal(staffedWindowCountForCoverage(2, 10, 10), 2)
    const crews = distributeCrews('CONTINUO_7D', 1).crews
    const idx = assignCrewWindowIndices(crews, 2, 1)
    const staffedIdx = crews
      .map((c, i) => (c.headcount > 0 ? idx[i] : null))
      .filter((x) => x != null)
    assert.deepEqual(staffedIdx, [0])
  })

  it('same HC + no HE → Δ folha ≈ 0 (encargos on both sides)', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual;vr_valor_dia;vr_dias_mes_atual;vt_valor_dia;vt_dias_mes_atual;regime_funcionamento',
      'Operador;3000;220;44;CC1;10;6x1;32;26;15;26;SEG_SEX',
    ].join('\n')
    const { rows } = parsePayrollCsv(csv)
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        payrollRows: rows,
        defaultRegimeFuncionamento: 'SEG_SEX',
      }),
    )
    assert.equal(r.coverage.additionalHeadcount, 0)
    assert.equal(r.heCascade.heCostDelta, 0)
    assert.ok(Math.abs(r.cost.monthlyDelta) < 0.01)
    assert.ok(r.vr && r.vr.monthlyDelta < 0) // 26→21 days
    assert.ok(r.vt && r.vt.monthlyDelta < 0)
  })

  it('status_quo Δ folha ≈ 0 (no fake encargos-only jump)', () => {
    const r = simulate(baseInput({ scenarioId: 'status_quo' }))
    assert.ok(Math.abs(r.cost.monthlyDelta) < 0.01)
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

  it('attaches coberturaAtualPorDia per cost center from payroll', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual;cod_horario_atual;horario_trabalho_atual',
      'Operador;2200;220;44;Loja-01;14;6x1;42;08:00-17:48',
    ].join('\n')
    const { rows } = parsePayrollCsv(csv)
    assert.equal(rows[0].horarioTrabalhoAtual, '08:00-17:48')
    const r = simulate(
      baseInput({
        payrollRows: rows,
        defaultRegimeFuncionamento: 'SEG_SAB',
      }),
    )
    assert.equal(r.byCostCenter.length, 1)
    const cc = r.byCostCenter[0]
    assert.equal(cc.codHorarioAtual, '42')
    assert.equal(cc.horarioTrabalhoAtual, '08:00-17:48')
    assert.equal(cc.escalaAtual, '6x1')
    assert.equal(cc.cargaSemanalAtual, 44)
    assert.ok(cc.coberturaAtualPorDia)
    assert.equal(cc.coberturaAtualPorDia!.seg, 14)
    assert.equal(cc.coberturaAtualPorDia!.dom, 0)
  })

  it('formatHorarioAtualLabel keeps multi-period / intervalo strings', () => {
    assert.equal(
      formatHorarioAtualLabel({
        codHorarioAtual: '4',
        horarioTrabalhoAtual: '08:00-12:00 / intervalo 60min / 13:00-17:48',
      }),
      '4 · 08:00–12:00 / intervalo 60min / 13:00–17:48',
    )
    assert.equal(
      formatHorarioAtualLabel({
        codHorarioAtual: '4',
        horarioTrabalhoAtual: '08:00-17:48',
      }),
      '4 · 08:00–17:48',
    )
  })

  it('splits same CC into horário slices (Filial → CC → horário)', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual;cod_horario_atual;cnpj_completo',
      'Operador;2200;220;44;CC-A;5;6x1;10;12345678000190',
      'Operador;2200;220;44;CC-A;3;6x1;20;12345678000190',
      'Operador;2200;220;44;CC-B;2;5x2;30;12345678000190',
    ].join('\n')
    const { rows } = parsePayrollCsv(csv)
    const r = simulate(
      baseInput({
        payrollRows: rows,
        defaultRegimeFuncionamento: 'SEG_SEX',
      }),
    )
    assert.equal(r.byCostCenter.length, 3)
    assert.deepEqual(
      r.byCostCenter.map((c) => `${c.centroCusto}:${c.codHorarioAtual}`),
      ['CC-A:10', 'CC-A:20', 'CC-B:30'],
    )
    assert.equal(r.byCostCenter[0]!.currentHeadcount, 5)
    assert.equal(r.byCostCenter[1]!.currentHeadcount, 3)
    assert.equal(r.byCostCenter[2]!.currentHeadcount, 2)
  })

  it('OH cascade: cargo beats CC; metadata + tiles use matched scope', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual;cod_cc;regime_funcionamento',
      'Operador;3000;220;44;CC-102;10;6x1;CC-102;SEG_SEX',
      'Gerente;5000;220;44;CC-102;2;6x1;CC-102;SEG_SEX',
    ].join('\n')
    const { rows } = parsePayrollCsv(csv)
    const r = simulate(
      baseInput({
        payrollRows: rows,
        defaultRegimeFuncionamento: 'SEG_SEX',
        operatingHours: { default: { openHour: 9, closeHour: 21 } },
        ohScopeRules: [
          {
            scope_type: 'global',
            target_value: '',
            operating_hours: {
              abertura: '09:00',
              fechamento: '21:00',
              dias_semana: [],
            },
          },
          {
            scope_type: 'centro_custo',
            target_value: 'CC-102',
            operating_hours: {
              abertura: '08:00',
              fechamento: '16:00',
              dias_semana: [],
            },
          },
          {
            scope_type: 'cargo',
            target_value: 'Operador',
            operating_hours: {
              abertura: '06:00',
              fechamento: '14:00',
              dias_semana: [],
            },
          },
        ],
      }),
    )
    // Dominant cargo in the single CC×horário slice is Operador (10 vs 2).
    assert.equal(r.byCostCenter.length, 1)
    const cc = r.byCostCenter[0]!
    assert.equal(cc.ohScopeMatch?.scopeType, 'cargo')
    assert.equal(cc.ohScopeMatch?.targetValue, 'Operador')
    assert.deepEqual(cc.operatingHours?.default, {
      openHour: 6,
      closeHour: 14,
    })
    // Short 8h window → single tile (no 09–21 double tile invent).
    const sug = r.scheduleSuggestions.filter((s) => s.centroCusto === cc.centroCusto)
    assert.ok(sug.length > 0)
    assert.equal(sug[0]!.ohScopeMatch?.scopeType, 'cargo')
    assert.equal(sug[0]!.shifts.length, 1)
    assert.equal(sug[0]!.shifts[0]!.startHour, 6)
    assert.equal(r.coverage.additionalHeadcount, 0)
  })

  it('OH cascade: falls back to global when no segmented match', () => {
    const csv = [
      'cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;quantidade;escala_atual',
      'Analista;4000;220;44;CC-OTHER;5;6x1',
    ].join('\n')
    const { rows } = parsePayrollCsv(csv)
    const r = simulate(
      baseInput({
        payrollRows: rows,
        defaultRegimeFuncionamento: 'SEG_SEX',
        ohScopeRules: [
          {
            scope_type: 'global',
            target_value: '',
            operating_hours: {
              abertura: '10:00',
              fechamento: '18:00',
              dias_semana: [],
            },
          },
          {
            scope_type: 'centro_custo',
            target_value: 'CC-102',
            operating_hours: {
              abertura: '07:00',
              fechamento: '15:00',
              dias_semana: [],
            },
          },
        ],
      }),
    )
    const cc = r.byCostCenter[0]!
    assert.equal(cc.ohScopeMatch?.scopeType, 'global')
    assert.deepEqual(cc.operatingHours?.default, {
      openHour: 10,
      closeHour: 18,
    })
  })
})
