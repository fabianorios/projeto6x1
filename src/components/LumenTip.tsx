/**
 * Short editorial Lumen whisper — decision tips, empty states.
 */
import type { ReactNode } from 'react'

export type LumenTipProps = {
  children: ReactNode
  className?: string
}

export function LumenTip({ children, className = '' }: LumenTipProps) {
  return (
    <p className={`lumen-tip ${className}`} data-testid="lumen-tip">
      <span aria-hidden className="mt-0.5 shrink-0 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-green)] uppercase">
        Lumen
      </span>
      <span>{children}</span>
    </p>
  )
}

/** Light empty-state illustration + tip (no stock photo). */
export function EditorialEmptyState({
  title,
  tip,
}: {
  title: string
  tip: string
}) {
  return (
    <div className="empty-state-art" data-testid="editorial-empty-state">
      <svg
        width="72"
        height="48"
        viewBox="0 0 72 48"
        fill="none"
        aria-hidden
      >
        <rect
          x="4"
          y="8"
          width="64"
          height="32"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity="0.45"
        />
        <path
          d="M12 28h10M12 22h18M40 22h20M40 28h12"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="58" cy="14" r="3" fill="currentColor" opacity="0.25" />
      </svg>
      <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
      <LumenTip>{tip}</LumenTip>
    </div>
  )
}
