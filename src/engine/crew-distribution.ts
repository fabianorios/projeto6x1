/**
 * Crew / turma distribution by operating regime.
 * CONTINUO_7D → 7 rotating 5×2 crews (classic coverage pattern).
 */

import type { RegimeFuncionamento } from '../types'
import { DEFAULT_REGIME_FUNCIONAMENTO } from '../types'

const WEEKDAYS_SEG_SEX = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
] as const

const WEEKDAYS_SEG_SAB = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
] as const

const WEEKDAYS_7D = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
  'dom',
] as const

export interface TurmaCrew {
  /** 1-based crew index. */
  turmaIndex: number
  label: string
  /** Scale label for the crew pattern. */
  escala: string
  /** Weekday keys this crew works. */
  workDays: string[]
  /** Weekday keys this crew rests. */
  restDays: string[]
  /** Headcount allocated to this crew. */
  headcount: number
}

export interface TurmaDistribution {
  regime: RegimeFuncionamento
  /** People needed on site each operating day (demand). */
  dailyCoverageNeed: number
  /** Total headcount across crews. */
  totalHeadcount: number
  /** Number of crews / turmas. */
  crewCount: number
  crews: TurmaCrew[]
  note: string
}

export function resolveRegime(
  regime?: RegimeFuncionamento | null,
): RegimeFuncionamento {
  return regime ?? DEFAULT_REGIME_FUNCIONAMENTO
}

/**
 * Distribute required headcount into turmas for the operating regime.
 *
 * - SEG_SEX: one 5×2 pool covering Mon–Fri.
 * - SEG_SAB: one 6-day pool (modeled as 6×1 work pattern for coverage days;
 *   suggestion policy still prefers 5×2 candidates elsewhere).
 * - CONTINUO_7D: **7 rotating 5×2 crews** — each calendar day 5 of 7 crews
 *   work, so dailyCoverage = 5 × crewSize and totalHC = 7 × crewSize.
 */
export function distributeCrews(
  regime: RegimeFuncionamento,
  requiredHeadcount: number,
): TurmaDistribution {
  const hc = Math.max(0, Math.ceil(requiredHeadcount))

  if (regime === 'SEG_SEX') {
    return {
      regime,
      dailyCoverageNeed: hc,
      totalHeadcount: hc,
      crewCount: 1,
      crews: [
        {
          turmaIndex: 1,
          label: 'Turma única 5×2',
          escala: '5x2',
          workDays: [...WEEKDAYS_SEG_SEX],
          restDays: ['sab', 'dom'],
          headcount: hc,
        },
      ],
      note: 'Cobertura seg–sex com uma turma 5×2 (folga sab/dom).',
    }
  }

  if (regime === 'SEG_SAB') {
    return {
      regime,
      dailyCoverageNeed: hc,
      totalHeadcount: hc,
      crewCount: 1,
      crews: [
        {
          turmaIndex: 1,
          label: 'Turma seg–sáb',
          escala: '6x1',
          workDays: [...WEEKDAYS_SEG_SAB],
          restDays: ['dom'],
          headcount: hc,
        },
      ],
      note:
        'Cobertura seg–sáb (uma turma). Escala 6×1 aqui descreve dias de ' +
        'cobertura do estabelecimento — não é sugestão normativa.',
    }
  }

  // CONTINUO_7D: 7 rotating 5×2 crews.
  // If requiredHeadcount is the *total* roster, crewSize = ceil(total/7)
  // and daily coverage ≈ 5/7 of roster. If callers pass daily need, they
  // should pass dailyNeed * 7/5 as requiredHeadcount first.
  // Convention here: `requiredHeadcount` = total roster after scale factor.
  const crewCount = 7
  const crewSize = Math.max(1, Math.ceil(hc / crewCount))
  const totalHeadcount = crewSize * crewCount
  const dailyCoverageNeed = crewSize * 5
  const crews: TurmaCrew[] = []

  for (let i = 0; i < crewCount; i++) {
    // Stagger rest days: crew i rests on weekdays i and (i+1)%7
    const restA = WEEKDAYS_7D[i]
    const restB = WEEKDAYS_7D[(i + 1) % 7]
    const workDays = WEEKDAYS_7D.filter((d) => d !== restA && d !== restB)
    crews.push({
      turmaIndex: i + 1,
      label: `Turma ${i + 1} (5×2 rotativa)`,
      escala: '5x2',
      workDays: [...workDays],
      restDays: [restA, restB],
      headcount: crewSize,
    })
  }

  return {
    regime: 'CONTINUO_7D',
    dailyCoverageNeed,
    totalHeadcount,
    crewCount,
    crews,
    note:
      'Operação contínua: 7 turmas 5×2 rotativas — a cada dia 5 de 7 turmas ' +
      'trabalham (cobertura diária = 5 × tamanho da turma).',
  }
}

/** Headcount multiplier to keep daily coverage when using 7×5×2 crews. */
export function continuo7dRosterFactor(): number {
  return 7 / 5
}
