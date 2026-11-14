import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { distributeCrews } from './crew-distribution'
import {
  coberturaPropostaFromDistribution,
  compareCoverageDay,
  deriveCoberturaAtualPorDia,
} from './coverage-days'
import { makeScale } from './rules'

describe('deriveCoberturaAtualPorDia', () => {
  it('5x2 fills seg–sex with full HC', () => {
    const c = deriveCoberturaAtualPorDia(20, makeScale(5, 2), 'SEG_SEX')
    assert.equal(c.seg, 20)
    assert.equal(c.sex, 20)
    assert.equal(c.sab, 0)
    assert.equal(c.dom, 0)
  })

  it('6x1 fills seg–sáb', () => {
    const c = deriveCoberturaAtualPorDia(14, makeScale(6, 1), 'SEG_SAB')
    assert.equal(c.seg, 14)
    assert.equal(c.sab, 14)
    assert.equal(c.dom, 0)
  })

  it('CONTINUO_7D uses HC × workRatio every day', () => {
    const c = deriveCoberturaAtualPorDia(35, makeScale(6, 1), 'CONTINUO_7D')
    const expected = Math.round(35 * (6 / 7))
    for (const d of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const) {
      assert.equal(c[d], expected)
    }
  })
})

describe('coberturaPropostaFromDistribution', () => {
  it('CONTINUO_7D daily = 5 × crewSize', () => {
    const dist = distributeCrews('CONTINUO_7D', 35)
    const cov = coberturaPropostaFromDistribution(dist)
    const crewSize = dist.totalHeadcount / 7
    for (const d of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const) {
      assert.equal(cov[d], crewSize * 5)
    }
  })
})

describe('compareCoverageDay', () => {
  it('marks ok / below / flat', () => {
    assert.equal(compareCoverageDay(10, 10), 'ok')
    assert.equal(compareCoverageDay(10, 12), 'ok')
    assert.equal(compareCoverageDay(10, 9), 'below')
    assert.equal(compareCoverageDay(0, 0), 'flat')
  })
})
