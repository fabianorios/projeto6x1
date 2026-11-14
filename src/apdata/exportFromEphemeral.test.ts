import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exportResultFromEphemeralRows } from './exportFromEphemeral'

describe('exportResultFromEphemeralRows', () => {
  it('maps extractor rows and filters by CNPJ digits', () => {
    const raw = [
      {
        cod_empresa: '1',
        cod_filial: '1',
        cnpj_completo: '12345678000199',
        cod_cc: 'CC1',
        desc_cargo: 'Operador',
        escala_atual: '6x1',
        carga_semanal_atual: 44,
        qtd_colaboradores: 2,
        massa_salarial_base: 4400,
        vr_dia_medio: 30,
        vt_dia_medio: 10,
        dias_trabalho_mes_atual: 22,
      },
      {
        cod_empresa: '2',
        cod_filial: '1',
        cnpj_completo: '99888777000111',
        cod_cc: 'CC2',
        desc_cargo: 'Auxiliar',
        escala_atual: '5x2',
        carga_semanal_atual: 40,
        qtd_colaboradores: 1,
        massa_salarial_base: 2000,
        vr_dia_medio: 0,
        vt_dia_medio: 0,
        dias_trabalho_mes_atual: 20,
      },
    ]

    const out = exportResultFromEphemeralRows(raw, {
      selectedCnpjKeys: ['12345678000199'],
      defaultSalario: 2200,
    })

    assert.equal(out.rows.length, 1)
    assert.equal(out.rows[0]!.cargo, 'Operador')
    assert.equal(out.stats.contratadosAtivos, 2)
    assert.equal(out.stats.estabelecimentosFiltrados, 1)
    assert.equal(out.stats.sample[0]!.cargo, 'Operador')
    assert.equal(
      Object.prototype.hasOwnProperty.call(out.stats.sample[0], 'nome'),
      false,
    )
    assert.ok(!JSON.stringify(out).toLowerCase().includes('password'))
  })
})
