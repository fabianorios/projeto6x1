import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_MASK_COLLABORATOR_NAMES,
  applyCollaboratorNameMask,
  mapPayrollNomesForDisplay,
  maskCollaboratorName,
  resolveCollaboratorDisplayName,
  scrubNomeForHandoffExport,
} from './lgpdNameMask'

describe('lgpdNameMask', () => {
  it('defaults mask to on', () => {
    assert.equal(DEFAULT_MASK_COLLABORATOR_NAMES, true)
  })

  it('masks each token keeping the first letter', () => {
    assert.equal(maskCollaboratorName('Ana'), 'A**')
    assert.equal(maskCollaboratorName('João Silva'), 'J*** S****')
    assert.equal(maskCollaboratorName('  Maria  Clara  '), 'M**** C****')
    assert.equal(maskCollaboratorName(''), '')
    assert.equal(maskCollaboratorName(null), '')
    assert.equal(maskCollaboratorName('X'), '*')
  })

  it('resolveCollaboratorDisplayName respects mask flag', () => {
    assert.equal(
      resolveCollaboratorDisplayName('João Silva'),
      'J*** S****',
    )
    assert.equal(
      resolveCollaboratorDisplayName('João Silva', { mask: true }),
      'J*** S****',
    )
    assert.equal(
      resolveCollaboratorDisplayName('João Silva', { mask: false }),
      'João Silva',
    )
    assert.equal(resolveCollaboratorDisplayName('  '), null)
    assert.equal(resolveCollaboratorDisplayName(null), null)
  })

  it('applyCollaboratorNameMask mirrors resolve', () => {
    assert.equal(applyCollaboratorNameMask('Ana Costa', true), 'A** C****')
    assert.equal(applyCollaboratorNameMask('Ana Costa', false), 'Ana Costa')
    assert.equal(applyCollaboratorNameMask(null), null)
  })

  it('handoff scrub never emits unmasked names when mask is on', () => {
    assert.equal(scrubNomeForHandoffExport('João Silva', true), null)
    assert.equal(scrubNomeForHandoffExport('João Silva', false), null)
    assert.equal(scrubNomeForHandoffExport(null, true), null)
  })

  it('toggle: mask on hides name; mask off shows raw (display only)', () => {
    const raw = 'Maria Clara'
    assert.equal(maskCollaboratorName(raw), 'M**** C****')
    assert.equal(
      resolveCollaboratorDisplayName(raw, { mask: true }),
      'M**** C****',
    )
    assert.equal(
      resolveCollaboratorDisplayName(raw, { mask: false }),
      'Maria Clara',
    )
    // Handoff path still refuses unmasked export even if UI toggle is off.
    assert.equal(scrubNomeForHandoffExport(raw, true), null)
    assert.notEqual(
      scrubNomeForHandoffExport(raw, true),
      resolveCollaboratorDisplayName(raw, { mask: false }),
    )
  })


  it('mapPayrollNomesForDisplay applies policy to rows', () => {
    const rows = [
      { nome: 'João Silva' as string | null, cargo: 'Op' },
      { nome: null as string | null, cargo: 'Aux' },
    ]
    const masked = mapPayrollNomesForDisplay(rows, true)
    assert.equal(masked[0]!.nome, 'J*** S****')
    assert.equal(masked[1]!.nome, null)
    const open = mapPayrollNomesForDisplay(rows, false)
    assert.equal(open[0]!.nome, 'João Silva')
  })
})
