import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  indexHmvRows,
  indexSindicatoRows,
  resolveSindicatoHmvForContratado,
} from './sindicatoHmvMap'

describe('sindicatoHmvMap (Etapa 5 — Apdata SIN_* / HMV_*)', () => {
  it('indexes SIN_CdiSindicato / SIN_D1sSindicato / SIN_NusCNPJ', () => {
    const byId = indexSindicatoRows([
      {
        SIN_CdiSindicato: 12,
        SIN_D1sSindicato: 'Sindicato Metalurgicos Demo',
        SIN_NusCNPJ: '11222333000144',
      },
      {
        SIN_CdiSindicato: '7',
        SIN_D1sSindicato: '  ',
        SIN_NusCNPJ: null,
      },
      { SIN_D1sSindicato: 'orphan without id' },
    ])
    assert.equal(byId.size, 2)
    assert.deepEqual(byId.get(12), {
      nome: 'Sindicato Metalurgicos Demo',
      cnpj: '11222333000144',
    })
    assert.deepEqual(byId.get(7), {
      nome: 'SEM_SINDICATO',
      cnpj: '',
    })
  })

  it('indexes HMV_CdiQuantidadeHoraMes / HMV_QtnQuantidadeHoraMes', () => {
    const byId = indexHmvRows([
      {
        HMV_CdiQuantidadeHoraMes: 3,
        HMV_QtnQuantidadeHoraMes: 220,
        HMV_QtnHorasSemanal: 44,
      },
      {
        HMV_CdiQuantidadeHoraMes: 9,
        HMV_QtnQuantidadeHoraMes: '180',
        HMV_QtnHorasSemanal: '36',
      },
    ])
    assert.deepEqual(byId.get(3), { mensal: 220, semanal: 44 })
    assert.deepEqual(byId.get(9), { mensal: 180, semanal: 36 })
  })

  it('associates Contratado FKs to sindicato + horas base', () => {
    const sin = indexSindicatoRows([
      {
        SIN_CdiSindicato: 12,
        SIN_D1sSindicato: 'Sindicato Demo',
        SIN_NusCNPJ: '11222333000144',
      },
    ])
    const hmv = indexHmvRows([
      {
        HMV_CdiQuantidadeHoraMes: 5,
        HMV_QtnQuantidadeHoraMes: 210,
        HMV_QtnHorasSemanal: 42,
      },
    ])
    const hit = resolveSindicatoHmvForContratado(
      { conCdiSindicato: 12, conCdiQuantidadeHoraMes: 5 },
      sin,
      hmv,
    )
    assert.deepEqual(hit, {
      codSindicato: '12',
      nomeSindicato: 'Sindicato Demo',
      cnpjSindicato: '11222333000144',
      cargaMensal: 210,
      cargaSemanal: 42,
    })
  })

  it('defaults carga and handles missing / zero sindicato', () => {
    const empty = resolveSindicatoHmvForContratado(
      { conCdiSindicato: null, conCdiQuantidadeHoraMes: null },
      new Map(),
      new Map(),
    )
    assert.deepEqual(empty, {
      codSindicato: null,
      nomeSindicato: null,
      cnpjSindicato: null,
      cargaMensal: 220,
      cargaSemanal: 44,
    })

    const orphanFk = resolveSindicatoHmvForContratado(
      { conCdiSindicato: 99, conCdiQuantidadeHoraMes: 1 },
      new Map(),
      new Map(),
    )
    assert.equal(orphanFk.codSindicato, '99')
    assert.equal(orphanFk.nomeSindicato, 'SEM_SINDICATO')
    assert.equal(orphanFk.cargaMensal, 220)

    const zeroSin = resolveSindicatoHmvForContratado(
      { conCdiSindicato: 0, conCdiQuantidadeHoraMes: null },
      new Map([[0, { nome: 'ignored', cnpj: '' }]]),
      new Map(),
    )
    assert.equal(zeroSin.codSindicato, null)
    assert.equal(zeroSin.nomeSindicato, null)
  })
})
