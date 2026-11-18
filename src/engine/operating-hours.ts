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

/**
 * Quadro Proposto default entrada/saída for one coverage day.
 * Mirrors ScheduleBuilder: full window when ≤10h; otherwise first 8h from open.
 * 24h ops → 00:00–08:00; closed → 08:00–17:00 fallback.
 */
export function defaultShiftWindow(
  day: DayOperatingHours,
): { startHour: number; endHour: number; hours: number } {
  if (day.closed) return { startHour: 8, endHour: 17, hours: 8 }
  if (day.openHour === day.closeHour) {
    return { startHour: 0, endHour: 8, hours: 8 }
  }
  const span = coverageSpanHours(day)
  const end =
    span > 10 ? day.openHour + 8 : day.closeHour === 0 ? 24 : day.closeHour
  const endHour = end > 24 ? end - 24 : end
  const hours = Math.round(shiftSpanHours(day.openHour, endHour) * 100) / 100
  return { startHour: day.openHour, endHour, hours }
}

function shiftSpanHours(startHour: number, endHour: number): number {
  if (startHour === endHour) return 24
  if (endHour > startHour) return endHour - startHour
  return 24 - startHour + endHour
}

/**
 * Resolve work-shift windows from establishment operating hours.
 *
 * Same tiling as schedule suggestions (`buildShiftWindows` / `tileCoverageWindow`):
 * a long funcionamento (e.g. 09–21) yields one legal jornada per tile
 * (09–17 and 13–21), never a silent collapse to a lone 09–17.
 *
 * `shiftsPerDay` is a **floor** when the OH window fits in one tile (request
 * more copies only if tiles already exist — it cannot invent clocks outside
 * the coverage window, and cannot hide tiles the window requires).
 */
export function resolveShiftWindows(
  hours: OperatingHours,
  shiftsPerDay: number,
  maxHours = 10,
  preferredBlockHours = 8,
): { startHour: number; endHour: number; hours: number }[] {
  const day = widestCoverageDay(hours)
  const tiles = tileCoverageWindow(day, maxHours, preferredBlockHours)
  if (tiles.length === 0) {
    return [defaultShiftWindow(day)]
  }
  const requested = Math.max(
    1,
    Math.floor(Number.isFinite(shiftsPerDay) ? shiftsPerDay : 1),
  )
  // Always keep every coverage tile (matches sugestões de escala).
  // shiftsPerDay cannot collapse multi-tile OH back to the first 8h block.
  const count = Math.min(tiles.length, Math.max(requested, tiles.length))
  return tiles.slice(0, count)
}

const HORARIO_PERIOD_RE =
  /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/
const HORARIO_INTERVALO_RE = /^intervalo\s+\d+\s*min$/i

/**
 * Parse Folha `horario_trabalho_atual` into work periods.
 *
 * Supports multi-period `HH:MM-HH:MM / …` and skips synthetic
 * `intervalo Nmin` tokens (PX-150). Returns [] when missing/unparseable.
 */
export function parseHorarioTrabalhoPeriods(
  raw: string | null | undefined,
): { startHour: number; endHour: number; hours: number }[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  const parts = text.split(/\s*\/\s*/)
  const out: { startHour: number; endHour: number; hours: number }[] = []
  for (const part of parts) {
    const token = part.trim()
    if (!token || HORARIO_INTERVALO_RE.test(token)) continue
    const m = HORARIO_PERIOD_RE.exec(token)
    if (!m) continue
    const startHour = normalizeHour(
      Number(m[1]) + Number(m[2]) / 60,
    )
    const endHourRaw = Number(m[3]) + Number(m[4]) / 60
    // 24:00 end-of-day sentinel (formatHourClock accepts 24).
    const endHour =
      Number(m[3]) === 24 && Number(m[4]) === 0
        ? 24
        : normalizeHour(endHourRaw)
    const hours = Math.round(shiftSpanHours(startHour, endHour) * 100) / 100
    out.push({ startHour, endHour, hours })
  }
  return out
}

