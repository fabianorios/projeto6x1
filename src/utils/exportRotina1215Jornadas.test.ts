import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, buildApdataHierarchy, simulate } from '../engine'
import {
  JORNADAS_1215_CAMPOS,
  ROTINA_1215_JORNADAS_LAYOUT_VERSION,
  TX_INCLUSAO_JORNADAS,
  buildComandosDmlJornadaRows,
  buildLinhaInclusao1215,
  buildRotina1215JornadasFromResult,
  buildRotina1215JornadasText,
  horasDiaToHhMmSs,
  toAaaammdd,
} from './exportRotina1215Jornadas'

describe('exportRotina1215Jornadas', () => {
  it('converts horasDia to HH:MM:SS', () => {
    assert.equal(horasDiaToHhMmSs(3.5), '03:30:00')
    assert.equal(horasDiaToHhMmSs(8), '08:00:00')
    assert.equal(horasDiaToHhMmSs(8.8), '08:48:00')
    assert.equal(horasDiaToHhMmSs(0), '00:00:00')
  })

  it('formats dates as AAAAMMDD', () => {
    assert.equal(toAaaammdd('2026-12-01'), '20261201')
    assert.equal(toAaaammdd('01/12/2026'), '20261201')
    assert.equal(toAaaammdd('20261201'), '20261201')
  })

  it('builds inclusion line without brackets (tipo 2)', () => {
    const line = buildLinhaInclusao1215(TX_INCLUSAO_JORNADAS, [
      { id: JORNADAS_1215_CAMPOS.cosIdentificadorTabela.id, valor: 'JOR-0900-1230' },
      { id: JORNADAS_1215_CAMPOS.d1sJornada.id, valor: '09:00–12:30' },
      { id: JORNADAS_1215_CAMPOS.hrdTotalHorasPrevistasTrab.id, valor: '03:30:00' },
      { id: JORNADAS_1215_CAMPOS.cdiTipoApuracaoJornada.id, valor: '1' },
      { id: JORNADAS_1215_CAMPOS.oplDesativado.id, valor: '0' },
      { id: JORNADAS_1215_CAMPOS.oplNoturna.id, valor: '0' },
    ])
    assert.equal(
      line,
      '29752;120531;(JOR-0900-1230)45025;(09:00–12:30)116457;(03:30:00)10808;(1)126242;(0)10847;(0)',
    )
    assert.ok(!line.includes('['))
    assert.ok(!/INSERT/i.test(line))
  })

  it('emits one 29752 line per unique jornada codigo (dedupe)', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 20,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      estrategiaAbsorcao: 'HORA_EXTRA_MAXIMA',
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const tree = buildApdataHierarchy(result, {
      dataInicio: '2026-12-01',
      includeLunchJornada: true,
    })
    assert.ok(tree.jornadas.length >= 2)

    const text = buildRotina1215JornadasFromResult(result, {
      dataInicio: '2026-12-01',
      includeLunchJornada: true,
    })
    assert.ok(!/INSERT\s+INTO/i.test(text))
    assert.ok(!text.includes('JOR_CosIdentificadorTabela')) // técnico não vai no arquivo
    assert.ok(!/"cpf"/i.test(text))
    assert.ok(!/CON_DssNome/i.test(text))

    const lines = text.trim().split('\n').filter(Boolean)
    assert.equal(lines.length, tree.jornadas.length)
    for (const line of lines) {
      assert.ok(line.startsWith(`${TX_INCLUSAO_JORNADAS};`))
      assert.ok(line.includes(`${JORNADAS_1215_CAMPOS.cosIdentificadorTabela.id};(`))
      assert.ok(!line.includes('['))
      assert.match(line, /^\d+;\d+;\(/)
    }

    const rows = buildComandosDmlJornadaRows(tree.jornadas)
    const codes = new Set(rows.map((r) => r.cosIdentificador))
    assert.equal(codes.size, rows.length)
    for (const j of tree.jornadas) {
      assert.ok(text.includes(j.codigo))
    }
    // Layout version is a module constant (not written into the .txt body).
    assert.equal(
      ROTINA_1215_JORNADAS_LAYOUT_VERSION,
      'turnocheck-rotina-1215-jornadas-29752-v1',
    )
  })

  it('dedupes duplicate codigo inputs to a single line', () => {
    const dup = {
      codigo: 'JOR-0900-1230',
      descricao: '09:00–12:30',
      horasDia: 3.5,
      kind: 'MANHA' as const,
      steps: [
        { ordem: 1, tipo: 'ENTRADA' as const, hora: '09:00' },
        { ordem: 2, tipo: 'SAIDA' as const, hora: '12:30' },
      ],
    }
    const text = buildRotina1215JornadasText([dup, { ...dup }])
    const lines = text.trim().split('\n').filter(Boolean)
    assert.equal(lines.length, 1)
    assert.equal(
      lines[0],
      '29752;120531;(JOR-0900-1230)45025;(09:00–12:30)116457;(03:30:00)10808;(1)126242;(0)10847;(0)',
    )
  })
})
