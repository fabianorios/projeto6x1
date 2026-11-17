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
 * Re-balance crews so Σ headcount === `total` (keep N turmas / rest pattern).
 * Spreads remainder +1 across the first crews — never invents heads beyond `total`.
 */
export function crewsWithTotalHeadcount(
  crews: TurmaCrew[],
  total: number,
): TurmaCrew[] {
  const n = crews.length
  if (n === 0) return crews
  const target = Math.max(0, Math.round(total))
  if (target === 0) return crews.map((c) => ({ ...c, headcount: 0 }))
  const base = Math.floor(target / n)
  let rem = target - base * n
  return crews.map((c) => {
    const extra = rem > 0 ? 1 : 0
    if (rem > 0) rem -= 1
    return { ...c, headcount: base + extra }
  })
}

/**
 * Distribute required headcount into turmas for the operating regime.
 *
 * - SEG_SEX: one 5×2 pool covering Mon–Fri.
 * - SEG_SAB: one 6-day pool (modeled as 6×1 work pattern for coverage days;
 *   suggestion policy still prefers 5×2 candidates elsewhere).
 * - CONTINUO_7D: **7 rotating 5×2 crews** — each calendar day 5 of 7 crews
 *   work. Total HC is preserved exactly (no ceil×7 inflation); daily need ≈
 *   round(total × 5/7).
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
  // Convention: `requiredHeadcount` = total roster after scale factor.
  // Allocate exactly that roster across T1…T7 (same as baseline calendar) —
  // do NOT ceil(hc/7)*7, which invented heads for small CCs (ex. 1→7, 8→14).
  const crewCount = 7
  const skeleton: TurmaCrew[] = []

  for (let i = 0; i < crewCount; i++) {
    // Stagger rest days: crew i rests on weekdays i and (i+1)%7
    const restA = WEEKDAYS_7D[i]
    const restB = WEEKDAYS_7D[(i + 1) % 7]
    const workDays = WEEKDAYS_7D.filter((d) => d !== restA && d !== restB)
    skeleton.push({
      turmaIndex: i + 1,
      label: `Turma ${i + 1} (5×2 rotativa)`,
      escala: '5x2',
      workDays: [...workDays],
      restDays: [restA, restB],
      headcount: 0,
    })
  }

  const crews = crewsWithTotalHeadcount(skeleton, hc)
  const totalHeadcount = hc
  const dailyCoverageNeed =
    hc === 0 ? 0 : Math.max(0, Math.round((hc * 5) / 7))

  return {
    regime: 'CONTINUO_7D',
    dailyCoverageNeed,
    totalHeadcount,
    crewCount,
    crews,
    note:
      'Operação contínua: 7 turmas 5×2 rotativas — a cada dia 5 de 7 turmas ' +
      'trabalham (cobertura diária ≈ HC × 5/7). HC total = requerido (sem inventar).',
  }
}

/** Headcount multiplier to keep daily coverage when using 7×5×2 crews. */
export function continuo7dRosterFactor(): number {
  return 7 / 5
}
