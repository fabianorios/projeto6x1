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

  it('Oracle Folha dialect has LISTAGG/NVL and no MSSQL-only constructs', () => {
    const oracle = getAptoolsExtractorScript('oracle')
    const mssql = getAptoolsExtractorScript('mssql')
    assert.match(oracle, /LISTAGG\s*\(/)
    assert.match(oracle, /WITHIN GROUP\s*\(\s*ORDER BY/)
    assert.match(oracle, /\bNVL\s*\(/)
    assert.match(oracle, /\bCHR\s*\(\s*59\s*\)/)
    assert.match(oracle, /\|\|/)
    assert.match(oracle, /AS NUMBER/)
    assert.match(oracle, /beneficios_agg/)
    assert.match(oracle, /cnpj_completo/)
    assert.match(oracle, /NOT IN \(0, 2, 3, 99\)/)
    assert.ok(!/\bISNULL\s*\(/i.test(oracle), 'Oracle must not use ISNULL')
    assert.ok(!/\bSTRING_AGG\s*\(/i.test(oracle), 'Oracle must not use STRING_AGG')
    assert.ok(!/\bCHAR\s*\(/i.test(oracle), 'Oracle must use CHR not CHAR')
    assert.ok(!/\bVARCHAR\s*\(/i.test(oracle), 'Oracle must not use VARCHAR(n)')
    assert.ok(!/\bDECIMAL\s*\(/i.test(oracle), 'Oracle must use NUMBER not DECIMAL')
    // MSSQL variant must keep its own dialect (do not break it).
    assert.match(mssql, /STRING_AGG/)
    assert.match(mssql, /\bISNULL\s*\(/)
    assert.ok(!/\bLISTAGG\s*\(/i.test(mssql))
  })

  it('Oracle Aptools Folha must not end with ; (ORA-00933) and LISTAGG parses', () => {
    const oracle = getAptoolsExtractorScript('oracle')
    const mssql = getAptoolsExtractorScript('mssql')
    assert.ok(
      !/;\s*$/.test(oracle),
      'Oracle Aptools SQL must not end with semicolon (ORA-00933)',
    )
    assert.ok(
      !oracle.trimEnd().endsWith(';'),
      'Oracle Aptools SQL trimEnd must not end with ;',
    )
    // LISTAGG(expr, sep) WITHIN GROUP (ORDER BY …) — not mis-parenthesized
    assert.match(
      oracle,
      /LISTAGG\s*\(\s*[\s\S]*?,\s*CHR\s*\(\s*59\s*\)\s*\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+cod_tipo\s*\)/i,
    )
    assert.ok(!/\bISNULL\s*\(/i.test(oracle))
    assert.ok(!/\bSTRING_AGG\s*\(/i.test(oracle))
    assert.ok(!/\bCHAR\s*\(/i.test(oracle))
    // MSSQL Aptools keeps historical trailing semicolon
    assert.ok(/;\s*$/.test(mssql), 'MSSQL Aptools may keep trailing ;')
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

  it('maps vale-combustível into VR and respects session overrides', () => {
    const base = mapExtractorAggregatesToPayroll([
      {
        desc_cargo: 'Motorista',
        cod_cc: 'CC-02',
        qtd_colaboradores: 2,
        massa_salarial_base: 5000,
        carga_semanal_atual: 44,
        beneficios_agg: '80|VALE COMBUSTIVEL|15;53|VALE REFEICAO|30',
      },
    ])
    assert.equal(base[0].vrValorDia, 45)
    assert.equal(base[0].benefits[0].classificacao, 'VARIAVEL_DIA')

    const overridden = mapExtractorAggregatesToPayroll(
      [
        {
          desc_cargo: 'Motorista',
          cod_cc: 'CC-02',
          qtd_colaboradores: 2,
          massa_salarial_base: 5000,
          carga_semanal_atual: 44,
          beneficios_agg: '80|VALE COMBUSTIVEL|15;53|VALE REFEICAO|30',
        },
      ],
      {
        '80::VALE COMBUSTIVEL': {
          classificacao: 'FIXO_MENSAL',
          valorMedio: 250,
        },
      },
    )
    assert.equal(overridden[0].vrValorDia, 30)
    assert.equal(overridden[0].assistMedicaMes, 250)
  })
})
