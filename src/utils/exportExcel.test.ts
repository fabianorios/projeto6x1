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
    assert.match(xml, /Trabalho/)
    assert.match(xml, /Folga\/DSR/)
    assert.match(xml, /Pessoa \/ Posto/)
    assert.match(xml, /LGPD: nomes anonimizados/)
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

  it('blocks unmasked person names in Excel when LGPD mask is ON', () => {
    const result = simulate({
      sector: 'varejo',
      headcount: 2,
      currentScale: '6x1',
      averageMonthlySalary: 2200,
      units: 1,
      shiftsPerDay: 1,
      scenarioId: 'fase1_2026_42h',
      operatingHours: DEFAULT_OPERATING_HOURS,
      payrollRows: [
        {
          cargo: 'Operador',
          salario: 2200,
          cargaHorariaMensal: 220,
          cargaHorariaSemanal: 44,
          centroCusto: 'Geral',
          vrValorDia: null,
          vrDiasMesAtual: null,
          vtValorDia: null,
          vtDiasMesAtual: null,
          nome: 'João Silva',
          quantidade: 2,
          escalaAtual: '6x1',
          sourceLine: 2,
          codEmpresa: null,
          codFilial: null,
          razaoSocial: null,
          nomeFilial: null,
          cnpjCompleto: null,
          codCc: null,
          descCc: null,
          codCargo: null,
          descCargo: null,
          codVinculo: null,
          codHorarioAtual: null,
          horarioTrabalhoAtual: null,
          codSindicato: null,
          nomeSindicato: null,
          cnpjSindicato: null,
          heMediaMensalHoras: 0,
          regimeFuncionamento: null,
          massaSalarialBase: null,
          modoDiasVr: null,
          modoDiasVt: null,
          diasBaseMesVr: null,
          diasBaseMesVt: null,
          vaValorDia: null,
          vaValorMes: null,
          vaModoValor: null,
          assistMedicaMes: null,
          assistOdontoMes: null,
          benefits: [],
        },
      ],
    })
    const xml = buildEscalasTurmasSpreadsheetXml(
      result,
      { year: 2026, month: 12 },
      { maskCollaboratorNames: true },
    )
    assert.doesNotMatch(xml, /João Silva/)
    assert.match(xml, /J\*\*\* S\*\*\*\*/)
  })
})
