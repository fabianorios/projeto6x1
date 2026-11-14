import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseScale } from './scale'
import { resolveBenefitDays } from './payroll'

describe('resolveBenefitDays modo_dias', () => {
  const current = parseScale('6x1')
  const target = parseScale('5x2')

  it('ESCALA recalculates proposed days from target scale', () => {
    const r = resolveBenefitDays(26, current, target, 'ESCALA', 26)
    assert.equal(r.currentDays, 26)
    assert.equal(r.proposedDays, 21) // round(30 * 5/7)
  })

  it('FIXO_MES keeps dias_base_mes fixed in projection', () => {
    const r = resolveBenefitDays(26, current, target, 'FIXO_MES', 22)
    assert.equal(r.currentDays, 22)
    assert.equal(r.proposedDays, 22)
  })

  it('CALENDARIO_LOCAL keeps dias_base_mes fixed', () => {
    const r = resolveBenefitDays(null, current, target, 'CALENDARIO_LOCAL', 20)
    assert.equal(r.currentDays, 20)
    assert.equal(r.proposedDays, 20)
  })
})
