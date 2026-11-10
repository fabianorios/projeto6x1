/**
 * Fase A — capture accept / edit / reject feedback on schedule suggestions.
 * Local-only dataset for later calibration (docs/learning-motor.md).
 */

import type { OperatingHours } from './operating-hours'
import type { ScheduleSuggestion, ShiftWindowSuggestion } from './schedule-suggest'
import type {
  CostDelta,
  CoverageGap,
  ScenarioId,
  SectorId,
  SimulationInput,
  SimulationResult,
} from './types'

export const CALIBRATION_STORAGE_KEY = 'projeto6x1.calibrationFeedback.v1'
export const CALIBRATION_SCHEMA_VERSION = 'calibration-feedback-v1'

export type FeedbackAction = 'accepted' | 'edited' | 'rejected'

/** Editable fields on a suggested shift (HC and/or hours). */
export interface EditedShiftFields {
  label: string
  startHour: number
  endHour: number
  hours: number
  headcount: number
}

export interface SuggestionFeedbackPayload {
  code: string
  label: string
  centroCusto: string
  original: {
    shifts: ShiftWindowSuggestion[]
    totalHeadcount: number
    monthlyDeltaVsCurrent: number
    estimatedMonthlyTotal: number
    currentMonthlyTotal: number
  }
  /** Present when action === 'edited'. */
  edited?: {
    shifts: EditedShiftFields[]
    totalHeadcount: number
  }
}

export interface PayrollDeltasSnapshot {
  simulationMonthlyPayroll: number
  simulationAnnualPayroll: number
  simulationMonthlyVr: number | null
  simulationMonthlyVt: number | null
  suggestionMonthlyDeltaVsCurrent: number
}

/** Anonymized / local scenario snapshot (no raw payroll rows). */
export interface ScenarioSnapshot {
  sector: SectorId
  scenarioId: ScenarioId
  operatingHours: OperatingHours
  currentScale: string
  headcount: number
  averageMonthlySalary: number
  units: number
  shiftsPerDay: number
  usedPayrollImport: boolean
  ruleVersionId: string
  ruleVersionLabel: string
  cost: CostDelta
  coverage: CoverageGap
  /** All candidates shown for this run (codes + Δ). */
  suggestionSummaries: {
    code: string
    label: string
    centroCusto: string
    totalHeadcount: number
    monthlyDeltaVsCurrent: number
  }[]
}

export interface CalibrationFeedbackEntry {
  id: string
  schemaVersion: string
  timestamp: string
  sector: SectorId
  operatingHours: OperatingHours
  scenarioId: ScenarioId
  action: FeedbackAction
  suggestion: SuggestionFeedbackPayload
  payrollDeltas: PayrollDeltasSnapshot
  scenarioSnapshot: ScenarioSnapshot
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildScenarioSnapshot(
  result: SimulationResult,
): ScenarioSnapshot {
  const { input, ruleVersion, cost, coverage, scheduleSuggestions, usedPayrollImport } =
    result
  return {
    sector: input.sector,
    scenarioId: input.scenarioId,
    operatingHours: input.operatingHours,
    currentScale: input.currentScale,
    headcount: input.headcount,
    averageMonthlySalary: input.averageMonthlySalary,
    units: input.units,
    shiftsPerDay: input.shiftsPerDay,
    usedPayrollImport,
    ruleVersionId: ruleVersion.id,
    ruleVersionLabel: ruleVersion.label,
    cost,
    coverage,
    suggestionSummaries: scheduleSuggestions.map((s) => ({
      code: s.code,
      label: s.label,
      centroCusto: s.centroCusto,
      totalHeadcount: s.totalHeadcount,
      monthlyDeltaVsCurrent: s.monthlyDeltaVsCurrent,
    })),
  }
}

export function buildFeedbackEntry(args: {
  result: SimulationResult
  suggestion: ScheduleSuggestion
  action: FeedbackAction
  editedShifts?: EditedShiftFields[]
}): CalibrationFeedbackEntry {
  const { result, suggestion, action, editedShifts } = args
  const snapshot = buildScenarioSnapshot(result)

  const suggestionPayload: SuggestionFeedbackPayload = {
    code: suggestion.code,
    label: suggestion.label,
    centroCusto: suggestion.centroCusto,
    original: {
      shifts: suggestion.shifts,
      totalHeadcount: suggestion.totalHeadcount,
      monthlyDeltaVsCurrent: suggestion.monthlyDeltaVsCurrent,
      estimatedMonthlyTotal: suggestion.estimated.monthlyTotal,
      currentMonthlyTotal: suggestion.current.monthlyTotal,
    },
  }

  if (action === 'edited' && editedShifts && editedShifts.length > 0) {
    suggestionPayload.edited = {
      shifts: editedShifts,
      totalHeadcount: editedShifts.reduce((n, s) => n + s.headcount, 0),
    }
  }

  return {
    id: newId(),
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    sector: result.input.sector,
    operatingHours: result.input.operatingHours,
    scenarioId: result.input.scenarioId,
    action,
    suggestion: suggestionPayload,
    payrollDeltas: {
      simulationMonthlyPayroll: result.cost.monthlyDelta,
      simulationAnnualPayroll: result.cost.annualDelta,
      simulationMonthlyVr: result.vr?.monthlyDelta ?? null,
      simulationMonthlyVt: result.vt?.monthlyDelta ?? null,
      suggestionMonthlyDeltaVsCurrent: suggestion.monthlyDeltaVsCurrent,
    },
    scenarioSnapshot: snapshot,
  }
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function loadCalibrationHistory(): CalibrationFeedbackEntry[] {
  if (!canUseStorage()) return []
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFeedbackEntry)
  } catch {
    return []
  }
}

function isFeedbackEntry(v: unknown): v is CalibrationFeedbackEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as CalibrationFeedbackEntry
  return (
    typeof e.id === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.action === 'string' &&
    typeof e.sector === 'string' &&
    typeof e.scenarioId === 'string' &&
    e.suggestion != null &&
    e.payrollDeltas != null &&
    e.scenarioSnapshot != null
  )
}

export function saveCalibrationEntry(
  entry: CalibrationFeedbackEntry,
): CalibrationFeedbackEntry[] {
  const prev = loadCalibrationHistory()
  const next = [entry, ...prev]
  if (canUseStorage()) {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function clearCalibrationHistory(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(CALIBRATION_STORAGE_KEY)
}

/** Download full history (or a single entry) as JSON. */
export function downloadCalibrationJson(
  entries: CalibrationFeedbackEntry[],
  filename = `projeto6x1-calibracao-${new Date().toISOString().slice(0, 10)}.json`,
): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Convenience for UI labels. */
export function feedbackActionLabel(action: FeedbackAction): string {
  switch (action) {
    case 'accepted':
      return 'Aceitou'
    case 'edited':
      return 'Editou'
    case 'rejected':
      return 'Rejeitou'
  }
}

/** Strip heavy payroll rows when embedding SimulationInput elsewhere. */
export function stripInputForSnapshot(
  input: SimulationInput,
): Omit<SimulationInput, 'payrollRows'> {
  const { payrollRows: _omit, ...rest } = input
  return rest
}
