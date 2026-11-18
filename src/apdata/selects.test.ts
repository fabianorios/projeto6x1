import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIVE_SELECT_STEPS, REVIEW_SELECTS } from './selects'

describe('Apdata LIVE selects — Sindicatos + HMV (Etapa 5)', () => {
  it('hmv step lists HMV_Cdi / HMV_QtnQuantidadeHoraMes / HMV_QtnHorasSemanal', () => {
    const step = LIVE_SELECT_STEPS.find((s) => s.id === 'hmv')
    assert.ok(step)
    assert.equal(step.table, 'QuantidadesHorasMes')
    assert.deepEqual(step.columns, [
      'HMV_CdiQuantidadeHoraMes',
      'HMV_QtnQuantidadeHoraMes',
      'HMV_QtnHorasSemanal',
    ])
  })

  it('sindicatos step lists SIN_CdiSindicato / SIN_D1sSindicato / SIN_NusCNPJ', () => {
    const step = LIVE_SELECT_STEPS.find((s) => s.id === 'sindicatos')
    assert.ok(step)
    assert.equal(step.table, 'Sindicatos')
    assert.deepEqual(step.columns, [
      'SIN_CdiSindicato',
      'SIN_D1sSindicato',
      'SIN_NusCNPJ',
    ])
  })

  it('contratados step carries CON_CdiSindicato + CON_CdiQuantidadeHoraMes FKs', () => {
    const step = LIVE_SELECT_STEPS.find((s) => s.id === 'contratados')
    assert.ok(step)
    assert.ok(step.columns.includes('CON_CdiSindicato'))
    assert.ok(step.columns.includes('CON_CdiQuantidadeHoraMes'))
    assert.ok(!step.columns.some((c) => /nome|cpf|dssnome/i.test(c)))
  })
})

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
