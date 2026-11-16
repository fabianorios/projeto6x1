import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyBenefitOverrides,
  benefitsFromTiposRows,
  benefitsToPayrollScalars,
  classifyBenefitByDescription,
  mergeBenefitSessionOverride,
  parseBeneficiosAgg,
  sanitizeBenefitText,
} from './classifyBenefit'

describe('classifyBenefitByDescription', () => {
  it('classifies VR / refeição as VARIAVEL_DIA', () => {
    assert.equal(classifyBenefitByDescription('Vale-Refeição'), 'VARIAVEL_DIA')
    assert.equal(classifyBenefitByDescription('VR Empresa'), 'VARIAVEL_DIA')
    assert.equal(
      classifyBenefitByDescription('Alimentação diária'),
      'VARIAVEL_DIA',
    )
  })

  it('classifies vale-combustível as VARIAVEL_DIA (VR-like, not VT)', () => {
    assert.equal(
      classifyBenefitByDescription('Vale-Combustível'),
      'VARIAVEL_DIA',
    )
    assert.equal(
      classifyBenefitByDescription('Auxílio Combustivel'),
      'VARIAVEL_DIA',
    )
    assert.equal(
      classifyBenefitByDescription('COMBUSTIVEL FROTA'),
      'VARIAVEL_DIA',
    )
  })

  it('classifies medical / VA / odonto / seguro as FIXO_MENSAL', () => {
    assert.equal(classifyBenefitByDescription('Assistência Médica'), 'FIXO_MENSAL')
    assert.equal(classifyBenefitByDescription('Unimed Titular'), 'FIXO_MENSAL')
    assert.equal(classifyBenefitByDescription('Plano Odonto'), 'FIXO_MENSAL')
    assert.equal(classifyBenefitByDescription('Vale Alimentação'), 'FIXO_MENSAL')
    assert.equal(classifyBenefitByDescription('Cesta Básica'), 'FIXO_MENSAL')
    assert.equal(classifyBenefitByDescription('Seguro de Vida'), 'FIXO_MENSAL')
  })

  it('ignores unrecognized convenios', () => {
    assert.equal(classifyBenefitByDescription('Convênio Academia'), 'IGNORAR')
    assert.equal(classifyBenefitByDescription(''), 'IGNORAR')
  })
})

describe('parseBeneficiosAgg + scalars', () => {
  it('parses codigo|desc|valor and maps scalars', () => {
    const agg =
      '53|VALE REFEICAO|30.56;52|VALE ALIMENTACAO|361.00;12|ASSIST MEDICA UNIMED|450.00;9|CONVENIO FARMACIA|20.00'
    const list = parseBeneficiosAgg(agg)
    assert.equal(list.length, 4)
    assert.equal(list[0].classificacao, 'VARIAVEL_DIA')
    assert.equal(list[1].classificacao, 'FIXO_MENSAL')
    assert.equal(list[2].classificacao, 'FIXO_MENSAL')
    assert.equal(list[3].classificacao, 'IGNORAR')
    const s = benefitsToPayrollScalars(list)
    assert.equal(s.vrValorDia, 30.56)
    assert.equal(s.vaValorMes, 361)
    assert.equal(s.assistMedicaMes, 450)
    assert.equal(s.assistOdontoMes, null)
  })

  it('folds combustível into VR scalar (not VT)', () => {
    const list = parseBeneficiosAgg(
      '53|VALE REFEICAO|30;80|VALE COMBUSTIVEL|12.5',
    )
    assert.equal(list[1].classificacao, 'VARIAVEL_DIA')
    const s = benefitsToPayrollScalars(list)
    assert.equal(s.vrValorDia, 42.5)
  })

  it('applies session overrides for class + valor', () => {
    const list = parseBeneficiosAgg('80|VALE COMBUSTIVEL|12.5')
    const overridden = applyBenefitOverrides(list, {
      '80::VALE COMBUSTIVEL': {
        classificacao: 'FIXO_MENSAL',
        valorMedio: 200,
      },
    })
    assert.equal(overridden[0].classificacao, 'FIXO_MENSAL')
    assert.equal(overridden[0].valorMedio, 200)
    const s = benefitsToPayrollScalars(overridden)
    assert.equal(s.vrValorDia, null)
    assert.equal(s.assistMedicaMes, 200)
  })

  it('mergeBenefitSessionOverride patches fields', () => {
    let map = mergeBenefitSessionOverride({}, '1::X', {
      classificacao: 'VARIAVEL_DIA',
    })
    map = mergeBenefitSessionOverride(map, '1::X', { valorMedio: 9 })
    assert.deepEqual(map['1::X'], {
      classificacao: 'VARIAVEL_DIA',
      valorMedio: 9,
    })
  })

  it('benefitsFromTiposRows maps Studio grid rows', () => {
    const list = benefitsFromTiposRows([
      { cod_tipo: 80, desc_tipo: 'Vale Combustivel', valor_medio: 12.5 },
      { COD_TIPO: '53', DESC_TIPO: 'VR', VALOR_MEDIO: '30' },
    ])
    assert.equal(list.length, 2)
    assert.equal(list[0].classificacao, 'VARIAVEL_DIA')
    assert.equal(list[1].codigo, '53')
    assert.equal(list[1].valorMedio, 30)
  })

  it('sanitizes separators in text', () => {
    assert.equal(sanitizeBenefitText('A;B\tC|D'), 'A B C D')
  })
})
