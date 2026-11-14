import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  benefitsToPayrollScalars,
  classifyBenefitByDescription,
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

  it('sanitizes separators in text', () => {
    assert.equal(sanitizeBenefitText('A;B\tC|D'), 'A B C D')
  })
})