/**
 * Quadro **Atual (Baseline)** windows: prefer Folha collaborator/horário
 * entry–exit (`horario_trabalho_atual`). Fall back to establishment OH tiles
 * only when Folha has no parseable work period.
 *
 * Quadro Proposto may still use {@link resolveShiftWindows} for PEC redesign.
 */
export function resolveBaselineShiftWindows(
  horarioTrabalhoAtual: string | null | undefined,
  hours: OperatingHours,
  shiftsPerDay: number,
): { startHour: number; endHour: number; hours: number }[] {
  const folha = parseHorarioTrabalhoPeriods(horarioTrabalhoAtual)
  if (folha.length > 0) return folha
  return resolveShiftWindows(hours, shiftsPerDay)
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

/* -------------------------------------------------------------------------- */
/* Segmented OH scopes (Etapa 1 — types/DTO only; cascade is Etapa 2)          */
/* -------------------------------------------------------------------------- */

/**
 * Scope granularity for establishment operating hours.
 * Etapa 2 cascade priority (most specific first): cargo → centro_custo →
 * publico → global.
 */
export type OHScopeType = 'global' | 'publico' | 'centro_custo' | 'cargo'

export const OH_SCOPE_TYPES: readonly OHScopeType[] = [
  'global',
  'publico',
  'centro_custo',
  'cargo',
] as const

/**
 * Documented cascade order for Etapa 2 motor (not applied in Etapa 1).
 * First match wins when resolving OH for a Folha row.
 */
export const OH_SCOPE_CASCADE_PRIORITY: readonly OHScopeType[] = [
  'cargo',
  'centro_custo',
  'publico',
  'global',
] as const

/**
 * Clock window carried on a scope rule.
 * - `abertura` / `fechamento`: `HH:MM` (fechamento may be `24:00`).
 * - `dias_semana`: `Date.getDay()` indices — 0=Sun … 6=Sat.
 *   Empty array → same window every day (no closed weekdays).
 */
export interface OHScopeWindow {
  abertura: string
  fechamento: string
  dias_semana: number[]
}

/**
 * One OH exception / override keyed by scope.
 * `target_value` examples: `''` or `'*'` for global; `Administrativo` (público);
 * `CC-102` (centro); cargo label/code.
 */
export interface OHScopeRule {
  scope_type: OHScopeType
  target_value: string
  operating_hours: OHScopeWindow
}

const CLOCK_RE = /^(\d{1,2}):(\d{2})$/

/** WeekdayKey → Date.getDay() (0=Sun … 6=Sat). */
const WEEKDAY_TO_DIAS: Record<WeekdayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const DIAS_TO_WEEKDAY: Record<number, WeekdayKey> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

export function isOHScopeType(value: unknown): value is OHScopeType {
  return (
    typeof value === 'string' &&
    (OH_SCOPE_TYPES as readonly string[]).includes(value)
  )
}

/** Parse `HH:MM` / `24:00` into fractional hour; null when invalid. */
export function parseScopeClock(value: string): number | null {
  const text = value.trim()
  const m = CLOCK_RE.exec(text)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (mm < 0 || mm > 59) return null
  if (hh === 24 && mm === 0) return 24
  if (hh < 0 || hh > 23) return null
  return normalizeHour(hh + mm / 60)
}

export function formatScopeClock(hour: number): string {
  return formatHourClock(hour)
}

export function weekdayKeyFromDias(day: number): WeekdayKey | null {
  return DIAS_TO_WEEKDAY[day] ?? null
}

export function diasFromWeekdayKey(key: WeekdayKey): number {
  return WEEKDAY_TO_DIAS[key]
}

/** Convert a scope window into engine `OperatingHours` (closed days marked). */
export function ohWindowToOperatingHours(window: OHScopeWindow): OperatingHours {
  const openHour = parseScopeClock(window.abertura) ?? 9
  const closeHour = parseScopeClock(window.fechamento) ?? 21
  const day: DayOperatingHours = { openHour, closeHour }
  const dias = normalizeDiasSemana(window.dias_semana)
  if (dias.length === 0) {
    return { default: day }
  }
  const openSet = new Set(dias)
  const byWeekday = {} as NonNullable<OperatingHours['byWeekday']>
  for (const key of WEEKDAY_ORDER) {
    const d = WEEKDAY_TO_DIAS[key]
    if (!openSet.has(d)) {
      byWeekday[key] = { openHour, closeHour, closed: true }
    }
  }
  return Object.keys(byWeekday).length > 0
    ? { default: day, byWeekday }
    : { default: day }
}

/**
 * Flatten engine OH into a scope window (default open/close + open dias).
 * Closed weekdays are omitted from `dias_semana`; when every day matches
 * default and none are closed → empty `dias_semana`.
 */
export function operatingHoursToOhWindow(hours: OperatingHours): OHScopeWindow {
  const abertura = formatScopeClock(hours.default.openHour)
  const fechamento = formatScopeClock(hours.default.closeHour)
  if (!hours.byWeekday || Object.keys(hours.byWeekday).length === 0) {
    return { abertura, fechamento, dias_semana: [] }
  }
  const openDays: number[] = []
  let anyClosed = false
  for (const key of WEEKDAY_ORDER) {
    const d = hoursForWeekday(hours, key)
    const dias = WEEKDAY_TO_DIAS[key]
    if (d.closed) {
      anyClosed = true
      continue
    }
    openDays.push(dias)
  }
  if (!anyClosed) {
    return { abertura, fechamento, dias_semana: [] }
  }
  return { abertura, fechamento, dias_semana: openDays }
}

/** Build the canonical global rule from wizard `operatingHours`. */
export function globalRuleFromOperatingHours(
  hours: OperatingHours,
): OHScopeRule {
  return {
    scope_type: 'global',
    target_value: '',
    operating_hours: operatingHoursToOhWindow(hours),
  }
}

export function parseOHScopeRule(raw: unknown): OHScopeRule | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!isOHScopeType(obj.scope_type)) return null
  const oh = obj.operating_hours
  if (!oh || typeof oh !== 'object') return null
  const win = oh as Record<string, unknown>
  if (typeof win.abertura !== 'string' || typeof win.fechamento !== 'string') {
    return null
  }
  if (parseScopeClock(win.abertura) == null) return null
  if (parseScopeClock(win.fechamento) == null) return null
  const diasRaw = Array.isArray(win.dias_semana) ? win.dias_semana : []
  const dias_semana = normalizeDiasSemana(diasRaw)
  const target_value =
    typeof obj.target_value === 'string' ? obj.target_value.trim() : ''
  return {
    scope_type: obj.scope_type,
    target_value,
    operating_hours: {
      abertura: formatScopeClock(parseScopeClock(win.abertura)!),
      fechamento: formatScopeClock(parseScopeClock(win.fechamento)!),
      dias_semana,
    },
  }
}

