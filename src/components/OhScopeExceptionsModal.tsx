/**
 * Modal CRUD for segmented OHScopeRule (publico / centro_custo / cargo).
 * Global OH stays on Premissas; this only edits exceptions.
 */

import { useMemo, useState } from 'react'
import {
  OH_SCOPE_TYPES,
  DEFAULT_OPERATING_HOURS,
  ohWindowToOperatingHours,
  operatingHoursToOhWindow,
  type OHScopeRule,
  type OHScopeType,
  type OperatingHours,
  type PayrollRow,
} from '../engine'
import { OH_SCOPE_TYPE_LABELS } from '../utils/ohScopeBadge'
import { OperatingHoursFields } from './OperatingHoursFields'

const EXCEPTION_TYPES: OHScopeType[] = ['publico', 'centro_custo', 'cargo']

export type OhScopeExceptionsModalProps = {
  open: boolean
  onClose: () => void
  /** Full rules list (may include global). */
  rules: OHScopeRule[]
  onChange: (next: OHScopeRule[]) => void
  /** Optional Folha for target suggestions. */
  payrollRows?: PayrollRow[]
}

function newBlankRule(): {
  scope_type: OHScopeType
  target_value: string
  hours: OperatingHours
} {
  return {
    scope_type: 'centro_custo',
    target_value: '',
    hours: { ...DEFAULT_OPERATING_HOURS, default: { ...DEFAULT_OPERATING_HOURS.default } },
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )
}

export function OhScopeExceptionsModal({
  open,
  onClose,
  rules,
  onChange,
  payrollRows = [],
}: OhScopeExceptionsModalProps) {
  const exceptions = useMemo(
    () => rules.filter((r) => r.scope_type !== 'global'),
    [rules],
  )
  const [draft, setDraft] = useState(newBlankRule)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const cargoSuggestions = useMemo(
    () =>
      uniqueSorted(
        payrollRows.flatMap((r) => [
          r.cargo ?? '',
          r.descCargo ?? '',
          r.codCargo ?? '',
        ]),
      ),
    [payrollRows],
  )
  const ccSuggestions = useMemo(
    () =>
      uniqueSorted(
        payrollRows.flatMap((r) => [
          r.codCc ?? '',
          r.centroCusto ?? '',
          r.descCc ?? '',
        ]),
      ),
    [payrollRows],
  )

  if (!open) return null

  function persistExceptions(nextExceptions: OHScopeRule[]) {
    const global = rules.filter((r) => r.scope_type === 'global')
    onChange([...global, ...nextExceptions])
  }

  function startEdit(i: number) {
    const rule = exceptions[i]
    if (!rule) return
    setEditIndex(i)
    setDraft({
      scope_type: rule.scope_type,
      target_value: rule.target_value,
      hours: ohWindowToOperatingHours(rule.operating_hours),
    })
  }

  function cancelEdit() {
    setEditIndex(null)
    setDraft(newBlankRule())
  }

  function saveDraft() {
    const target = draft.target_value.trim()
    if (!target) return
    if (!EXCEPTION_TYPES.includes(draft.scope_type)) return
    const rule: OHScopeRule = {
      scope_type: draft.scope_type,
      target_value: target,
      operating_hours: operatingHoursToOhWindow(draft.hours),
    }
    const next = [...exceptions]
    if (editIndex != null && editIndex >= 0 && editIndex < next.length) {
      next[editIndex] = rule
    } else {
      next.push(rule)
    }
    persistExceptions(next)
    cancelEdit()
  }

  function removeAt(i: number) {
    persistExceptions(exceptions.filter((_, idx) => idx !== i))
    if (editIndex === i) cancelEdit()
    else if (editIndex != null && editIndex > i) setEditIndex(editIndex - 1)
  }

  const suggestions =
    draft.scope_type === 'cargo'
      ? cargoSuggestions
      : draft.scope_type === 'centro_custo'
        ? ccSuggestions
        : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oh-exceptions-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="oh-exceptions-title"
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              Exceções de horário (OH)
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Override por público, centro de custo ou cargo. Cascata no motor:
              cargo → CC → público → global. O horário global permanece nas
              Premissas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {exceptions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Nenhuma exceção. Todo o quadro usa o OH global.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] bg-white">
              {exceptions.map((r, i) => (
                <li
                  key={`${r.scope_type}-${r.target_value}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {OH_SCOPE_TYPE_LABELS[r.scope_type] ?? r.scope_type}
                    </span>
                    {': '}
                    <span>{r.target_value}</span>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {r.operating_hours.abertura}–{r.operating_hours.fechamento}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-[var(--color-teal)] underline"
                      onClick={() => startEdit(i)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[var(--color-muted)] underline"
                      onClick={() => removeAt(i)}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="mt-5 space-y-3 border border-[var(--color-line)] bg-white/80 p-3">
          <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            {editIndex != null ? 'Editar exceção' : 'Nova exceção'}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Escopo</span>
              <select
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                value={draft.scope_type}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    scope_type: e.target.value as OHScopeType,
                  }))
                }
              >
                {EXCEPTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {OH_SCOPE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Alvo</span>
              <input
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                list="oh-exception-target-suggestions"
                value={draft.target_value}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, target_value: e.target.value }))
                }
                placeholder={
                  draft.scope_type === 'publico'
                    ? 'Ex.: Administrativo'
                    : draft.scope_type === 'centro_custo'
                      ? 'Código ou descrição do CC'
                      : 'Cargo / descrição'
                }
              />
              {suggestions.length > 0 ? (
                <datalist id="oh-exception-target-suggestions">
                  {suggestions.slice(0, 80).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ) : null}
            </label>
          </div>
          <OperatingHoursFields
            value={draft.hours}
            onChange={(hours) => setDraft((d) => ({ ...d, hours }))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draft.target_value.trim()}
              className="bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {editIndex != null ? 'Salvar alteração' : 'Adicionar exceção'}
            </button>
            {editIndex != null ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-muted)]"
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </fieldset>

        <p className="mt-3 text-[10px] text-[var(--color-muted)]">
          Escopos válidos no DTO:{' '}
          {OH_SCOPE_TYPES.filter((t) => t !== 'global').join(', ')}. Persistidos
          em <code>ohScopeRules</code> na simulação.
        </p>
      </div>
    </div>
  )
}
