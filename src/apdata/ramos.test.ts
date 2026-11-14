import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activeRamos,
  buildRamos,
  mapRamoToSectorId,
  sectorFromSelectedRamos,
  segmentLabelFromSelectedRamos,
  suggestedBufferPctFromSelectedRamos,
} from './ramos'

describe('mapRamoToSectorId', () => {
  it('maps generic ramo labels to nearest catalog presets', () => {
    assert.equal(mapRamoToSectorId('Comércio varejista'), 'varejo')
    assert.equal(mapRamoToSectorId('Serviços hospitalares'), 'hospital')
    assert.equal(mapRamoToSectorId('Construção civil'), 'construcao')
    assert.equal(
      mapRamoToSectorId('Locação de equipamentos'),
      'locacao_facilities',
    )
    assert.equal(mapRamoToSectorId('Indústria metalúrgica'), 'industria')
    assert.equal(mapRamoToSectorId('Logística e transporte'), 'logistica')
    assert.equal(mapRamoToSectorId('Contact center e SAC'), 'contact_center')
    assert.equal(
      mapRamoToSectorId('Hotelaria e restaurantes'),
      'alimentacao_hotelaria',
    )
    assert.equal(mapRamoToSectorId('Agronegócio e pecuária'), 'agronegocio')
    assert.equal(
      mapRamoToSectorId('Consultoria administrativa'),
      'tecnologia_admin',
    )
    assert.equal(mapRamoToSectorId('Serviços educacionais'), 'custom')
    assert.equal(mapRamoToSectorId(''), 'custom')
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
    // REF-GEN has no keyword → custom
    assert.equal(list.find((r) => r.id === 4)?.sectorId, 'custom')
    assert.equal(activeRamos(list).length, 3)
  })
})

describe('sectorFromSelectedRamos', () => {
  it('uses first selected ramo mapping and keeps DB label', () => {
    const ramos = buildRamos([
      { id: 1, label: 'Comércio varejista' },
      { id: 2, label: 'Serviços hospitalares' },
    ])
    assert.equal(sectorFromSelectedRamos(ramos, [2, 1]), 'hospital')
    assert.equal(
      segmentLabelFromSelectedRamos(ramos, [2, 1]),
      'Serviços hospitalares',
    )
    assert.equal(suggestedBufferPctFromSelectedRamos(ramos, [2, 1]), 6)
    assert.equal(sectorFromSelectedRamos(ramos, []), 'custom')
  })
})
