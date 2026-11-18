/**
 * Excel (SpreadsheetML) export for Escala Atual × Proposta calendars
 * + Apdata cadastral hierarchy (Jornada→Horário→Ciclo→Grade).
 * Sheet "Escalas e Turmas" includes Dia 01…Dia N with T/F marks.
 * Sheet "Apdata Hierarquia" is the ERP fiel-da-balança tree.
 * LGPD: no person names / CPF — CC + turma aggregates only.
 */

import {
  MONTH_LABELS_PT,
  applyTurmaHourLabels,
  buildApdataHierarchy,
  buildMonthCalendarMatrix,
  baselineCrewsForCalendar,
  resolveBaselineShiftWindows,
  resolveShiftWindows,
  type ApdataHierarchyTree,
  type MonthCalendarMatrix,
} from '../engine'
import { distributeCrews } from '../engine/crew-distribution'
import type { CostCenterResult, SimulationResult } from '../engine/types'
import { parseScale } from '../engine/scale'
import { deriveCoberturaAtualPorDia } from '../engine/coverage-days'
import { DEFAULT_OPERATING_HOURS } from '../engine/operating-hours'

export interface EscalasExcelExportOptions {
  /** Data Início for Ciclos (YYYY-MM-DD). */
  dataInicio?: string
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | number, type: 'String' | 'Number' = 'String'): string {
  if (type === 'Number') {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`
}

function row(cells: string[]): string {
  return `<Row>${cells.join('')}</Row>`
}

function centersFromResult(result: SimulationResult): CostCenterResult[] {
  if (result.byCostCenter.length > 0) return result.byCostCenter
  const escala = result.input.currentScale
  const regime = result.distribuicaoTurmas.regime
  return [
    {
      centroCusto: 'Geral',
      currentHeadcount: result.coverage.currentHeadcount,
      requiredHeadcount: result.coverage.requiredHeadcount,
      additionalHeadcount: result.coverage.additionalHeadcount,
      baselineSalaryMass:
        result.cost.baselineSalaryMass ??
        result.coverage.currentHeadcount * result.input.averageMonthlySalary,
      baselinePayroll: result.cost.baselineMonthlyPayroll,
      projectedPayroll: result.cost.projectedMonthlyPayroll,
      payrollMonthlyDelta: result.cost.monthlyDelta,
      vr: result.vr ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      vt: result.vt ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      va: result.va ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      assistMedicaMonthly: result.assistMedicaMonthly ?? 0,
      assistOdontoMonthly: result.assistOdontoMonthly ?? 0,
      regimeFuncionamento: regime,
      distribuicaoTurmas: result.distribuicaoTurmas,
      codHorarioAtual: null,
      escalaAtual: escala,
      cargaSemanalAtual: null,
      coberturaAtualPorDia: deriveCoberturaAtualPorDia(
        result.coverage.currentHeadcount,
        parseScale(escala),
        regime,
      ),
    },
  ]
}

function matrixToBlock(
  title: string,
  matrix: MonthCalendarMatrix,
): string[] {
  const dayHeaders = matrix.days.map(
    (d) => `Dia ${String(d.day).padStart(2, '0')}`,
  )
  const lines: string[] = []
  lines.push(
    row([
      cell(title),
      cell(`${MONTH_LABELS_PT[matrix.month - 1]} / ${matrix.year}`),
    ]),
  )
  lines.push(
    row([
      cell('Turma'),
      cell('HC'),
      cell('Escala'),
      ...dayHeaders.map((h) => cell(h)),
    ]),
  )
  for (const r of matrix.rows) {
    lines.push(
      row([
        cell(r.label?.trim() || `T${r.turmaIndex}`),
        cell(r.headcount, 'Number'),
        cell(r.escala),
        ...r.marks.map((m) => cell(m)),
      ]),
    )
  }
  lines.push(
    row([
      cell('Total trabalhando'),
      cell(''),
      cell(''),
      ...matrix.daily.map((d) => cell(d.working, 'Number')),
    ]),
  )
  lines.push(
    row([
      cell('Mínimo CC'),
      cell(''),
      cell(''),
      ...matrix.daily.map((d) => cell(d.need, 'Number')),
    ]),
  )
  lines.push(
    row([
      cell('Status'),
      cell(''),
      cell(''),
      ...matrix.daily.map((d) => cell(d.uncovered ? 'FALTA' : 'OK')),
    ]),
  )
  lines.push(row([cell('')]))
  return lines
}

function hierarchySheetRows(tree: ApdataHierarchyTree): string[] {
  const lines: string[] = []
  lines.push(
    row([
      cell('Turnocheck · Hierarquia Apdata'),
      cell(tree.scenarioLabel),
      cell(`Data Início ${tree.dataInicio}`),
      cell(tree.schemaVersion),
    ]),
  )
  lines.push(
    row([
      cell(
        'Jornada → Horário → Ciclo → Grade (Vagas) · LGPD: só códigos CC/turma/HC',
      ),
    ]),
  )
  lines.push(row([cell('')]))

  lines.push(row([cell('=== Jornadas e Steps ===')]))
  lines.push(
    row([
      cell('Codigo'),
      cell('Descricao'),
      cell('HorasDia'),
      cell('Ordem'),
      cell('TipoStep'),
      cell('Inicio'),
      cell('Fim'),
    ]),
  )
  for (const j of tree.jornadas) {
    // Work periods = 29762 steps (Trabalho only). Lunch gap is not a step/jornada.
    for (const p of j.workPeriods) {
      lines.push(
        row([
          cell(j.codigo),
          cell(j.descricao),
          cell(j.horasDia, 'Number'),
          cell(p.ordem, 'Number'),
          cell('TRABALHO'),
          cell(p.inicio),
          cell(p.fim),
        ]),
      )
    }
  }
  lines.push(row([cell('')]))

  lines.push(row([cell('=== Horarios ===')]))
  lines.push(
    row([
      cell('Codigo'),
      cell('Descricao'),
      cell('Jornadas'),
      cell('CargaSemanalHoras'),
      cell('CodHorarioAtualRef'),
    ]),
  )
  for (const h of tree.horarios) {
    lines.push(
      row([
        cell(h.codigo),
        cell(h.descricao),
        cell(h.jornadaCodigos.join(', ')),
        h.cargaSemanalHoras == null
          ? cell('')
          : cell(h.cargaSemanalHoras, 'Number'),
        cell(h.codHorarioAtualRef ?? ''),
      ]),
    )
  }
  lines.push(row([cell('')]))

  lines.push(row([cell('=== Ciclos de Horarios ===')]))
  lines.push(
    row([
      cell('Codigo'),
      cell('Horario'),
      cell('DataInicio'),
      cell('Escala'),
      cell('Work'),
      cell('Off'),
      cell('DiaOrdem'),
      cell('Weekday'),
      cell('Marca'),
    ]),
  )
  for (const c of tree.ciclos) {
    for (const d of c.dias) {
      lines.push(
        row([
          cell(c.codigo),
          cell(c.horarioCodigo),
          cell(c.dataInicio),
          cell(c.escala),
          cell(c.workDays, 'Number'),
          cell(c.offDays, 'Number'),
          cell(d.ordem, 'Number'),
          cell(d.weekdayLabel),
          cell(d.marca),
        ]),
      )
    }
  }
  lines.push(row([cell('')]))

  lines.push(row([cell('=== Grades (Vagas) ===')]))
  lines.push(
    row([
      cell('Turma'),
      cell('Ciclo'),
      cell('CentroCustoCodigo'),
      cell('HeadcountProposto'),
      cell('TipoGrade'),
      cell('Label'),
    ]),
  )
  for (const g of tree.grades) {
    lines.push(
      row([
        cell(g.turma),
        cell(g.cicloCodigo),
        cell(g.centroCustoCodigo),
        cell(g.headcountProposto, 'Number'),
        cell(g.tipoGrade),
        cell(g.label),
      ]),
    )
  }
  lines.push(row([cell('')]))

  lines.push(row([cell('=== Arvore (revisao) ===')]))
  lines.push(
    row([
      cell('FilialCNPJ'),
      cell('CC'),
      cell('Turma'),
      cell('Jornada'),
      cell('Horario'),
      cell('Ciclo'),
      cell('DataInicio'),
      cell('Escala'),
      cell('CicloTF'),
      cell('HC'),
    ]),
  )
  for (const center of tree.centers) {
    for (const node of center.nodes) {
      const g = node.grades[0]
      const tf = node.ciclo.dias.map((d) => d.marca).join('')
      lines.push(
        row([
          cell(center.cnpjCompleto ?? ''),
          cell(center.centroCustoCodigo),
          cell(g?.turma ?? ''),
          cell(node.jornadas.map((j) => j.codigo).join(', ') || node.jornada.codigo),
          cell(node.horario.codigo),
          cell(node.ciclo.codigo),
          cell(node.ciclo.dataInicio),
          cell(node.ciclo.escala),
          cell(tf),
          cell(g?.headcountProposto ?? 0, 'Number'),
        ]),
      )
    }
  }

  return lines
}

/** Build SpreadsheetML workbook XML (Escalas + Apdata Hierarquia). */
export function buildEscalasTurmasSpreadsheetXml(
  result: SimulationResult,
  period: { year: number; month: number },
  options: EscalasExcelExportOptions = {},
): string {
  const centers = centersFromResult(result)
  const body: string[] = []
  body.push(
    row([
      cell('Turnocheck · Escalas e Turmas'),
      cell(result.ruleVersion.label),
      cell(`Período ${String(period.month).padStart(2, '0')}/${period.year}`),
    ]),
  )
  body.push(row([cell('')]))

  const operatingHours =
    result.input.operatingHours ?? DEFAULT_OPERATING_HOURS
  const shiftsPerDay = Math.max(1, result.input.shiftsPerDay || 1)

  for (const cc of centers) {
    const regime =
      cc.regimeFuncionamento ??
      cc.distribuicaoTurmas?.regime ??
      result.distribuicaoTurmas.regime
    const dist =
      cc.distribuicaoTurmas ??
      distributeCrews(regime, cc.requiredHeadcount)
    const ccHours = cc.operatingHours ?? operatingHours
    const shiftWindows = resolveShiftWindows(ccHours, shiftsPerDay)

    body.push(
      row([
        cell(`Centro: ${cc.centroCusto}`),
        cell(regime),
        cell(`HC ${cc.currentHeadcount} → ${cc.requiredHeadcount}`),
      ]),
    )

    // Atual only: Folha window when present; Proposto keeps OH tiles.
    const atualWindows = resolveBaselineShiftWindows(
      cc.horarioTrabalhoAtual,
      ccHours,
      shiftsPerDay,
    )
    const atualCrews = applyTurmaHourLabels(
      baselineCrewsForCalendar({
        currentHeadcount: cc.currentHeadcount,
        escalaAtual: cc.escalaAtual,
        regime,
      }),
      atualWindows,
      cc.centroCusto,
      { dailyCoverageNeed: dist.dailyCoverageNeed },
    )
    const atualMatrix = buildMonthCalendarMatrix({
      year: period.year,
      month: period.month,
      crews: atualCrews,
      regime,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: regime === 'CONTINUO_7D',
    })
    body.push(...matrixToBlock('Quadro Atual (Baseline)', atualMatrix))

    const propostoCrews = applyTurmaHourLabels(
      dist.crews,
      shiftWindows,
      cc.centroCusto,
      { dailyCoverageNeed: dist.dailyCoverageNeed },
    )
    const propostoMatrix = buildMonthCalendarMatrix({
      year: period.year,
      month: period.month,
      crews: propostoCrews,
      regime,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: regime === 'CONTINUO_7D',
    })
    body.push(...matrixToBlock('Quadro Proposto (Nova Escala)', propostoMatrix))
  }

  const tree = buildApdataHierarchy(result, {
    dataInicio: options.dataInicio,
  })
  const hierarchyBody = hierarchySheetRows(tree)

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Escalas e Hierarquia Apdata</Title>
  <Author>Turnocheck</Author>
 </DocumentProperties>
 <Worksheet ss:Name="Escalas e Turmas">
  <Table>
${body.join('\n')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Apdata Hierarquia">
  <Table>
${hierarchyBody.join('\n')}
  </Table>
 </Worksheet>
</Workbook>
`
}

/** Trigger browser download of Escalas e Turmas (.xls SpreadsheetML). */
export function downloadEscalasTurmasExcel(
  result: SimulationResult,
  period: { year: number; month: number },
  options: EscalasExcelExportOptions = {},
): void {
  const xml = buildEscalasTurmasSpreadsheetXml(result, period, options)
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const mm = String(period.month).padStart(2, '0')
  a.download = `turnocheck-escalas-turmas-${mm}-${period.year}.xls`
  a.click()
  URL.revokeObjectURL(url)
}
