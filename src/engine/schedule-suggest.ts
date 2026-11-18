/**
 * Propose 1–2 operational schedules (hours + HC/shift) per coverage group.
 * Costs = salário + VR/VT vs current. Never recommends excluded scales.
 */

import {
  DEFAULT_OPERATING_HOURS,
  formatOperatingWindow,
  resolveOperatingHoursForEntity,
  tileCoverageWindow,
  widestCoverageDay,
  type OHScopeMatchContext,
  type OHScopeMatchMeta,
  type OHScopeRule,
  type OperatingHours,
} from './operating-hours'
import { estimateWorkDaysPerMonth } from './payroll'
import { makeScale, getSectorCalibration } from './rules'
import {
  ALLOWED_SCHEDULES,
  MAX_SUGGESTED_DAILY_HOURS,
  SCHEDULE_POLICY_VERSION,
  SCHEDULE_SUGGESTION_DISCLAIMER,
  checkScheduleExclusion,
  getAllowedSchedule,
  listSuggestableCodes,
  type AllowedScheduleCode,
  type ExclusionHit,
} from './schedule-policy'
import {
  distributeExactCounts,
  requiredHeadcountAfterFactor,
  resolveRegime,
} from './crew-distribution'
import { parseScale } from './scale'
import type {
  ScenarioId,
  SectorId,
  SimulationInput,
} from './types'
import type { RegimeFuncionamento } from '../types'

export interface ShiftWindowSuggestion {
  label: string
  /** Local start hour 0–23. */
  startHour: number
  /** Local end hour 0–23 (may wrap past midnight). */
  endHour: number
  /** Duration in hours (always ≤ MAX_SUGGESTED_DAILY_HOURS). */
  hours: number
  headcount: number
}

export interface ScheduleCostEstimate {
  monthlyPayroll: number
  monthlyVr: number | null
  monthlyVt: number | null
  /** Folha + VR + VT (null benefits treated as 0 in the sum when absent). */
  monthlyTotal: number
}

export interface ScheduleSuggestion {
  code: AllowedScheduleCode
  label: string
  description: string
  /** Cost-center key, or "Geral" when wizard-only. */
  centroCusto: string
  shifts: ShiftWindowSuggestion[]
  /** Sum of HC across shifts (roster size for the cycle). */
  totalHeadcount: number
  workDaysPerMonth: number
  estimated: ScheduleCostEstimate
  current: ScheduleCostEstimate
  /** estimated.monthlyTotal − current.monthlyTotal */
  monthlyDeltaVsCurrent: number
  policyVersion: string
  /** OH cascade match used to tile this suggestion (Etapa 2 → badge). */
  ohScopeMatch?: OHScopeMatchMeta
}

export interface ScheduleSuggestionResult {
  suggestions: ScheduleSuggestion[]
  /** Populated when the user asked for / typed an excluded scale. */
  excludedNotice: ExclusionHit | null
  disclaimer: string
  policyVersion: string
}

export interface CostCenterDemand {
  centroCusto: string
  headcount: number
  averageMonthlySalary: number
  /** Current monthly salary mass (baseline). */
  currentMonthlyPayroll: number
  avgVrValorDia: number | null
  avgVtValorDia: number | null
  currentMonthlyVr: number | null
  currentMonthlyVt: number | null
  /** Operating regime for this center (fixed-off waiver). */
  regimeFuncionamento?: RegimeFuncionamento | null
  /** Pre-resolved OH for this center (from simulate cascade). */
  operatingHours?: OperatingHours
  ohScopeMatch?: OHScopeMatchMeta
  /** When operatingHours omitted, resolve via ohScopeRules + this context. */
  ohMatchContext?: OHScopeMatchContext
}

