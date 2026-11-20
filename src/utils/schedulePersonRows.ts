/**
 * Expand turma/crew aggregates into individual person / posto rows
 * for ScheduleBuilderView (nominal calendar) and Excel export.
 * LGPD: names resolved via mask policy; never invent PII.
 */

import {
  DEFAULT_MASK_COLLABORATOR_NAMES,
  resolveCollaboratorDisplayName,
} from '../apdata/lgpdNameMask'
import type { DayMark, MonthCalendarMatrix, TurmaMonthRow } from '../engine/display'
import type { PayrollRow } from '../engine/payroll'

export type PersonPostoKind = 'person' | 'posto'

export interface PersonPostoSlot {
  /** Stable id within the matrix (turmaIndex-slot). */
  id: string
  turmaIndex: number
  /** 1-based slot inside the turma. */
  slotIndex: number
  kind: PersonPostoKind
  /** Display primary line (masked name or "Posto NN"). */
  primaryLabel: string
  /** Secondary line: cargo · carga, or cargo alone. */
  secondaryLabel: string
  /** Avatar initials (1–2 chars). */
  initials: string
  cargo: string | null
  /** Raw name before mask — never show when maskOn; export scrubber uses this. */
  rawNome: string | null
  marks: DayMark[]
}

export interface ExpandPersonSlotsOptions {
  /** LGPD mask (default ON). */
  maskOn?: boolean
  /** Optional payroll lines for this CC (names / cargo / qty). */
  payrollRows?: PayrollRow[] | null
  /** Centro de custo code for matching payroll. */
  centroCusto?: string | null
}

function initialsFromLabel(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !/^posto$/i.test(p) && !/^\d+$/.test(p))
  if (parts.length === 0) return 'P'
  if (parts.length === 1) {
    const w = parts[0]!
    return (w.slice(0, 2) || 'P').toUpperCase()
  }
  return `${parts[0]![0] ?? 'P'}${parts[1]![0] ?? ''}`.toUpperCase()
}

function cargoFromRow(r: PayrollRow): string | null {
  const c = (r.cargo || r.descCargo || '').trim()
  return c || null
}

function cargaLabelFromRow(r: PayrollRow): string | null {
  if (r.cargaHorariaSemanal > 0) {
    return `${r.cargaHorariaSemanal.toLocaleString('pt-BR')} h/sem`
  }
  if (r.cargaHorariaMensal > 0) {
    return `${r.cargaHorariaMensal.toLocaleString('pt-BR')} h/mês`
  }
  return null
}

function matchesCentro(r: PayrollRow, centroCusto: string | null | undefined): boolean {
  if (!centroCusto?.trim()) return true
  const key = centroCusto.trim()
  const cc = (r.centroCusto ?? '').trim()
  const cod = (r.codCc ?? '').trim()
  return cc === key || cod === key || cc.endsWith(key) || key.endsWith(cc)
}

/**
 * Flatten payroll into individual people/postos for one CC.
 * Expands `quantidade` / `qtd` into slots; prefers named rows when present.
 */
export function flattenPayrollSlotsForCc(
  payrollRows: PayrollRow[] | null | undefined,
  centroCusto: string | null | undefined,
  maskOn: boolean = DEFAULT_MASK_COLLABORATOR_NAMES,
): Array<{
  kind: PersonPostoKind
  primaryLabel: string
  secondaryLabel: string
  initials: string
  cargo: string | null
  rawNome: string | null
}> {
  const rows = (payrollRows ?? []).filter((r) => matchesCentro(r, centroCusto))
  const out: Array<{
    kind: PersonPostoKind
    primaryLabel: string
    secondaryLabel: string
    initials: string
    cargo: string | null
    rawNome: string | null
  }> = []
  let postoSeq = 0
  for (const r of rows) {
    const qty = Math.max(1, Math.round(r.quantidade || 1))
    const cargo = cargoFromRow(r)
    const carga = cargaLabelFromRow(r)
    const secondary = [cargo, carga].filter(Boolean).join(' · ')
    const rawNome = (r.nome ?? '').trim() || null
    for (let i = 0; i < qty; i++) {
      if (rawNome) {
        const display =
          resolveCollaboratorDisplayName(rawNome, { mask: maskOn }) ?? rawNome
        out.push({
          kind: 'person',
          primaryLabel: display,
          secondaryLabel: secondary,
          initials: initialsFromLabel(maskOn ? display : rawNome),
          cargo,
          rawNome,
        })
      } else {
        postoSeq += 1
        const nn = String(postoSeq).padStart(2, '0')
        const primary = cargo ? `Posto ${nn} · ${cargo}` : `Posto ${nn}`
        out.push({
          kind: 'posto',
          primaryLabel: primary,
          secondaryLabel: carga ?? '',
          initials: initialsFromLabel(cargo ?? `P${nn}`),
          cargo,
          rawNome: null,
        })
      }
    }
  }
  return out
}