/** Drop invalid entries; preserve order. */
export function normalizeOHScopeRules(raw: unknown): OHScopeRule[] {
  if (!Array.isArray(raw)) return []
  const out: OHScopeRule[] = []
  for (const item of raw) {
    const rule = parseOHScopeRule(item)
    if (rule) out.push(rule)
  }
  return out
}

/**
 * Carry-through helper: when rules are omitted → `undefined` (backward
 * compatible — sims keep using only `operatingHours`).
 * When an array is provided, ensure a `global` rule exists (synthesized from
 * `operatingHours` when missing). Does **not** resolve cargo/CC/público.
 */
export function prepareOHScopeRulesForInput(
  raw: unknown,
  globalHours: OperatingHours,
): OHScopeRule[] | undefined {
  if (raw == null) return undefined
  const rules = normalizeOHScopeRules(raw)
  if (rules.length === 0) return undefined
  // Prefer wizard OH as the live global window when any rules are sent.
  return syncOhScopeRulesWithGlobalHours(rules, globalHours)
}

/** Prepend/replace missing global rule from wizard OH. */
export function ensureGlobalOHScopeRule(
  rules: OHScopeRule[],
  globalHours: OperatingHours,
): OHScopeRule[] {
  const hasGlobal = rules.some((r) => r.scope_type === 'global')
  if (hasGlobal) return rules
  return [globalRuleFromOperatingHours(globalHours), ...rules]
}

