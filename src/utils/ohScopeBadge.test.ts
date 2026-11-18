import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatOhScopeBadge,
  formatOhScopeBadgeShort,
  formatOhScopeTargetDisplay,
  isSegmentedOhScope,
} from './ohScopeBadge'

describe('ohScopeBadge (Etapa 4)', () => {
  it('treats missing / global as OH global', () => {
    assert.equal(isSegmentedOhScope(undefined), false)
    assert.equal(isSegmentedOhScope(null), false)
    assert.equal(
      isSegmentedOhScope({ scopeType: 'global', targetValue: '' }),
      false,
    )
    assert.equal(formatOhScopeBadge(undefined), 'OH global')
    assert.equal(formatOhScopeBadgeShort(undefined), 'global')
  })

  it('labels segmented scopes with type + target', () => {
    assert.equal(
      isSegmentedOhScope({ scopeType: 'cargo', targetValue: 'Operador' }),
      true,
    )
    assert.equal(
      formatOhScopeBadge({ scopeType: 'cargo', targetValue: 'Operador' }),
      'OH segmentada · Cargo: Operador',
    )
    assert.equal(
      formatOhScopeBadge({
        scopeType: 'centro_custo',
        targetValue: 'CC-102',
      }),
      'OH segmentada · Centro de custo: CC-102',
    )
    assert.equal(
      formatOhScopeBadge({
        scopeType: 'centro_custo',
        targetValue: '01.02',
        targetLabel: 'Loja Centro',
      }),
      'OH segmentada · Centro de custo: 01.02 — Loja Centro',
    )
    assert.equal(
      formatOhScopeBadge({
        scopeType: 'sindicato',
        targetValue: '12',
        targetLabel: 'Sindicato Metalúrgicos',
      }),
      'OH segmentada · Sindicato: 12 — Sindicato Metalúrgicos',
    )
    assert.equal(
      formatOhScopeBadge({ scopeType: 'publico', targetValue: '' }),
      'OH segmentada · Público',
    )
    assert.equal(
      formatOhScopeBadgeShort({ scopeType: 'cargo', targetValue: 'X' }),
      'segmentada',
    )
  })

  it('formatOhScopeTargetDisplay joins code — label', () => {
    assert.equal(
      formatOhScopeTargetDisplay('01.02', 'Loja Centro'),
      '01.02 — Loja Centro',
    )
    assert.equal(formatOhScopeTargetDisplay('01.02', ''), '01.02')
    assert.equal(formatOhScopeTargetDisplay('', 'Loja'), 'Loja')
  })
})
