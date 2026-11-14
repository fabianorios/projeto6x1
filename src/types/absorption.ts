/**
 * Strategies to absorb coverage gap after scale change (consulting heuristics).
 */

/** How the client absorbs uncovered person-days / hours. */
export type EstrategiaAbsorcao =
  | 'CONTRATACAO_INTEGRAL'
  | 'HORA_EXTRA_MAXIMA'
  | 'HIBRIDO_INTERMITENTE'

/**
 * Legal-style monthly OT cap used in stress models (2h/day × ~22 days).
 * ESTIMATE for simulation — not a CCT calculator.
 */
export const HE_LEGAL_CAP_HOURS_MONTH = 44

/** Typical OT premium multiplier (50% extra). */
export const HE_PREMIUM_MULTIPLIER = 1.5

/** Baseline monthly salary divisor (CLT-style 44h × 5). */
export const SALARY_DIVISOR_BASELINE = 220

export const DEFAULT_ESTRATEGIA_ABSORCAO: EstrategiaAbsorcao =
  'CONTRATACAO_INTEGRAL'

export function isEstrategiaAbsorcao(value: string): value is EstrategiaAbsorcao {
  return (
    value === 'CONTRATACAO_INTEGRAL' ||
    value === 'HORA_EXTRA_MAXIMA' ||
    value === 'HIBRIDO_INTERMITENTE'
  )
}
