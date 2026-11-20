import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCnaeLabel,
  searchCnaeCatalog,
} from './cnae-catalog'
import {
  OPERATIONAL_GROUPS,
  OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
  operationalGroupFromSector,
  resolveOperationalGroup,
} from './operational-groups'

describe('operational groups (Passo 1)', () => {
  it('exposes exactly six groups with 5% default buffer', () => {
    assert.equal(OPERATIONAL_GROUPS.length, 6)
    assert.equal(OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT, 5)
    for (const g of OPERATIONAL_GROUPS) {
      assert.equal(g.defaultBufferPct, 5)
      assert.ok(g.label.length > 0)
      assert.ok(g.lumenTip.length > 0)
    }
  })

  it('maps fine SectorIds onto the six cards', () => {
    assert.equal(operationalGroupFromSector('hospital').id, 'saude')
    assert.equal(operationalGroupFromSector('construcao').id, 'construcao')
    assert.equal(operationalGroupFromSector('industria').id, 'industria')
    assert.equal(operationalGroupFromSector('varejo').id, 'comercio')
    assert.equal(operationalGroupFromSector('contact_center').id, 'comercio')
    assert.equal(operationalGroupFromSector('logistica').id, 'servicos')
    assert.equal(operationalGroupFromSector('tecnologia_admin').id, 'servicos')
    assert.equal(operationalGroupFromSector('custom').id, 'personalizado')
    assert.equal(
      operationalGroupFromSector('servicos_educacionais').id,
      'personalizado',
    )
  })

  it('resolves personalizado as fallback', () => {
    assert.equal(resolveOperationalGroup('nope').id, 'personalizado')
  })
})

describe('CNAE catalog search', () => {
  it('finds hospital CNAE by code digits', () => {
    const hits = searchCnaeCatalog('8610')
    assert.ok(hits.length > 0)
    assert.ok(hits[0]!.code.startsWith('8610'))
    assert.match(formatCnaeLabel(hits[0]!), /8610/)
  })

  it('finds varejo by description keyword', () => {
    const hits = searchCnaeCatalog('supermercado')
    assert.ok(hits.some((h) => h.nearestSectorId === 'varejo'))
  })
})
