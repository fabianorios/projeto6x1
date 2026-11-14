export type { TaxRegime } from './tax'
export {
  DEFAULT_TAX_REGIME,
  EMPLOYER_CHARGE_RATE,
  FIXED_BENEFITS_PER_HEAD,
  ONBOARDING_COST_PER_HIRE,
  THIRTEENTH_PROVISION_RATE,
  VACATION_PROVISION_RATE,
  employerChargeRate,
  isTaxRegime,
} from './tax'

export type { EstrategiaAbsorcao } from './absorption'
export {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  HE_LEGAL_CAP_HOURS_MONTH,
  HE_PREMIUM_MULTIPLIER,
  SALARY_DIVISOR_BASELINE,
  isEstrategiaAbsorcao,
} from './absorption'

export type { RegimeFuncionamento } from './regime'
export {
  DEFAULT_REGIME_FUNCIONAMENTO,
  REGIME_FUNCIONAMENTO_LABELS,
  isRegimeFuncionamento,
} from './regime'
