/**
 * Passo 5 — executive KPI card layout helpers.
 * Keeps long signed BRL values inside the 4-card grid (no spill into neighbors).
 */

/** Shell for each KPI grid child: shrinkable + clip overflow. */
export const EXECUTIVE_KPI_CARD_CLASS =
  'min-w-0 overflow-hidden px-4 py-4'

/** Hero (Δ folha) card chrome. */
export const EXECUTIVE_KPI_CARD_HERO_CLASS =
  `${EXECUTIVE_KPI_CARD_CLASS} border-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]/60`

/** Secondary KPI card chrome. */
export const EXECUTIVE_KPI_CARD_PLAIN_CLASS =
  `${EXECUTIVE_KPI_CARD_CLASS} border border-[var(--color-line)] bg-white/80`

/** Value line shell: contain + allow fluid type; ellipsis as last resort. */
export const EXECUTIVE_KPI_VALUE_SHELL_CLASS =
  'mt-2 min-w-0 overflow-hidden whitespace-nowrap font-semibold tracking-tight tabular-nums leading-tight text-ellipsis'

/** Hint / subline under the primary value. */
export const EXECUTIVE_KPI_HINT_CLASS =
  'mt-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--color-muted)]'

/**
 * Compact length of a display string (ignore spaces) for sizing thresholds.
 * Arrow glyphs rendered beside the value are not included — pass signed BRL only.
 */
export function executiveKpiDisplayLength(display: string): number {
  return display.replace(/\s/g, '').length
}

/**
 * Responsive type for large BRL in a 4-col card.
 * Long values step down so "+R$ 1.030.367" fits without overlapping neighbors.
 */
export function executiveKpiValueSizeClass(display: string): string {
  const len = executiveKpiDisplayLength(display)
  // "+R$1.030.367" = 12 — reported overflow into HEADCOUNT (PX-125)
  if (len >= 12) {
    return 'text-[clamp(0.95rem,2.1vw,1.25rem)]'
  }
  if (len >= 10) {
    return 'text-[clamp(1.05rem,2.4vw,1.5rem)]'
  }
  return 'text-[clamp(1.25rem,2.8vw,1.875rem)]'
}

/** Full class list for a KPI primary value given its display text. */
export function executiveKpiValueClass(
  display: string,
  toneClass = '',
): string {
  return [
    EXECUTIVE_KPI_VALUE_SHELL_CLASS,
    executiveKpiValueSizeClass(display),
    toneClass,
  ]
    .filter(Boolean)
    .join(' ')
}
