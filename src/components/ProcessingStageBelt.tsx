/**
 * Quiet Chrome — visual stage belt for extraction / simulate processing.
 * Discrete steps instead of a generic spinner.
 */

export type ProcessingStageItem = {
  id: string
  label: string
  /** short supporting phrase (decision intent). */
  hint?: string
}

export type ProcessingStageBeltProps = {
  stages: ProcessingStageItem[]
  /** 0-based index of the active stage; stages before are done. */
  activeIndex: number
  /** Optional percent for the thin fill under the belt. */
  pct?: number
  className?: string
  /** Accessible live status label. */
  statusLabel?: string
}

export function ProcessingStageBelt({
  stages,
  activeIndex,
  pct,
  className = '',
  statusLabel,
}: ProcessingStageBeltProps) {
  const safeIndex = Math.max(0, Math.min(activeIndex, stages.length - 1))
  const live = statusLabel ?? stages[safeIndex]?.label ?? 'Processando…'

  return (
    <div
      className={`mt-3 space-y-3 ${className}`}
      role="status"
      aria-live="polite"
      data-testid="processing-stage-belt"
    >
      <ol className="flex flex-wrap items-stretch gap-0">
        {stages.map((stage, i) => {
          const done = i < safeIndex
          const active = i === safeIndex
          return (
            <li
              key={stage.id}
              className="flex min-w-[7.5rem] flex-1 items-stretch"
            >
              <div
                className={[
                  'flex w-full flex-col border px-3 py-2.5',
                  i === 0 ? '' : 'border-l-0',
                  done
                    ? 'border-[var(--color-line)] bg-[var(--color-accent-soft)]'
                    : active
                      ? 'border-[var(--color-green)] bg-[var(--color-surface)]'
                      : 'border-[var(--color-line)] bg-[var(--color-surface)]/70 opacity-70',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-[10px] font-semibold tracking-[0.12em] uppercase',
                    done || active
                      ? 'text-[var(--color-green)]'
                      : 'text-[var(--color-muted)]',
                  ].join(' ')}
                >
                  {done ? 'Concluído' : active ? 'Em curso' : 'A seguir'} ·{' '}
                  {i + 1}/{stages.length}
                </span>
                <span
                  className={[
                    'mt-0.5 text-sm font-medium',
                    active
                      ? 'text-[var(--color-ink)]'
                      : 'text-[var(--color-muted)]',
                  ].join(' ')}
                >
                  {stage.label}
                </span>
                {stage.hint ? (
                  <span className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {stage.hint}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {pct != null ? (
        <div
          className="h-1.5 w-full overflow-hidden border border-[var(--color-line)] bg-[var(--color-paper)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={live}
        >
          <div
            className="h-full bg-[var(--color-green)] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      ) : null}
      <p className="text-xs text-[var(--color-muted)] tabular-nums">{live}</p>
    </div>
  )
}

/** Simulate pipeline stages (Passo 4 → 5). */
export const SIMULATE_STAGE_BELT: ProcessingStageItem[] = [
  {
    id: 'send',
    label: 'Enviar premissas',
    hint: 'Empacota o que você decidiu',
  },
  {
    id: 'calc',
    label: 'Calcular impacto',
    hint: 'HC, folha e benefícios',
  },
  {
    id: 'assemble',
    label: 'Montar dossiê',
    hint: 'Resultados prontos para a reunião',
  },
]

/** Extraction / folha load stages. */
export const EXTRACT_STAGE_BELT: ProcessingStageItem[] = [
  {
    id: 'connect',
    label: 'Ler origem',
    hint: 'Conexão ou arquivo',
  },
  {
    id: 'aggregate',
    label: 'Agregar folha',
    hint: 'Cargo × centro × escala',
  },
  {
    id: 'ready',
    label: 'Pronto para premissas',
    hint: 'Revise antes de simular',
  },
]
