/**
 * Schedule suggestion policy — mirrors docs/schedule-policy.md.
 * Versioned allowlist + blocklist. The motor NEVER recommends excluded scales.
 * 6×1 / 6x1_ajustada: valid as Atual/status quo only — never as proposed.
 */

import type { ScenarioId } from './types'

/** Codes the product may propose as operational alternatives. */
export type AllowedScheduleCode = '5x2' | '4x3' | 'turnos_8h'

/** Codes that must never appear as recommendations. */
export type ExcludedScheduleCode =
  | '6x1'
  | '6x1_ajustada'
  | '12x36'
  | '24x48'
  | 'sobreaviso_puro'
  | 'jornada_gt_10h'

export interface AllowedScheduleDef {
  code: AllowedScheduleCode
  label: string
  description: string
  /** Work/rest cycle used for cost & VR/VT day estimates. */
  workDays: number
  restDays: number
  /** Default daily shift length (hours). Must be ≤ MAX_SUGGESTED_DAILY_HOURS. */
  defaultDailyHours: number
}

export interface ExcludedScheduleDef {
  code: ExcludedScheduleCode
  label: string
  reason: string
  /** Patterns that match user input (normalized). */
  matchers: RegExp[]
}

/** Hard cap: never suggest a default daily shift longer than this. */
export const MAX_SUGGESTED_DAILY_HOURS = 10

export const SCHEDULE_POLICY_VERSION = 'schedule-policy-v2'

export const ALLOWED_SCHEDULES: readonly AllowedScheduleDef[] = [
  {
    code: '5x2',
    label: '5×2 (diurno)',
    description: '5 dias trabalho / 2 folga — varejo diurno, escritório, apoio.',
    workDays: 5,
    restDays: 2,
    defaultDailyHours: 8,
  },
  {
    code: '4x3',
    label: '4×3 (contínuo leve)',
    description:
      '4×3 quando o cenário PEC agressivo modela mais folgas — contínuo leve.',
    workDays: 4,
    restDays: 3,
    defaultDailyHours: 8,
  },
  {
    code: 'turnos_8h',
    label: 'Turnos 8h (5×2)',
    description:
      'Blocos 8h (manhã/tarde/noite) em ciclo 5×2 — loja/obra com horário comercial + extensão.',
    workDays: 5,
    restDays: 2,
    defaultDailyHours: 8,
  },
] as const

export const EXCLUDED_SCHEDULES: readonly ExcludedScheduleDef[] = [
  {
    code: '6x1',
    label: '6×1',
    reason:
      'Escala que a PEC visa abolir. Pode figurar só como Atual/status quo; o motor nunca a sugere como proposta.',
    matchers: [/^6\s*[x×]\s*1$/, /^6x1$/, /^6×1$/],
  },
  {
    code: '6x1_ajustada',
    label: '6×1 ajustada',
    reason:
      'Variante de 6×1 — também excluída da sugestão (PEC aboliria essa escala).',
    matchers: [
      /^6\s*[x×]\s*1[_-]?ajustada$/,
      /^6x1_ajustada$/,
      /^6×1ajustada$/,
    ],
  },
  {
    code: '12x36',
    label: '12×36',
    reason:
      'Regime específico de plantão; não entra como “adequação à PEC”. O motor pode ler 12×36 como status quo na importação, mas não recomenda migrar para ele.',
    matchers: [/^12\s*[x×]\s*36$/, /^12x36$/, /^12×36$/],
  },
  {
    code: '24x48',
    label: '24×48',
    reason:
      'Plantão longo fora do escopo da proposta de escala comercial / adequação à PEC.',
    matchers: [/^24\s*[x×]\s*48$/, /^24x48$/, /^24×48$/],
  },
  {
    code: 'sobreaviso_puro',
    label: 'Sobreaviso puro',
    reason: 'Não é escala de cobertura diária — fora da sugestão operacional.',
    matchers: [/^sobreaviso(_puro)?$/, /^sobre[\s_-]?aviso$/],
  },
  {
    code: 'jornada_gt_10h',
    label: 'Jornada diária > 10h',
    reason:
      'O produto não normaliza jornadas diárias acima de 10h como padrão sugerido.',
    // Matched via daily-hours check, not label alone.
    matchers: [],
  },
] as const

