import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, simulate } from '../engine'
import {
  AHR_HANDOFF_SCHEMA_VERSION,
  buildAhrHandoff,
} from './exportHandoff'

describe('exportHandoff AHR JSON', () => {
  it('builds schema without PII fields', () => {
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
    const payload = buildAhrHandoff(result)
    assert.equal(payload.schemaVersion, AHR_HANDOFF_SCHEMA_VERSION)
    assert.equal(payload.product, 'Turnocheck')
    assert.equal(payload.heCapBadge.estrategia, 'HORA_EXTRA_MAXIMA')
    assert.equal(payload.distribuicaoTurmas.crewCount, 7)
    const json = JSON.stringify(payload)
    assert.ok(!/"nome"\s*:/i.test(json))
    assert.ok(!/"cpf"\s*:/i.test(json))
    assert.ok(payload.scenario.salaryDivisor === 210)
  })
})
