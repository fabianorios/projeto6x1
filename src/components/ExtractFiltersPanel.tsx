/**
 * Premissas / Escopo filters for extract: Situações + Vínculos (categoria/regime).
 */

import {
  DEFAULT_EXCLUDED_SITUACOES,
  DEFAULT_TIPO_REGIME_TRABALHISTA_IDS,
  SITUACAO_FILTER_HELP,
  VINCULO_FILTER_HELP,
  defaultCategTrabeSocIds,
  type CategTrabeSocCatalogRow,
  type SituacaoCatalogRow,
  type TipoRegimeTrabalhistaCatalogRow,
} from '../apdata/extractFilters'

/** Fallback when Situacoes catalog is unavailable. */
export const FALLBACK_SITUACOES: SituacaoCatalogRow[] = [
  { code: 0, label: 'Nenhuma', oplAfastamento: false },
  { code: 1, label: 'Em Atividade Normal', oplAfastamento: false },
  { code: 2, label: 'Demitido em Meses Anteriores', oplAfastamento: true },
  { code: 3, label: 'Demitido no Mês', oplAfastamento: true },
  { code: 99, label: 'Excluído Logicamente', oplAfastamento: true },
]

/** eSocial TiposRegimesTrabalhistas when catalog missing. */
export const FALLBACK_REGIMES: TipoRegimeTrabalhistaCatalogRow[] = [
  { code: 1, label: 'CLT', cos: '1' },
  { code: 2, label: 'Estatutário', cos: '2' },
  { code: 3, label: 'Não se aplica', cos: '3' },
]

export type ExtractFiltersState = {
  /** Codes currently excluded (NOT IN). */
  excludeSituacoes: number[]
  incluirAfastados: boolean
  tipoRegimeTrabalhistaIds: number[]
  categTrabeSocIds: number[]
  /** When true and categ list empty → SQL uses SDK_OplVinculoEmpregaticio=1. */
  somenteEmpregaticios: boolean
}

export function defaultExtractFiltersState(
  categs: CategTrabeSocCatalogRow[] = [],
): ExtractFiltersState {
  const empregatícios = defaultCategTrabeSocIds(categs)
  return {
    excludeSituacoes: [...DEFAULT_EXCLUDED_SITUACOES],
    incluirAfastados: true,
    tipoRegimeTrabalhistaIds: [...DEFAULT_TIPO_REGIME_TRABALHISTA_IDS],
    categTrabeSocIds: empregatícios,
    somenteEmpregaticios: true,
  }
}

type Props = {
  value: ExtractFiltersState
  onChange: (next: ExtractFiltersState) => void
  situacoes?: SituacaoCatalogRow[]
  regimes?: TipoRegimeTrabalhistaCatalogRow[]
  categs?: CategTrabeSocCatalogRow[]
  compact?: boolean
}

function toggleId(list: number[], id: number, on: boolean): number[] {
  if (on) return list.includes(id) ? list : [...list, id].sort((a, b) => a - b)
  return list.filter((x) => x !== id)
}

export function ExtractFiltersPanel({
  value,
  onChange,
  situacoes,
  regimes,
  categs,
  compact,
}: Props) {
  const sitRows =
    situacoes && situacoes.length > 0 ? situacoes : FALLBACK_SITUACOES
  const regimeRows =
    regimes && regimes.length > 0 ? regimes : FALLBACK_REGIMES
  const categRows = categs ?? []

  const excluded = new Set(value.excludeSituacoes)

  return (
    <div className="space-y-4 border border-[var(--color-line)] bg-white/80 px-3 py-3">
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          Recorte do extract — Situações & Vínculos
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {SITUACAO_FILTER_HELP}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.incluirAfastados}
          onChange={(e) =>
            onChange({ ...value, incluirAfastados: e.target.checked })
          }
        />
        <span>
          <span className="font-medium">Incluir afastados</span>
          <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
            Ligado (padrão): mantém licenças/afastamentos. Desligado: exclui
            códigos com SIT_OplAfastamento=1 (demitidos 2/3/99 já estão na lista
            padrão).
          </span>
        </span>
      </label>

      <div>
        <p className="text-sm font-medium">Situações excluídas</p>
        <p className="text-xs text-[var(--color-muted)]">
          Desmarque para incluir no extract; marcados entram no NOT IN.
        </p>
        <ul
          className={[
            'mt-2 space-y-1 overflow-y-auto text-sm',
            compact ? 'max-h-36' : 'max-h-56',
          ].join(' ')}
        >
          {sitRows
            .filter((s) => !s.oplDesativado)
            .map((s) => {
              const isExcluded = excluded.has(s.code)
              return (
                <li key={s.code}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isExcluded}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          excludeSituacoes: toggleId(
                            value.excludeSituacoes,
                            s.code,
                            e.target.checked,
                          ),
                        })
                      }
                    />
                    <span>
                      <span className="font-mono text-xs">{s.code}</span>{' '}
                      {s.label}
                      {s.oplAfastamento ? (
                        <span className="ml-1 text-xs text-[var(--color-muted)]">
                          (afast.)
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              )
            })}
        </ul>
      </div>

      <div className="border-t border-[var(--color-line)] pt-3">
        <p className="text-sm font-medium">Vínculos (categoria & regime)</p>
        <p className="text-xs text-[var(--color-muted)]">{VINCULO_FILTER_HELP}</p>

        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.somenteEmpregaticios}
            onChange={(e) => {
              const on = e.target.checked
              onChange({
                ...value,
                somenteEmpregaticios: on,
                categTrabeSocIds: on
                  ? defaultCategTrabeSocIds(categRows)
                  : value.categTrabeSocIds,
              })
            }}
          />
          <span>
            Somente vínculos empregatícios
            <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
              Usa SDK_OplVinculoEmpregaticio=1 (ou a lista de categorias abaixo).
            </span>
          </span>
        </label>

        <p className="mt-3 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          Tipo de regime trabalhista
        </p>
        <ul className="mt-1 space-y-1 text-sm">
          {regimeRows.map((r) => {
            const checked = value.tipoRegimeTrabalhistaIds.includes(r.code)
            return (
              <li key={r.code}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        tipoRegimeTrabalhistaIds: toggleId(
                          value.tipoRegimeTrabalhistaIds,
                          r.code,
                          e.target.checked,
                        ),
                      })
                    }
                  />
                  <span>
                    <span className="font-mono text-xs">{r.code}</span> {r.label}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {categRows.length > 0 ? (
          <>
            <p className="mt-3 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Categoria do trabalhador (eSocial)
            </p>
            <ul
              className={[
                'mt-1 space-y-1 overflow-y-auto text-sm',
                compact ? 'max-h-36' : 'max-h-56',
              ].join(' ')}
            >
              {categRows.map((c) => {
                const checked = value.categTrabeSocIds.includes(c.code)
                return (
                  <li key={c.code}>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            categTrabeSocIds: toggleId(
                              value.categTrabeSocIds,
                              c.code,
                              e.target.checked,
                            ),
                            somenteEmpregaticios: false,
                          })
                        }
                      />
                      <span>
                        <span className="font-mono text-xs">{c.code}</span>{' '}
                        {c.label}
                        {c.oplVinculoEmpregaticio ? (
                          <span className="ml-1 text-xs text-[var(--color-muted)]">
                            (empregatício)
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Catálogo de categorias indisponível — extract usa a flag
            empregatícia no SQL quando a opção acima está ligada.
          </p>
        )}
      </div>
    </div>
  )
}
