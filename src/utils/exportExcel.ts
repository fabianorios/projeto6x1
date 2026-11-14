/**
 * Excel (SpreadsheetML) export for Escala Atual × Proposta calendars.
 * Sheet "Escalas e Turmas" includes Dia 01…Dia N with T/F marks.
 * LGPD: no person names / CPF — CC + turma aggregates only.
 */

import {
  MONTH_LABELS_PT,
  buildMonthCalendarMatrix,
  baselineCrewsForCalendar,
  type MonthCalendarMatrix,
} from '../engine/monthly-calendar'
import { distributeCrews } from '../engine/crew-distribution'
import type { CostCenterResult, SimulationResult } from '../engine/types'
import { parseScale } from '../engine/scale'
import { deriveCoberturaAtualPorDia } from '../engine/coverage-days'

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
        cell(`T${r.turmaIndex}`),
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

/** Build SpreadsheetML workbook XML for the Escalas e Turmas sheet. */
export function buildEscalasTurmasSpreadsheetXml(
  result: SimulationResult,
  period: { year: number; month: number },
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

  for (const cc of centers) {
    const regime =
      cc.regimeFuncionamento ??
      cc.distribuicaoTurmas?.regime ??
      result.distribuicaoTurmas.regime
    const dist =
      cc.distribuicaoTurmas ??
      distributeCrews(regime, cc.requiredHeadcount)

    body.push(
      row([
        cell(`Centro: ${cc.centroCusto}`),
        cell(regime),
        cell(`HC ${cc.currentHeadcount} → ${cc.requiredHeadcount}`),
      ]),
    )

    const atualCrews = baselineCrewsForCalendar({
      currentHeadcount: cc.currentHeadcount,
      escalaAtual: cc.escalaAtual,
      regime,
    })
    const atualMatrix = buildMonthCalendarMatrix({
      year: period.year,
      month: period.month,
      crews: atualCrews,
      regime,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: regime === 'CONTINUO_7D',
    })
    body.push(...matrixToBlock('Quadro Atual (Baseline)', atualMatrix))

    const propostoMatrix = buildMonthCalendarMatrix({
      year: period.year,
      month: period.month,
      crews: dist.crews,
      regime,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: regime === 'CONTINUO_7D',
    })
    body.push(...matrixToBlock('Quadro Proposto (Nova Escala)', propostoMatrix))
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Escalas e Turmas</Title>
  <Author>Turnocheck</Author>
 </DocumentProperties>
 <Worksheet ss:Name="Escalas e Turmas">
  <Table>
${body.join('\n')}
  </Table>
 </Worksheet>
</Workbook>
`
}

/** Trigger browser download of Escalas e Turmas (.xls SpreadsheetML). */
export function downloadEscalasTurmasExcel(
  result: SimulationResult,
  period: { year: number; month: number },
): void {
  const xml = buildEscalasTurmasSpreadsheetXml(result, period)
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
