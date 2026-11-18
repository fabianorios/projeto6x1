/**
 * Compat suite — INSERT SQL removido; agora valida linhas 1215 via re-exports.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TX_INCLUSAO_JORNADAS,
  buildComandosDmlJornadasText,
  horasDiaToHrdHhMm,
} from './exportComandosDmlJornadas'

describe('exportComandosDmlJornadas (compat → rotina 1215)', () => {
  it('horasDiaToHrdHhMm returns HH:MM prefix', () => {
    assert.equal(horasDiaToHrdHhMm(3.5), '03:30')
  })

  it('emits 29752 lines and never INSERT SQL', () => {
    const text = buildComandosDmlJornadasText([
      {
        codigo: 'JOR-0900-1230',
        descricao: '09:00–12:30',
        horasDia: 3.5,
        kind: 'MANHA',
        steps: [
          { ordem: 1, tipo: 'ENTRADA', hora: '09:00' },
          { ordem: 2, tipo: 'SAIDA', hora: '12:30' },
        ],
      },
    ])
    assert.ok(text.startsWith(`${TX_INCLUSAO_JORNADAS};`))
    assert.ok(!/INSERT\s+INTO/i.test(text))
  })
})
