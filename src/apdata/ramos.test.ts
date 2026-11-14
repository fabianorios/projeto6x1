import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activeRamos,
  buildRamos,
  mapRamoToSectorId,
  sectorFromSelectedRamos,
} from './ramos'

describe('mapRamoToSectorId', () => {
  it('maps generic ramo labels to sectors', () => {
    assert.equal(mapRamoToSectorId('Comércio varejista'), 'varejo')
    assert.equal(mapRamoToSectorId('Serviços hospitalares'), 'hospital')
    assert.equal(mapRamoToSectorId('Construção civil'), 'construcao')
    assert.equal(mapRamoToSectorId('Locação de equipamentos'), 'locacao')
    assert.equal(mapRamoToSectorId('Consultoria administrativa'), 'varejo')
    assert.equal(mapRamoToSectorId(''), 'varejo')
  })
})

describe('buildRamos', () => {
  it('builds sorted active/inactive list from Apdata-shaped rows', () => {
    const list = buildRamos([
      { id: 2, label: 'Serviços hospitalares', desativado: 0 },
      { id: 1, label: 'Comércio varejista', desativado: 0 },
      { id: 3, label: 'Obsoleto', desativado: 1 },
      { id: 4, label: '', referencia: 'REF-GEN', desativado: 0 },
    ])
    assert.equal(list.length, 4)
    assert.equal(list[0]!.label, 'Comércio varejista')
    assert.equal(list[0]!.sectorId, 'varejo')
    assert.equal(list.find((r) => r.id === 2)?.sectorId, 'hospital')
    assert.equal(list.find((r) => r.id === 3)?.desativado, true)
    assert.equal(list.find((r) => r.id === 4)?.label, 'REF-GEN')
    assert.equal(activeRamos(list).length, 3)
  })
})

describe('sectorFromSelectedRamos', () => {
  it('uses first selected ramo mapping', () => {
    const ramos = buildRamos([
      { id: 1, label: 'Comércio varejista' },
      { id: 2, label: 'Serviços hospitalares' },
    ])
    assert.equal(sectorFromSelectedRamos(ramos, [2, 1]), 'hospital')
    assert.equal(sectorFromSelectedRamos(ramos, []), 'varejo')
  })
})
