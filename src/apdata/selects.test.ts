import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIVE_SELECT_STEPS, REVIEW_SELECTS } from './selects'

describe('Apdata TiposDiasPonto column prefix', () => {
  it('live tipos-dia step uses TIP_* (not TDP_*)', () => {
    const step = LIVE_SELECT_STEPS.find((s) => s.id === 'tipos-dia')
    assert.ok(step)
    assert.deepEqual(step.columns, [
      'TIP_CdiTipoDiaPonto',
      'TIP_OplTrabalho',
    ])
    assert.ok(!step.columns.some((c) => c.startsWith('TDP_')))
  })

  it('review SELECTs join TiposDiasPonto on TIP_* columns', () => {
    const withTipos = REVIEW_SELECTS.filter((s) =>
      s.sql.includes('TiposDiasPonto'),
    )
    assert.ok(withTipos.length >= 1)
    for (const sel of withTipos) {
      assert.match(sel.sql, /TIP_OplTrabalho/)
      assert.match(sel.sql, /TIP_CdiTipoDiaPonto/)
      assert.ok(!sel.sql.includes('TDP_OplTrabalho'), sel.id)
      assert.ok(!sel.sql.includes('TDP_CdiTipoDiaPonto'), sel.id)
    }
  })
})