export const SCHEDULE_SUGGESTION_DISCLAIMER =
  'Escalas sugeridas são estimativas operacionais (horários e HC por turno) para ' +
  'cobertura e custo (folha + VR/VT). Início/fim dos turnos derivam do horário de ' +
  'funcionamento informado — não de grades fixas inventadas. Não constituem ' +
  'recomendação jurídica nem adequação automática à PEC. Valide com RH e ' +
  'assessoria jurídica. Escalas 6×1 (e ajustada), 12×36, 24×48, sobreaviso puro ' +
  'e jornadas diárias > 10h estão excluídas da sugestão — 6×1 só aparece como Atual.'

function normalizeScaleLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

/** True if every allowed def respects the ≤10h daily cap (invariant). */
export function assertAllowedDailyHoursCap(): boolean {
  return ALLOWED_SCHEDULES.every(
    (s) => s.defaultDailyHours <= MAX_SUGGESTED_DAILY_HOURS,
  )
}

export function getAllowedSchedule(
  code: AllowedScheduleCode,
): AllowedScheduleDef {
  const found = ALLOWED_SCHEDULES.find((s) => s.code === code)
  if (!found) throw new Error(`Unknown allowed schedule: ${code}`)
  return found
}

export interface ExclusionHit {
  excluded: true
  code: ExcludedScheduleCode
  label: string
  reason: string
  /** Short UX badge text. */
  badge: string
  /**
   * Soft = ok as Atual (e.g. 6×1); hard = never treat as PEC answer (12×36…).
   */
  severity: 'soft' | 'hard'
}

export interface ExclusionMiss {
  excluded: false
}

function hitFromDef(
  def: ExcludedScheduleDef,
  severity: 'soft' | 'hard',
): ExclusionHit {
  return {
    excluded: true,
    code: def.code,
    label: def.label,
    reason: def.reason,
    badge:
      severity === 'soft'
        ? 'Só como Atual — não sugerida'
        : 'Excluído da sugestão',
    severity,
  }
}

/**
 * Detect if a scale label is on the exclusion list (must not be suggested).
 * 6×1 is soft: valid as current/status quo, never as proposed.
 */
export function checkScheduleExclusion(
  raw: string,
  dailyHours?: number,
): ExclusionHit | ExclusionMiss {
  const n = normalizeScaleLabel(raw)

  for (const def of EXCLUDED_SCHEDULES) {
    if (def.code === 'jornada_gt_10h') continue
    if (def.matchers.some((re) => re.test(n))) {
      const soft = def.code === '6x1' || def.code === '6x1_ajustada'
      return hitFromDef(def, soft ? 'soft' : 'hard')
    }
  }

  const cycle = n.match(/^(\d+)[x×](\d+)$/)
  if (cycle) {
    const a = Number(cycle[1])
    const b = Number(cycle[2])
    if (a === 6 && b === 1) {
      return hitFromDef(
        EXCLUDED_SCHEDULES.find((e) => e.code === '6x1')!,
        'soft',
      )
    }
    if (a === 12 && b === 36) {
      return hitFromDef(
        EXCLUDED_SCHEDULES.find((e) => e.code === '12x36')!,
        'hard',
      )
    }
    if (a === 24 && b === 48) {
      return hitFromDef(
        EXCLUDED_SCHEDULES.find((e) => e.code === '24x48')!,
        'hard',
      )
    }
  }

  if (
    dailyHours !== undefined &&
    dailyHours > MAX_SUGGESTED_DAILY_HOURS
  ) {
    return hitFromDef(
      EXCLUDED_SCHEDULES.find((e) => e.code === 'jornada_gt_10h')!,
      'hard',
    )
  }

  return { excluded: false }
}

/**
 * Allowlist codes eligible for a scenario.
 * Never includes 6×1 / 6x1_ajustada. `4x3` only under aggressive draft.
 */
export function listSuggestableCodes(
  scenarioId: ScenarioId,
  _currentScaleLabel: string,
): AllowedScheduleCode[] {
  switch (scenarioId) {
    case 'status_quo':
      return ['5x2', 'turnos_8h']
    case 'pec_draft_conservative':
      return ['5x2', 'turnos_8h']
    case 'pec_draft_aggressive':
      return ['4x3', '5x2', 'turnos_8h']
    default:
      return ['5x2', 'turnos_8h']
  }
}

/** True if a code is on the allowlist (and passes the ≤10h invariant). */
export function isAllowedSuggestion(code: string): code is AllowedScheduleCode {
  const def = ALLOWED_SCHEDULES.find((s) => s.code === code)
  return !!def && def.defaultDailyHours <= MAX_SUGGESTED_DAILY_HOURS
}
