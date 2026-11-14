import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getAptoolsExtractorScript,
  getExtractorSelectBody,
} from './extractorSql'
import { mapExtractorAggregatesToPayroll } from './mapExtractorRows'

describe('extractor SQL (SPA)', () => {
  it('exposes MSSQL and Oracle Aptools scripts', () => {
    const mssql = getAptoolsExtractorScript('mssql')
    const oracle = getAptoolsExtractorScript('oracle')
    assert.match(mssql, /FROM\s+Contratados\b/i)
    assert.match(mssql, /LPC_CdiLocal/)
    assert.match(oracle, /FROM\s+Contratados\b/i)
    assert.ok(!/SET\s+TRANSACTION/i.test(mssql))
    assert.ok(!/SET\s+TRANSACTION/i.test(oracle))
    assert.match(getExtractorSelectBody('mssql'), /^WITH\b/i)
    assert.ok(!getExtractorSelectBody('mssql').includes(';'))
    // Strip TAB/newlines from text cols so Aptools .txt export stays aligned.
    assert.match(mssql, /CHAR\(9\)/)
    assert.match(mssql, /CHAR\(10\)/)
    assert.match(mssql, /CHAR\(13\)/)
    assert.match(oracle, /CHR\(9\)/)
    assert.match(oracle, /CHR\(10\)/)
    assert.match(oracle, /CHR\(13\)/)
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
