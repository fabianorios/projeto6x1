/**
 * Monthly T/F calendar projection for Escala Atual × Proposta.
 * LGPD: aggregates / turma labels only — no person names.
 */

import type { RegimeFuncionamento } from '../types'
import {
  COVERAGE_WEEKDAYS,
  type CoverageWeekday,
} from './coverage-days'
import type { TurmaCrew } from './crew-distribution'
import { distributeCrews } from './crew-distribution'

export { crewsWithTotalHeadcount } from './crew-distribution'
import { parseScale } from './scale'
import type { ScaleCycle, ScenarioId } from './types'
import { normalizeScenarioId } from './rules'

export type DayMark = 'T' | 'F'

export const MONTH_LABELS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export const WEEKDAY_SHORT_PT: Record<CoverageWeekday, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
}

export interface MonthDayCell {
  /** 1-based day of month. */
  day: number
  /** Year of the cell (same as month period). */
  year: number
  /** 1-based month. */
  month: number
  weekday: CoverageWeekday
  weekdayLabel: string
  isWeekend: boolean
  /** 0-based week index relative to the week containing day 1. */
  weekIndex: number
}

export interface TurmaMonthRow {
  turmaIndex: number
  label: string
  escala: string
  headcount: number
  /** T/F per day of month (index 0 = day 1). */
  marks: DayMark[]
}

export interface DailyCoverageCell {
  day: number
  working: number
  need: number
  /** working < need when need > 0 */
  uncovered: boolean
}

export interface MonthCalendarMatrix {
  year: number
  month: number
  days: MonthDayCell[]
  rows: TurmaMonthRow[]
  daily: DailyCoverageCell[]
}

/** Days in calendar month (1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Default reference period: Dec/2026 for 42h, Dec/2027 for 40h. */
export function defaultReferencePeriod(scenarioId: string): {
  year: number
  month: number
} {
  const id = normalizeScenarioId(scenarioId) as ScenarioId
  if (id === 'fase2_2027_40h') return { year: 2027, month: 12 }
  return { year: 2026, month: 12 }
}

function jsWeekdayToCoverage(jsDay: number): CoverageWeekday {
  // Date#getDay: 0=Sun … 6=Sat → seg…dom with Mon-first
  const map: CoverageWeekday[] = [
    'dom',
    'seg',
    'ter',
    'qua',
    'qui',
    'sex',
    'sab',
  ]
  return map[jsDay] ?? 'seg'
}

function mondayWeekStartMs(year: number, month: number, day: number): number {
  const d = new Date(year, month - 1, day)
  const js = d.getDay()
  const toMonday = js === 0 ? -6 : 1 - js
  const mon = new Date(year, month - 1, day + toMonday)
  mon.setHours(0, 0, 0, 0)
  return mon.getTime()
}

/** Build day columns for a calendar month. */
export function buildMonthDays(year: number, month: number): MonthDayCell[] {
  const n = daysInMonth(year, month)
  const week0 = mondayWeekStartMs(year, month, 1)
  const out: MonthDayCell[] = []
  for (let day = 1; day <= n; day++) {
    const weekday = jsWeekdayToCoverage(new Date(year, month - 1, day).getDay())
    const weekIndex = Math.round(
      (mondayWeekStartMs(year, month, day) - week0) / (7 * 86_400_000),
    )
    out.push({
      day,
      year,
      month,
      weekday,
      weekdayLabel: WEEKDAY_SHORT_PT[weekday],
      isWeekend: weekday === 'sab' || weekday === 'dom',
      weekIndex,
    })
  }
  return out
}

function weekdayIndex(d: CoverageWeekday): number {
  return COVERAGE_WEEKDAYS.indexOf(d)
}

/** Shift a weekday by `delta` days (can be negative). */
export function shiftCoverageWeekday(
  day: CoverageWeekday,
  delta: number,
): CoverageWeekday {
  const n = COVERAGE_WEEKDAYS.length
  const i = weekdayIndex(day)
  const next = ((i + delta) % n + n) % n
  return COVERAGE_WEEKDAYS[next]
}

function normalizeDayKeys(days: string[]): CoverageWeekday[] {
  const out: CoverageWeekday[] = []
  for (const raw of days) {
    const key = raw.toLowerCase() as CoverageWeekday
    if ((COVERAGE_WEEKDAYS as readonly string[]).includes(key)) out.push(key)
  }
  return out
}

/**
 * Whether a crew works on a given month day.
 * When `rotateWeekly` is true (5×2 contínuo), rest days advance +1 weekday
 * each calendar week so offs walk through the week.
 */
