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
    assert.match(mssql, /LOC_CdiLocal/)
    assert.match(mssql, /Vinculos\b/)
    assert.match(mssql, /VIN_CdiTipoRegimeTrabalhista IN \(1\)/)
    assert.match(mssql, /CategsTrabseSoc/)
    assert.ok(!/\bLPC_/i.test(mssql))
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

  it('uses TIP_* escalas with work_days x off_days concat', () => {
    const mssql = getAptoolsExtractorScript('mssql')
    const oracle = getAptoolsExtractorScript('oracle')
    assert.match(mssql, /TIP_OplTrabalho/)
    assert.match(mssql, /TIP_CdiTipoDiaPonto/)
    assert.ok(!mssql.includes('TDP_OplTrabalho'))
    assert.ok(!mssql.includes('TDP_CdiTipoDiaPonto'))
    assert.match(mssql, /HOR_OplDesativado/)
    assert.match(
      mssql,
      /CAST\(cic\.work_days AS VARCHAR\(10\)\) \+ 'x' \+ CAST\(cic\.off_days AS VARCHAR\(10\)\)/,
    )
    assert.ok(!/WHEN cic\.cycle_len = 7 AND cic\.work_days = 6 THEN '6x1'/.test(mssql))
    assert.match(oracle, /TIP_OplTrabalho/)
    assert.match(oracle, /TO_CHAR\(cic\.work_days\) \|\| 'x' \|\| TO_CHAR\(cic\.off_days\)/)
  })

  it('joins ConBeneficios → PLB → PBV max inicio → EBT → TBE', () => {
    const mssql = getAptoolsExtractorScript('mssql')
    const oracle = getAptoolsExtractorScript('oracle')
    assert.match(mssql, /ConBeneficios/)
    assert.match(mssql, /PlanosBeneficios/)
    assert.match(mssql, /TiposBeneficiosEntsBens/)
    assert.match(mssql, /TBE_CdiTipoBeneficio/)
    assert.match(mssql, /TBE_D1sTipoBeneficio/)
    assert.match(mssql, /MAX\(PBV_DtdInicio\)/)
    assert.match(mssql, /CBN_DtdFim IS NULL/)
    assert.ok(!mssql.includes('PBV_DtdFim IS NULL'))
    assert.ok(!mssql.includes('CBN_OplDesativado'))
    assert.ok(!mssql.includes('TPB_CdiTipoBeneficio'))
    assert.ok(!mssql.includes('TPB_D1sTipoBeneficio'))
    assert.match(mssql, /beneficios_agg/)
    assert.ok(!/TBE_CdiTipoBeneficio\s*=\s*53/.test(mssql))
    assert.match(oracle, /LISTAGG/)
    assert.match(oracle, /ConBeneficios/)
    assert.match(oracle, /TBE_CdiTipoBeneficio/)
    assert.match(oracle, /beneficios_agg/)
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

  it('auto-classifies beneficios_agg into VR/VA/médica', () => {
    const rows = mapExtractorAggregatesToPayroll([
      {
        desc_cargo: 'Operador',
        cod_cc: 'CC-01',
        qtd_colaboradores: 1,
        massa_salarial_base: 2000,
        carga_semanal_atual: 44,
        beneficios_agg:
          '53|VALE REFEICAO|30.50;52|VALE ALIMENTACAO|300;10|UNIMED TITULAR|400',
      },
    ])
    assert.equal(rows[0].vrValorDia, 30.5)
    assert.equal(rows[0].vaValorMes, 300)
    assert.equal(rows[0].assistMedicaMes, 400)
    assert.equal(rows[0].benefits.length, 3)
  })
})
