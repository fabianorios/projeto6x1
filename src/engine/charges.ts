/**
 * Employer charges + provisions by tax regime (pure helpers).
 * Proxies for consulting — not memória de cálculo oficial.
 */

import {
  DEFAULT_TAX_REGIME,
  FIXED_BENEFITS_PER_HEAD,
  ONBOARDING_COST_PER_HIRE,
  THIRTEENTH_PROVISION_RATE,
  VACATION_PROVISION_RATE,
  employerChargeRate,
  type TaxRegime,
} from '../types'

export interface ChargeBreakdown {
  taxRegime: TaxRegime
  employerChargeRate: number
  /** Charge on projected salary mass. */
  employerCharges: number
  vacationProvision: number
  thirteenthProvision: number
  onboardingCost: number
  fixedBenefits: number
  /** Sum of charge components (monthly-equivalent; onboarding is one-shot amortized /12). */
  totalMonthlyExtras: number
}

export interface ChargeInput {
  projectedSalaryMass: number
  /** Baseline salary mass (current HC) — provisions often applied on full mass. */
  baselineSalaryMass: number
  additionalHeadcount: number
  requiredHeadcount: number
  taxRegime?: TaxRegime
  /** Optional override of fixed benefits/head. */
  fixedBenefitsPerHead?: number
  onboardingCostPerHire?: number
}

/** Resolve tax regime with safe default. */
export function resolveTaxRegime(regime?: TaxRegime | null): TaxRegime {
  return regime ?? DEFAULT_TAX_REGIME
}

/**
 * Monthly extras on top of salary mass:
 * employer charges (regime) + vacation/13th provisions + amortized onboarding + fixed benefits.
 */
export function computeChargeBreakdown(input: ChargeInput): ChargeBreakdown {
  const taxRegime = resolveTaxRegime(input.taxRegime)
  const rate = employerChargeRate(taxRegime)
  const employerCharges = roundMoney(input.projectedSalaryMass * rate)
  const vacationProvision = roundMoney(
    input.projectedSalaryMass * VACATION_PROVISION_RATE,
  )
  const thirteenthProvision = roundMoney(
    input.projectedSalaryMass * THIRTEENTH_PROVISION_RATE,
  )
  const onboardingRaw =
    Math.max(0, input.additionalHeadcount) *
    (input.onboardingCostPerHire ?? ONBOARDING_COST_PER_HIRE)
  // Amortize one-shot onboarding over 12 months for monthly Δ.
  const onboardingCost = roundMoney(onboardingRaw / 12)
  const fixedPerHead = input.fixedBenefitsPerHead ?? FIXED_BENEFITS_PER_HEAD
  const fixedBenefits = roundMoney(
    Math.max(0, input.requiredHeadcount) * fixedPerHead,
  )
  const totalMonthlyExtras = roundMoney(
    employerCharges +
      vacationProvision +
      thirteenthProvision +
      onboardingCost +
      fixedBenefits,
  )
  return {
    taxRegime,
    employerChargeRate: rate,
    employerCharges,
    vacationProvision,
    thirteenthProvision,
    onboardingCost,
    fixedBenefits,
    totalMonthlyExtras,
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}
