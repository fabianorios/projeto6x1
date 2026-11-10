/** Shared types for the PEC 6×1 impact simulation engine. */

import type { OperatingHours } from './operating-hours'
import type { PayrollRow } from './payroll'
import type { ExclusionHit } from './schedule-policy'
import type { ScheduleSuggestion } from './schedule-suggest'

export type SectorId = 'varejo' | 'hospital' | 'construcao' | 'locacao'

/**
 * Versioned normative scenarios (heuristic drafts — not legal text).
 * - status_quo: keep the client's current scale
 * - pec_draft_conservative: milder rest-day shift + small buffer
 * - pec_draft_aggressive: stronger rest-day shift + larger buffer
 */
export type ScenarioId =
  | 'status_quo'
  | 'pec_draft_conservative'
  | 'pec_draft_aggressive'

/** Parsed work/rest cycle, e.g. 6×1 → { workDays: 6, restDays: 1 }. */
export interface ScaleCycle {
  workDays: number
  restDays: number
  /** workDays / (workDays + restDays) */
  workRatio: number
  label: string
}

/**
 * Tunable parameters for one scenario. Stored as data so versions can
 * be swapped without changing formula code.
 */
export interface ScenarioParams {
  scenarioId: ScenarioId
  /** Target scale under this draft (ignored when preserveCurrentScale). */
  targetScale: ScaleCycle
  /** If true, target scale = client's current scale (status quo). */
  preserveCurrentScale: boolean
  /**
   * Extra headcount buffer for scheduling friction / absences (0–1).
   * ESTIMATE — not a legal requirement.
   */
  coverageBuffer: number
  /**
   * Multiplier on projected salary mass for rough employer charges
   * (INSS/FGTS/benefits style). Applied only to the projected side so
   * the delta surfaces charge growth with headcount. ESTIMATE.
   */
  projectedChargeFactor: number
  /** Assumed hours per shift when converting gaps to hours. */
  hoursPerShift: number
}

export interface RuleVersion {
  id: string
  label: string
  /** Plain-language summary of the heuristic draft (not a legal citation). */
  summary: string
  /** Effective date or draft tag for versioning. */
  effectiveAsOf: string
  params: ScenarioParams
}

/** Sector-specific friction on required headcount (ESTIMATE). */
export interface SectorCalibration {
  sector: SectorId
  /** Multiplier on required headcount after scale + buffer. */
  staffingFriction: number
  note: string
}

export interface SimulationInput {
  sector: SectorId
  headcount: number
  /** Current scale label, e.g. "6x1". */
  currentScale: string
  averageMonthlySalary: number
  /** Stores / plants / units. */
  units: number
  /** Shifts per day that must be covered. */
  shiftsPerDay: number
  scenarioId: ScenarioId
  /**
   * Establishment open/close (optional by weekday). Suggested shift
   * start/end are derived from this coverage window.
   */
  operatingHours: OperatingHours
  /**
   * Optional imported payroll lines (docs/import-layout.md).
   * When present, HC/salário médio/VR/VT vêm da folha; o wizard
   * headcount/salário médio são sobrescritos pelos totais importados.
   */
  payrollRows?: PayrollRow[]
}

export interface CostDelta {
  baselineMonthlyPayroll: number
  projectedMonthlyPayroll: number
  /** Projected − baseline (salary mass; projected may include charge factor). */
  monthlyDelta: number
  annualDelta: number
  /** Employer-charge portion embedded in projected payroll (estimate). */
  estimatedMonthlyCharges: number
}

/** VR or VT: current vs proposed under target scale (docs/import-layout.md). */
export interface BenefitDelta {
  /** valor_dia × dias_mes_atual × quantidade (somado). */
  currentMonthly: number
  /** valor_dia × dias_mes_proposta × quantidade (+ HC adicional). */
  proposedMonthly: number
  monthlyDelta: number
  annualDelta: number
  /** Dias/mês usados na proposta (estimativa da escala-alvo). */
  proposedDaysPerMonth: number
}

/** Totals for one centro de custo after scale + charge projection. */
export interface CostCenterResult {
  centroCusto: string
  currentHeadcount: number
  requiredHeadcount: number
  additionalHeadcount: number
  baselinePayroll: number
  projectedPayroll: number
  payrollMonthlyDelta: number
  vr: BenefitDelta
  vt: BenefitDelta
}

export interface CoverageGap {
  requiredHeadcount: number
  currentHeadcount: number
  additionalHeadcount: number
  /** Estimated weekly hours that would go uncovered if headcount is not raised. */
  uncoveredShiftHoursPerWeek: number
  currentWorkRatio: number
  targetWorkRatio: number
  headcountFactor: number
}

export type LineItemUnit =
  | 'BRL_month'
  | 'BRL_year'
  | 'people'
  | 'hours_week'
  | 'ratio'
  | 'factor'
  | 'none'

export type LineItemCategory =
  | 'payroll'
  | 'benefits'
  | 'coverage'
  | 'headcount'
  | 'assumption'

/** Explainable result row: every headline number has a matching line item. */
export interface ResultLineItem {
  id: string
  category: LineItemCategory
  label: string
  amount: number | null
  unit: LineItemUnit
  /** Hypothesis / formula pointer shown next to the number. */
  detail: string
}

export interface SimulationResult {
  input: SimulationInput
  ruleVersion: RuleVersion
  cost: CostDelta
  coverage: CoverageGap
  /** Present when payrollRows were imported. */
  vr: BenefitDelta | null
  vt: BenefitDelta | null
  /** Breakdown by centro_custo (empty if no import). */
  byCostCenter: CostCenterResult[]
  /** True when payroll CSV/paste drove salary + benefits. */
  usedPayrollImport: boolean
  /**
   * 1–2 operational schedule/hour candidates per centro (or Geral).
   * Never includes 12×36 / 24×48 / >10h defaults (docs/schedule-policy.md).
   */
  scheduleSuggestions: ScheduleSuggestion[]
  /** Set when the user typed/selected an excluded scale (policy badge). */
  excludedScheduleNotice: ExclusionHit | null
  /** Disclaimer specific to the schedule-suggestion block. */
  scheduleSuggestionDisclaimer: string
  lineItems: ResultLineItem[]
  /** Human-readable bullets (derived from lineItems + rule). */
  explanations: string[]
  disclaimer: string
  /**
   * False once formulas are wired. Remains false for heuristic drafts;
   * numbers are estimates, not stubs of "1.2×".
   */
  isStub: boolean
}
