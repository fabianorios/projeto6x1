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

  it('value shell truncates/contains overflow', () => {
    assert.match(EXECUTIVE_KPI_VALUE_SHELL_CLASS, /\boverflow-hidden\b/)
    assert.match(EXECUTIVE_KPI_VALUE_SHELL_CLASS, /\bmin-w-0\b/)
    assert.match(EXECUTIVE_KPI_VALUE_SHELL_CLASS, /\btext-ellipsis\b/)
    assert.match(EXECUTIVE_KPI_HINT_CLASS, /\boverflow-hidden\b/)
  })

  it('ignores spaces when measuring display length', () => {
    assert.equal(executiveKpiDisplayLength('+R$ 1.030.367'), 12)
    assert.equal(executiveKpiDisplayLength('+R$1.030.367'), 12)
  })

  it('steps down type for million-scale signed BRL (PX-125)', () => {
    const million = '+R$ 1.030.367' // len 12
    const mid = '+R$ 183.612' // len 10
    const short = '+R$ 83.612' // len 9
    const tiny = '—'

    assert.equal(executiveKpiDisplayLength(million), 12)
    assert.equal(executiveKpiDisplayLength(mid), 10)
    assert.equal(executiveKpiDisplayLength(short), 9)
    assert.match(executiveKpiValueSizeClass(million), /0\.95rem/)
    assert.match(executiveKpiValueSizeClass(mid), /1\.05rem/)
    assert.match(executiveKpiValueSizeClass(short), /1\.25rem/)
    assert.match(executiveKpiValueSizeClass(tiny), /1\.25rem/)
  })

  it('composes value class with optional tone', () => {
    const cls = executiveKpiValueClass('+R$ 1.030.367', 'text-red-800')
    assert.match(cls, /\bmin-w-0\b/)
    assert.match(cls, /\boverflow-hidden\b/)
    assert.match(cls, /clamp/)
    assert.match(cls, /\btext-red-800\b/)
  })
})
