import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXCLUDED_SITUACOES,
  buildEstablishments,
  cnpjDigits,
  establishmentKey,
  formatCnpjDisplay,
  formatEstablishmentLabel,
  folhaToEstablishmentKey,
  isIncludedSituacao,
} from './cnpj'

describe('situação exclusion', () => {
  it('excludes 0, 2, 3, 99', () => {
    assert.deepEqual([...EXCLUDED_SITUACOES], [0, 2, 3, 99])
    for (const s of EXCLUDED_SITUACOES) {
      assert.equal(isIncludedSituacao(s), false)
    }
  })

  it('includes ativos and afastados-like codes', () => {
    assert.equal(isIncludedSituacao(1), true)
    assert.equal(isIncludedSituacao(4), true)
    assert.equal(isIncludedSituacao(10), true)
    assert.equal(isIncludedSituacao(null), false)
  })
})

describe('CNPJ formatting', () => {
  it('normalizes digits and formats display', () => {
    assert.equal(cnpjDigits('12.345.678'), '12345678')
    assert.equal(cnpjDigits('0001-90'), '000190')
    assert.equal(
      formatCnpjDisplay('12.345.678', '0001-90'),
      '12.345.678/0001-90',
    )
    assert.equal(establishmentKey('12.345.678', '0001-90'), '12345678000190')
  })

  it('builds Razão · Filial · CNPJ label', () => {
    assert.equal(
      formatEstablishmentLabel({
        razaoSocial: 'Empresa Exemplo Ltda',
        nomeFilial: 'Filial Centro',
        prefixo: '12.345.678',
        sufixo: '0001-90',
      }),
      'Empresa Exemplo Ltda · Filial Centro · 12.345.678/0001-90',
    )
    assert.equal(
      formatEstablishmentLabel({
        razaoSocial: '',
        nomeFilial: '',
        prefixo: '12.345.678',
        sufixo: '0001-90',
      }),
      '12.345.678/0001-90',
    )
  })
})

describe('buildEstablishments', () => {
  it('joins Folhas→Locais→Empresas with razão + filial and vínculo headcount', () => {
    const list = buildEstablishments(
      [
        {
          empresaId: 1,
          prefixo: '12.345.678',
          razaoSocial: 'Empresa Exemplo Ltda',
          ramoId: 10,
        },
      ],
      [
        {
          localId: 10,
          empresaId: 1,
          sufixo: '0001-90',
          nomeFilial: 'Filial Centro',
        },
        {
          localId: 11,
          empresaId: 1,
          sufixo: '0002-71',
          nomeFilial: 'Filial Norte',
        },
        { localId: 99, empresaId: 1, sufixo: '0003-52', nomeFilial: 'Sem Folha' },
      ],
      [
        { folhaId: 100, localId: 10 },
        { folhaId: 101, localId: 10 },
        { folhaId: 200, localId: 11 },
      ],
      [
        { folhaId: 100, situacao: 1 },
        { folhaId: 100, situacao: 1 },
        { folhaId: 100, situacao: 4 },
        { folhaId: 101, situacao: 1 },
        { folhaId: 101, situacao: 2 }, // excluded
        { folhaId: 101, situacao: 99 }, // excluded
        { folhaId: 200, situacao: 1 },
        { folhaId: 200, situacao: 0 }, // excluded
      ],
    )
    assert.equal(list.length, 2)
    assert.equal(
      list[0]!.label,
      'Empresa Exemplo Ltda · Filial Centro · 12.345.678/0001-90',
    )
    assert.equal(list[0]!.razaoSocial, 'Empresa Exemplo Ltda')
    assert.equal(list[0]!.nomeFilial, 'Filial Centro')
    assert.equal(list[0]!.ramoId, 10)
    assert.deepEqual(list[0]!.folhaIds, [100, 101])
    // 3 on folha 100 + 1 on folha 101 (sit 2/99 excluded) = 4 vínculos
    assert.equal(list[0]!.colaboradores, 4)
    assert.match(list[1]!.label, /Filial Norte/)
    assert.equal(list[1]!.colaboradores, 1)
    const map = folhaToEstablishmentKey(list)
    assert.equal(map.get(100), '12345678000190')
    assert.equal(map.get(200), '12345678000271')
  })

  it('defaults colaboradores to 0 when contratados omitted', () => {
    const list = buildEstablishments(
      [{ empresaId: 1, prefixo: '12.345.678', razaoSocial: 'Ex', ramoId: 1 }],
      [{ localId: 10, empresaId: 1, sufixo: '0001-90', nomeFilial: 'A' }],
      [{ folhaId: 100, localId: 10 }],
    )
    assert.equal(list.length, 1)
    assert.equal(list[0]!.colaboradores, 0)
    assert.equal(list[0]!.folhaIds.length, 1)
  })
})
