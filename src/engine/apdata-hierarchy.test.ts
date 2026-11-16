import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, simulate } from './index'
import {
  APDATA_HIERARCHY_SCHEMA_VERSION,
  buildApdataHierarchy,
  buildJornadaSteps,
  defaultApdataDataInicio,
} from './apdata-hierarchy'

describe('apdata-hierarchy', () => {
  it('buildJornadaSteps inserts meal interval for ≥6h shifts', () => {
    const steps = buildJornadaSteps(9, 17)
    assert.equal(steps[0]?.tipo, 'ENTRADA')
    assert.equal(steps[0]?.hora, '09:00')
    assert.ok(steps.some((s) => s.tipo === 'INTERVALO_INICIO'))
    assert.ok(steps.some((s) => s.tipo === 'INTERVALO_FIM'))
    assert.equal(steps.at(-1)?.tipo, 'SAIDA')
    assert.equal(steps.at(-1)?.hora, '17:00')
  })

  it('defaultApdataDataInicio uses scenario reference month day 1', () => {
    assert.equal(defaultApdataDataInicio('fase1_2026_42h'), '2026-12-01')
    assert.equal(defaultApdataDataInicio('fase2_2027_40h'), '2027-12-01')
  })

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
    assert.ok(tree.jornadas.length >= 1)
    assert.ok(tree.horarios.length >= 1)
    assert.equal(tree.grades.length, 7)
    assert.ok(tree.grades.every((g) => /^T[1-7]$/.test(g.turma)))
    assert.ok(tree.grades.every((g) => g.tipoGrade === 'VAGAS'))
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
    assert.ok(tree.centers[0]?.nodes.length === 7)
    assert.equal(tree.centers[0]?.nodes[0]?.jornada.steps[0]?.tipo, 'ENTRADA')
  })

  it('SEG_SEX yields a single turma grade', () => {
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
    assert.equal(tree.grades.length, 1)
    assert.equal(tree.grades[0]?.turma, 'T1')
    assert.equal(tree.ciclos[0]?.workDays, 5)
    assert.equal(tree.ciclos[0]?.offDays, 2)
  })
})