/**
 * Expand aggregated turma calendar rows into one row per person/posto.
 * Daily coverage stays correct because each slot carries HC=1 marks.
 */
export function expandMatrixToPersonRows(
  matrix: MonthCalendarMatrix,
  options: ExpandPersonSlotsOptions = {},
): PersonPostoSlot[] {
  const maskOn = options.maskOn ?? DEFAULT_MASK_COLLABORATOR_NAMES
  const pool = flattenPayrollSlotsForCc(
    options.payrollRows,
    options.centroCusto,
    maskOn,
  )
  let poolIdx = 0
  const slots: PersonPostoSlot[] = []
  let globalPosto = 0

  for (const row of matrix.rows) {
    const hc = Math.max(0, Math.round(row.headcount))
    for (let i = 1; i <= hc; i++) {
      const fromPool = poolIdx < pool.length ? pool[poolIdx++]! : null
      let kind: PersonPostoKind
      let primaryLabel: string
      let secondaryLabel: string
      let initials: string
      let cargo: string | null
      let rawNome: string | null

      if (fromPool) {
        kind = fromPool.kind
        primaryLabel = fromPool.primaryLabel
        secondaryLabel = fromPool.secondaryLabel
        initials = fromPool.initials
        cargo = fromPool.cargo
        rawNome = fromPool.rawNome
      } else {
        globalPosto += 1
        const nn = String(globalPosto).padStart(2, '0')
        kind = 'posto'
        primaryLabel = `Posto ${nn}`
        secondaryLabel = row.label?.trim()
          ? `${row.label.trim()} · ${row.escala}`
          : row.escala
        initials = initialsFromLabel(`P${nn}`)
        cargo = null
        rawNome = null
      }

      slots.push({
        id: `t${row.turmaIndex}-s${i}`,
        turmaIndex: row.turmaIndex,
        slotIndex: i,
        kind,
        primaryLabel,
        secondaryLabel,
        initials,
        cargo,
        rawNome,
        marks: [...row.marks],
      })
    }
  }
  return slots
}

/** Excel-safe label: never emit unmasked name when maskOn. */
export function excelPersonLabel(
  slot: PersonPostoSlot,
  maskOn: boolean = DEFAULT_MASK_COLLABORATOR_NAMES,
): string {
  if (slot.kind === 'person' && slot.rawNome) {
    if (maskOn) {
      return (
        resolveCollaboratorDisplayName(slot.rawNome, { mask: true }) ??
        slot.primaryLabel
      )
    }
    return slot.rawNome
  }
  return slot.primaryLabel
}

/** Mark cell copy: Trabalho vs Folga/DSR. */
export function dayMarkLabel(mark: DayMark): string {
  return mark === 'T' ? 'Trabalho' : 'Folga/DSR'
}

/** Recompute daily working counts from person slots (each slot = 1 HC). */
export function dailyWorkingFromPersonSlots(
  slots: PersonPostoSlot[],
  dayCount: number,
): number[] {
  const out = Array.from({ length: dayCount }, () => 0)
  for (const s of slots) {
    for (let i = 0; i < dayCount; i++) {
      if (s.marks[i] === 'T') out[i]! += 1
    }
  }
  return out
}

/** Keep turma rows available for editable HC mode. */
export function turmaRowKey(row: TurmaMonthRow): string {
  return `t${row.turmaIndex}`
}