/**
 * When exceptions exist, always refresh the `global` rule window from wizard
 * `operatingHours` (Premissas edits). Segmented rules are preserved.
 */
export function syncOhScopeRulesWithGlobalHours(
  rules: OHScopeRule[],
  globalHours: OperatingHours,
): OHScopeRule[] {
  const exceptions = rules.filter((r) => r.scope_type !== 'global')
  return [globalRuleFromOperatingHours(globalHours), ...exceptions]
}

/**
 * Prefer an explicit `global` scope rule when present; otherwise the legacy
 * `operatingHours` field. Prefer {@link resolveOperatingHoursForEntity} when
 * segmented cascade (cargo→CC→público→global) is needed.
 */
export function effectiveGlobalOperatingHours(
  rules: OHScopeRule[] | undefined,
  fallback: OperatingHours,
): OperatingHours {
  if (!rules || rules.length === 0) return fallback
  const global = rules.find((r) => r.scope_type === 'global')
  if (!global) return fallback
  return ohWindowToOperatingHours(global.operating_hours)
}

/* -------------------------------------------------------------------------- */
/* Etapa 2 — cascade resolution (cargo → centro_custo → publico → global)     */
/* -------------------------------------------------------------------------- */

/**
 * Attributes available on a Folha row / cost-center aggregate for OH matching.
 * `publico` is optional (consultant audience label; may be absent on Folha).
 */
export interface OHScopeMatchContext {
  cargo?: string | null
  codCargo?: string | null
  descCargo?: string | null
  /** Cost-center code (prefer `cod_cc`). */
  codCc?: string | null
  /** Cost-center key / description as stored on the row (`centro_custo`). */
  centroCusto?: string | null
  descCc?: string | null
  /** Audience / population label (trim/case match). */
  publico?: string | null
}

/** Compact match metadata for results (Etapa 4 badge — no re-resolve). */
export interface OHScopeMatchMeta {
  scopeType: OHScopeType
  /** Matched `target_value`; empty string for global / legacy fallback. */
  targetValue: string
}

export interface OHScopeResolution extends OHScopeMatchMeta {
  hours: OperatingHours
}

/** Normalize free-text keys (cargo / público / CC description). */
export function normalizeOHScopeKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

/** True when `candidate` equals `target` after text normalization. */
function textKeysMatch(
  target: string,
  candidate: string | null | undefined,
): boolean {
  const t = normalizeOHScopeKey(target)
  if (!t) return false
  return normalizeOHScopeKey(candidate) === t
}

/**
 * Centro de custo: match `cod_cc` and/or description fields.
 * Codes compare trimmed case-insensitively; descriptions use text normalize.
 */
function centroCustoMatches(
  target: string,
  ctx: OHScopeMatchContext,
): boolean {
  const raw = target.trim()
  if (!raw) return false
  const codeTarget = raw.toLocaleLowerCase('pt-BR')
  for (const candidate of [ctx.codCc, ctx.centroCusto]) {
    const c = (candidate ?? '').trim()
    if (c && c.toLocaleLowerCase('pt-BR') === codeTarget) return true
  }
  // Description / free-text CC labels
  if (textKeysMatch(raw, ctx.descCc)) return true
  if (textKeysMatch(raw, ctx.centroCusto)) return true
  return false
}

