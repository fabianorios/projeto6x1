import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXECUTIVE_KPI_CARD_CLASS,
  EXECUTIVE_KPI_CARD_HERO_CLASS,
  EXECUTIVE_KPI_CARD_PLAIN_CLASS,
  EXECUTIVE_KPI_HINT_CLASS,
  EXECUTIVE_KPI_VALUE_SHELL_CLASS,
  executiveKpiDisplayLength,
  executiveKpiValueClass,
  executiveKpiValueSizeClass,
  formatExecutiveNumber,
  formatSignedExecutiveNumber,
} from './executiveKpi'

describe('executiveKpi layout helpers', () => {
  it('cards always include min-w-0 and overflow-hidden', () => {
    for (const cls of [
      EXECUTIVE_KPI_CARD_CLASS,
      EXECUTIVE_KPI_CARD_HERO_CLASS,
      EXECUTIVE_KPI_CARD_PLAIN_CLASS,
    ]) {
      assert.match(cls, /\bmin-w-0\b/)
      assert.match(cls, /\boverflow-hidden\b/)
    }
  })

  it('value and hint never use ellipsis / nowrap truncation (PX-128)', () => {
    for (const cls of [
      EXECUTIVE_KPI_VALUE_SHELL_CLASS,
      EXECUTIVE_KPI_HINT_CLASS,
    ]) {
      assert.match(cls, /\bmin-w-0\b/)
      assert.match(cls, /\bbreak-words\b/)
      assert.doesNotMatch(cls, /\btext-ellipsis\b/)
      assert.doesNotMatch(cls, /\bwhitespace-nowrap\b/)
      assert.doesNotMatch(cls, /\btruncate\b/)
    }
  })

  it('formats C-Level amounts as pt-BR numeric without R$ (PX-130)', () => {
    assert.equal(formatExecutiveNumber(1_030_367), '1.030.367')
    assert.equal(formatExecutiveNumber(183_612), '183.612')
    assert.equal(formatSignedExecutiveNumber(1_030_367), '+1.030.367')
    assert.equal(formatSignedExecutiveNumber(-183_612), '−183.612')
    assert.equal(formatSignedExecutiveNumber(0), '0')
    assert.doesNotMatch(formatSignedExecutiveNumber(12_000), /R\$/)
    assert.doesNotMatch(formatSignedExecutiveNumber(-12_000), /R\$/)
  })

  it('ignores spaces when measuring display length', () => {
    assert.equal(executiveKpiDisplayLength('+1.030.367'), 10)
    assert.equal(executiveKpiDisplayLength('+ 1.030.367'), 10)
    assert.equal(executiveKpiDisplayLength('754 → 832'), 7)
  })

  it('steps down type for million-scale signed numbers (PX-125/128/130)', () => {
    const million = '+1.030.367' // len 10
    const mid = '+183.612' // len 8
    const short = '+83.612' // len 7
    const headcount = '754 → 832' // len 7
    const tiny = '—'

    assert.equal(executiveKpiDisplayLength(million), 10)
    assert.equal(executiveKpiDisplayLength(mid), 8)
    assert.equal(executiveKpiDisplayLength(short), 7)
    assert.equal(executiveKpiDisplayLength(headcount), 7)
    assert.match(executiveKpiValueSizeClass(million), /0\.8rem/)
    assert.match(executiveKpiValueSizeClass(mid), /0\.9rem/)
    assert.match(executiveKpiValueSizeClass(short), /1rem/)
    assert.match(executiveKpiValueSizeClass(headcount), /1rem/)
    assert.match(executiveKpiValueSizeClass(tiny), /1\.15rem/)
  })

  it('composes value class with optional tone and no ellipsis', () => {
    const cls = executiveKpiValueClass('+1.030.367', 'text-red-800')
    assert.match(cls, /\bmin-w-0\b/)
    assert.match(cls, /\bbreak-words\b/)
    assert.match(cls, /clamp/)
    assert.match(cls, /\btext-red-800\b/)
    assert.doesNotMatch(cls, /\btext-ellipsis\b/)
    assert.doesNotMatch(cls, /\bwhitespace-nowrap\b/)
  })
})
