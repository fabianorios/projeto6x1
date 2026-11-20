/**
 * SPA-safe display / structure helpers derived from SimulationResult DTO.
 *
 * Passo 5 UI + exports should import from here (or `import type` from
 * `./types`) — not from `./simulate`, absorption, charges, or schedule-suggest
 * heuristics. Calendar / Apdata tree builders are allowed: they only reshape
 * crews + OH already present on the DTO (see migracao-motor P0/P1).
 *
 * Heavy calc (`simulate`, `planAbsorption`, `suggestSchedules`, …) stays on
 * turnocheck-api (or a lazy local-fallback chunk).
 */

export type {
  ApdataCicloDia,
  ApdataCicloHorario,
  ApdataGradeTipo,
  ApdataGradeTurma,
  ApdataHierarchyCenter,
  ApdataHierarchyNode,
  ApdataHierarchyTree,
  ApdataHorario,
  ApdataHorarioCandidate,
  ApdataJornada,
  ApdataJornadaCandidate,
  ApdataJornadaKind,
  ApdataJornadaStep,
  ApdataShiftWindow,
  ApdataStepTipo,
  ApdataStructureCandidates,
  ApdataWorkPeriod,
  BuildApdataHierarchyOptions,
} from './apdata-hierarchy'
export {
  APDATA_HIERARCHY_SCHEMA_VERSION,
  applyTurmaHourLabels,
  buildApdataHierarchy,
  defaultApdataDataInicio,
  deriveApdataCandidates,
  formatHorarioLabel,
  formatJornadaLabel,
  formatTurmaLabel,
  formatWorkdayAbbrev,
} from './apdata-hierarchy'

export type {
  CoberturaPorDia,
  CoverageCompareTone,
  CoverageWeekday,
} from './coverage-days'
export {
  COVERAGE_WEEKDAYS,
  COVERAGE_WEEKDAY_LABELS,
  coberturaPropostaFromCrews,
  compareCoverageDay,
  deriveCoberturaAtualPorDia,
} from './coverage-days'

export type {
  DailyCoverageCell,
  DayMark,
  MonthCalendarMatrix,
  MonthDayCell,
  TurmaMonthRow,
} from './monthly-calendar'
export {
  MONTH_LABELS_PT,
  baselineCrewsForCalendar,
  buildMonthCalendarMatrix,
  defaultReferencePeriod,
} from './monthly-calendar'

export type { TurmaCrew, TurmaDistribution } from './crew-distribution'
export {
  assignCrewWindowIndices,
  distributeCrews,
} from './crew-distribution'

export {
  DEFAULT_OPERATING_HOURS,
  formatHourClock,
  hourToTimeInputValue,
  resolveBaselineShiftWindows,
  resolveShiftWindows,
  summarizeOperatingHours,
  timeInputToHour,
} from './operating-hours'
export type {
  OperatingHours,
  OHScopeMatchMeta,
  OHScopeRule,
  OHScopeType,
} from './operating-hours'

/** Label helper only — mirrors schedule-suggest without importing heuristics. */
export function formatShiftRange(shift: {
  startHour: number
  endHour: number
}): string {
  const fmt = (h: number) => {
    if (h === 24) return '24:00'
    const hh = Math.floor(((h % 24) + 24) % 24)
    const mm = Math.round((h - Math.floor(h)) * 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return `${fmt(shift.startHour)}–${fmt(shift.endHour)}`
}

export type { ScheduleSuggestion } from './schedule-suggest'

export {
  centroCustoDisplayLabel,
  formatCentroCustoCodeDesc,
  formatHorarioAtualLabel,
} from './payroll'
export type { PayrollParseIssue, PayrollRow } from './payroll'

export type {
  CostCenterResult,
  ResultLineItem,
  ScenarioId,
  SimulationInput,
  SimulationResult,
} from './types'
export type { ExclusionHit } from './schedule-policy'

export { getSectorDisplayLabel } from './sectors'

export { buildScenarioWhyBullets } from './scenario-why'

export {
  buildFeedbackEntry,
  clearCalibrationHistory,
  downloadCalibrationJson,
  loadCalibrationHistory,
  saveCalibrationEntry,
} from './calibration-feedback'
export type {
  CalibrationFeedbackEntry,
  EditedShiftFields,
  FeedbackAction,
} from './calibration-feedback'

export {
  removeProposedScenario,
  setBestScenario,
} from './scenario-basket'
export type { ScenarioBasket } from './scenario-basket'

export { parseScale } from './scale'

export {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  REGIME_FUNCIONAMENTO_LABELS,
} from '../types'
export type {
  EstrategiaAbsorcao,
  RegimeFuncionamento,
  TaxRegime,
} from '../types'
