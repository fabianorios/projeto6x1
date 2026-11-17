/** Colloquial “Por que esses números” block for Passo 5 scenario projections. */

export interface ScenarioWhyPanelProps {
  bullets: string[]
  /** Optional scenario label (multi-basket rows). */
  scenarioLabel?: string
  variant?: 'screen' | 'print'
}

export function ScenarioWhyPanel({
  bullets,
  scenarioLabel,
  variant = 'screen',
}: ScenarioWhyPanelProps) {
  if (bullets.length === 0) return null

  const isPrint = variant === 'print'
  const title = scenarioLabel
    ? `Por que esses números — ${scenarioLabel}`
    : 'Por que esses números'

  return (
    <aside
      className={
        isPrint
          ? 'mt-3 border border-neutral-300 bg-neutral-50 px-3 py-3 text-xs'
          : 'border border-[var(--color-line)] bg-[var(--color-accent-soft)]/35 px-4 py-4'
      }
      aria-label={title}
    >
      <h3
        className={
          isPrint
            ? 'text-sm font-semibold tracking-wide uppercase'
            : 'text-sm font-semibold text-[var(--color-ink)]'
        }
      >
        {title}
      </h3>
      {!isPrint ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Leitura rápida baseline × proposto — como a gente explica em reunião.
        </p>
      ) : null}
      <ul
        className={
          isPrint
            ? 'mt-2 list-disc space-y-1.5 pl-4 leading-relaxed text-neutral-800'
            : 'mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-ink)]'
        }
      >
        {bullets.map((b, i) => (
          <li key={`${i}-${b.slice(0, 24)}`}>{b}</li>
        ))}
      </ul>
    </aside>
  )
}
