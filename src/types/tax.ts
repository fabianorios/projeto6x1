/**
 * Tax / employer-charge premises per CNPJ (consulting proxies — not folha oficial).
 */

/** Brazilian tax regime used to pick employer-charge proxy. */
export type TaxRegime = 'SIMPLES' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'

/**
 * Employer-charge rate applied on projected salary mass (ESTIMATE).
 * SIMPLES: CPP-style proxy. Lucro*: INSS patronal + FGTS + RAT/terceiros style.
 */
export const EMPLOYER_CHARGE_RATE: Record<TaxRegime, number> = {
  SIMPLES: 0.08,
  LUCRO_PRESUMIDO: 0.3,
  LUCRO_REAL: 0.32,
}

/** 13º provision ≈ 1/12 of monthly salary mass. */
export const THIRTEENTH_PROVISION_RATE = 1 / 12

/** Vacation provision ≈ 1/12 (simplified; ignores 1/3 constitucional). */
export const VACATION_PROVISION_RATE = 1 / 12

/** One-shot onboarding cost per additional hire (BRL, estimate). */
export const ONBOARDING_COST_PER_HIRE = 800

/** Fixed monthly benefits per head beyond VR/VT (estimate; 0 = off). */
export const FIXED_BENEFITS_PER_HEAD = 0

export const DEFAULT_TAX_REGIME: TaxRegime = 'LUCRO_PRESUMIDO'

export function isTaxRegime(value: string): value is TaxRegime {
  return value === 'SIMPLES' || value === 'LUCRO_PRESUMIDO' || value === 'LUCRO_REAL'
}

export function employerChargeRate(regime: TaxRegime): number {
  return EMPLOYER_CHARGE_RATE[regime]
}
