/** Passo 5 — PT-BR summary of where HC sobe (Filial → CC → cargo). */

import {
  formatHcTriple,
  type HcIncreaseSummary as HcIncreaseSummaryData,
} from '../utils/hcIncreaseSummary'

export interface HcIncreaseSummaryProps {
  summary: HcIncreaseSummaryData
  variant?: 'screen' | 'print'
}

export function HcIncreaseSummary({
  summary,
  variant = 'screen',
}: HcIncreaseSummaryProps) {
  const isPrint = variant === 'print'
  const multiFilial = summary.filiais.length > 1

  return (
    <aside
      className={
        isPrint
          ? 'mt-6 border border-neutral-300 bg-neutral-50 px-3 py-3 text-xs'
          : 'border border-[var(--color-line)] bg-white/80 px-4 py-4'
      }
      aria-labelledby={isPrint ? undefined : 'hc-increase-summary-title'}
    >
      <h3
        id={isPrint ? undefined : 'hc-increase-summary-title'}
        className={
          isPrint
            ? 'text-sm font-semibold tracking-wide uppercase'
            : 'text-sm font-semibold text-[var(--color-ink)]'
        }
      >
        Onde o HC sobe
      </h3>
      <p
        className={
          isPrint
            ? 'mt-1 text-neutral-600'
            : 'mt-1 text-xs text-[var(--color-muted)]'
        }
      >
        Só locais com aumento (atual → proposto)
        {summary.hasCargoDetail ? ' · Filial → centro de custo → cargo' : ''}.
        Total nos pontos listados:{' '}
        <span className="font-medium tabular-nums text-[var(--color-ink)]">
          {formatHcTriple(summary.total)}
        </span>
      </p>

      <ul
        className={
          isPrint
            ? 'mt-3 space-y-2 text-neutral-800'
            : 'mt-3 space-y-2 text-sm text-[var(--color-ink)]'
        }
      >
        {summary.filiais.map((filial) => {
          const showFilialHeader =
            multiFilial || filial.key !== '__geral__' || filial.label !== 'Geral'
          return (
            <li key={filial.key}>
              {showFilialHeader ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-semibold">{filial.label}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">
                    {formatHcTriple(filial)}
                  </span>
                </div>
              ) : null}
              <ul
                className={
                  showFilialHeader
                    ? isPrint
                      ? 'mt-1 space-y-1.5 border-l border-neutral-300 pl-3'
                      : 'mt-1.5 space-y-1.5 border-l border-[var(--color-line)] pl-3'
                    : 'space-y-1.5'
                }
              >
                {filial.centros.map((cc) => {
                  const hideCcHeader =
                    !showFilialHeader &&
                    cc.centroCusto === 'Geral' &&
                    cc.cargos.length === 0
                  return (
                    <li key={`${filial.key}-${cc.centroCusto}`}>
                      {hideCcHeader ? (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="font-medium">Quadro geral</span>
                          <span className="tabular-nums font-medium">
                            {formatHcTriple(cc)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="font-medium">{cc.centroCusto}</span>
                          <span
                            className={
                              isPrint
                                ? 'tabular-nums text-neutral-600'
                                : 'tabular-nums text-[var(--color-muted)]'
                            }
                          >
                            {formatHcTriple(cc)}
                          </span>
                        </div>
                      )}
                      {cc.cargos.length > 0 ? (
                        <ul
                          className={
                            isPrint
                              ? 'mt-1 space-y-0.5 border-l border-neutral-200 pl-3'
                              : 'mt-1 space-y-0.5 border-l border-[var(--color-line)] pl-3'
                          }
                        >
                          {cc.cargos.map((cargo) => (
                            <li
                              key={`${filial.key}-${cc.centroCusto}-${cargo.cargo}`}
                              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                            >
                              <span>{cargo.cargo}</span>
                              <span className="tabular-nums font-medium">
                                {formatHcTriple(cargo)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
