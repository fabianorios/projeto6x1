import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTemplate, PILOT_TEMPLATES } from '../templates'
import { getSectorCalibration } from './rules'
import {
  ALL_SECTOR_PRESETS,
  MARKET_SECTOR_PRESETS,
  calibrationFromSector,
  getSectorDisplayLabel,
  normalizeSectorId,
  resolveSectorPreset,
} from './sectors'

describe('sector catalog', () => {
  it('exposes 10 market presets + custom', () => {
    assert.equal(MARKET_SECTOR_PRESETS.length, 10)
    assert.equal(ALL_SECTOR_PRESETS.length, 11)
    assert.equal(PILOT_TEMPLATES.length, 11)
  })

  it('maps legacy locacao → locacao_facilities', () => {
    assert.equal(normalizeSectorId('locacao'), 'locacao_facilities')
    assert.equal(resolveSectorPreset('locacao').id, 'locacao_facilities')
    assert.equal(getTemplate('locacao').id, 'locacao_facilities')
  })

  it('falls back unknown ids to custom calibration', () => {
    const cal = getSectorCalibration('servicos_educacionais')
    assert.equal(cal.sector, 'servicos_educacionais')
    assert.ok(cal.staffingFriction >= 1)
    assert.equal(getTemplate('servicos_educacionais').id, 'servicos_educacionais')
    assert.equal(
      getSectorDisplayLabel('custom', 'Serviços educacionais'),
      'Serviços educacionais',
    )
  })

  it('honors buffer override on calibration', () => {
    const base = calibrationFromSector('varejo')
    assert.equal(base.staffingFriction, 1)
    assert.equal(calibrationFromSector('hospital').staffingFriction, 1.06)
    const overridden = getSectorCalibration('varejo', 12)
    assert.equal(overridden.staffingFriction, 1.12)
  })
})
