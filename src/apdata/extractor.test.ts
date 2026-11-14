import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getAptoolsExtractorScript,
  getExtractorSelectBody,
} from './extractorSql'
import { mapExtractorAggregatesToPayroll } from './mapExtractorRows'

describe('extractor SQL (SPA)', () => {
  it('exposes MSSQL and Oracle Aptools scripts', () => {
    assert.match(getAptoolsExtractorScript('mssql'), /READ UNCOMMITTED/i)
    assert.match(getAptoolsExtractorScript('oracle'), /READ ONLY/i)
    assert.match(getExtractorSelectBody('mssql'), /^WITH\b/i)
    assert.ok(!getExtractorSelectBody('mssql').includes(';'))
  })
})

describe('mapExtractorAggregatesToPayroll', () => {
  it('maps aggregates without PII and derives salario', () => {
    const rows = mapExtractorAggregatesToPayroll([
      {
        cod_empresa: '1',
        cod_filial: '1',
        cnpj_completo: '12345678000190',
        cod_cc: 'CC-01',
        desc_cargo: 'Operador',
        qtd_colaboradores: 2,
        massa_salarial_base: 4400,
        vr_dia_medio: 32,
        vt_dia_medio: 15,
        dias_trabalho_mes_atual: 26,
        carga_semanal_atual: 44,
        escala_atual: '6x1',
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operador')
    assert.equal(rows[0].salario, 2200)
    assert.equal(rows[0].quantidade, 2)
    assert.equal(rows[0].nome, null)
    assert.equal(rows[0].cnpjCompleto, '12345678000190')
    assert.equal(rows[0].vrValorDia, 32)
  })
})
