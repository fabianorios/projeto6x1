import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS, simulate } from '../engine'
import { buildEscalasTurmasSpreadsheetXml } from './exportExcel'

describe('buildEscalasTurmasSpreadsheetXml', () => {
  it('emits Escalas e Turmas sheet with Dia 01… and T/F', () => {
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
    const xml = buildEscalasTurmasSpreadsheetXml(result, {
      year: 2026,
      month: 12,
    })
    assert.match(xml, /ss:Name="Escalas e Turmas"/)
    assert.match(xml, /Dia 01/)
    assert.match(xml, /Dia 31/)
    assert.match(xml, />T</)
    assert.match(xml, />F</)
    assert.match(xml, /Quadro Atual \(Baseline\)/)
    assert.match(xml, /Quadro Proposto \(Nova Escala\)/)
    assert.doesNotMatch(xml, /CPF|cpf|nome completo/i)
  })
})
