/**
 * Stamp CNPJ/filial onto payroll rows when the extract/agg dropped them.
 * Used so Seção B (Bloco Operacional) can accordion by Filial/CNPJ.
 */

import { cnpjDigits } from './cnpj'
import type { PayrollRow } from '../engine/payroll'

export type EscopoEstablishmentHint = {
  /** Digits-only CNPJ key from escopo multi-select. */
  key: string
  /** Optional Apdata local id → cod_filial. */
  localId?: number | null
  /** Optional Apdata empresa id → cod_empresa. */
  empresaId?: number | null
}

/**
 * If every row already has a usable CNPJ, returns rows unchanged.
 * If rows lack CNPJ and escopo has **exactly one** establishment, stamp that
 * CNPJ (and codFilial/codEmpresa when provided) on every row.
 * Multi-CNPJ escopo cannot invent a split without per-row CNPJ — returns as-is.
 */
export function enrichPayrollCnpjFromEscopo(
  rows: PayrollRow[],
  establishments: EscopoEstablishmentHint[] | undefined | null,
): PayrollRow[] {
  if (!rows.length) return rows
  const hasAnyCnpj = rows.some((r) => cnpjDigits(r.cnpjCompleto).length >= 8)
  if (hasAnyCnpj) return rows

  const unique = new Map<string, EscopoEstablishmentHint>()
  for (const e of establishments ?? []) {
    const dig = cnpjDigits(e.key)
    if (dig.length >= 8) unique.set(dig, { ...e, key: dig })
  }
  if (unique.size !== 1) return rows

  const only = [...unique.values()][0]!
  return rows.map((r) => ({
    ...r,
    cnpjCompleto: only.key,
    codFilial:
      r.codFilial ??
      (only.localId != null ? String(only.localId) : r.codFilial),
    codEmpresa:
      r.codEmpresa ??
      (only.empresaId != null ? String(only.empresaId) : r.codEmpresa),
  }))
}
