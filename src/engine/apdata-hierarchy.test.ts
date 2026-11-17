import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, simulate } from './index'
import {
  APDATA_HIERARCHY_SCHEMA_VERSION,
  applyTurmaHourLabels,
  buildApdataHierarchy,
  buildBlockJornadaSteps,
  buildJornadaCandidates,
  buildJornadaSteps,
  defaultApdataDataInicio,
  deriveApdataCandidates,
  formatHorarioLabel,
  formatJornadaLabel,
  formatTurmaLabel,
  formatWorkdayAbbrev,
  horarioCodigoFor,
  jornadaCodigoFor,
  resolveApdataShiftWindows,
  resolveMealWindow,
  workdayKey,
} from './apdata-hierarchy'
import { resolveShiftWindows } from './operating-hours'

describe('apdata-hierarchy naming', () => {
  it('formatWorkdayAbbrev collapses consecutive days and dots gaps', () => {
    assert.equal(formatWorkdayAbbrev(['seg', 'ter', 'qua', 'qui', 'sex']), 'Seg–Sex')
    assert.equal(formatWorkdayAbbrev(['ter', 'qua', 'qui', 'sex', 'sab']), 'Ter–Sáb')
    assert.equal(formatWorkdayAbbrev(['seg', 'qua', 'sex']), 'Seg·Qua·Sex')
    assert.equal(formatWorkdayAbbrev(['dom']), 'Dom')
  })

  it('formatHorarioLabel uses abbrev workdays + entry/exit', () => {
    assert.equal(
      formatHorarioLabel(['seg', 'ter', 'qua', 'qui', 'sex'], 9, 17),
      'Seg–Sex 09:00–17:00',
    )
    assert.equal(
      formatHorarioLabel(['seg', 'ter', 'qua', 'qui', 'sex'], 8, 16),
      'Seg–Sex 08:00–16:00',
    )
  })

  it('formatJornadaLabel names blocks; lunch prefixes Almoço', () => {
    assert.equal(formatJornadaLabel(9, 12, 'MANHA'), '09:00–12:00')
    assert.equal(formatJornadaLabel(12, 13, 'ALMOCO'), 'Almoço 12:00–13:00')
    assert.equal(formatJornadaLabel(13, 17, 'TARDE'), '13:00–17:00')
  })

  it('formatTurmaLabel prefixes entrada–saída before T# and CC', () => {
    assert.equal(
      formatTurmaLabel(9, 17, 1, 'Geral'),
      '09:00–17:00 · T1 · Geral',
    )
    assert.equal(
      formatTurmaLabel(13, 21, 3, 'CC-OPS'),
      '13:00–21:00 · T3 · CC-OPS',
    )
  })

  it('applyTurmaHourLabels matches proposto prefix on baseline crews', () => {
    const labeled = applyTurmaHourLabels(
      [
        {
          turmaIndex: 1,
          label: 'Baseline 6×1',
          escala: '6x1',
          workDays: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
          restDays: ['dom'],
          headcount: 1,
        },
      ],
      [{ startHour: 9, endHour: 17 }],
      'Geral',
    )
    assert.equal(labeled[0]?.label, '09:00–17:00 · T1 · Geral')
  })

  it('jornada/horario códigos follow clock + day keys', () => {
    assert.equal(jornadaCodigoFor(9, 12, 'MANHA'), 'JOR-0900-1200')
    assert.equal(jornadaCodigoFor(12, 13, 'ALMOCO'), 'JOR-ALM-1200-1300')
    assert.equal(workdayKey(['seg', 'ter', 'qua', 'qui', 'sex']), 'SEGSEX')
    assert.equal(workdayKey(['ter', 'qua', 'qui', 'sex', 'sab']), 'TERSAB')
    assert.equal(workdayKey(['seg', 'qua', 'sex']), 'SEGQUASEX')
    assert.equal(
      horarioCodigoFor(['seg', 'ter', 'qua', 'qui', 'sex'], 9, 17, 'Geral'),
      'HOR-SEGSEX-0900-1700-GERAL',
    )
    assert.equal(
      horarioCodigoFor(['seg', 'ter', 'qua', 'qui', 'sex'], 8, 16, 'Geral'),
      'HOR-SEGSEX-0800-1600-GERAL',
    )
  })

  it('resolveApdataShiftWindows always keeps OH tiles (09–21 → 09–17 + 13–21)', () => {
    const varejo = { default: { openHour: 9, closeHour: 21 } }
    // turnos/dia must NOT collapse a long funcionamento to a lone 09–17
    for (const turnos of [1, 2]) {
      const windows = resolveApdataShiftWindows(varejo, turnos)
      assert.equal(windows.length, 2, `turnos=${turnos}`)
      assert.equal(windows[0]?.startHour, 9)
      assert.equal(windows[0]?.endHour, 17)
      assert.equal(windows[1]?.startHour, 13)
      assert.equal(windows[1]?.endHour, 21)
    }

    const shortDay = { default: { openHour: 8, closeHour: 16 } }
    const short = resolveShiftWindows(shortDay, 1)
    assert.equal(short.length, 1)
    assert.equal(short[0]?.startHour, 8)
    assert.equal(short[0]?.endHour, 16)
  })
})

