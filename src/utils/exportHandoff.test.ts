import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_MASK_COLLABORATOR_NAMES,
  scrubNomeForHandoffExport,
} from '../apdata/lgpdNameMask'
import { emptyPayrollExtras } from '../engine/payroll'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'
import { simulate } from '../engine/simulate'
import {
  AHR_HANDOFF_SCHEMA_VERSION,
  buildAhrHandoff,
} from './exportHandoff'

describe('exportHandoff AHR JSON', () => {
  it('builds full Apdata hierarchy from SimulationResult (no UI accordion required)', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 20,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      estrategiaAbsorcao: 'HORA_EXTRA_MAXIMA',
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const payload = buildAhrHandoff(result, { dataInicio: '2026-12-01' })
    assert.equal(payload.schemaVersion, AHR_HANDOFF_SCHEMA_VERSION)
    assert.equal(payload.product, 'Turnocheck')
    assert.equal(payload.heCapBadge.estrategia, 'HORA_EXTRA_MAXIMA')
    assert.equal(payload.distribuicaoTurmas.crewCount, 7)
    assert.equal(payload.apdataHierarchy.dataInicio, '2026-12-01')
    // OH 09–21 → 2 shift tiles × 7 turmas
    assert.equal(payload.apdataHierarchy.grades.length, 14)
    assert.ok(
      payload.apdataHierarchy.jornadas.every(
        (j) => j.workPeriods.length === 1 || j.workPeriods.length === 2,
      ),
    )
    assert.ok(
      payload.apdataHierarchy.jornadas.every(
        (j) => !/Almo[cç]o/i.test(j.descricao) && !j.codigo.includes('ALM'),
      ),
    )
    assert.ok(
      payload.apdataHierarchy.ciclos.every((c) => c.dataInicio === '2026-12-01'),
    )
    const json = JSON.stringify(payload)
    assert.ok(!/"nome"\s*:/i.test(json))
    assert.ok(!/"cpf"\s*:/i.test(json))
    assert.ok(payload.scenario.salaryDivisor === 210)
  })

  it('LGPD: handoff scrub never exports unmasked names when mask on', () => {
    assert.equal(DEFAULT_MASK_COLLABORATOR_NAMES, true)
    const result = simulate({
      sector: 'varejo',
      headcount: 5,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      payrollRows: [
        {
          cargo: 'Operador',
          salario: 2200,
          cargaHorariaMensal: 220,
          cargaHorariaSemanal: 44,
          centroCusto: 'CC-01',
          vrValorDia: null,
          vrDiasMesAtual: null,
          vtValorDia: null,
          vtDiasMesAtual: null,
          nome: 'João Silva',
          quantidade: 1,
          escalaAtual: '6x1',
          sourceLine: 2,
          ...emptyPayrollExtras(),
        },
      ],
    })
    const withMask = buildAhrHandoff(result, { maskCollaboratorNames: true })
    const withoutMaskFlag = buildAhrHandoff(result, {
      maskCollaboratorNames: false,
    })
    const jsonOn = JSON.stringify(withMask)
    const jsonOff = JSON.stringify(withoutMaskFlag)
    assert.ok(!jsonOn.includes('João Silva'))
    assert.ok(!jsonOn.includes('J*** S****'))
    assert.ok(!jsonOff.includes('João Silva'))
    assert.equal(scrubNomeForHandoffExport('João Silva', true), null)
    assert.equal(scrubNomeForHandoffExport('João Silva', false), null)
  })
})

