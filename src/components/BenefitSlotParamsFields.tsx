/**
 * Editable Apdata code→slot mapping + default amounts for VR/VA/Médico/Odonto.
 * Used by Studio SQL (profile) and Wizard Passo 4 (session amounts).
 */

import {
  formatTipoCodeList,
  setSlotTipoCodes,
  type BenefitParams,
  type BenefitSlotId,
} from '../types/sql-profile'
import type { BenefitSlotAmounts } from '../apdata/classifyBenefit'

const SLOT_ROWS: {
  slot: BenefitSlotId
  codeLabel: string
  amountLabel: string
  amountKey: keyof BenefitSlotAmounts
  profileAmountKey:
    | 'vrValorDiaPadrao'
    | 'vaValorMesPadrao'
    | 'assistenciaMedicaValorMes'
    | 'assistenciaOdontologicaValorMes'
}[] = [
  {
    slot: 'vr',
    codeLabel: 'VR / Refeição — códigos Apdata',
    amountLabel: 'VR R$/dia',
    amountKey: 'vrValorDia',
    profileAmountKey: 'vrValorDiaPadrao',
  },
  {
    slot: 'va',
    codeLabel: 'VA / Alimentação — códigos Apdata',
    amountLabel: 'VA R$/mês',
    amountKey: 'vaValorMes',
    profileAmountKey: 'vaValorMesPadrao',
  },
  {
    slot: 'medica',
    codeLabel: 'Médico titular — códigos Apdata',
    amountLabel: 'Médico R$/mês',
    amountKey: 'assistMedicaMes',
    profileAmountKey: 'assistenciaMedicaValorMes',
  },
  {
    slot: 'odonto',
    codeLabel: 'Odontológica — códigos Apdata',
    amountLabel: 'Odonto R$/mês',
    amountKey: 'assistOdontoMes',
    profileAmountKey: 'assistenciaOdontologicaValorMes',
  },
]

function codesForSlot(params: BenefitParams, slot: BenefitSlotId): string {
  if (slot === 'vr') {
    return formatTipoCodeList(params.vrTipoBeneficio, params.vrTiposExtras)
  }
  if (slot === 'va') {
    return formatTipoCodeList(params.vaTipoBeneficio, params.vaTiposExtras)
  }
  if (slot === 'medica') {
    return formatTipoCodeList(
      params.assistenciaMedicaTipo,
      params.medicaTiposExtras,
    )
  }
  return formatTipoCodeList(
    params.assistenciaOdontologicaTipo,
    params.odontoTiposExtras,
  )
}

function parseAmountInput(raw: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

interface BenefitSlotParamsFieldsProps {
  /** Code mapping (+ optional profile amount defaults). */
  benefitParams: BenefitParams
  onBenefitParamsChange: (next: BenefitParams) => void
  /** When true, codes/amounts persist on profile; when false, amounts are session-only. */
  persistAmountsOnProfile?: boolean
  /** Session amounts (Wizard) — overrides profile defaults when set. */
  sessionAmounts?: BenefitSlotAmounts
  onSessionAmountsChange?: (next: BenefitSlotAmounts) => void
  /** Hide code editors (Wizard shows amounts only + read-only codes). */
  codesReadOnly?: boolean
  disabled?: boolean
}

export function BenefitSlotParamsFields({
  benefitParams,
  onBenefitParamsChange,
  persistAmountsOnProfile = true,
  sessionAmounts,
  onSessionAmountsChange,
  codesReadOnly = false,
  disabled = false,
}: BenefitSlotParamsFieldsProps) {
  function amountDisplay(row: (typeof SLOT_ROWS)[number]): string | number {
    if (!persistAmountsOnProfile && sessionAmounts) {
      const v = sessionAmounts[row.amountKey]
      if (v != null && Number.isFinite(v)) return v
      // Fall back to profile seed for display when session empty.
      const seed = benefitParams[row.profileAmountKey]
      return seed ?? ''
    }
    return benefitParams[row.profileAmountKey] ?? ''
  }

  function onAmountChange(
    row: (typeof SLOT_ROWS)[number],
    raw: string,
  ) {
    const parsed = parseAmountInput(raw)
    if (parsed === undefined) return
    if (persistAmountsOnProfile) {
      onBenefitParamsChange({
        ...benefitParams,
        [row.profileAmountKey]: parsed,
      })
      return
    }
    if (!onSessionAmountsChange) return
    onSessionAmountsChange({
      ...sessionAmounts,
      [row.amountKey]: parsed,
    })
  }

  return (
    <div className="space-y-3">
      {SLOT_ROWS.map((row) => (
        <div
          key={row.slot}
          className="grid gap-2 border-b border-[var(--color-line)]/50 pb-3 last:border-0 last:pb-0 sm:grid-cols-2"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">
              {row.codeLabel}
            </span>
            <input
              type="text"
              inputMode="numeric"
              className="w-full border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-sm disabled:bg-white/50"
              value={codesForSlot(benefitParams, row.slot)}
              disabled={disabled || codesReadOnly}
              placeholder="ex.: 53, 80"
              aria-label={row.codeLabel}
              onChange={(e) =>
                onBenefitParamsChange(
                  setSlotTipoCodes(benefitParams, row.slot, e.target.value),
                )
              }
            />
            <span className="mt-0.5 block text-[10px] text-[var(--color-muted)]">
              Vários códigos: separe por vírgula. O 1º alimenta @tipo nas
              queries.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">
              {row.amountLabel}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full border border-[var(--color-line)] bg-white px-3 py-2 tabular-nums disabled:bg-white/50"
              value={amountDisplay(row)}
              disabled={disabled}
              placeholder="—"
              aria-label={row.amountLabel}
              onChange={(e) => onAmountChange(row, e.target.value)}
            />
          </label>
        </div>
      ))}
    </div>
  )
}
