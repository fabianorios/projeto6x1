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
  ohScopeMatchContextFromPayrollRow,
  ohWindowToOperatingHours,
  operatingHoursToOhWindow,
  parseOHScopeRule,
  parseScopeClock,
  prepareOHScopeRulesForInput,
  resolveOperatingHoursForEntity,
  syncOhScopeRulesWithGlobalHours,
  type OHScopeRule,
} from './operating-hours'

describe('OHScopeRule helpers (Etapa 1)', () => {
  it('isOHScopeType accepts only known scopes', () => {
    assert.equal(isOHScopeType('global'), true)
    assert.equal(isOHScopeType('cargo'), true)
    assert.equal(isOHScopeType('centro_custo'), true)
    assert.equal(isOHScopeType('sindicato'), true)
    assert.equal(isOHScopeType('publico'), true)
    assert.equal(isOHScopeType('filial'), false)
    assert.equal(isOHScopeType(null), false)
  })

  it('documents cascade priority cargo → CC → sindicato → publico → global', () => {
    assert.deepEqual([...OH_SCOPE_CASCADE_PRIORITY], [
      'cargo',
      'centro_custo',
      'sindicato',
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

  it('syncOhScopeRulesWithGlobalHours refreshes global window from wizard OH', () => {
    const synced = syncOhScopeRulesWithGlobalHours(
      [
        {
          scope_type: 'global',
          target_value: '',
          operating_hours: {
            abertura: '01:00',
            fechamento: '02:00',
            dias_semana: [],
          },
        },
        {
          scope_type: 'cargo',
          target_value: 'Operador',
          operating_hours: {
            abertura: '06:00',
            fechamento: '14:00',
            dias_semana: [],
          },
        },
      ],
      { default: { openHour: 9, closeHour: 21 } },
    )
    assert.equal(synced[0]!.scope_type, 'global')
    assert.equal(synced[0]!.operating_hours.abertura, '09:00')
    assert.equal(synced[0]!.operating_hours.fechamento, '21:00')
    assert.equal(synced[1]!.scope_type, 'cargo')
  })
})

describe('resolveOperatingHoursForEntity (Etapa 2 cascade)', () => {
  const cargoRule: OHScopeRule = {
    scope_type: 'cargo',
    target_value: 'Operador',
    operating_hours: {
      abertura: '06:00',
      fechamento: '14:00',
      dias_semana: [],
    },
  }
  const ccRule: OHScopeRule = {
    scope_type: 'centro_custo',
    target_value: 'CC-102',
    operating_hours: {
      abertura: '07:00',
      fechamento: '15:00',
      dias_semana: [],
    },
  }
  const sindicatoRule: OHScopeRule = {
    scope_type: 'sindicato',
    target_value: '12',
    target_label: 'Sindicato Metalúrgicos',
    operating_hours: {
      abertura: '07:30',
      fechamento: '16:30',
      dias_semana: [],
    },
  }
  const publicoRule: OHScopeRule = {
    scope_type: 'publico',
    target_value: 'Administrativo',
    operating_hours: {
      abertura: '08:00',
      fechamento: '17:00',
      dias_semana: [1, 2, 3, 4, 5],
    },
  }
  const globalRule: OHScopeRule = {
    scope_type: 'global',
    target_value: '',
    operating_hours: {
      abertura: '10:00',
      fechamento: '20:00',
      dias_semana: [],
    },
  }
  const allRules = [
    globalRule,
    publicoRule,
    sindicatoRule,
    ccRule,
    cargoRule,
  ]

  it('falls back to wizard operatingHours when ohScopeRules omitted', () => {
    const r = resolveOperatingHoursForEntity(
      undefined,
      DEFAULT_OPERATING_HOURS,
      { cargo: 'Operador', centroCusto: 'CC-102' },
    )
    assert.equal(r.scopeType, 'global')
    assert.equal(r.targetValue, '')
    assert.deepEqual(r.hours.default, DEFAULT_OPERATING_HOURS.default)
  })

  it('prefers cargo over CC, publico, and global', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'operador',
      centroCusto: 'CC-102',
      publico: 'Administrativo',
    })
    assert.equal(r.scopeType, 'cargo')
    assert.equal(r.targetValue, 'Operador')
    assert.deepEqual(r.hours.default, { openHour: 6, closeHour: 14 })
  })

  it('matches cargo via descCargo / codCargo (trim + case)', () => {
    const byDesc = resolveOperatingHoursForEntity(
      allRules,
      DEFAULT_OPERATING_HOURS,
      { descCargo: '  OPERADOR  ' },
    )
    assert.equal(byDesc.scopeType, 'cargo')
    const byCod = resolveOperatingHoursForEntity(
      [{ ...cargoRule, target_value: 'CARGO-9' }, globalRule],
      DEFAULT_OPERATING_HOURS,
      { codCargo: 'cargo-9' },
    )
    assert.equal(byCod.scopeType, 'cargo')
    assert.equal(byCod.targetValue, 'CARGO-9')
  })

  it('falls through to centro_custo when cargo misses', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'Gerente',
      codCc: 'CC-102',
      publico: 'Administrativo',
    })
    assert.equal(r.scopeType, 'centro_custo')
    assert.equal(r.targetValue, 'CC-102')
    assert.deepEqual(r.hours.default, { openHour: 7, closeHour: 15 })
  })

  it('matches CC by description when cod differs', () => {
    const rules: OHScopeRule[] = [
      globalRule,
      {
        scope_type: 'centro_custo',
        target_value: 'Loja Centro',
        operating_hours: {
          abertura: '09:30',
          fechamento: '18:30',
          dias_semana: [],
        },
      },
    ]
    const r = resolveOperatingHoursForEntity(rules, DEFAULT_OPERATING_HOURS, {
      centroCusto: '999',
      descCc: 'loja  centro',
    })
    assert.equal(r.scopeType, 'centro_custo')
    assert.deepEqual(r.hours.default, { openHour: 9.5, closeHour: 18.5 })
  })

  it('falls through to sindicato when cargo and CC miss', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'Gerente',
      centroCusto: 'CC-999',
      codSindicato: '12',
      nomeSindicato: 'Sindicato Metalúrgicos',
      publico: 'administrativo',
    })
    assert.equal(r.scopeType, 'sindicato')
    assert.equal(r.targetValue, '12')
    assert.equal(r.targetLabel, 'Sindicato Metalúrgicos')
    assert.deepEqual(r.hours.default, { openHour: 7.5, closeHour: 16.5 })
  })

  it('matches sindicato by nome when cod differs', () => {
    const rules: OHScopeRule[] = [
      globalRule,
      {
        scope_type: 'sindicato',
        target_value: 'Sindicato Metalúrgicos',
        operating_hours: {
          abertura: '08:15',
          fechamento: '17:15',
          dias_semana: [],
        },
      },
    ]
    const r = resolveOperatingHoursForEntity(rules, DEFAULT_OPERATING_HOURS, {
      codSindicato: '99',
      nomeSindicato: 'sindicato  metalúrgicos',
    })
    assert.equal(r.scopeType, 'sindicato')
    assert.deepEqual(r.hours.default, { openHour: 8.25, closeHour: 17.25 })
  })

  it('falls through to publico when cargo, CC and sindicato miss', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'Gerente',
      centroCusto: 'CC-999',
      codSindicato: '0',
      publico: 'administrativo',
    })
    assert.equal(r.scopeType, 'publico')
    assert.equal(r.targetValue, 'Administrativo')
    assert.equal(r.hours.default.openHour, 8)
    assert.equal(r.hours.default.closeHour, 17)
    assert.equal(r.hours.byWeekday?.sat?.closed, true)
  })

  it('falls back to global rule when no segmented match', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'X',
      centroCusto: 'Y',
      publico: 'Z',
    })
    assert.equal(r.scopeType, 'global')
    assert.deepEqual(r.hours.default, { openHour: 10, closeHour: 20 })
  })

  it('ohScopeMatchContextFromPayrollRow feeds cascade', () => {
    const ctx = ohScopeMatchContextFromPayrollRow({
      cargo: 'Operador',
      codCc: 'CC-102',
      centroCusto: 'CC-102',
      codSindicato: '12',
    })
    const r = resolveOperatingHoursForEntity(
      allRules,
      DEFAULT_OPERATING_HOURS,
      ctx,
    )
    assert.equal(r.scopeType, 'cargo')
  })

  it('conflict: CC wins over sindicato and publico when cargo misses', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      cargo: 'Gerente',
      centroCusto: 'CC-102',
      codSindicato: '12',
      publico: 'Administrativo',
    })
    assert.equal(r.scopeType, 'centro_custo')
    assert.deepEqual(r.hours.default, { openHour: 7, closeHour: 15 })
  })

  it('conflict: sindicato wins over publico when cargo and CC miss', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      codSindicato: '12',
      publico: 'Administrativo',
    })
    assert.equal(r.scopeType, 'sindicato')
    assert.equal(r.hours.default.openHour, 7.5)
  })

  it('conflict: publico wins over global when higher scopes miss', () => {
    const r = resolveOperatingHoursForEntity(allRules, DEFAULT_OPERATING_HOURS, {
      publico: 'Administrativo',
    })
    assert.equal(r.scopeType, 'publico')
    assert.equal(r.hours.default.openHour, 8)
  })

  it('parseOHScopeRule keeps optional target_label for CC dual display', () => {
    const rule = parseOHScopeRule({
      scope_type: 'centro_custo',
      target_value: '01.02',
      target_label: 'Loja Centro',
      operating_hours: {
        abertura: '09:00',
        fechamento: '18:00',
        dias_semana: [],
      },
    })
    assert.ok(rule)
    assert.equal(rule!.target_value, '01.02')
    assert.equal(rule!.target_label, 'Loja Centro')
  })

  it('empty rules array uses wizard OH (global fallback)', () => {
    const r = resolveOperatingHoursForEntity([], DEFAULT_OPERATING_HOURS, {
      cargo: 'Operador',
      centroCusto: 'CC-102',
    })
    assert.equal(r.scopeType, 'global')
    assert.deepEqual(r.hours.default, DEFAULT_OPERATING_HOURS.default)
  })

  it('first matching rule at same scope wins (duplicate cargo targets)', () => {
    const rules: OHScopeRule[] = [
      globalRule,
      {
        scope_type: 'cargo',
        target_value: 'Operador',
        operating_hours: {
          abertura: '05:00',
          fechamento: '13:00',
          dias_semana: [],
        },
      },
      {
        scope_type: 'cargo',
        target_value: 'Operador',
        operating_hours: {
          abertura: '11:00',
          fechamento: '19:00',
          dias_semana: [],
        },
      },
    ]
    const r = resolveOperatingHoursForEntity(rules, DEFAULT_OPERATING_HOURS, {
      cargo: 'Operador',
    })
    assert.equal(r.scopeType, 'cargo')
    assert.deepEqual(r.hours.default, { openHour: 5, closeHour: 13 })
  })
})

