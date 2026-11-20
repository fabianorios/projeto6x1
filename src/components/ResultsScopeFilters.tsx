/**
 * Passo 5 — Filial / CC / Sindicato filters.
 * CC supports busca por código e/ou descrição (dual-label options).
 */

import type {
  DossierCentroCustoOption,
  DossierEstablishmentOption,
  DossierSindicatoOption,
} from '../utils/resultsDossier'

export type ResultsScopeFiltersProps = {
  establishments: DossierEstablishmentOption[]
  ccOptions: DossierCentroCustoOption[]
  sindicatoOptions: DossierSindicatoOption[]
  filterCnpj: string
  filterCc: string
  filterSindicato: string
  onFilterCnpj: (next: string) => void
  onFilterCc: (next: string) => void
  onFilterSindicato: (next: string) => void
  visibleCount: number
  totalCount: number
}

export function ResultsScopeFilters({
  establishments,
  ccOptions,
  sindicatoOptions,
  filterCnpj,
  filterCc,
  filterSindicato,
  onFilterCnpj,
  onFilterCc,
  onFilterSindicato,
  visibleCount,
  totalCount,
}: ResultsScopeFiltersProps) {
  const active = Boolean(filterCnpj || filterCc || filterSindicato)

  const ccSelectValue = ccOptions.some((o) => o.key === filterCc)
    ? filterCc
    : ''

  return (
    <div
      className="mt-3 space-y-2 quiet-panel p-3"
      data-testid="results-scope-filters"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--color-ink)]">
            Onde olhar na reunião?
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            Recorte por filial, centro ou sindicato — sem recalcular.
          </p>
        </div>
        <p className="text-[10px] tabular-nums text-[var(--color-muted)]">
          {active
            ? `${visibleCount} de ${totalCount} centro(s)`
            : `${totalCount} centro(s)`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-[var(--color-ink)]">
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Filial
          </span>
          <select
            value={filterCnpj}
            onChange={(e) => {
              const next = e.target.value
              onFilterCnpj(next)
              if (filterCc && next) {
                const est = establishments.find((x) => x.key === next)
                if (
                  est &&
                  !est.centroCustos.includes(filterCc) &&
                  !ccOptions.some(
                    (o) =>
                      o.key === filterCc &&
                      est.centroCustos.includes(o.key),
                  )
                ) {
                  // Keep free-text search; clear only exact picks outside filial.
                  if (ccSelectValue) onFilterCc('')
                }
              }
            }}
            className="mt-1 block min-h-10 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
            disabled={establishments.length === 0}
          >
            <option value="">
              {establishments.length === 0
                ? 'Todas (sem CNPJ na folha)'
                : 'Todas as filiais'}
            </option>
            {establishments.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-[var(--color-ink)]">
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Centro de custo
          </span>
          <select
            value={ccSelectValue}
            onChange={(e) => onFilterCc(e.target.value)}
            className="mt-1 block min-h-10 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Todos os centros</option>
            {ccOptions.map((cc) => (
              <option key={cc.key} value={cc.key}>
                {cc.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={filterCc}
            onChange={(e) => onFilterCc(e.target.value)}
            placeholder="Buscar código ou descrição…"
            className="mt-1 block min-h-9 w-full border border-[var(--color-line)] bg-white px-2 py-1 text-sm"
            aria-label="Buscar centro de custo por código ou descrição"
            data-testid="results-cc-search"
          />
        </label>
        <label className="block text-xs text-[var(--color-ink)]">
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Sindicato
          </span>
          <select
            value={filterSindicato}
            onChange={(e) => onFilterSindicato(e.target.value)}
            className="mt-1 block min-h-10 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
            disabled={sindicatoOptions.length === 0}
          >
            <option value="">
              {sindicatoOptions.length === 0
                ? 'Todos (sem sindicato na folha)'
                : 'Todos os sindicatos'}
            </option>
            {sindicatoOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
