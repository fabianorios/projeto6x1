/**
 * Daily coverage (pessoas no posto) Mon–Sun for baseline vs proposed crews.
 * Weekday keys match crew-distribution: seg..dom.
 */

import type { RegimeFuncionamento } from '../types'
import type { TurmaCrew, TurmaDistribution } from './crew-distribution'
import type { ScaleCycle } from './types'

export const COVERAGE_WEEKDAYS = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
  'dom',
] as const

export type CoverageWeekday = (typeof COVERAGE_WEEKDAYS)[number]

export const COVERAGE_WEEKDAY_LABELS: Record<CoverageWeekday, string> = {
  seg: 'SEG',
  ter: 'TER',
  qua: 'QUA',
  qui: 'QUI',
  sex: 'SEX',
  sab: 'SAB',
  dom: 'DOM',
}

/** People working on site each weekday (headcount on duty). */
export type CoberturaPorDia = Record<CoverageWeekday, number>

export function emptyCoberturaPorDia(): CoberturaPorDia {
  return {
    seg: 0,
    ter: 0,
    qua: 0,
    qui: 0,
    sex: 0,
    sab: 0,
    dom: 0,
  }
}

function isCoverageWeekday(d: string): d is CoverageWeekday {
  return (COVERAGE_WEEKDAYS as readonly string[]).includes(d)
}

/**
 * Estimate baseline daily coverage from scale + roster.
 *
 * - CONTINUO_7D (or workDays ≥ 7): rotating roster → every day ≈ HC × workRatio
 * - Otherwise: first `workDays` weekdays (seg…) get full HC; rest days get 0
 *   (classic 5×2 → seg–sex; 6×1 → seg–sáb).
 */
export function deriveCoberturaAtualPorDia(
  headcount: number,
  scale: ScaleCycle,
  regime?: RegimeFuncionamento | null,
): CoberturaPorDia {
  const hc = Math.max(0, Math.round(headcount))
  const out = emptyCoberturaPorDia()
  if (hc === 0) return out

  const continuous =
    regime === 'CONTINUO_7D' || scale.workDays >= 7 || scale.workRatio >= 0.99

  if (continuous) {
    const daily = Math.max(0, Math.round(hc * scale.workRatio))
    for (const d of COVERAGE_WEEKDAYS) out[d] = daily
    return out
  }

  const workCount = Math.min(
    7,
    Math.max(0, Math.round(scale.workDays)),
  )
  for (let i = 0; i < COVERAGE_WEEKDAYS.length; i++) {
    out[COVERAGE_WEEKDAYS[i]] = i < workCount ? hc : 0
  }
  return out
}

/** Sum crew headcounts that work on each weekday. */
export function coberturaPropostaFromCrews(
  crews: Pick<TurmaCrew, 'workDays' | 'headcount'>[],
): CoberturaPorDia {
  const out = emptyCoberturaPorDia()
  for (const crew of crews) {
    const hc = Math.max(0, Math.round(crew.headcount))
    for (const raw of crew.workDays) {
      const key = raw.toLowerCase()
      if (isCoverageWeekday(key)) out[key] += hc
    }
  }
  return out
}

export function coberturaPropostaFromDistribution(
  dist: TurmaDistribution,
): CoberturaPorDia {
  return coberturaPropostaFromCrews(dist.crews)
}

export type CoverageCompareTone = 'ok' | 'below' | 'flat'

/** Green when proposed ≥ current; red when below; flat when both 0. */
export function compareCoverageDay(
  atual: number,
  proposto: number,
): CoverageCompareTone {
  if (atual <= 0 && proposto <= 0) return 'flat'
  if (proposto >= atual) return 'ok'
  return 'below'
}