export interface SuggestSchedulesInput {
  sector: SectorId
  /** Override catalog buffer/absenteísmo % when set. */
  sectorBufferPct?: number
  scenarioId: ScenarioId
  currentScale: string
  /** Wizard / org-level coverage. */
  headcount: number
  averageMonthlySalary: number
  units: number
  shiftsPerDay: number
  /** Establishment open/close — shift times are derived from this window. */
  operatingHours: OperatingHours
  /** Optional segmented OH rules (cascade when resolving per center). */
  ohScopeRules?: OHScopeRule[]
  /** Scenario charge factor applied to projected salary mass. */
  projectedChargeFactor: number
  /** Scenario coverage buffer (0–1). */
  coverageBuffer: number
  /** Default regime when a cost center omits its own. */
  defaultRegimeFuncionamento?: RegimeFuncionamento | null
  /** Optional per-center demand from payroll import. */
  costCenters?: CostCenterDemand[]
  /**
   * Optional: user manually requested a scale code/label to evaluate.
   * If excluded, we surface the policy message and still do not recommend it.
   */
  manualScaleRequest?: string
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

const SHIFT_LABELS = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno 4'] as const

/**
 * Build shift windows from establishment operating hours + allowlisted code.
 * Start/end are tiled across the coverage window — never arbitrary clocks.
 */
export function buildShiftWindows(
  code: AllowedScheduleCode,
  operatingHours: OperatingHours,
  totalHeadcount: number,
): ShiftWindowSuggestion[] {
  const def = getAllowedSchedule(code)
  // Always prefer policy default daily hours (8h for allowlisted codes), never
  // equal-split a longer window into shortened blocks (e.g. 12h → 2×6h).
  const preferred = Math.min(
    def.defaultDailyHours,
    MAX_SUGGESTED_DAILY_HOURS,
  )
  const day = widestCoverageDay(operatingHours)
  const tiles = tileCoverageWindow(
    day,
    MAX_SUGGESTED_DAILY_HOURS,
    preferred,
  )

  if (tiles.length === 0) {
    return []
  }

  // Preserve exact roster across tiles — never Math.max(1) pad (HC=1 +
  // 09–21 → 2 tiles used to invent a 2nd person).
  const counts = distributeExactCounts(totalHeadcount, tiles.length)
  const windowLabel = formatOperatingWindow(day)

  return tiles.map((t, i) => {
    return {
      label: tiles.length === 1 ? `Cobertura (${windowLabel})` : SHIFT_LABELS[i] ?? `Turno ${i + 1}`,
      startHour: t.startHour,
      endHour: t.endHour,
      hours: Math.min(t.hours, MAX_SUGGESTED_DAILY_HOURS),
      headcount: counts[i] ?? 0,
    }
  })
}

/** Public helper for UI display. */
export function formatShiftRange(shift: ShiftWindowSuggestion): string {
  const fmt = (h: number) => {
    if (h === 24) return '24:00'
    const hh = Math.floor(((h % 24) + 24) % 24)
    const mm = Math.round((h - Math.floor(h)) * 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return `${fmt(shift.startHour)}–${fmt(shift.endHour)}`
}

function requiredHeadcountForCandidate(
  currentHc: number,
  currentWorkRatio: number,
  candidateWorkDays: number,
  candidateRestDays: number,
  coverageBuffer: number,
  staffingFriction: number,
  regime: RegimeFuncionamento,
): number {
  const target = makeScale(candidateWorkDays, candidateRestDays)
  const safeTarget = target.workRatio > 0 ? target.workRatio : currentWorkRatio
  const scaleFactor =
    safeTarget > 0 ? currentWorkRatio / safeTarget : 1
  const factor = scaleFactor * (1 + coverageBuffer) * staffingFriction
  return requiredHeadcountAfterFactor(currentHc, factor, {
    preserveCurrentScale: false,
    regime,
    targetWorkDays: candidateWorkDays,
  })
}

function estimateCosts(args: {
  headcount: number
  avgSalary: number
  chargeFactor: number
  workDays: number
  restDays: number
  avgVrValorDia: number | null
  avgVtValorDia: number | null
}): ScheduleCostEstimate {
  const scale = makeScale(args.workDays, args.restDays)
  const days = estimateWorkDaysPerMonth(scale)
  const monthlyPayroll = roundMoney(
    args.headcount * args.avgSalary * args.chargeFactor,
  )
  const monthlyVr =
    args.avgVrValorDia !== null && args.avgVrValorDia > 0
      ? roundMoney(args.headcount * args.avgVrValorDia * days)
      : null
  const monthlyVt =
    args.avgVtValorDia !== null && args.avgVtValorDia > 0
      ? roundMoney(args.headcount * args.avgVtValorDia * days)
      : null
  const monthlyTotal = roundMoney(
    monthlyPayroll + (monthlyVr ?? 0) + (monthlyVt ?? 0),
  )
  return { monthlyPayroll, monthlyVr, monthlyVt, monthlyTotal }
}

function preferredCodeForScenario(
  scenarioId: ScenarioId,
): AllowedScheduleCode {
  if (scenarioId === 'stress_test_4x3') return '4x3'
  return '5x2'
}

/** Prefer the scenario-aligned code, then fill by lowest Δ cost (max 2). */
function rankAndPick(
  candidates: ScheduleSuggestion[],
  preferred: AllowedScheduleCode,
  max = 2,
): ScheduleSuggestion[] {
  const byCost = [...candidates].sort(
    (a, b) => a.monthlyDeltaVsCurrent - b.monthlyDeltaVsCurrent,
  )
  const picked: ScheduleSuggestion[] = []
  const pref = byCost.find((c) => c.code === preferred)
  if (pref) picked.push(pref)
  for (const c of byCost) {
    if (picked.length >= max) break
    if (picked.some((p) => p.code === c.code)) continue
    picked.push(c)
  }
  return picked
}

function resolveDemandOperatingHours(
  demand: CostCenterDemand,
  input: SuggestSchedulesInput,
): { hours: OperatingHours; ohScopeMatch: OHScopeMatchMeta } {
  if (demand.operatingHours) {
    return {
      hours: demand.operatingHours,
      ohScopeMatch: demand.ohScopeMatch ?? {
        scopeType: 'global',
        targetValue: '',
      },
    }
  }
  const resolved = resolveOperatingHoursForEntity(
    input.ohScopeRules,
    input.operatingHours ?? DEFAULT_OPERATING_HOURS,
    demand.ohMatchContext ?? { centroCusto: demand.centroCusto },
  )
  return {
    hours: resolved.hours,
    ohScopeMatch: {
      scopeType: resolved.scopeType,
      targetValue: resolved.targetValue,
      ...(resolved.targetLabel ? { targetLabel: resolved.targetLabel } : {}),
    },
  }
}

function suggestForCenter(
  demand: CostCenterDemand,
  input: SuggestSchedulesInput,
): ScheduleSuggestion[] {
  const sector = getSectorCalibration(input.sector, input.sectorBufferPct)
  const currentScale = parseScale(input.currentScale)
  const codes = listSuggestableCodes(input.scenarioId, input.currentScale)
  const regime = resolveRegime(
    demand.regimeFuncionamento ?? input.defaultRegimeFuncionamento,
  )
  const { hours: centerHours, ohScopeMatch } = resolveDemandOperatingHours(
    demand,
    input,
  )

  // Roster base = demand HC only. units×shifts/dia is informative in simulate
  // (see docs/engine-assumptions.md) — do not use it as a second HC floor
  // (shiftsPerDay=2 used to invent people before the scale factor).
  const coverageHc = Math.max(0, Math.round(demand.headcount))

  const built: ScheduleSuggestion[] = []

  for (const code of codes) {
    if (!ALLOWED_SCHEDULES.some((s) => s.code === code)) continue
    const def = getAllowedSchedule(code)
    if (def.defaultDailyHours > MAX_SUGGESTED_DAILY_HOURS) continue

    const hc = requiredHeadcountForCandidate(
      coverageHc,
      currentScale.workRatio,
      def.workDays,
      def.restDays,
      input.coverageBuffer,
      sector.staffingFriction,
      regime,
    )

    const shifts = buildShiftWindows(code, centerHours, hc)
    if (shifts.length === 0) continue
    // Exact split — Σ shift HC === required roster (no invent pad).
    const totalHeadcount = shifts.reduce((s, w) => s + w.headcount, 0)
    const window = formatOperatingWindow(widestCoverageDay(centerHours))

    const estimated = estimateCosts({
      headcount: totalHeadcount,
      avgSalary: demand.averageMonthlySalary,
      chargeFactor: input.projectedChargeFactor,
      workDays: def.workDays,
      restDays: def.restDays,
      avgVrValorDia: demand.avgVrValorDia,
      avgVtValorDia: demand.avgVtValorDia,
    })

    const currentTotal = roundMoney(
      demand.currentMonthlyPayroll +
        (demand.currentMonthlyVr ?? 0) +
        (demand.currentMonthlyVt ?? 0),
    )
    const current: ScheduleCostEstimate = {
      monthlyPayroll: roundMoney(demand.currentMonthlyPayroll),
      monthlyVr: demand.currentMonthlyVr,
      monthlyVt: demand.currentMonthlyVt,
      monthlyTotal: currentTotal,
    }

    built.push({
      code,
      label: def.label,
      description: `${def.description} Janelas derivadas do funcionamento ${window}.`,
      centroCusto: demand.centroCusto,
      shifts,
      totalHeadcount,
      workDaysPerMonth: estimateWorkDaysPerMonth(
        makeScale(def.workDays, def.restDays),
      ),
      estimated,
      current,
      monthlyDeltaVsCurrent: roundMoney(
        estimated.monthlyTotal - current.monthlyTotal,
      ),
      policyVersion: SCHEDULE_POLICY_VERSION,
      ohScopeMatch,
    })
  }

  return rankAndPick(built, preferredCodeForScenario(input.scenarioId), 2)
}

/**
 * Main entry: 1–2 suggestions per cost center (or one "Geral" group).
 */
export function suggestSchedules(
  input: SuggestSchedulesInput,
): ScheduleSuggestionResult {
  const manual =
    input.manualScaleRequest?.trim() ||
    // If current scale itself is excluded, surface the policy badge.
    input.currentScale

  const exclusion = checkScheduleExclusion(manual)
  const excludedNotice: ExclusionHit | null = exclusion.excluded
    ? exclusion
    : null

  const centers: CostCenterDemand[] =
    input.costCenters && input.costCenters.length > 0
      ? input.costCenters
      : [
          {
            centroCusto: 'Geral',
            headcount: input.headcount,
            averageMonthlySalary: input.averageMonthlySalary,
            currentMonthlyPayroll: roundMoney(
              input.headcount * input.averageMonthlySalary,
            ),
            avgVrValorDia: null,
            avgVtValorDia: null,
            currentMonthlyVr: null,
            currentMonthlyVt: null,
          },
        ]

  const suggestions = centers.flatMap((c) => suggestForCenter(c, input))

  // Safety: drop anything that somehow isn't allowlisted or exceeds hours.
  const blockedCodes = new Set([
    '6x1',
    '6x1_ajustada',
    '12x36',
    '24x48',
    'sobreaviso_puro',
  ])
  const safe = suggestions.filter((s) => {
    const code = s.code as string
    if (blockedCodes.has(code)) return false
    if (code.startsWith('6x1')) return false
    const def = ALLOWED_SCHEDULES.find((a) => a.code === s.code)
    if (!def) return false
    if (def.defaultDailyHours > MAX_SUGGESTED_DAILY_HOURS) return false
    if (s.shifts.some((w) => w.hours > MAX_SUGGESTED_DAILY_HOURS)) return false
    return true
  })

  return {
    suggestions: safe,
    excludedNotice,
    disclaimer: SCHEDULE_SUGGESTION_DISCLAIMER,
    policyVersion: SCHEDULE_POLICY_VERSION,
  }
}

/** Convenience: build suggest input from a finished simulation's inputs + CC results. */
export function suggestSchedulesFromSimulation(
  input: SimulationInput,
  opts: {
    projectedChargeFactor: number
    coverageBuffer: number
    costCenters?: CostCenterDemand[]
    manualScaleRequest?: string
  },
): ScheduleSuggestionResult {
  return suggestSchedules({
    sector: input.sector,
    sectorBufferPct: input.sectorBufferPct,
    scenarioId: input.scenarioId,
    currentScale: input.currentScale,
    headcount: input.headcount,
    averageMonthlySalary: input.averageMonthlySalary,
    units: input.units,
    shiftsPerDay: input.shiftsPerDay,
    operatingHours: input.operatingHours ?? DEFAULT_OPERATING_HOURS,
    ohScopeRules: input.ohScopeRules,
    projectedChargeFactor: opts.projectedChargeFactor,
    coverageBuffer: opts.coverageBuffer,
    defaultRegimeFuncionamento: input.defaultRegimeFuncionamento,
    costCenters: opts.costCenters,
    manualScaleRequest: opts.manualScaleRequest,
  })
}
