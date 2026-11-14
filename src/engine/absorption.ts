/**
 * Absorption strategies + salary-divisor cascade on existing HE.
 */

import {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  HE_LEGAL_CAP_HOURS_MONTH,
  HE_PREMIUM_MULTIPLIER,
  SALARY_DIVISOR_BASELINE,
  type EstrategiaAbsorcao,
} from '../types'

export interface HeCascadeResult {
  /** Baseline divisor (usually 220). */
  baselineDivisor: number
  /** Scenario salary divisor (210 / 200 / 180…). */
  scenarioDivisor: number
  /** Existing HE hours/month across the group. */
  heHoursExisting: number
  /** Hourly rate under baseline divisor. */
  hourlyBaseline: number
  /** Hourly rate under scenario divisor. */
  hourlyScenario: number
  /** Monthly HE cost under baseline. */
  heCostBaseline: number
  /** Monthly HE cost under scenario divisor (same hours). */
  heCostScenario: number
  /** Extra HE cost purely from divisor drop. */
  heCostDelta: number
}

export interface AbsorptionPlan {
  estrategia: EstrategiaAbsorcao
  /** Ideal additional HC if hiring for full gap. */
  gapHeadcount: number
  /** Hours/month of coverage gap (approx). */
  gapHoursMonth: number
  /** HE hours used (capped). */
  heHoursUsed: number
  /** Legal HE cap (hours/month) applied to current staff pool. */
  heCapHours: number
  /** True when HORA_EXTRA_MAXIMA / híbrido hit the legal cap. */
  heCapReached: boolean
  /** Headcount still hired after HE / intermittent mix. */
  hiresHeadcount: number
  /** Intermittent-equivalent HC (híbrido residual modeled as hire). */
  intermittentHeadcount: number
  /** Effective additional people on payroll (hires + intermittent). */
  effectiveAdditionalHeadcount: number
  /** Extra monthly cost from HE used for absorption (at scenario hourly). */
  heAbsorptionCost: number
}

export interface AbsorptionInput {
  estrategia?: EstrategiaAbsorcao
  currentHeadcount: number
  gapHeadcount: number
  /** Average monthly salary (for hourly + HE cost). */
  averageMonthlySalary: number
  scenarioDivisor: number
  /** Existing HE hours/month already paid (cascade input). */
  heMediaMensalHoras?: number
  /** Hours/month one FTE covers under target (default ≈ weekly × 52/12). */
  hoursPerFteMonth?: number
  heCapHoursMonth?: number
  hePremiumMultiplier?: number
  baselineDivisor?: number
}

/** Cascade existing HE cost when monthly salary divisor drops (220→210/200/180). */
export function cascadeHeOnDivisor(args: {
  averageMonthlySalary: number
  heHoursExisting: number
  scenarioDivisor: number
  baselineDivisor?: number
  hePremiumMultiplier?: number
}): HeCascadeResult {
  const baselineDivisor = args.baselineDivisor ?? SALARY_DIVISOR_BASELINE
  const scenarioDivisor = Math.max(1, args.scenarioDivisor)
  const premium = args.hePremiumMultiplier ?? HE_PREMIUM_MULTIPLIER
  const heHours = Math.max(0, args.heHoursExisting)
  const hourlyBaseline = args.averageMonthlySalary / baselineDivisor
  const hourlyScenario = args.averageMonthlySalary / scenarioDivisor
  const heCostBaseline = roundMoney(heHours * hourlyBaseline * premium)
  const heCostScenario = roundMoney(heHours * hourlyScenario * premium)
  return {
    baselineDivisor,
    scenarioDivisor,
    heHoursExisting: heHours,
    hourlyBaseline,
    hourlyScenario,
    heCostBaseline,
    heCostScenario,
    heCostDelta: roundMoney(heCostScenario - heCostBaseline),
  }
}

/**
 * Plan how to cover a headcount gap via hiring / OT / hybrid.
 * HORA_EXTRA_MAXIMA respects HE_LEGAL_CAP_HOURS_MONTH per current employee.
 */
export function planAbsorption(input: AbsorptionInput): AbsorptionPlan {
  const estrategia = input.estrategia ?? DEFAULT_ESTRATEGIA_ABSORCAO
  const gapHeadcount = Math.max(0, input.gapHeadcount)
  const currentHc = Math.max(0, input.currentHeadcount)
  const hoursPerFte =
    input.hoursPerFteMonth ??
    // ~44h/week × 52/12 ≈ 190.7; use divisor-based proxy when available
    (input.scenarioDivisor > 0 ? input.scenarioDivisor : 220)
  const gapHoursMonth = gapHeadcount * hoursPerFte
  const heCapPerPerson = input.heCapHoursMonth ?? HE_LEGAL_CAP_HOURS_MONTH
  const heCapHours = currentHc * heCapPerPerson
  const premium = input.hePremiumMultiplier ?? HE_PREMIUM_MULTIPLIER
  const hourly =
    input.scenarioDivisor > 0
      ? input.averageMonthlySalary / input.scenarioDivisor
      : input.averageMonthlySalary / SALARY_DIVISOR_BASELINE

  if (gapHeadcount === 0 || estrategia === 'CONTRATACAO_INTEGRAL') {
    return {
      estrategia,
      gapHeadcount,
      gapHoursMonth,
      heHoursUsed: 0,
      heCapHours,
      heCapReached: false,
      hiresHeadcount: gapHeadcount,
      intermittentHeadcount: 0,
      effectiveAdditionalHeadcount: gapHeadcount,
      heAbsorptionCost: 0,
    }
  }

  if (estrategia === 'HORA_EXTRA_MAXIMA') {
    const heHoursUsed = Math.min(gapHoursMonth, heCapHours)
    const heCapReached = gapHoursMonth > heCapHours + 1e-9
    const remainingHours = Math.max(0, gapHoursMonth - heHoursUsed)
    const hiresHeadcount = Math.ceil(remainingHours / hoursPerFte)
    return {
      estrategia,
      gapHeadcount,
      gapHoursMonth,
      heHoursUsed,
      heCapHours,
      heCapReached,
      hiresHeadcount,
      intermittentHeadcount: 0,
      effectiveAdditionalHeadcount: hiresHeadcount,
      heAbsorptionCost: roundMoney(heHoursUsed * hourly * premium),
    }
  }

  // HIBRIDO_INTERMITENTE: max legal HE on staff, then intermittent for residual.
  const heHoursUsed = Math.min(gapHoursMonth, heCapHours)
  const heCapReached = gapHoursMonth > heCapHours + 1e-9
  const remainingHours = Math.max(0, gapHoursMonth - heHoursUsed)
  const intermittentHeadcount = Math.ceil(remainingHours / hoursPerFte)
  return {
    estrategia,
    gapHeadcount,
    gapHoursMonth,
    heHoursUsed,
    heCapHours,
    heCapReached,
    hiresHeadcount: 0,
    intermittentHeadcount,
    effectiveAdditionalHeadcount: intermittentHeadcount,
    heAbsorptionCost: roundMoney(heHoursUsed * hourly * premium),
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}
