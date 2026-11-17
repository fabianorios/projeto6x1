import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS } from './operating-hours'
import {
  buildShiftWindows,
  suggestSchedules,
} from './schedule-suggest'

describe('buildShiftWindows HC split', () => {
  it('does not invent HC when tiling 09–21 with roster 1', () => {
    const shifts = buildShiftWindows('5x2', DEFAULT_OPERATING_HOURS, 1)
    assert.ok(shifts.length >= 2, 'default OH 09–21 yields ≥2 tiles')
    assert.equal(
      shifts.reduce((s, w) => s + w.headcount, 0),
      1,
    )
    assert.ok(shifts.every((w) => w.headcount >= 0))
    assert.ok(shifts.some((w) => w.headcount === 0))
  })

  it('preserves exact HC across tiles (10 → sum 10)', () => {
    const shifts = buildShiftWindows('5x2', DEFAULT_OPERATING_HOURS, 10)
    assert.equal(
      shifts.reduce((s, w) => s + w.headcount, 0),
      10,
    )
  })
})

describe('suggestSchedules no invent', () => {
  it('SEG_SEX + folga fixa + HC=1 keeps suggestion roster at 1', () => {
    const result = suggestSchedules({
      sector: 'varejo',
      scenarioId: 'fase1_2026_42h',
      currentScale: '6x1',
      headcount: 1,
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 2,
      operatingHours: DEFAULT_OPERATING_HOURS,
      projectedChargeFactor: 1.6,
      coverageBuffer: 0.05,
      defaultRegimeFuncionamento: 'SEG_SEX',
    })
    assert.ok(result.suggestions.length >= 1)
    for (const s of result.suggestions) {
      assert.equal(
        s.totalHeadcount,
        1,
        `${s.code} must not invent via posts or tile pad`,
      )
    }
  })

  it('CONTINUO_7D still applies scale factor on HC=1', () => {
    const result = suggestSchedules({
      sector: 'varejo',
      scenarioId: 'fase1_2026_42h',
      currentScale: '6x1',
      headcount: 1,
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 1,
      operatingHours: DEFAULT_OPERATING_HOURS,
      projectedChargeFactor: 1.6,
      coverageBuffer: 0.05,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const fiveByTwo = result.suggestions.find((s) => s.code === '5x2')
    assert.ok(fiveByTwo)
    assert.ok(fiveByTwo!.totalHeadcount >= 2)
  })
})
