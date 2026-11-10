/** Two-column Atual × Proposto comparison — screen + print. */

export interface ScenarioSideMetrics {
  /** Column eyebrow, e.g. "Cenário atual". */
  eyebrow: string
  /** Short label under the eyebrow. */
  title: string
  scale: string
  /** Optional operational schedule hint (suggested hours). */
  scheduleHint?: string | null
  headcount: number
  /** Monthly salary mass (baseline or projected). */
  payrollMonthly: number
  vrMonthly: number | null
  vtMonthly: number | null
}

export interface ScenarioComparePanelProps {
  current: ScenarioSideMetrics
  proposed: ScenarioSideMetrics
  /** Optional delta line under the columns. */
  footerNote?: string
  /** Visual density. */
  variant?: 'screen' | 'print'
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function MetricRow({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] py-2 last:border-b-0 print:border-neutral-200">
      <span
        className={[
          'text-xs',
          muted
            ? 'text-[var(--color-muted)] print:text-neutral-500'
            : 'text-[var(--color-muted)] print:text-neutral-600',
        ].join(' ')}
      >
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-[var(--color-ink)] print:text-black">
        {value}
      </span>
    </div>
  )
}

function SideCard({
  side,
  tone,
  variant,
}: {
  side: ScenarioSideMetrics
  tone: 'current' | 'proposed'
  variant: 'screen' | 'print'
}) {
  const isProposed = tone === 'proposed'
  const shell =
    variant === 'print'
      ? isProposed
        ? 'border-2 border-neutral-800 bg-neutral-50'
        : 'border border-neutral-300 bg-white'
      : isProposed
        ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
        : 'border border-[var(--color-line)] bg-white/80'

  return (
    <div className={`relative flex flex-col p-4 ${shell}`}>
      <p
        className={[
          'sticky top-14 z-10 -mx-4 -mt-4 mb-2 border-b border-[var(--color-line)]/60 px-4 py-2 text-[10px] font-semibold tracking-[0.16em] uppercase backdrop-blur-sm sm:static sm:z-auto sm:mx-0 sm:mt-0 sm:mb-0 sm:border-0 sm:px-0 sm:py-0 sm:backdrop-blur-none',
          isProposed
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] print:static print:bg-transparent print:text-neutral-900'
            : 'bg-white/90 text-[var(--color-muted)] print:static print:bg-transparent print:text-neutral-600',
        ].join(' ')}
      >
        {side.eyebrow}
      </p>
      <p className="mt-1 text-base font-semibold text-[var(--color-ink)] print:text-black">
        {side.title}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-muted)] print:text-neutral-600">
        Escala: <strong className="text-[var(--color-ink)] print:text-black">{side.scale}</strong>
        {side.scheduleHint ? (
          <>
            <br />
            {side.scheduleHint}
          </>
        ) : null}
      </p>
      <div className="mt-3 flex-1">
        <MetricRow label="Headcount" value={String(side.headcount)} />
        <MetricRow label="Folha mensal" value={brl(side.payrollMonthly)} />
        <MetricRow
          label="VR mensal"
          value={side.vrMonthly != null ? brl(side.vrMonthly) : '—'}
          muted={side.vrMonthly == null}
        />
        <MetricRow
          label="VT mensal"
          value={side.vtMonthly != null ? brl(side.vtMonthly) : '—'}
          muted={side.vtMonthly == null}
        />
      </div>
    </div>
  )
}

/**
 * Always renders two equal columns: Cenário atual | Cenário proposto.
 */
export function ScenarioComparePanel({
  current,
  proposed,
  footerNote,
  variant = 'screen',
}: ScenarioComparePanelProps) {
  return (
    <div
      className={
        variant === 'print'
          ? 'scenario-compare'
          : 'scenario-compare no-print-skip'
      }
    >
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h3
          className={
            variant === 'print'
              ? 'text-base font-semibold tracking-wide uppercase'
              : 'text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase'
          }
        >
          Cenário atual × Cenário proposto
        </h3>
        {variant === 'screen' ? (
          <p className="text-xs text-[var(--color-muted)]">
            Lado a lado para visualizar o impacto
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SideCard side={current} tone="current" variant={variant} />
        <SideCard side={proposed} tone="proposed" variant={variant} />
      </div>
      {footerNote ? (
        <p
          className={
            variant === 'print'
              ? 'mt-2 text-xs text-neutral-600'
              : 'mt-2 text-xs text-[var(--color-muted)]'
          }
        >
          {footerNote}
        </p>
      ) : null}
    </div>
  )
}

/** Build compare sides from a finished SimulationResult-like snapshot. */
export function sidesFromSimulation(args: {
  currentScale: string
  proposedScaleLabel: string
  proposedTitle: string
  currentHeadcount: number
  proposedHeadcount: number
  baselinePayroll: number
  projectedPayroll: number
  vrCurrent: number | null
  vrProposed: number | null
  vtCurrent: number | null
  vtProposed: number | null
  scheduleHint?: string | null
}): { current: ScenarioSideMetrics; proposed: ScenarioSideMetrics } {
  return {
    current: {
      eyebrow: 'Cenário atual',
      title: 'Status quo (escala informada)',
      scale: args.currentScale,
      headcount: args.currentHeadcount,
      payrollMonthly: args.baselinePayroll,
      vrMonthly: args.vrCurrent,
      vtMonthly: args.vtCurrent,
    },
    proposed: {
      eyebrow: 'Cenário proposto',
      title: args.proposedTitle,
      scale: args.proposedScaleLabel,
      scheduleHint: args.scheduleHint,
      headcount: args.proposedHeadcount,
      payrollMonthly: args.projectedPayroll,
      vrMonthly: args.vrProposed,
      vtMonthly: args.vtProposed,
    },
  }
}
