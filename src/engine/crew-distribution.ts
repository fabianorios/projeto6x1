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
 * Split `total` people across `binCount` buckets (floor + remainder on the
 * first buckets). Never invents heads: Σ result === round(total).
 * Used by turmas, shift tiles, and Apdata grades so multi-window paths
 * cannot pad with Math.max(1, …).
 */
export function distributeExactCounts(
  total: number,
  binCount: number,
): number[] {
  const n = Math.max(0, Math.floor(binCount))
  if (n === 0) return []
  const target = Math.max(0, Math.round(total))
  if (target === 0) return Array.from({ length: n }, () => 0)
  const base = Math.floor(target / n)
  let rem = target - base * n
  return Array.from({ length: n }, () => {
    const extra = rem > 0 ? 1 : 0
    if (rem > 0) rem -= 1
    return base + extra
  })
}

/**
 * Re-balance crews so Σ headcount === `total` (keep N turmas / rest pattern).
 * Spreads remainder +1 across the first crews — never invents heads beyond `total`.
 */
export function crewsWithTotalHeadcount(
  crews: TurmaCrew[],
  total: number,
): TurmaCrew[] {
  const counts = distributeExactCounts(total, crews.length)
  if (counts.length === 0) return crews
  return crews.map((c, i) => ({ ...c, headcount: counts[i]! }))
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

/**
 * True when a fixed weekly target pattern already staffs every operating day
 * of the regime at full roster — so the person-days scale factor must not
 * invent headcount.
 *
 * Example: SEG_SEX + 5×2 (folga fixa sáb/dom, mesmo horário). Baseline 6×1
 * already puts the whole roster on Mon–Fri; migrating to 5×2 keeps that
 * coverage without hiring. Shorter targets (e.g. 4×3 on SEG_SEX) still need
 * more roster. CONTINUO_7D is handled separately (see
 * `singleCollaboratorContinuoKeepsRoster`).
 */
export function fixedOffTargetCoversOperatingDays(
  regime: RegimeFuncionamento,
  targetWorkDays: number,
): boolean {
  const work = Math.max(0, Math.round(targetWorkDays))
  if (regime === 'SEG_SEX') return work >= 5
  if (regime === 'SEG_SAB') return work >= 6
  return false
}

/**
 * Single collaborator on CONTINUO → 5×2 (or longer) target: OH tiles
 * (09–17 + 13–21) are legal jornada alternatives for a long funcionamento,
 * not two simultaneous posts. Baseline daily need stays 1; ceil(1 × 1.2 ×
 * buffer) must not invent a 2nd person that lands on the 2nd tile.
 * Larger CONTINUO rosters still use the scale factor. 4×3 (shorter target)
 * still inflates.
 */
export function singleCollaboratorContinuoKeepsRoster(
  regime: RegimeFuncionamento,
  currentHeadcount: number,
  targetWorkDays: number,
): boolean {
  if (regime !== 'CONTINUO_7D') return false
  if (Math.max(0, Math.round(currentHeadcount)) > 1) return false
  return Math.max(0, Math.round(targetWorkDays)) >= 5
}

/**
 * Required roster after scenario factor, with coverage waivers.
 * - Folga fixa + target already covers operating days → keep HC.
 * - Single-collaborator CONTINUO with 5×2+ target → keep HC (tiles ≠ posts).
 */
export function requiredHeadcountAfterFactor(
  currentHeadcount: number,
  headcountFactor: number,
  opts: {
    preserveCurrentScale: boolean
    regime: RegimeFuncionamento
    targetWorkDays: number
  },
): number {
  const hc = Math.max(0, Math.round(currentHeadcount))
  if (opts.preserveCurrentScale) return hc
  if (fixedOffTargetCoversOperatingDays(opts.regime, opts.targetWorkDays)) {
    return hc
  }
  if (
    singleCollaboratorContinuoKeepsRoster(
      opts.regime,
      hc,
      opts.targetWorkDays,
    )
  ) {
    return hc
  }
  return Math.max(hc, Math.ceil(hc * headcountFactor))
}

/**
 * How many OH tiles should receive headcount for a given daily post need.
 * Never staff every tile just because the funcionamento tiled into N jornadas
 * — a single-post CC keeps people on the first tile(s) only.
 */
export function staffedWindowCountForCoverage(
  windowCount: number,
  totalHeadcount: number,
  dailyCoverageNeed?: number,
): number {
  const n = Math.max(0, Math.floor(windowCount))
  if (n === 0) return 0
  const hc = Math.max(0, Math.round(totalHeadcount))
  if (hc <= 0) return 1
  const need =
    dailyCoverageNeed != null
      ? Math.max(1, Math.round(dailyCoverageNeed))
      : Math.max(1, hc)
  return Math.min(n, need, hc)
}

/**
 * Map each crew to a window index. Non-zero HC packs into the first
 * `staffedCount` tiles (Σ HC per tile follows `distributeExactCounts`).
 * Zero-HC structural turmas keep `i % allWindows` so the 7-turma template
 * still shows alternating labels.
 */
export function assignCrewWindowIndices(
  crews: readonly { headcount: number }[],
  windowCount: number,
  dailyCoverageNeed?: number,
): number[] {
  const n = Math.max(0, Math.floor(windowCount))
  if (n === 0) return crews.map(() => 0)
  const totalHc = crews.reduce(
    (s, c) => s + Math.max(0, Math.round(c.headcount)),
    0,
  )
  const staffed = staffedWindowCountForCoverage(n, totalHc, dailyCoverageNeed)
  const budget = distributeExactCounts(totalHc, staffed)
  const remaining = [...budget]
  let fillTile = 0
  return crews.map((c, i) => {
    const hc = Math.max(0, Math.round(c.headcount))
    if (hc === 0) return i % n
    while (fillTile < staffed - 1 && (remaining[fillTile] ?? 0) <= 0) {
      fillTile += 1
    }
    const assigned = Math.min(fillTile, staffed - 1)
    remaining[assigned] = (remaining[assigned] ?? 0) - hc
    return assigned
  })
}
