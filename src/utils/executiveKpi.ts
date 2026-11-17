/**
 * Passo 5 — executive KPI card layout helpers.
 * Keeps long signed BRL / headcount ranges readable inside the 4-card grid
 * (full values, no ellipsis truncation — shrink type or wrap).
 */

/** Shell for each KPI grid child: shrinkable; clip only decorative overflow. */
export const EXECUTIVE_KPI_CARD_CLASS =
  'min-w-0 overflow-hidden px-4 py-4'

/** Hero (Δ folha) card chrome. */
export const EXECUTIVE_KPI_CARD_HERO_CLASS =
  `${EXECUTIVE_KPI_CARD_CLASS} border-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]/60`

/** Secondary KPI card chrome. */
export const EXECUTIVE_KPI_CARD_PLAIN_CLASS =
  `${EXECUTIVE_KPI_CARD_CLASS} border border-[var(--color-line)] bg-white/80`

/**
 * Value line shell: fluid type + wrap so full BRL/ranges stay visible.
 * No text-overflow ellipsis / nowrap — PX-128.
 */
export const EXECUTIVE_KPI_VALUE_SHELL_CLASS =
  'mt-2 min-w-0 max-w-full break-words font-semibold tracking-tight tabular-nums leading-tight'

/** Hint / subline under the primary value — wrap, never ellipsize. */
export const EXECUTIVE_KPI_HINT_CLASS =
  'mt-1 min-w-0 max-w-full break-words text-xs leading-snug text-[var(--color-muted)]'

/**
 * Compact length of a display string (ignore spaces) for sizing thresholds.
 * Arrow glyphs rendered beside the value are not included — pass signed BRL only.
 */
export function executiveKpiDisplayLength(display: string): number {
  return display.replace(/\s/g, '').length
}

/**
 * Responsive type for large BRL / ranges in a 4-col card.
 * Longer values step down so full text fits (or wraps) without ellipsis.
 */
export function executiveKpiValueSizeClass(display: string): string {
  const len = executiveKpiDisplayLength(display)
  // "+R$1.030.367" = 12 — million-scale Δ folha
  if (len >= 12) {
    return 'text-[clamp(0.8rem,1.8vw,1.05rem)]'
  }
  // "+R$183.612" / mid VR·VT
  if (len >= 10) {
    return 'text-[clamp(0.9rem,2vw,1.2rem)]'
  }
  // "754→832" (len 7) and short signed BRL — still tight in 4-col
  if (len >= 7) {
    return 'text-[clamp(1rem,2.2vw,1.35rem)]'
  }
  return 'text-[clamp(1.15rem,2.6vw,1.75rem)]'
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
