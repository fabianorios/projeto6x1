import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, buildApdataHierarchy, simulate } from '../engine'
import {
  COMANDOS_DML_JORNADAS_LAYOUT_VERSION,
  COMANDOS_DML_JORNADAS_ROTINA,
  buildComandosDmlJornadaRows,
  buildComandosDmlJornadasFromResult,
  buildComandosDmlJornadasText,
  horasDiaToHrdHhMm,
} from './exportComandosDmlJornadas'

describe('exportComandosDmlJornadas', () => {
  it('converts horasDia to HH:MM', () => {
    assert.equal(horasDiaToHrdHhMm(3.5), '03:30')
    assert.equal(horasDiaToHrdHhMm(8), '08:00')
    assert.equal(horasDiaToHrdHhMm(8.8), '08:48')
    assert.equal(horasDiaToHrdHhMm(0), '00:00')
  })

  it('emits one INSERT per unique jornada codigo (dedupe)', () => {
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

    const text = buildComandosDmlJornadasFromResult(result, {
      dataInicio: '2026-12-01',
      includeLunchJornada: true,
    })
    assert.ok(text.includes(`rotina ${COMANDOS_DML_JORNADAS_ROTINA}`))
    assert.ok(text.includes(COMANDOS_DML_JORNADAS_LAYOUT_VERSION))
    assert.ok(text.includes('INSERT INTO Jornadas'))
    assert.ok(text.includes('JOR_CosIdentificadorTabela'))
    assert.ok(!/"cpf"/i.test(text))
    assert.ok(!/CON_DssNome/i.test(text))

    const inserts = text.match(/INSERT INTO Jornadas/g) ?? []
    assert.equal(inserts.length, tree.jornadas.length)
    // Only Jornadas INSERTs — no JOI_/JornadasItens DML body.
    assert.equal((text.match(/INSERT INTO\s+\w+/gi) ?? []).length, inserts.length)
    assert.ok(!/INSERT INTO JornadasItens/i.test(text))
    assert.ok(!/\bJOI_/i.test(text))
    // PK not in INSERT column lists (only mentioned in header assumption note).
    const insertBlocks = text.split('INSERT INTO Jornadas').slice(1)
    for (const block of insertBlocks) {
      const cols = block.slice(0, block.indexOf(') VALUES'))
      assert.ok(!cols.includes('JOR_CdiJornada'))
    }

    const rows = buildComandosDmlJornadaRows(tree.jornadas)
    const codes = new Set(rows.map((r) => r.cosIdentificador))
    assert.equal(codes.size, rows.length)
    for (const j of tree.jornadas) {
      assert.ok(text.includes(j.codigo))
    }
  })

  it('dedupes duplicate codigo inputs to a single INSERT', () => {
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
    const text = buildComandosDmlJornadasText([dup, { ...dup }])
    const inserts = text.match(/INSERT INTO Jornadas/g) ?? []
    assert.equal(inserts.length, 1)
    assert.ok(text.includes("'JOR-0900-1230'"))
    assert.ok(text.includes('1899-12-30 03:30:00'))
  })
})