describe('apdata-hierarchy jornadas/steps', () => {
  it('buildJornadaSteps inserts meal interval for ≥6h shifts (legacy)', () => {
    const steps = buildJornadaSteps(9, 17)
    assert.equal(steps[0]?.tipo, 'ENTRADA')
    assert.equal(steps[0]?.hora, '09:00')
    assert.ok(steps.some((s) => s.tipo === 'INTERVALO_INICIO'))
    assert.ok(steps.some((s) => s.tipo === 'INTERVALO_FIM'))
    assert.equal(steps.at(-1)?.tipo, 'SAIDA')
    assert.equal(steps.at(-1)?.hora, '17:00')
  })

  it('resolveMealWindow + split candidates: A manhã, optional lunch, B tarde', () => {
    const meal = resolveMealWindow(9, 17)
    assert.ok(meal)
    assert.equal(meal!.breakStart, 12.5)
    assert.equal(meal!.breakEnd, 13.5)
    const withLunch = buildJornadaCandidates(9, 17, true)
    assert.equal(withLunch.length, 3)
    assert.equal(withLunch[0]?.kind, 'MANHA')
    assert.equal(withLunch[0]?.steps[0]?.tipo, 'ENTRADA')
    assert.equal(withLunch[0]?.steps[0]?.hora, '09:00')
    assert.equal(withLunch[0]?.steps[1]?.tipo, 'SAIDA')
    assert.equal(withLunch[0]?.steps[1]?.hora, '12:30')
    assert.equal(withLunch[1]?.kind, 'ALMOCO')
    assert.equal(withLunch[1]?.descricao, 'Almoço 12:30–13:30')
    assert.equal(withLunch[2]?.kind, 'TARDE')
    assert.equal(withLunch[2]?.steps[0]?.hora, '13:30')
    assert.equal(withLunch[2]?.steps[1]?.hora, '17:00')

    const noLunch = buildJornadaCandidates(9, 17, false)
    assert.equal(noLunch.length, 2)
    assert.ok(noLunch.every((j) => j.kind !== 'ALMOCO'))
  })

  it('buildBlockJornadaSteps is entrada→saída only', () => {
    const steps = buildBlockJornadaSteps(13, 17)
    assert.deepEqual(steps, [
      { ordem: 1, tipo: 'ENTRADA', hora: '13:00' },
      { ordem: 2, tipo: 'SAIDA', hora: '17:00' },
    ])
  })

  it('short shifts yield a single integral jornada', () => {
    const cands = buildJornadaCandidates(9, 14, true)
    assert.equal(cands.length, 1)
    assert.equal(cands[0]?.kind, 'INTEGRAL')
  })

  it('defaultApdataDataInicio uses scenario reference month day 1', () => {
    assert.equal(defaultApdataDataInicio('fase1_2026_42h'), '2026-12-01')
    assert.equal(defaultApdataDataInicio('fase2_2027_40h'), '2027-12-01')
  })
})

