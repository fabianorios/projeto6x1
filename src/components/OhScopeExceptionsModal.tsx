/**
 * Modal CRUD for segmented OHScopeRule
 * (publico / centro_custo / sindicato / cargo).
 * Global OH stays on Premissas; this only edits exceptions.
 */

import { useMemo, useState } from 'react'
import {
  OH_SCOPE_TYPES,
  DEFAULT_OPERATING_HOURS,
  formatCentroCustoCodeDesc,
  ohWindowToOperatingHours,
  operatingHoursToOhWindow,
  type OHScopeRule,
  type OHScopeType,
  type OperatingHours,
  type PayrollRow,
} from '../engine'
import {
  formatOhScopeTargetDisplay,
  OH_SCOPE_TYPE_LABELS,
} from '../utils/ohScopeBadge'
import { OperatingHoursFields } from './OperatingHoursFields'

const EXCEPTION_TYPES: OHScopeType[] = [
  'publico',
  'centro_custo',
  'sindicato',
  'cargo',
]

export type OhScopeExceptionsModalProps = {
  open: boolean
  onClose: () => void
  /** Full rules list (may include global). */
  rules: OHScopeRule[]
  onChange: (next: OHScopeRule[]) => void
  /** Optional Folha for target suggestions. */
  payrollRows?: PayrollRow[]
}

type DraftRule = {
  scope_type: OHScopeType
  target_value: string
  target_label: string
  hours: OperatingHours
}

type CcSuggestion = { value: string; label: string; desc: string }
type SindicatoSuggestion = { value: string; label: string; nome: string }

function newBlankRule(): DraftRule {
  return {
    scope_type: 'centro_custo',
    target_value: '',
    target_label: '',
    hours: {
      ...DEFAULT_OPERATING_HOURS,
      default: { ...DEFAULT_OPERATING_HOURS.default },
    },
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )
}

function buildCcSuggestions(rows: PayrollRow[]): CcSuggestion[] {
  const map = new Map<string, CcSuggestion>()
  for (const r of rows) {
    const code = (r.codCc ?? r.centroCusto ?? '').trim()
    if (!code) continue
    const desc = (r.descCc ?? '').trim()
    const prev = map.get(code)
    if (!prev || (desc && !prev.desc)) {
      map.set(code, {
        value: code,
        desc,
        label: formatCentroCustoCodeDesc({
          codCc: code,
          centroCusto: r.centroCusto,
          descCc: desc || prev?.desc,
        }),
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
  )
}

function buildSindicatoSuggestions(rows: PayrollRow[]): SindicatoSuggestion[] {
  const map = new Map<string, SindicatoSuggestion>()
  for (const r of rows) {
    const code = (r.codSindicato ?? '').trim()
    if (!code || code === '0') continue
    const nome = (r.nomeSindicato ?? '').trim()
    const prev = map.get(code)
    if (!prev || (nome && !prev.nome)) {
      map.set(code, {
        value: code,
        nome,
        label: formatOhScopeTargetDisplay(code, nome || prev?.nome),
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
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
    () => buildCcSuggestions(payrollRows),
    [payrollRows],
  )
  const sindicatoSuggestions = useMemo(
    () => buildSindicatoSuggestions(payrollRows),
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
      target_label: rule.target_label ?? '',
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
    const label = draft.target_label.trim()
    const rule: OHScopeRule = {
      scope_type: draft.scope_type,
      target_value: target,
      ...(label ? { target_label: label } : {}),
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

  function applyCcPick(raw: string) {
    const text = raw.trim()
    const hit = ccSuggestions.find(
      (s) => s.value === text || s.label === text,
    )
    if (hit) {
      setDraft((d) => ({
        ...d,
        target_value: hit.value,
        target_label: hit.desc,
      }))
      return
    }
    setDraft((d) => ({ ...d, target_value: text, target_label: '' }))
  }

  function applySindicatoPick(raw: string) {
    const text = raw.trim()
    const hit = sindicatoSuggestions.find(
      (s) => s.value === text || s.label === text,
    )
    if (hit) {
      setDraft((d) => ({
        ...d,
        target_value: hit.value,
        target_label: hit.nome,
      }))
      return
    }
    setDraft((d) => ({ ...d, target_value: text, target_label: '' }))
  }

  const targetPlaceholder =
    draft.scope_type === 'publico'
      ? 'Ex.: Administrativo'
      : draft.scope_type === 'centro_custo'
        ? 'Código do CC (descrição preenchida da Folha)'
        : draft.scope_type === 'sindicato'
          ? 'Código do sindicato (nome da Folha)'
          : 'Cargo / descrição'

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
              Override por público, centro de custo, sindicato ou cargo.
              Cascata no motor: cargo → CC → sindicato → público → global. O
              horário global permanece nas Premissas.
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
                    <span>
                      {formatOhScopeTargetDisplay(
                        r.target_value,
                        r.target_label,
                      )}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {r.operating_hours.abertura}–
                      {r.operating_hours.fechamento}
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
                    target_value: '',
                    target_label: '',
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
              {draft.scope_type === 'centro_custo' &&
              ccSuggestions.length > 0 ? (
                <>
                  <select
                    className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                    value={
                      ccSuggestions.some((s) => s.value === draft.target_value)
                        ? draft.target_value
                        : ''
                    }
                    onChange={(e) => applyCcPick(e.target.value)}
                  >
                    <option value="">Selecione o centro de custo…</option>
                    {ccSuggestions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-xs"
                    value={draft.target_value}
                    onChange={(e) => applyCcPick(e.target.value)}
                    placeholder="Ou digite o código do CC"
                  />
                  {draft.target_value ? (
                    <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                      Código: <code>{draft.target_value}</code>
                      {draft.target_label
                        ? ` · Descrição: ${draft.target_label}`
                        : ''}
                    </p>
                  ) : null}
                </>
              ) : draft.scope_type === 'sindicato' &&
                sindicatoSuggestions.length > 0 ? (
                <>
                  <select
                    className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                    value={
                      sindicatoSuggestions.some(
                        (s) => s.value === draft.target_value,
                      )
                        ? draft.target_value
                        : ''
                    }
                    onChange={(e) => applySindicatoPick(e.target.value)}
                  >
                    <option value="">Selecione o sindicato…</option>
                    {sindicatoSuggestions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-xs"
                    value={draft.target_value}
                    onChange={(e) => applySindicatoPick(e.target.value)}
                    placeholder="Ou digite o código do sindicato"
                  />
                  {draft.target_value ? (
                    <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                      Código: <code>{draft.target_value}</code>
                      {draft.target_label
                        ? ` · Nome: ${draft.target_label}`
                        : ''}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <input
                    className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                    list="oh-exception-target-suggestions"
                    value={draft.target_value}
                    onChange={(e) => {
                      if (draft.scope_type === 'centro_custo') {
                        applyCcPick(e.target.value)
                      } else if (draft.scope_type === 'sindicato') {
                        applySindicatoPick(e.target.value)
                      } else {
                        setDraft((d) => ({
                          ...d,
                          target_value: e.target.value,
                          target_label: '',
                        }))
                      }
                    }}
                    placeholder={targetPlaceholder}
                  />
                  {draft.scope_type === 'cargo' &&
                  cargoSuggestions.length > 0 ? (
                    <datalist id="oh-exception-target-suggestions">
                      {cargoSuggestions.slice(0, 80).map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  ) : null}
                </>
              )}
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
          em <code>ohScopeRules</code> na simulação. CC/sindicato: código em{' '}
          <code>target_value</code>, descrição/nome em{' '}
          <code>target_label</code>.
        </p>
      </div>
    </div>
  )
}
