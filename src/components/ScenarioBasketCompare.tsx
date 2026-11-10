/** Multi-row atual + proposed scenarios + per-scenario deltas. */

import type { ReactNode } from 'react'
import type {
  ScenarioBasket,
  ScenarioBasketProposed,
  ScenarioDeltas,
  ScenarioRowMetrics,
} from '../engine'
import type { ScenarioId } from '../engine'

export interface ScenarioBasketCompareProps {
  basket: ScenarioBasket
  variant?: 'screen' | 'print'
  onSelectBest?: (scenarioId: ScenarioId | null) => void
  onRemoveProposed?: (scenarioId: ScenarioId) => void
  onClear?: () => void
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function signedBrl(n: number) {
  const abs = brl(Math.abs(n))
  if (n > 0) return `+${abs}`
  if (n < 0) return `−${abs}`
  return abs
}

function signedNum(n: number, digits = 0) {
  const abs = Math.abs(n).toFixed(digits)
  if (n > 0) return `+${abs}`
  if (n < 0) return `−${abs}`
  return abs
}

function metricCells(m: ScenarioRowMetrics) {
  return {
    scale: m.scale,
    headcount: String(m.headcount),
    payroll: brl(m.payrollMonthly),
    vr: m.vrMonthly != null ? brl(m.vrMonthly) : '—',
    vt: m.vtMonthly != null ? brl(m.vtMonthly) : '—',
  }
}

function deltaCells(d: ScenarioDeltas) {
  return {
    headcount: signedNum(d.headcount),
    payroll: signedBrl(d.payrollMonthly),
    vr: d.vrMonthly != null ? signedBrl(d.vrMonthly) : '—',
    vt: d.vtMonthly != null ? signedBrl(d.vtMonthly) : '—',
  }
}

function RowActions({
  entry,
  isBest,
  variant,
  onSelectBest,
  onRemoveProposed,
  stacked,
}: {
  entry: ScenarioBasketProposed
  isBest: boolean
  variant: 'screen' | 'print'
  onSelectBest?: (scenarioId: ScenarioId | null) => void
  onRemoveProposed?: (scenarioId: ScenarioId) => void
  stacked?: boolean
}) {
  if (variant === 'print') {
    return isBest ? (
      <span className="text-[10px] font-semibold tracking-wide uppercase">
        Melhor
      </span>
    ) : null
  }
  return (
    <div
      className={
        stacked
          ? 'mt-3 flex flex-col gap-2'
          : 'flex flex-wrap items-center gap-2'
      }
    >
      <button
        type="button"
        onClick={() => onSelectBest?.(isBest ? null : entry.scenarioId)}
        className={[
          'border font-semibold tracking-wide uppercase',
          stacked
            ? 'min-h-11 w-full px-3 py-2.5 text-xs'
            : 'px-2 py-1 text-[10px]',
          isBest
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
            : 'border-[var(--color-line)] bg-white text-[var(--color-muted)]',
        ].join(' ')}
      >
        {isBest ? 'Melhor ✓' : 'Marcar melhor'}
      </button>
      {onRemoveProposed ? (
        <button
          type="button"
          onClick={() => onRemoveProposed(entry.scenarioId)}
          className={
            stacked
              ? 'min-h-11 w-full text-xs text-[var(--color-muted)] underline'
              : 'text-[10px] text-[var(--color-muted)] underline'
          }
        >
          Remover
        </button>
      ) : null}
    </div>
  )
}

function MetricDl({
  cells,
}: {
  cells: ReturnType<typeof metricCells>
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <div>
        <dt className="text-[var(--color-muted)]">Escala</dt>
        <dd className="font-medium tabular-nums">{cells.scale}</dd>
      </div>
      <div>
        <dt className="text-[var(--color-muted)]">HC</dt>
        <dd className="font-medium tabular-nums">{cells.headcount}</dd>
      </div>
      <div>
        <dt className="text-[var(--color-muted)]">Folha/mês</dt>
        <dd className="font-semibold tabular-nums">{cells.payroll}</dd>
      </div>
      <div>
        <dt className="text-[var(--color-muted)]">VR / VT</dt>
        <dd className="tabular-nums">
          {cells.vr} · {cells.vt}
        </dd>
      </div>
    </dl>
  )
}

function MobileScenarioCard({
  eyebrow,
  title,
  scheduleHint,
  cells,
  tone,
  actions,
}: {
  eyebrow: string
  title: string
  scheduleHint?: string | null
  cells: ReturnType<typeof metricCells>
  tone: 'current' | 'proposed' | 'best'
  actions?: ReactNode
}) {
  const shell =
    tone === 'best'
      ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
      : tone === 'proposed'
        ? 'border border-[var(--color-line)] bg-white/80'
        : 'border border-[var(--color-line)] bg-[var(--color-accent-soft)]/40'

  return (
    <article className={`p-4 ${shell}`}>
      <p
        className={[
          'text-[10px] font-semibold tracking-[0.14em] uppercase',
          tone === 'current'
            ? 'text-[var(--color-muted)]'
            : 'text-[var(--color-accent)]',
        ].join(' ')}
      >
        {eyebrow}
      </p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <MetricDl cells={cells} />
      {scheduleHint ? (
        <details className="mt-3 border-t border-[var(--color-line)] pt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-muted)]">
            Turnos / horário
          </summary>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
            {scheduleHint}
          </p>
        </details>
      ) : null}
      {actions}
    </article>
  )
}

function MobileDeltaCard({
  entry,
  isBest,
}: {
  entry: ScenarioBasketProposed
  isBest: boolean
}) {
  const d = deltaCells(entry.deltas)
  return (
    <article
      className={[
        'border p-4',
        isBest
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-line)] bg-white/80',
      ].join(' ')}
    >
      <p className="text-sm font-semibold">
        {entry.label}
        {isBest ? (
          <span className="ml-2 text-[10px] font-semibold tracking-wide uppercase text-[var(--color-accent)]">
            Melhor
          </span>
        ) : null}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-[var(--color-muted)]">Δ Folha</dt>
          <dd className="text-sm font-semibold tabular-nums">{d.payroll}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Δ HC</dt>
          <dd className="font-medium tabular-nums">{d.headcount}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Δ VR</dt>
          <dd className="tabular-nums">{d.vr}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Δ VT</dt>
          <dd className="tabular-nums">{d.vt}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--color-muted)]">Gap h/sem</dt>
          <dd className="tabular-nums">
            {signedNum(entry.deltas.uncoveredHoursPerWeek, 0)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

/**
 * Table: top row = atual; rows below = each proposed run in the session.
 * Below: difference block for atual vs EACH proposed.
 * On narrow screens: stacked cards (1 per scenario) + separate Δ cards.
 */
export function ScenarioBasketCompare({
  basket,
  variant = 'screen',
  onSelectBest,
  onRemoveProposed,
  onClear,
}: ScenarioBasketCompareProps) {
  const currentCells = metricCells(basket.current.metrics)
  const isPrint = variant === 'print'

  return (
    <div
      className={
        isPrint ? 'scenario-basket' : 'scenario-basket no-print-skip'
      }
    >
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3
            className={
              isPrint
                ? 'text-base font-semibold tracking-wide uppercase'
                : 'text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase'
            }
          >
            Comparativo multi-cenário
          </h3>
          {!isPrint ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Linha 1 = atual · abaixo = cada proposta simulada nesta sessão.
              Marque a melhor para o relatório.
            </p>
          ) : null}
        </div>
        {!isPrint && onClear && basket.proposed.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-[var(--color-muted)] underline"
          >
            Limpar cesta
          </button>
        ) : null}
      </div>

      {/* Mobile: stacked cards */}
      {!isPrint ? (
        <div className="space-y-3 sm:hidden">
          <MobileScenarioCard
            eyebrow={basket.current.eyebrow}
            title={basket.current.title}
            cells={currentCells}
            tone="current"
          />
          {basket.proposed.length === 0 ? (
            <p className="border border-[var(--color-line)] bg-white/70 px-4 py-3 text-xs text-[var(--color-muted)]">
              Nenhuma proposta na cesta ainda. Simule um cenário PEC
              (conservador ou agressivo) para acrescentar linhas.
            </p>
          ) : (
            basket.proposed.map((p) => {
              const cells = metricCells(p.metrics)
              const isBest = basket.bestScenarioId === p.scenarioId
              return (
                <MobileScenarioCard
                  key={p.scenarioId}
                  eyebrow="Proposto"
                  title={p.label}
                  scheduleHint={p.metrics.scheduleHint}
                  cells={cells}
                  tone={isBest ? 'best' : 'proposed'}
                  actions={
                    <RowActions
                      entry={p}
                      isBest={isBest}
                      variant={variant}
                      onSelectBest={onSelectBest}
                      onRemoveProposed={onRemoveProposed}
                      stacked
                    />
                  }
                />
              )
            })
          )}

          {basket.proposed.length > 0 ? (
            <div className="pt-1">
              <h4 className="text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                Diferença — atual × cada proposta
              </h4>
              <div className="mt-2 space-y-3">
                {basket.proposed.map((p) => (
                  <MobileDeltaCard
                    key={`delta-m-${p.scenarioId}`}
                    entry={p}
                    isBest={basket.bestScenarioId === p.scenarioId}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Desktop / print: tables */}
      <div className={isPrint ? '' : 'hidden sm:block'}>
        <div
          className={
            isPrint
              ? 'overflow-x-auto'
              : 'overflow-x-auto border border-[var(--color-line)] bg-white/70'
          }
        >
          <table
            className={
              isPrint
                ? 'w-full border-collapse text-xs'
                : 'w-full text-left text-xs'
            }
          >
            <thead>
              <tr
                className={
                  isPrint
                    ? 'border-b border-neutral-400 text-left'
                    : 'border-b border-[var(--color-line)] text-[var(--color-muted)]'
                }
              >
                <th className="px-3 py-2 font-normal">Cenário</th>
                <th className="px-3 py-2 font-normal">Escala</th>
                <th className="px-3 py-2 font-normal">HC</th>
                <th className="px-3 py-2 font-normal">Folha/mês</th>
                <th className="px-3 py-2 font-normal">VR/mês</th>
                <th className="px-3 py-2 font-normal">VT/mês</th>
                {!isPrint || basket.bestScenarioId ? (
                  <th className="px-3 py-2 font-normal">Escolha</th>
                ) : (
                  <th className="px-3 py-2 font-normal" />
                )}
              </tr>
            </thead>
            <tbody>
              <tr
                className={
                  isPrint
                    ? 'border-b border-neutral-300 bg-neutral-50'
                    : 'border-b border-[var(--color-line)] bg-[var(--color-accent-soft)]/40'
                }
              >
                <td className="px-3 py-2">
                  <span className="block text-[10px] font-semibold tracking-wide text-[var(--color-muted)] uppercase print:text-neutral-600">
                    {basket.current.eyebrow}
                  </span>
                  <span className="font-medium">{basket.current.title}</span>
                </td>
                <td className="px-3 py-2 font-medium tabular-nums">
                  {currentCells.scale}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {currentCells.headcount}
                </td>
                <td className="px-3 py-2 tabular-nums">{currentCells.payroll}</td>
                <td className="px-3 py-2 tabular-nums">{currentCells.vr}</td>
                <td className="px-3 py-2 tabular-nums">{currentCells.vt}</td>
                <td className="px-3 py-2 text-[var(--color-muted)] print:text-neutral-500">
                  —
                </td>
              </tr>
              {basket.proposed.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-3 text-[var(--color-muted)] print:text-neutral-600"
                  >
                    Nenhuma proposta na cesta ainda. Simule um cenário PEC
                    (conservador ou agressivo) para acrescentar linhas.
                  </td>
                </tr>
              ) : (
                basket.proposed.map((p) => {
                  const cells = metricCells(p.metrics)
                  const isBest = basket.bestScenarioId === p.scenarioId
                  return (
                    <tr
                      key={p.scenarioId}
                      className={[
                        isPrint
                          ? 'border-b border-neutral-200'
                          : 'border-b border-[var(--color-line)]',
                        isBest
                          ? isPrint
                            ? 'bg-neutral-100'
                            : 'bg-[var(--color-accent-soft)]'
                          : '',
                      ].join(' ')}
                    >
                      <td className="px-3 py-2">
                        <span className="block text-[10px] font-semibold tracking-wide text-[var(--color-accent)] uppercase print:text-neutral-800">
                          Proposto
                        </span>
                        <span className="font-medium">{p.label}</span>
                        {p.metrics.scheduleHint ? (
                          <span className="mt-0.5 block text-[10px] text-[var(--color-muted)] print:text-neutral-600">
                            {p.metrics.scheduleHint}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-medium tabular-nums">
                        {cells.scale}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{cells.headcount}</td>
                      <td className="px-3 py-2 tabular-nums">{cells.payroll}</td>
                      <td className="px-3 py-2 tabular-nums">{cells.vr}</td>
                      <td className="px-3 py-2 tabular-nums">{cells.vt}</td>
                      <td className="px-3 py-2">
                        <RowActions
                          entry={p}
                          isBest={isBest}
                          variant={variant}
                          onSelectBest={onSelectBest}
                          onRemoveProposed={onRemoveProposed}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {basket.proposed.length > 0 ? (
          <div className="mt-4">
            <h4
              className={
                isPrint
                  ? 'text-sm font-semibold tracking-wide uppercase'
                  : 'text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase'
              }
            >
              Diferença — atual × cada proposta
            </h4>
            <div
              className={
                isPrint
                  ? 'mt-2 overflow-x-auto'
                  : 'mt-2 overflow-x-auto border border-[var(--color-line)] bg-white/70'
              }
            >
              <table
                className={
                  isPrint
                    ? 'w-full border-collapse text-xs'
                    : 'w-full text-left text-xs'
                }
              >
                <thead>
                  <tr
                    className={
                      isPrint
                        ? 'border-b border-neutral-400 text-left'
                        : 'border-b border-[var(--color-line)] text-[var(--color-muted)]'
                    }
                  >
                    <th className="px-3 py-2 font-normal">Proposta</th>
                    <th className="px-3 py-2 font-normal">Δ HC</th>
                    <th className="px-3 py-2 font-normal">Δ Folha</th>
                    <th className="px-3 py-2 font-normal">Δ VR</th>
                    <th className="px-3 py-2 font-normal">Δ VT</th>
                    <th className="px-3 py-2 font-normal">Gap h/sem</th>
                  </tr>
                </thead>
                <tbody>
                  {basket.proposed.map((p) => {
                    const d = deltaCells(p.deltas)
                    const isBest = basket.bestScenarioId === p.scenarioId
                    return (
                      <tr
                        key={`delta-${p.scenarioId}`}
                        className={[
                          isPrint
                            ? 'border-b border-neutral-200'
                            : 'border-b border-[var(--color-line)]',
                          isBest
                            ? isPrint
                              ? 'bg-neutral-100'
                              : 'bg-[var(--color-accent-soft)]'
                            : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2 font-medium">
                          {p.label}
                          {isBest ? (
                            <span className="ml-2 text-[10px] font-semibold tracking-wide uppercase text-[var(--color-accent)] print:text-neutral-800">
                              Melhor
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{d.headcount}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">
                          {d.payroll}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{d.vr}</td>
                        <td className="px-3 py-2 tabular-nums">{d.vt}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {signedNum(p.deltas.uncoveredHoursPerWeek, 0)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
