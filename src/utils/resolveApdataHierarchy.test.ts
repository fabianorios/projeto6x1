import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApdataHierarchy } from '../engine/apdata-hierarchy'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'
import { simulate } from '../engine/simulate'
import { resolveApdataHierarchy } from './resolveApdataHierarchy'

describe('resolveApdataHierarchy', () => {
  it('prefers seeded tree on SimulationResult (no rebuild)', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 20,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const seeded = buildApdataHierarchy(result, { dataInicio: '2026-12-01' })
    const withSeed = { ...result, apdataHierarchy: seeded }
    const resolved = resolveApdataHierarchy(withSeed, {
      dataInicio: '2026-12-01',
    })
    assert.equal(resolved, seeded)
  })

  it('rebuilds when lunch option diverges from seed', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 20,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const seeded = buildApdataHierarchy(result, {
      dataInicio: '2026-12-01',
      includeLunchJornada: false,
    })
    const withSeed = { ...result, apdataHierarchy: seeded }
    const rebuilt = resolveApdataHierarchy(withSeed, {
      dataInicio: '2026-12-01',
      includeLunchJornada: true,
    })
    assert.notEqual(rebuilt, seeded)
    assert.equal(rebuilt.includeLunchJornada, true)
  })
})
