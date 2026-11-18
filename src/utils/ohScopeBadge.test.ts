import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatOhScopeBadge,
  formatOhScopeBadgeShort,
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
      formatOhScopeBadge({ scopeType: 'publico', targetValue: '' }),
      'OH segmentada · Público',
    )
    assert.equal(
      formatOhScopeBadgeShort({ scopeType: 'cargo', targetValue: 'X' }),
      'segmentada',
    )
  })
})
