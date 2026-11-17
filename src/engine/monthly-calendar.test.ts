import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { distributeCrews } from './crew-distribution'
import {
  baselineCrewsForCalendar,
  buildMonthCalendarMatrix,
  buildMonthDays,
  crewWorksOnDay,
  daysInMonth,
  defaultReferencePeriod,
  minimumNeedForWeekday,
  shiftCoverageWeekday,
} from './monthly-calendar'

describe('defaultReferencePeriod', () => {
  it('Dec/2026 for 42h and Dec/2027 for 40h', () => {
    assert.deepEqual(defaultReferencePeriod('fase1_2026_42h'), {
      year: 2026,
      month: 12,
    })
    assert.deepEqual(defaultReferencePeriod('fase2_2027_40h'), {
      year: 2027,
      month: 12,
    })
    assert.deepEqual(defaultReferencePeriod('pec_draft_conservative'), {
      year: 2026,
      month: 12,
    })
  })
})

describe('buildMonthDays', () => {
  it('builds 31 days for Dec 2026 with weekend flags', () => {
    assert.equal(daysInMonth(2026, 12), 31)
    const days = buildMonthDays(2026, 12)
    assert.equal(days.length, 31)
    // 2026-12-01 is Tuesday
    assert.equal(days[0].weekday, 'ter')
    assert.equal(days[0].weekdayLabel, 'Ter')
    // 2026-12-05 is Saturday
    assert.equal(days[4].weekday, 'sab')
    assert.equal(days[4].isWeekend, true)
    assert.equal(days[5].weekday, 'dom')
    assert.equal(days[5].isWeekend, true)
  })

  it('handles Feb 2027 (28 days)', () => {
    assert.equal(daysInMonth(2027, 2), 28)
    assert.equal(buildMonthDays(2027, 2).length, 28)
  })
})

describe('shiftCoverageWeekday / rotating 5×2', () => {
  it('shifts rest days +1 per week', () => {
    assert.equal(shiftCoverageWeekday('sab', 1), 'dom')
    assert.equal(shiftCoverageWeekday('dom', 1), 'seg')
    assert.equal(shiftCoverageWeekday('seg', 6), 'dom')
  })

  it('advances offs week to week for a 5×2 crew', () => {
    const crew = {
      workDays: ['seg', 'ter', 'qua', 'qui', 'sex'],
      restDays: ['sab', 'dom'],
      escala: '5x2',
    }
    const week0Sab = buildMonthDays(2026, 12).find(
      (d) => d.day === 5 && d.weekday === 'sab',
    )!
    assert.equal(week0Sab.weekIndex, 0)
    assert.equal(crewWorksOnDay(crew, week0Sab, true), false)

    // Next Saturday (day 12) is weekIndex 1 → rest shifted to dom+seg → sab is work
    const week1Sab = buildMonthDays(2026, 12).find((d) => d.day === 12)!
    assert.equal(week1Sab.weekday, 'sab')
    assert.equal(week1Sab.weekIndex, 1)
    assert.equal(crewWorksOnDay(crew, week1Sab, true), true)
  })
})

describe('buildMonthCalendarMatrix CONTINUO_7D', () => {
  it('keeps ~5/7 crews working each day and flags uncover', () => {
    const dist = distributeCrews('CONTINUO_7D', 35)
    const matrix = buildMonthCalendarMatrix({
      year: 2026,
      month: 12,
      crews: dist.crews,
      regime: 'CONTINUO_7D',
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: true,
    })
    assert.equal(matrix.rows.length, 7)
    assert.equal(matrix.days.length, 31)
    for (const cell of matrix.daily) {
      // 5 of 7 crews × crewSize
      assert.equal(cell.working, dist.dailyCoverageNeed)
      assert.equal(cell.uncovered, false)
    }
  })

  it('marks uncovered when HC is too low', () => {
    const dist = distributeCrews('CONTINUO_7D', 35)
    const thin = dist.crews.map((c) => ({ ...c, headcount: 1 }))
    const matrix = buildMonthCalendarMatrix({
      year: 2026,
      month: 12,
      crews: thin,
      regime: 'CONTINUO_7D',
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: true,
    })
    assert.ok(matrix.daily.some((d) => d.uncovered))
  })
})

describe('minimumNeedForWeekday', () => {
  it('SEG_SEX zeros weekend; SEG_SAB zeros Sunday', () => {
    assert.equal(minimumNeedForWeekday('SEG_SEX', 'seg', 10), 10)
    assert.equal(minimumNeedForWeekday('SEG_SEX', 'sab', 10), 0)
    assert.equal(minimumNeedForWeekday('SEG_SAB', 'sab', 10), 10)
    assert.equal(minimumNeedForWeekday('SEG_SAB', 'dom', 10), 0)
    assert.equal(minimumNeedForWeekday('CONTINUO_7D', 'dom', 10), 10)
  })
})

describe('baselineCrewsForCalendar', () => {
  it('5×2 baseline is single turma Mon–Fri', () => {
    const crews = baselineCrewsForCalendar({
      currentHeadcount: 20,
      escalaAtual: '5x2',
      regime: 'SEG_SEX',
    })
    assert.equal(crews.length, 1)
    assert.equal(crews[0].headcount, 20)
    assert.ok(crews[0].workDays.includes('seg'))
    assert.ok(crews[0].restDays.includes('dom'))
  })

  it('CONTINUO_7D baseline keeps exact current HC across T1–T7', () => {
    const crews = baselineCrewsForCalendar({
      currentHeadcount: 8,
      escalaAtual: '6x1',
      regime: 'CONTINUO_7D',
    })
    assert.equal(crews.length, 7)
    assert.equal(
      crews.reduce((s, c) => s + c.headcount, 0),
      8,
    )
  })
})
