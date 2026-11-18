import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_OPERATING_HOURS,
  OH_SCOPE_CASCADE_PRIORITY,
  effectiveGlobalOperatingHours,
  ensureGlobalOHScopeRule,
  globalRuleFromOperatingHours,
  isOHScopeType,
  normalizeOHScopeRules,
  ohWindowToOperatingHours,
  operatingHoursToOhWindow,
  parseOHScopeRule,
  parseScopeClock,
  prepareOHScopeRulesForInput,
  type OHScopeRule,
} from './operating-hours'

describe('OHScopeRule helpers (Etapa 1)', () => {
  it('isOHScopeType accepts only known scopes', () => {
    assert.equal(isOHScopeType('global'), true)
    assert.equal(isOHScopeType('cargo'), true)
    assert.equal(isOHScopeType('centro_custo'), true)
    assert.equal(isOHScopeType('publico'), true)
    assert.equal(isOHScopeType('filial'), false)
    assert.equal(isOHScopeType(null), false)
  })

  it('documents cascade priority cargo → CC → publico → global', () => {
    assert.deepEqual([...OH_SCOPE_CASCADE_PRIORITY], [
      'cargo',
      'centro_custo',
      'publico',
      'global',
    ])
  })

  it('parseScopeClock reads HH:MM and 24:00', () => {
    assert.equal(parseScopeClock('09:00'), 9)
    assert.equal(parseScopeClock('13:30'), 13.5)
    assert.equal(parseScopeClock('24:00'), 24)
    assert.equal(parseScopeClock('25:00'), null)
    assert.equal(parseScopeClock('abc'), null)
  })

  it('round-trips default OperatingHours through OHScopeWindow', () => {
    const win = operatingHoursToOhWindow(DEFAULT_OPERATING_HOURS)
    assert.deepEqual(win, {
      abertura: '09:00',
      fechamento: '21:00',
      dias_semana: [],
    })
    const back = ohWindowToOperatingHours(win)
    assert.deepEqual(back.default, DEFAULT_OPERATING_HOURS.default)
    assert.equal(back.byWeekday, undefined)
  })

  it('marks closed weekdays from dias_semana (Mon–Fri)', () => {
    const hours = ohWindowToOperatingHours({
      abertura: '08:00',
      fechamento: '18:00',
      dias_semana: [1, 2, 3, 4, 5],
    })
    assert.equal(hours.default.openHour, 8)
    assert.equal(hours.default.closeHour, 18)
    assert.equal(hours.byWeekday?.sat?.closed, true)
    assert.equal(hours.byWeekday?.sun?.closed, true)
    assert.equal(hours.byWeekday?.mon, undefined)
  })

  it('parseOHScopeRule / normalizeOHScopeRules drop invalid entries', () => {
    const ok = parseOHScopeRule({
      scope_type: 'cargo',
      target_value: 'Administrativo',
      operating_hours: {
        abertura: '08:00',
        fechamento: '17:00',
        dias_semana: [1, 2, 3, 4, 5],
      },
    })
    assert.ok(ok)
    assert.equal(ok!.scope_type, 'cargo')
    assert.equal(ok!.target_value, 'Administrativo')

    assert.equal(
      parseOHScopeRule({
        scope_type: 'cargo',
        target_value: 'X',
        operating_hours: { abertura: 'bad', fechamento: '17:00', dias_semana: [] },
      }),
      null,
    )

    const rules = normalizeOHScopeRules([
      ok,
      { scope_type: 'nope' },
      {
        scope_type: 'centro_custo',
        target_value: 'CC-102',
        operating_hours: {
          abertura: '10:00',
          fechamento: '22:00',
          dias_semana: [1, 2, 3, 4, 5, 6],
        },
      },
    ])
    assert.equal(rules.length, 2)
    assert.equal(rules[0].scope_type, 'cargo')
    assert.equal(rules[1].target_value, 'CC-102')
  })

  it('prepareOHScopeRulesForInput keeps omission for backward compatibility', () => {
    assert.equal(
      prepareOHScopeRulesForInput(undefined, DEFAULT_OPERATING_HOURS),
      undefined,
    )
    assert.equal(
      prepareOHScopeRulesForInput(null, DEFAULT_OPERATING_HOURS),
      undefined,
    )
  })

  it('ensureGlobalOHScopeRule synthesizes global from operatingHours', () => {
    const segmented: OHScopeRule[] = [
      {
        scope_type: 'publico',
        target_value: 'Administrativo',
        operating_hours: {
          abertura: '08:00',
          fechamento: '17:00',
          dias_semana: [1, 2, 3, 4, 5],
        },
      },
    ]
    const withGlobal = ensureGlobalOHScopeRule(
      segmented,
      DEFAULT_OPERATING_HOURS,
    )
    assert.equal(withGlobal[0].scope_type, 'global')
    assert.deepEqual(withGlobal[0].operating_hours, {
      abertura: '09:00',
      fechamento: '21:00',
      dias_semana: [],
    })
    assert.equal(withGlobal[1].scope_type, 'publico')

    const already = ensureGlobalOHScopeRule(
      [globalRuleFromOperatingHours(DEFAULT_OPERATING_HOURS), ...segmented],
      { default: { openHour: 7, closeHour: 19 } },
    )
    assert.equal(already.length, 2)
    assert.equal(already[0].operating_hours.abertura, '09:00')
  })

  it('effectiveGlobalOperatingHours prefers global rule, else fallback', () => {
    assert.deepEqual(
      effectiveGlobalOperatingHours(undefined, DEFAULT_OPERATING_HOURS),
      DEFAULT_OPERATING_HOURS,
    )
    const rules: OHScopeRule[] = [
      {
        scope_type: 'cargo',
        target_value: 'Operador',
        operating_hours: {
          abertura: '06:00',
          fechamento: '14:00',
          dias_semana: [],
        },
      },
      {
        scope_type: 'global',
        target_value: '',
        operating_hours: {
          abertura: '10:00',
          fechamento: '20:00',
          dias_semana: [],
        },
      },
    ]
    const eff = effectiveGlobalOperatingHours(rules, DEFAULT_OPERATING_HOURS)
    assert.deepEqual(eff.default, { openHour: 10, closeHour: 20 })
  })

  it('prepareOHScopeRulesForInput materializes global when array provided', () => {
    const prepared = prepareOHScopeRulesForInput(
      [
        {
          scope_type: 'centro_custo',
          target_value: 'CC-102',
          operating_hours: {
            abertura: '07:00',
            fechamento: '15:00',
            dias_semana: [1, 2, 3, 4, 5],
          },
        },
      ],
      DEFAULT_OPERATING_HOURS,
    )
    assert.ok(prepared)
    assert.equal(prepared![0].scope_type, 'global')
    assert.equal(prepared![1].scope_type, 'centro_custo')
  })
})