function cargoMatches(target: string, ctx: OHScopeMatchContext): boolean {
  return (
    textKeysMatch(target, ctx.cargo) ||
    textKeysMatch(target, ctx.descCargo) ||
    textKeysMatch(target, ctx.codCargo)
  )
}

function publicoMatches(target: string, ctx: OHScopeMatchContext): boolean {
  return textKeysMatch(target, ctx.publico)
}

function ruleMatchesEntity(
  rule: OHScopeRule,
  ctx: OHScopeMatchContext,
): boolean {
  switch (rule.scope_type) {
    case 'cargo':
      return cargoMatches(rule.target_value, ctx)
    case 'centro_custo':
      return centroCustoMatches(rule.target_value, ctx)
    case 'publico':
      return publicoMatches(rule.target_value, ctx)
    case 'global':
      return true
    default:
      return false
  }
}

/**
 * Build match context from a Folha / payroll row.
 * `publico` is not a Folha column today — pass via overrides when available.
 */
export function ohScopeMatchContextFromPayrollRow(
  row: {
    cargo?: string | null
    codCargo?: string | null
    descCargo?: string | null
    codCc?: string | null
    centroCusto?: string | null
    descCc?: string | null
    publico?: string | null
  },
  overrides?: Partial<OHScopeMatchContext>,
): OHScopeMatchContext {
  return {
    cargo: row.cargo ?? null,
    codCargo: row.codCargo ?? null,
    descCargo: row.descCargo ?? null,
    codCc: row.codCc ?? null,
    centroCusto: row.centroCusto ?? null,
    descCc: row.descCc ?? null,
    publico: row.publico ?? null,
    ...overrides,
  }
}

/** Match context from a cost-center aggregate / result slice. */
export function ohScopeMatchContextFromCostCenter(
  cc: {
    centroCusto?: string | null
    codCc?: string | null
    descCc?: string | null
    /** Dominant cargo label when known. */
    cargo?: string | null
    codCargo?: string | null
    descCargo?: string | null
    publico?: string | null
  },
  overrides?: Partial<OHScopeMatchContext>,
): OHScopeMatchContext {
  return ohScopeMatchContextFromPayrollRow(cc, overrides)
}

/**
 * Resolve establishment OH for one entity via cascade priority:
 * cargo → centro_custo → publico → global (then legacy `operatingHours`).
 *
 * First matching rule in priority order wins. When `ohScopeRules` is omitted,
 * returns the legacy global `operatingHours` with `scopeType: 'global'`.
 */
export function resolveOperatingHoursForEntity(
  rules: OHScopeRule[] | undefined,
  globalHours: OperatingHours,
  entity: OHScopeMatchContext = {},
): OHScopeResolution {
  const fallbackHours =
    effectiveGlobalOperatingHours(rules, globalHours) ?? globalHours

  if (!rules || rules.length === 0) {
    return {
      hours: globalHours,
      scopeType: 'global',
      targetValue: '',
    }
  }

  for (const scopeType of OH_SCOPE_CASCADE_PRIORITY) {
    const match = rules.find(
      (r) => r.scope_type === scopeType && ruleMatchesEntity(r, entity),
    )
    if (!match) continue
    return {
      hours: ohWindowToOperatingHours(match.operating_hours),
      scopeType: match.scope_type,
      targetValue: match.target_value,
    }
  }

  // Defensive: rules present but nothing matched (should not happen when a
  // global rule was ensured). Fall back to effective global / wizard OH.
  return {
    hours: fallbackHours,
    scopeType: 'global',
    targetValue: '',
  }
}

/** Convenience: resolve + return only the `OperatingHours` window. */
export function resolveOperatingHours(
  rules: OHScopeRule[] | undefined,
  globalHours: OperatingHours,
  entity?: OHScopeMatchContext,
): OperatingHours {
  return resolveOperatingHoursForEntity(rules, globalHours, entity ?? {}).hours
}

function normalizeDiasSemana(raw: unknown[]): number[] {
  const set = new Set<number>()
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 6) continue
    set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}
