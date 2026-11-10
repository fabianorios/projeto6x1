/**
 * Establishment operating hours — coverage window for schedule suggestions.
 * Shift start/end are derived from this window (never invented arbitrarily).
 */

export type WeekdayKey =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'

export const WEEKDAY_ORDER: readonly WeekdayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
}

/** One day's open/close. Hours are 0–24 (24 = midnight end-of-day). */
export interface DayOperatingHours {
  /** Opening hour (0–23.99…). */
  openHour: number
  /**
   * Closing hour. If equal to openHour → 24h. If less than openHour → overnight
   * (e.g. 22→6). Prefer 24 for "closes at midnight" on same calendar day.
   */
  closeHour: number
  /** Explicitly closed that day. */
  closed?: boolean
}

/**
 * Establishment hours. Default window always required; optional per-weekday
 * overrides (e.g. Saturday shorter, Sunday closed).
 */
export interface OperatingHours {
  default: DayOperatingHours
  byWeekday?: Partial<Record<WeekdayKey, DayOperatingHours>>
}

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  default: { openHour: 9, closeHour: 21 },
}

/** Retail-ish default: 09:00–21:00. */
export function defaultVarejoHours(): OperatingHours {
  return { default: { openHour: 9, closeHour: 21 } }
}

/** Hospital continuous: 24h (open === close → full day). */
export function defaultHospitalHours(): OperatingHours {
  return { default: { openHour: 0, closeHour: 0 } }
}

/** Duration in hours of [open, close). 0===0 → 24. */
export function coverageSpanHours(day: DayOperatingHours): number {
  if (day.closed) return 0
  const open = day.openHour
  const close = day.closeHour
  if (open === close) return 24
  if (close > open) return close - open
  return 24 - open + close
}

/** Resolve hours for a weekday (override or default). */
export function hoursForWeekday(
  hours: OperatingHours,
  day: WeekdayKey,
): DayOperatingHours {
  return hours.byWeekday?.[day] ?? hours.default
}

/**
 * Widest open coverage among weekdays that are not closed — used to size
 * suggested shifts so the proposal covers the longest operating day.
 */
export function widestCoverageDay(hours: OperatingHours): DayOperatingHours {
  let best = hours.default
  let bestSpan = coverageSpanHours(best)
  if (hours.byWeekday) {
    for (const key of WEEKDAY_ORDER) {
      const d = hours.byWeekday[key]
      if (!d || d.closed) continue
      const span = coverageSpanHours(d)
      if (span > bestSpan) {
        best = d
        bestSpan = span
      }
    }
  }
  return best
}

export function normalizeHour(h: number): number {
  if (!Number.isFinite(h)) return 0
  // Allow 24 as end-of-day sentinel; otherwise wrap to [0, 24).
  if (h === 24) return 24
  const x = ((h % 24) + 24) % 24
  return Math.round(x * 100) / 100
}