describe('apdata-hierarchy selection + tree', () => {
  it('builds Jornada→Horário→Ciclo→Grade tree for CONTINUO_7D T1–T7', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 35,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const tree = buildApdataHierarchy(result, { dataInicio: '2026-12-01' })
    assert.equal(tree.schemaVersion, APDATA_HIERARCHY_SCHEMA_VERSION)
    assert.equal(tree.dataInicio, '2026-12-01')
    assert.ok(tree.jornadas.length >= 2)
    assert.ok(tree.jornadas.some((j) => j.kind === 'MANHA'))
    assert.ok(tree.jornadas.some((j) => j.kind === 'TARDE'))
    assert.ok(tree.includeLunchJornada)
    assert.ok(tree.jornadas.some((j) => j.kind === 'ALMOCO'))
    assert.ok(tree.horarios.length >= 2)
    // DEFAULT OH 09–21 → 2 tiles × 7 turmas
    assert.equal(tree.grades.length, 14)
    assert.ok(tree.grades.every((g) => /^T[1-7]$/.test(g.turma)))
    assert.ok(tree.grades.every((g) => g.tipoGrade === 'VAGAS'))
    assert.ok(tree.grades.some((g) => g.label.startsWith('09:00–17:00')))
    assert.ok(tree.grades.some((g) => g.label.startsWith('13:00–21:00')))
    assert.ok(tree.ciclos.every((c) => c.dataInicio === '2026-12-01'))
    assert.ok(tree.ciclos.every((c) => c.dias.length === 7))
    assert.ok(
      tree.ciclos.every((c) =>
        c.dias.every((d) => d.marca === 'T' || d.marca === 'F'),
      ),
    )
    const json = JSON.stringify(tree)
    assert.ok(!/"cpf"\s*:/i.test(json))
    assert.ok(!/"nome"\s*:/i.test(json))
    assert.ok(tree.centers[0]?.nodes.length === 14)
    assert.equal(tree.centers[0]?.nodes[0]?.jornadas[0]?.steps[0]?.tipo, 'ENTRADA')
    assert.ok(tree.horarios[0]?.descricao.includes('–'))
    assert.ok(tree.horarios[0]?.jornadaCodigos.length >= 2)
  })

  it('deriveApdataCandidates exposes selectable horários with preview names', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 35,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const cands = deriveApdataCandidates(result)
    assert.ok(cands.horarios.length >= 1)
    assert.ok(cands.horarios.every((h) => h.id && h.descricao && h.codigo))
    assert.ok(cands.jornadas.some((j) => j.kind === 'MANHA'))
  })

  it('selectedHorarioIds filters which horários/grades are materialized', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 35,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'CONTINUO_7D',
    })
    const cands = deriveApdataCandidates(result)
    assert.ok(cands.horarios.length >= 2, 'CONTINUO_7D should yield multiple workday patterns')
    const onlyFirst = [cands.horarios[0]!.id]
    const tree = buildApdataHierarchy(result, {
      dataInicio: '2026-12-01',
      selectedHorarioIds: onlyFirst,
    })
    assert.deepEqual(tree.selectedHorarioIds, onlyFirst)
    assert.equal(tree.horarios.length, 1)
    assert.equal(tree.horarios[0]?.codigo, cands.horarios[0]!.codigo)
    assert.ok(tree.grades.length < 14)
    assert.ok(
      tree.grades.every((g) =>
        cands.horarios[0]!.turmaIndexes.includes(g.turmaIndex),
      ),
    )
  })

  it('includeLunchJornada false omits almoço jornada', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 10,
      currentScale: '5x2',
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'SEG_SEX',
    })
    const tree = buildApdataHierarchy(result, { includeLunchJornada: false })
    assert.equal(tree.includeLunchJornada, false)
    assert.ok(!tree.jornadas.some((j) => j.kind === 'ALMOCO'))
    // OH 09–21 → 2 tiles × (manhã+tarde) without lunch
    assert.equal(tree.jornadas.length, 4)
  })

  it('SEG_SEX with OH 09–21 yields T1 on both tiles (09–17 and 13–21)', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 10,
      currentScale: '5x2',
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'SEG_SEX',
    })
    const tree = buildApdataHierarchy(result)
    assert.equal(tree.grades.length, 2)
    assert.ok(tree.grades.every((g) => g.turma === 'T1'))
    assert.equal(tree.ciclos[0]?.workDays, 5)
    assert.equal(tree.ciclos[0]?.offDays, 2)
    const descs = tree.horarios.map((h) => h.descricao).sort()
    assert.deepEqual(descs, [
      'Seg–Sex 09:00–17:00',
      'Seg–Sex 13:00–21:00',
    ])
    const labels = tree.grades.map((g) => g.label).sort()
    assert.deepEqual(labels, [
      '09:00–17:00 · T1 · Geral',
      '13:00–21:00 · T1 · Geral',
    ])
  })

  it('custom operating hours drive jornada/horário clocks (not hardcoded 09–17)', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 10,
      currentScale: '5x2',
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: { default: { openHour: 8, closeHour: 16 } },
      defaultRegimeFuncionamento: 'SEG_SEX',
    })
    const cands = deriveApdataCandidates(result)
    assert.equal(cands.shift.startHour, 8)
    assert.equal(cands.shift.endHour, 16)
    assert.equal(cands.horarios[0]?.descricao, 'Seg–Sex 08:00–16:00')
    assert.ok(cands.jornadas.some((j) => j.descricao.startsWith('08:00')))
    const tree = buildApdataHierarchy(result)
    assert.equal(tree.grades[0]?.label, '08:00–16:00 · T1 · Geral')
    assert.equal(tree.horarios[0]?.codigo, 'HOR-SEGSEX-0800-1600-GERAL')
  })

  it('shiftsPerDay 2 materializes both tiles with times on turma labels', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 10,
      currentScale: '5x2',
      averageMonthlySalary: 2000,
      units: 1,
      shiftsPerDay: 2,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      defaultRegimeFuncionamento: 'SEG_SEX',
    })
    const cands = deriveApdataCandidates(result)
    assert.equal(cands.shifts.length, 2)
    assert.equal(cands.horarios.length, 2)
    const labels = cands.horarios.map((h) => h.descricao).sort()
    assert.deepEqual(labels, [
      'Seg–Sex 09:00–17:00',
      'Seg–Sex 13:00–21:00',
    ])
    const tree = buildApdataHierarchy(result)
    assert.equal(tree.grades.length, 2)
    const gradeLabels = tree.grades.map((g) => g.label).sort()
    assert.deepEqual(gradeLabels, [
      '09:00–17:00 · T1 · Geral',
      '13:00–21:00 · T1 · Geral',
    ])
    assert.ok(tree.jornadas.some((j) => j.codigo.includes('0900')))
    assert.ok(tree.jornadas.some((j) => j.codigo.includes('2100') || j.codigo.includes('1300')))
  })
})
