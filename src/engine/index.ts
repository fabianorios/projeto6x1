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
export {
  ALL_SECTOR_PRESETS,
  CUSTOM_SECTOR_ID,
  CUSTOM_SECTOR_PRESET,
  MARKET_SECTOR_PRESETS,
  bufferPctToFriction,
  calibrationFromSector,
  frictionToBufferPct,
  getSectorDisplayLabel,
  isKnownSectorPreset,
  normalizeSectorId,
  resolveSectorPreset,
} from './sectors'
export type { SectorPreset, SectorPresetId } from './sectors'
export { parseScale } from './scale'
export { simulate } from './simulate'
export {
  PAYROLL_CSV_HEADERS,
  aggregateByCostCenter,
  centroCustoDisplayLabel,
  detectPayrollDelimiter,
  emptyPayrollExtras,
  estimateWorkDaysPerMonth,
  formatHorarioAtualLabel,
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
  assignCrewWindowIndices,
  continuo7dRosterFactor,
  crewsWithTotalHeadcount,
  distributeCrews,
  distributeExactCounts,
  fixedOffTargetCoversOperatingDays,
  requiredHeadcountAfterFactor,
  resolveRegime,
  singleCollaboratorContinuoKeepsRoster,
  staffedWindowCountForCoverage,
} from './crew-distribution'
export type { TurmaCrew, TurmaDistribution } from './crew-distribution'
export {
  APDATA_HIERARCHY_SCHEMA_VERSION,
  applyTurmaHourLabels,
  buildApdataHierarchy,
  buildBlockJornadaSteps,
  buildJornadaCandidates,
  buildJornadaSteps,
  defaultApdataDataInicio,
  deriveApdataCandidates,
  formatHorarioLabel,
  formatJornadaCompositionLabel,
  formatJornadaLabel,
  formatTurmaLabel,
  formatWorkdayAbbrev,
  horarioCodigoFor,
  jornadaCodigoFor,
  resolveApdataShiftWindows,
  resolveMealWindow,
  workdayKey,
} from './apdata-hierarchy'
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
  COVERAGE_WEEKDAYS,
  COVERAGE_WEEKDAY_LABELS,
  coberturaPropostaFromCrews,
  coberturaPropostaFromDistribution,
  compareCoverageDay,
  deriveCoberturaAtualPorDia,
  emptyCoberturaPorDia,
} from './coverage-days'
export type {
  CoberturaPorDia,
  CoverageCompareTone,
  CoverageWeekday,
} from './coverage-days'
export {
  MONTH_LABELS_PT,
  WEEKDAY_SHORT_PT,
  baselineCrewsForCalendar,
  buildMonthCalendarMatrix,
  buildMonthDays,
  crewWorksOnDay,
  daysInMonth,
  defaultReferencePeriod,
  minimumNeedForWeekday,
  shiftCoverageWeekday,
  shouldRotateWeekly,
} from './monthly-calendar'
export type {
  DailyCoverageCell,
  DayMark,
  MonthCalendarMatrix,
  MonthDayCell,
  TurmaMonthRow,
} from './monthly-calendar'
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
  defaultShiftWindow,
  defaultVarejoHours,
  formatHourClock,
  formatOperatingWindow,
  hourToTimeInputValue,
  hoursForWeekday,
  parseHorarioTrabalhoPeriods,
  resolveBaselineShiftWindows,
  resolveShiftWindows,
  summarizeOperatingHours,
  tileCoverageWindow,
  timeInputToHour,
  widestCoverageDay,
  OH_SCOPE_TYPES,
  OH_SCOPE_CASCADE_PRIORITY,
  isOHScopeType,
  parseScopeClock,
  formatScopeClock,
  weekdayKeyFromDias,
  diasFromWeekdayKey,
  ohWindowToOperatingHours,
  operatingHoursToOhWindow,
  globalRuleFromOperatingHours,
  parseOHScopeRule,
  normalizeOHScopeRules,
  prepareOHScopeRulesForInput,
  ensureGlobalOHScopeRule,
  syncOhScopeRulesWithGlobalHours,
  effectiveGlobalOperatingHours,
  normalizeOHScopeKey,
  ohScopeMatchContextFromPayrollRow,
  ohScopeMatchContextFromCostCenter,
  resolveOperatingHoursForEntity,
  resolveOperatingHours,
} from './operating-hours'
export type {
  DayOperatingHours,
  OperatingHours,
  WeekdayKey,
  OHScopeType,
  OHScopeWindow,
  OHScopeRule,
  OHScopeMatchContext,
  OHScopeMatchMeta,
  OHScopeResolution,
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
export { buildScenarioWhyBullets } from './scenario-why'
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