export function formatHourClock(h: number): string {
  if (h === 24) return '24:00'
  const hh = Math.floor(normalizeHour(h)) % 24
  const mm = Math.round((normalizeHour(h) - Math.floor(normalizeHour(h))) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function hourToTimeInputValue(h: number): string {
  if (h === 24) return '00:00'
  const n = normalizeHour(h)
  const hh = Math.floor(n) % 24
  const mm = Math.round((n - Math.floor(n)) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function timeInputToHour(value: string): number {
  const [hs, ms] = value.split(':')
  const h = Number(hs)
  const m = Number(ms || 0)
  if (!Number.isFinite(h)) return 0
  return normalizeHour(h + (Number.isFinite(m) ? m / 60 : 0))
}

export function formatOperatingWindow(day: DayOperatingHours): string {
  if (day.closed) return 'fechado'
  if (day.openHour === day.closeHour) return '24h'
  return `${formatHourClock(day.openHour)}–${formatHourClock(day.closeHour)}`
}

/**
 * Tile [open, close) into shifts of **preferred** length (default 8h), capped at
 * maxHours (≤10). Never equal-splits into shortened blocks (e.g. 12h → 2×6h).
 *
 * - span ≤ maxHours → one shift covering the whole window
 * - span > maxHours → N = ceil(span / preferred) shifts of exactly `preferred`
 *   hours, stepped so the first starts at open and the last ends at close
 *   (overlap when span < N×preferred — e.g. 09–21 → 09–17 and 13–21)
 */
export function tileCoverageWindow(
  day: DayOperatingHours,
  maxHours: number,
  preferredBlockHours?: number,
): { startHour: number; endHour: number; hours: number }[] {
  const span = coverageSpanHours(day)
  if (span <= 0) return []

  const cap = Math.min(Math.max(1, maxHours), 24)
  const preferred = Math.min(
    cap,
    Math.max(1, preferredBlockHours ?? 8),
  )

  const open = day.openHour
  const closeAbs = open + span // absolute end on an unwrapped timeline

  // Whole window fits in one legal shift (≤10h) — keep a single block.
  if (span <= cap + 1e-9) {
    return [
      {
        startHour: normalizeClock(open),
        endHour: endClock(open, span, day),
        hours: Math.round(span * 100) / 100,
      },
    ]
  }

  // Multiple shifts: keep each at preferred length; space starts so last ends at close.
  const n = Math.max(2, Math.ceil(span / preferred))
  const out: { startHour: number; endHour: number; hours: number }[] = []

  if (n === 1) {
    return [
      {
        startHour: normalizeClock(open),
        endHour: endClock(open, span, day),
        hours: Math.min(cap, Math.round(span * 100) / 100),
      },
    ]
  }

  // step ≥ 0: when span < n*preferred, shifts overlap; when equal, they abut.
  const step = (span - preferred) / (n - 1)

  for (let i = 0; i < n; i++) {
    const startAbs = open + i * step
    const endAbs = startAbs + preferred
    // Snap last end exactly to closeAbs (float dust).
    const endAdj = i === n - 1 ? closeAbs : endAbs
    const startAdj = i === n - 1 ? endAdj - preferred : startAbs
    const hours = Math.round(preferred * 100) / 100
    out.push({
      startHour: normalizeClock(startAdj),
      endHour: endClockFromAbs(endAdj, day),
      hours: Math.min(cap, hours),
    })
  }

  return out
}

/** Map absolute (unwrapped) end hour back to clock, preserving 24 sentinel. */
function endClockFromAbs(endAbs: number, day: DayOperatingHours): number {
  if (day.openHour === day.closeHour) {
    // 24h ops: end at 24 when landing on a full-day boundary.
    const mod = ((endAbs % 24) + 24) % 24
    return mod === 0 ? 24 : normalizeClock(mod)
  }
  if (day.closeHour === 24 && Math.abs(endAbs - (day.openHour + coverageSpanHours(day))) < 1e-6) {
    return 24
  }
  return normalizeClock(endAbs)
}

function endClock(
  open: number,
  span: number,
  day: DayOperatingHours,
): number {
  return endClockFromAbs(open + span, day)
}

function normalizeClock(h: number): number {
  if (h === 24) return 24
  // Keep fractional hours; wrap past 24 for overnight midpoints.
  const wrapped = ((h % 24) + 24) % 24
  return Math.round(wrapped * 100) / 100
}

/** Short summary for UI/report (default + optional weekday notes). */
export function summarizeOperatingHours(hours: OperatingHours): string {
  const base = `Funcionamento ${formatOperatingWindow(hours.default)}`
  if (!hours.byWeekday || Object.keys(hours.byWeekday).length === 0) {
    return base
  }
  const notes: string[] = []
  for (const key of WEEKDAY_ORDER) {
    const d = hours.byWeekday[key]
    if (!d) continue
    const same =
      !d.closed &&
      d.openHour === hours.default.openHour &&
      d.closeHour === hours.default.closeHour
    if (same) continue
    notes.push(`${WEEKDAY_LABELS[key]} ${formatOperatingWindow(d)}`)
  }
  return notes.length ? `${base} (${notes.join(', ')})` : base
}
