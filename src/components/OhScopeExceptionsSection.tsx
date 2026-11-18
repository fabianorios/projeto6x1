/**
 * Premissas — global OH + entry point to manage segmented OH exceptions.
 */

import { useState } from 'react'
import {
  syncOhScopeRulesWithGlobalHours,
  type OHScopeRule,
  type OperatingHours,
  type PayrollRow,
} from '../engine'
import { OH_SCOPE_TYPE_LABELS } from '../utils/ohScopeBadge'
import { OperatingHoursFields } from './OperatingHoursFields'
import { OhScopeExceptionsModal } from './OhScopeExceptionsModal'

export type OhScopeExceptionsSectionProps = {
  operatingHours: OperatingHours
  onOperatingHoursChange: (next: OperatingHours) => void
  ohScopeRules: OHScopeRule[]
  onOhScopeRulesChange: (next: OHScopeRule[]) => void
  payrollRows?: PayrollRow[]
}

export function OhScopeExceptionsSection({
  operatingHours,
  onOperatingHoursChange,
  ohScopeRules,
  onOhScopeRulesChange,
  payrollRows = [],
}: OhScopeExceptionsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const exceptions = ohScopeRules.filter((r) => r.scope_type !== 'global')

  function openModal() {
    // Materialize global + keep exceptions when the consultant opens the editor.
    onOhScopeRulesChange(
      syncOhScopeRulesWithGlobalHours(ohScopeRules, operatingHours),
    )
    setModalOpen(true)
  }

  function handleHoursChange(next: OperatingHours) {
    // Parent may also sync ohScopeRules; simulate path re-syncs via
    // prepareOHScopeRulesForInput / syncOhScopeRulesWithGlobalHours.
    onOperatingHoursChange(next)
  }

  return (
    <div
      className="space-y-3 border border-[var(--color-line)] bg-white/80 px-3 py-3"
      data-testid="oh-scope-exceptions-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Horário de funcionamento (OH)
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Global para o estabelecimento. Exceções por público / centro de
            custo / cargo alimentam a cascata do motor e os badges nos
            Resultados.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-teal)]"
        >
          Gerenciar exceções
          {exceptions.length > 0 ? ` (${exceptions.length})` : ''}
        </button>
      </div>

      <OperatingHoursFields
        value={operatingHours}
        onChange={handleHoursChange}
      />

      {exceptions.length > 0 ? (
        <ul className="space-y-1 text-xs text-[var(--color-ink)]">
          {exceptions.map((r, i) => (
            <li key={`${r.scope_type}-${r.target_value}-${i}`}>
              <span className="text-[var(--color-muted)]">
                {OH_SCOPE_TYPE_LABELS[r.scope_type] ?? r.scope_type}:
              </span>{' '}
              {r.target_value}{' '}
              <span className="text-[var(--color-muted)]">
                ({r.operating_hours.abertura}–{r.operating_hours.fechamento})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          Sem exceções — simulação usa apenas o OH global.
        </p>
      )}

      <OhScopeExceptionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rules={ohScopeRules}
        onChange={onOhScopeRulesChange}
        payrollRows={payrollRows}
      />
    </div>
  )
}
