import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, buildApdataHierarchy, simulate } from '../engine'
import {
  JORNADAS_1215_CAMPOS,
  JORNADAS_ITENS_1215_CAMPOS,
  ROTINA_1215_JORNADAS_LAYOUT_VERSION,
  TX_INCLUSAO_JORNADAS,
  TX_INCLUSAO_JORNADAS_ITENS,
  buildLinhaInclusao1215,
  buildRotina1215JornadaRows,
  buildRotina1215JornadasFromResult,
  buildRotina1215JornadasText,
  clockToHhMmSs,
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

  it('normalizes clock to HH:MM:SS', () => {
    assert.equal(clockToHhMmSs('09:00'), '09:00:00')
    assert.equal(clockToHhMmSs('9:30:15'), '09:30:15')
  })

  it('formats dates as AAAAMMDD', () => {
    assert.equal(toAaaammdd('2026-12-01'), '20261201')
    assert.equal(toAaaammdd('01/12/2026'), '20261201')
    assert.equal(toAaaammdd('20261201'), '20261201')
  })

  it('builds inclusion line without brackets (tipo 2)', () => {
    const line = buildLinhaInclusao1215(TX_INCLUSAO_JORNADAS, [
      { id: JORNADAS_1215_CAMPOS.cosIdentificadorTabela.id, valor: 'JOR-0900-1700' },
      { id: JORNADAS_1215_CAMPOS.d1sJornada.id, valor: '09:00–12:30 / 13:30–17:00' },
      { id: JORNADAS_1215_CAMPOS.hrdTotalHorasPrevistasTrab.id, valor: '07:00:00' },
      { id: JORNADAS_1215_CAMPOS.cdiTipoApuracaoJornada.id, valor: '1' },
      { id: JORNADAS_1215_CAMPOS.oplDesativado.id, valor: '0' },
      { id: JORNADAS_1215_CAMPOS.oplNoturna.id, valor: '0' },
    ])
    assert.equal(
      line,
      '29752;120531;(JOR-0900-1700)45025;(09:00–12:30 / 13:30–17:00)116457;(07:00:00)10808;(1)126242;(0)10847;(0)',
    )
    assert.ok(!line.includes('['))
    assert.ok(!/INSERT/i.test(line))
  })

  it('emits 29752 + 29762 for composite jornada (two work steps)', () => {
    const composta = {
      codigo: 'JOR-0900-1800',
      descricao: '09:00–13:00 / 14:00–18:00',
      horasDia: 8,
      kind: 'COMPOSTA' as const,
      workPeriods: [
        {
          ordem: 1,
          startHour: 9,
          endHour: 13,
          inicio: '09:00',
          fim: '13:00',
        },
        {
          ordem: 2,
          startHour: 14,
          endHour: 18,
          inicio: '14:00',
          fim: '18:00',
        },
      ],
      steps: [
        { ordem: 1, tipo: 'ENTRADA' as const, hora: '09:00' },
        { ordem: 2, tipo: 'SAIDA' as const, hora: '13:00' },
        { ordem: 3, tipo: 'ENTRADA' as const, hora: '14:00' },
        { ordem: 4, tipo: 'SAIDA' as const, hora: '18:00' },
      ],
    }
    const text = buildRotina1215JornadasText([composta, { ...composta }])
    const lines = text.trim().split('\n').filter(Boolean)
    assert.equal(lines.length, 3) // 1 jornada + 2 itens
    assert.equal(
      lines[0],
      '29752;120531;(JOR-0900-1800)45025;(09:00–13:00 / 14:00–18:00)116457;(08:00:00)10808;(1)126242;(0)10847;(0)',
    )
    assert.equal(
      lines[1],
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-0900-1800)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(09:00:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(13:00:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(1)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
    )
    assert.equal(
      lines[2],
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-0900-1800)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(14:00:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(18:00:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(2)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
    )
    assert.ok(!/INSERT/i.test(text))
    assert.ok(!/JOR-ALM-/i.test(text))
  })

  it('emits one 29762 for continuous integral jornada', () => {
    const integral = {
      codigo: 'JOR-0900-1400',
      descricao: '09:00–14:00',
      horasDia: 5,
      kind: 'INTEGRAL' as const,
      workPeriods: [
        {
          ordem: 1,
          startHour: 9,
          endHour: 14,
          inicio: '09:00',
          fim: '14:00',
        },
      ],
      steps: [
        { ordem: 1, tipo: 'ENTRADA' as const, hora: '09:00' },
        { ordem: 2, tipo: 'SAIDA' as const, hora: '14:00' },
      ],
    }
    const lines = buildRotina1215JornadasText([integral])
      .trim()
      .split('\n')
      .filter(Boolean)
    assert.equal(lines.length, 2)
    assert.ok(lines[0]!.startsWith(`${TX_INCLUSAO_JORNADAS};`))
    assert.ok(lines[1]!.startsWith(`${TX_INCLUSAO_JORNADAS_ITENS};`))
    assert.ok(lines[1]!.includes('(09:00:00)'))
    assert.ok(lines[1]!.includes('(14:00:00)'))
  })

  it('from simulation: 29752+29762, global dedupe, no lunch top-level', () => {
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
    assert.ok(tree.jornadas.length >= 1)
    assert.ok(tree.jornadas.every((j) => j.kind === 'COMPOSTA' || j.kind === 'INTEGRAL'))
    assert.ok(!tree.jornadas.some((j) => j.codigo.includes('ALM')))
    // PX-182: never “Almoço …” as a jornada piece / third top-level block
    for (const j of tree.jornadas) {
      assert.doesNotMatch(j.descricao, /Almo[cç]o/i)
      assert.ok(!j.descricao.includes(' · '))
      assert.ok(j.workPeriods.length === 1 || j.workPeriods.length === 2)
    }
    assert.equal(
      tree.jornadas.map((j) => j.descricao).join(' · '),
      '09:00–12:30 / 13:30–17:00 · 13:00–16:30 / 17:30–21:00',
    )

    const text = buildRotina1215JornadasFromResult(result, {
      dataInicio: '2026-12-01',
      includeLunchJornada: true,
    })
    assert.ok(!/INSERT\s+INTO/i.test(text))
    assert.ok(!/"cpf"/i.test(text))
    assert.ok(!/CON_DssNome/i.test(text))
    assert.doesNotMatch(text, /Almo[cç]o/i)
    assert.ok(!/JOR-ALM-/i.test(text))

    const lines = text.trim().split('\n').filter(Boolean)
    const jLines = lines.filter((l) => l.startsWith(`${TX_INCLUSAO_JORNADAS};`))
    const iLines = lines.filter((l) =>
      l.startsWith(`${TX_INCLUSAO_JORNADAS_ITENS};`),
    )
    assert.equal(jLines.length, 2)
    assert.equal(iLines.length, 4) // 2 work steps × 2 tiles
    assert.deepEqual(jLines, [
      '29752;120531;(JOR-0900-1700)45025;(09:00–12:30 / 13:30–17:00)116457;(07:00:00)10808;(1)126242;(0)10847;(0)',
      '29752;120531;(JOR-1300-2100)45025;(13:00–16:30 / 17:30–21:00)116457;(07:00:00)10808;(1)126242;(0)10847;(0)',
    ])
    assert.deepEqual(iLines, [
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-0900-1700)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(09:00:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(12:30:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(1)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-0900-1700)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(13:30:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(17:00:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(2)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-1300-2100)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(13:00:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(16:30:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(1)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
      `29762;${JORNADAS_ITENS_1215_CAMPOS.cdiJornada.id};(JOR-1300-2100)${JORNADAS_ITENS_1215_CAMPOS.cdiTipoJornada.id};(1)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoInicio.id};(17:30:00)${JORNADAS_ITENS_1215_CAMPOS.hrdHoraMinutoFim.id};(21:00:00)${JORNADAS_ITENS_1215_CAMPOS.nuiOrdem.id};(2)${JORNADAS_ITENS_1215_CAMPOS.oplDesativado.id};(0)`,
    ])
    // All 29752 before 29762
    const firstItemIdx = lines.findIndex((l) =>
      l.startsWith(`${TX_INCLUSAO_JORNADAS_ITENS};`),
    )
    assert.ok(firstItemIdx === jLines.length)

    const rows = buildRotina1215JornadaRows(tree.jornadas)
    assert.equal(new Set(rows.map((r) => r.cosIdentificador)).size, rows.length)
    for (const j of tree.jornadas) {
      assert.ok(text.includes(j.codigo))
      assert.ok(j.descricao.includes('–'))
    }
    assert.equal(
      ROTINA_1215_JORNADAS_LAYOUT_VERSION,
      'turnocheck-rotina-1215-jornadas-29752-29762-v2',
    )
  })
})
