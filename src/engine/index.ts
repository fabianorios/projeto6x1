export {
  DEFAULT_DISCLAIMER,
  getRuleVersion,
  getSectorCalibration,
  isLegacyScenarioId,
  listScenarios,
  makeScale,
  normalizeScenarioId,
  RULE_VERSIONS,
  SECTOR_CALIBRATION,
} from './rules'
export { parseScale } from './scale'
export { simulate } from './simulate'
export {
  PAYROLL_CSV_HEADERS,
  aggregateByCostCenter,
  emptyPayrollExtras,
  estimateWorkDaysPerMonth,
  parseNumberBr,
  parsePayrollCsv,
  resolveBenefitDays,
} from './payroll'
export {
  ALLOWED_SCHEDULES,
  EXCLUDED_SCHEDULES,
  MAX_SUGGESTED_DAILY_HOURS,
  SCHEDULE_POLICY_VERSION,
  SCHEDULE_SUGGESTION_DISCLAIMER,
  assertAllowedDailyHoursCap,
  checkScheduleExclusion,
  getAllowedSchedule,
  isAllowedSuggestion,
  listSuggestableCodes,
} from './schedule-policy'
export type {
  AllowedScheduleCode,
  AllowedScheduleDef,
  ExcludedScheduleCode,
  ExcludedScheduleDef,
  ExclusionHit,
  ExclusionMiss,
} from './schedule-policy'
export {
  continuo7dRosterFactor,
  distributeCrews,
  resolveRegime,
} from './crew-distribution'
export type { TurmaCrew, TurmaDistribution } from './crew-distribution'
export {
  cascadeHeOnDivisor,
  planAbsorption,
} from './absorption'
export type { AbsorptionPlan, AbsorptionInput, HeCascadeResult } from './absorption'
export {
  computeChargeBreakdown,
  resolveTaxRegime,
} from './charges'
export type { ChargeBreakdown, ChargeInput } from './charges'
export {
  DEFAULT_OPERATING_HOURS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  coverageSpanHours,
  defaultHospitalHours,
  defaultVarejoHours,
  formatHourClock,
  formatOperatingWindow,
  hourToTimeInputValue,
  hoursForWeekday,
  summarizeOperatingHours,
  tileCoverageWindow,
  timeInputToHour,
  widestCoverageDay,
} from './operating-hours'
export type {
  DayOperatingHours,
  OperatingHours,
  WeekdayKey,
} from './operating-hours'
export {
  buildShiftWindows,
  formatShiftRange,
  suggestSchedules,
  suggestSchedulesFromSimulation,
} from './schedule-suggest'
export type {
  CostCenterDemand,
  ScheduleCostEstimate,
  ScheduleSuggestion,
  ScheduleSuggestionResult,
  ShiftWindowSuggestion,
  SuggestSchedulesInput,
} from './schedule-suggest'
export {
  CALIBRATION_SCHEMA_VERSION,
  CALIBRATION_STORAGE_KEY,
  buildFeedbackEntry,
  buildScenarioSnapshot,
  clearCalibrationHistory,
  downloadCalibrationJson,
  feedbackActionLabel,
  loadCalibrationHistory,
  saveCalibrationEntry,
  stripInputForSnapshot,
} from './calibration-feedback'
export type {
  CalibrationFeedbackEntry,
  EditedShiftFields,
  FeedbackAction,
  PayrollDeltasSnapshot,
  ScenarioSnapshot,
  SuggestionFeedbackPayload,
} from './calibration-feedback'
export {
  SCENARIO_BASKET_SCHEMA_VERSION,
  SCENARIO_BASKET_STORAGE_KEY,
  clearScenarioBasket,
  computeDeltas,
  fingerprintBaseline,
  loadScenarioBasket,
  metricsFromCurrentSide,
  metricsFromProposedSide,
  removeProposedScenario,
  saveScenarioBasket,
  setBestScenario,
  upsertSimulationInBasket,
} from './scenario-basket'
export type {
  ScenarioBasket,
  ScenarioBasketCurrent,
  ScenarioBasketProposed,
  ScenarioDeltas,
  ScenarioRowMetrics,
} from './scenario-basket'
export type {
  CostCenterTotals,
  PayrollCsvHeader,
  PayrollParseIssue,
  PayrollParseResult,
  PayrollRow,
} from './payroll'
export type {
  BenefitDelta,
  CostCenterResult,
  CostDelta,
  CoverageGap,
  LegacyScenarioId,
  LineItemCategory,
  LineItemUnit,
  ResultLineItem,
  RuleVersion,
  ScaleCycle,
  ScenarioId,
  ScenarioParams,
  SectorCalibration,
  SectorId,
  SimulationInput,
  SimulationResult,
} from './types'

export type {
  EstrategiaAbsorcao,
  RegimeFuncionamento,
  TaxRegime,
} from '../types'
export {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  EMPLOYER_CHARGE_RATE,
  HE_LEGAL_CAP_HOURS_MONTH,
  REGIME_FUNCIONAMENTO_LABELS,
  SALARY_DIVISOR_BASELINE,
} from '../types'