export function crewWorksOnDay(
  crew: Pick<TurmaCrew, 'workDays' | 'restDays' | 'escala'>,
  cell: MonthDayCell,
  rotateWeekly: boolean,
): boolean {
  const restBase = normalizeDayKeys(crew.restDays)
  if (rotateWeekly && restBase.length > 0) {
    const rest = new Set(
      restBase.map((d) => shiftCoverageWeekday(d, cell.weekIndex)),
    )
    return !rest.has(cell.weekday)
  }
  const work = new Set(normalizeDayKeys(crew.workDays))
  if (work.size > 0) return work.has(cell.weekday)
  // Fallback: treat missing workDays as off
  return false
}

/**
 * Operational minimum people on site for the weekday under the CC regime.
 */
export function minimumNeedForWeekday(
  regime: RegimeFuncionamento,
  weekday: CoverageWeekday,
  dailyCoverageNeed: number,
): number {
  const need = Math.max(0, Math.round(dailyCoverageNeed))
  if (need <= 0) return 0
  if (regime === 'CONTINUO_7D') return need
  if (regime === 'SEG_SAB') return weekday === 'dom' ? 0 : need
  // SEG_SEX
  return weekday === 'sab' || weekday === 'dom' ? 0 : need
}

export function shouldRotateWeekly(
  regime: RegimeFuncionamento,
  _escala?: string | null,
): boolean {
  // Only CONTINUO_7D advances 5×2 offs week-to-week; SEG_SEX / SEG_SAB stay fixed.
  return regime === 'CONTINUO_7D'
}

/** Project T/F matrix + daily working totals for a set of turmas. */
export function buildMonthCalendarMatrix(args: {
  year: number
  month: number
  crews: Pick<
    TurmaCrew,
    'turmaIndex' | 'label' | 'escala' | 'workDays' | 'restDays' | 'headcount'
  >[]
  regime: RegimeFuncionamento
  dailyCoverageNeed: number
  rotateWeekly?: boolean
}): MonthCalendarMatrix {
  const days = buildMonthDays(args.year, args.month)
  const rotate =
    args.rotateWeekly ??
    shouldRotateWeekly(args.regime, args.crews[0]?.escala)

  const rows: TurmaMonthRow[] = args.crews.map((crew) => ({
    turmaIndex: crew.turmaIndex,
    label: crew.label,
    escala: crew.escala,
    headcount: Math.max(0, Math.round(crew.headcount)),
    marks: days.map((cell) =>
      crewWorksOnDay(crew, cell, rotate) ? 'T' : 'F',
    ),
  }))

  const daily: DailyCoverageCell[] = days.map((cell, i) => {
    let working = 0
    for (const row of rows) {
      if (row.marks[i] === 'T') working += row.headcount
    }
    const need = minimumNeedForWeekday(
      args.regime,
      cell.weekday,
      args.dailyCoverageNeed,
    )
    return {
      day: cell.day,
      working,
      need,
      uncovered: need > 0 && working < need,
    }
  })

  return {
    year: args.year,
    month: args.month,
    days,
    rows,
    daily,
  }
}

/**
 * Baseline (Atual) crews for the monthly grid.
 * CONTINUO_7D → 7 rotating 5×2 turmas sized from current HC.
 * Otherwise → single pool from escala atual (5×2 / 6×1 weekdays).
 *
 * Labels stay generic here (`Baseline …` / `Turma N`); callers that show
 * Quadro Atual should apply `formatTurmaLabel` / `applyTurmaHourLabels` so
 * Atual matches Proposto (`09:00–17:00 · T1 · CC`).
 */
export function baselineCrewsForCalendar(args: {
  currentHeadcount: number
  escalaAtual: string | null | undefined
  regime: RegimeFuncionamento
}): TurmaCrew[] {
  const hc = Math.max(0, Math.round(args.currentHeadcount))
  if (args.regime === 'CONTINUO_7D') {
    // distributeCrews already preserves exact HC across T1…T7.
    return distributeCrews('CONTINUO_7D', hc).crews
  }

  const scale: ScaleCycle = parseScale(args.escalaAtual ?? '6x1')
  const workCount = Math.min(7, Math.max(0, Math.round(scale.workDays)))
  const workDays = COVERAGE_WEEKDAYS.slice(0, workCount)
  const restDays = COVERAGE_WEEKDAYS.slice(workCount)
  return [
    {
      turmaIndex: 1,
      label: `Baseline ${scale.label}`,
      escala: scale.label.replace('×', 'x').toLowerCase(),
      workDays: [...workDays],
      restDays: [...restDays],
      headcount: hc,
    },
  ]
}
