/**
 * Compact OH match badge — global vs segmentada (Etapa 4).
 */

import type { OHScopeMatchMeta } from '../engine'
import {
  formatOhScopeBadge,
  isSegmentedOhScope,
} from '../utils/ohScopeBadge'

export type OhScopeBadgeProps = {
  match?: OHScopeMatchMeta | null
  className?: string
  /** Prefer short "global" / "segmentada" when space is tight. */
  short?: boolean
}

export function OhScopeBadge({
  match,
  className = '',
  short = false,
}: OhScopeBadgeProps) {
  const segmented = isSegmentedOhScope(match)
  const label = short
    ? segmented
      ? 'segmentada'
      : 'global'
    : formatOhScopeBadge(match)

  return (
    <span
      data-testid="oh-scope-badge"
      data-scope-type={match?.scopeType ?? 'global'}
      title={formatOhScopeBadge(match)}
      className={[
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase',
        segmented
          ? 'border-[var(--color-teal)]/40 bg-[color-mix(in_srgb,var(--color-teal)_12%,white)] text-[var(--color-ink)]'
          : 'border-[var(--color-line)] bg-white/80 text-[var(--color-muted)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {short ? `OH ${label}` : label}
    </span>
  )
}
