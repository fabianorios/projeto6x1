import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'
import { simulate } from '../engine/simulate'
import { buildEscalasTurmasSpreadsheetXml } from './exportExcel'

describe('buildEscalasTurmasSpreadsheetXml', () => {
  it('emits full Escalas + Apdata sheets from SimulationResult (collapsed UI irrelevant)', () => {
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
    const xml = buildEscalasTurmasSpreadsheetXml(
      result,
      { year: 2026, month: 12 },
      { dataInicio: '2026-12-01' },
    )
    assert.match(xml, /ss:Name="Escalas e Turmas"/)
    assert.match(xml, /ss:Name="Apdata Hierarquia"/)
    assert.match(xml, /Dia 01/)
    assert.match(xml, /Dia 31/)
    assert.match(xml, />T</)
    assert.match(xml, />F</)
    assert.match(xml, /Quadro Atual \(Baseline\)/)
    assert.match(xml, /Quadro Proposto \(Nova Escala\)/)
    assert.match(xml, /=== Jornadas e Steps ===/)
    assert.match(xml, /TRABALHO/)
    assert.match(xml, /09:00–12:30 \/ 13:30–17:00/)
    assert.match(xml, /13:00–16:30 \/ 17:30–21:00/)
    assert.doesNotMatch(xml, /Almo[cç]o|JOR-ALM-|INTERVALO_INICIO/i)
    assert.match(xml, /=== Ciclos de Horarios ===/)
    assert.match(xml, /=== Grades \(Vagas\) ===/)
    assert.match(xml, /DataInicio/)
    assert.match(xml, /2026-12-01/)
    assert.doesNotMatch(xml, /CPF|cpf|nome completo/i)
  })
})
