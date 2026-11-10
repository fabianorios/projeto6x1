/** Payroll CSV import + aggregation helpers (layout: docs/import-layout.md). */

import type { ScaleCycle } from './types'

/** Canonical CSV headers — do not rename. */
export const PAYROLL_CSV_HEADERS = [
  'cargo',
  'salario',
  'carga_horaria_mensal',
  'carga_horaria_semanal',
  'centro_custo',
  'vr_valor_dia',
  'vr_dias_mes_atual',
  'vt_valor_dia',
  'vt_dias_mes_atual',
  'nome',
  'quantidade',
  'escala_atual',
] as const

export type PayrollCsvHeader = (typeof PAYROLL_CSV_HEADERS)[number]

const REQUIRED_HEADERS = [
  'cargo',
  'salario',
  'carga_horaria_mensal',
  'carga_horaria_semanal',
  'centro_custo',
] as const

/** One imported role/person line after parse. */
export interface PayrollRow {
  cargo: string
  salario: number
  cargaHorariaMensal: number
  cargaHorariaSemanal: number
  centroCusto: string
  /** VR R$ per work day; null if column absent/empty. */
  vrValorDia: number | null
  /** Current VR days/month; null → estimate from scale. */
  vrDiasMesAtual: number | null
  vtValorDia: number | null
  vtDiasMesAtual: number | null
  nome: string | null
  quantidade: number
  /** Per-row scale override; null → wizard default. */
  escalaAtual: string | null
  /** 1-based CSV line number (header = 1). */
  sourceLine: number
}

export interface PayrollParseIssue {
  line: number
  message: string
}

export interface PayrollParseResult {
  rows: PayrollRow[]
  issues: PayrollParseIssue[]
}

/**
 * Estimate work days/month from a scale cycle.
 * Heuristic: round(30 × workRatio) → 6×1 ≈ 26, 5×2 ≈ 21, 4×3 ≈ 17.
 */
export function estimateWorkDaysPerMonth(scale: ScaleCycle): number {
  return Math.max(0, Math.round(30 * scale.workRatio))
}

/** Parse a decimal that may use `.` or Brazilian `,`. */
export function parseNumberBr(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function splitCsvLine(line: string): string[] {
  // Semicolon layout; support quoted fields with `;` inside.
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ';' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/\s+/g, '_')
}

/**
 * Parse payroll CSV/paste text (`;` separator, UTF-8 header row).
 * Invalid lines are collected; ≥1 valid row is enough to proceed.
 */
export function parsePayrollCsv(text: string): PayrollParseResult {
  const issues: PayrollParseIssue[] = []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) {
    return {
      rows: [],
      issues: [{ line: 0, message: 'Texto vazio — cole ou envie um CSV.' }],
    }
  }

  const lines = normalized.split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) {
    return {
      rows: [],
      issues: [
        {
          line: 1,
          message: 'CSV precisa de cabeçalho + ao menos uma linha de dados.',
        },
      ],
    }
  }

  const headerCells = splitCsvLine(lines[0]).map(normalizeHeader)
  const index: Partial<Record<PayrollCsvHeader, number>> = {}
  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i] as PayrollCsvHeader
    if ((PAYROLL_CSV_HEADERS as readonly string[]).includes(h)) {
      index[h] = i
    }
  }

  for (const req of REQUIRED_HEADERS) {
    if (index[req] === undefined) {
      issues.push({
        line: 1,
        message: `Cabeçalho obrigatório ausente: ${req}`,
      })
    }
  }
  if (issues.some((i) => i.line === 1 && i.message.includes('ausente'))) {
    return { rows: [], issues }
  }

  const cell = (cols: string[], key: PayrollCsvHeader): string => {
    const i = index[key]
    if (i === undefined) return ''
    return cols[i] ?? ''
  }

  const rows: PayrollRow[] = []

  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1
    const cols = splitCsvLine(lines[li])
    const cargo = cell(cols, 'cargo')
    const centroCusto = cell(cols, 'centro_custo')
    const salario = parseNumberBr(cell(cols, 'salario'))
    const cargaM = parseNumberBr(cell(cols, 'carga_horaria_mensal'))
    const cargaS = parseNumberBr(cell(cols, 'carga_horaria_semanal'))

    if (!cargo) {
      issues.push({ line: lineNo, message: 'cargo vazio' })
      continue
    }
    if (!centroCusto) {
      issues.push({ line: lineNo, message: 'centro_custo vazio' })
      continue
    }
    if (salario === null || salario < 0) {
      issues.push({ line: lineNo, message: 'salario inválido' })
      continue
    }
    if (cargaM === null || cargaM < 0) {
      issues.push({
        line: lineNo,
        message: 'carga_horaria_mensal inválida',
      })
      continue
    }
    if (cargaS === null || cargaS < 0) {
      issues.push({
        line: lineNo,
        message: 'carga_horaria_semanal inválida',
      })
      continue
    }

    const qtyRaw = cell(cols, 'quantidade')
    let quantidade = 1
    if (qtyRaw.trim() !== '') {
      const q = parseNumberBr(qtyRaw)
      if (q === null || q <= 0) {
        issues.push({ line: lineNo, message: 'quantidade inválida' })
        continue
      }
      quantidade = q
    }

    const vrValorDia = parseOptionalNonNeg(cell(cols, 'vr_valor_dia'))
    const vrDiasMesAtual = parseOptionalNonNeg(cell(cols, 'vr_dias_mes_atual'))
    const vtValorDia = parseOptionalNonNeg(cell(cols, 'vt_valor_dia'))
    const vtDiasMesAtual = parseOptionalNonNeg(cell(cols, 'vt_dias_mes_atual'))

    if (vrValorDia === 'invalid') {
      issues.push({ line: lineNo, message: 'vr_valor_dia inválido' })
      continue
    }
    if (vrDiasMesAtual === 'invalid') {
      issues.push({ line: lineNo, message: 'vr_dias_mes_atual inválido' })
      continue
    }
    if (vtValorDia === 'invalid') {
      issues.push({ line: lineNo, message: 'vt_valor_dia inválido' })
      continue
    }
    if (vtDiasMesAtual === 'invalid') {
      issues.push({ line: lineNo, message: 'vt_dias_mes_atual inválido' })
      continue
    }

    const nomeRaw = cell(cols, 'nome')
    const escalaRaw = cell(cols, 'escala_atual')

    rows.push({
      cargo,
      salario,
      cargaHorariaMensal: cargaM,
      cargaHorariaSemanal: cargaS,
      centroCusto,
      vrValorDia,
      vrDiasMesAtual,
      vtValorDia,
      vtDiasMesAtual,
      nome: nomeRaw || null,
      quantidade,
      escalaAtual: escalaRaw || null,
      sourceLine: lineNo,
    })
  }

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ line: 0, message: 'Nenhuma linha válida encontrada.' })
  }

  return { rows, issues }
}

/** Empty → null; bad number → 'invalid'. */
function parseOptionalNonNeg(raw: string): number | null | 'invalid' {
  if (raw.trim() === '') return null
  const n = parseNumberBr(raw)
  if (n === null || n < 0) return 'invalid'
  return n
}

export interface BenefitLineTotals {
  currentMonthly: number
  proposedMonthly: number
  /** Person-days of benefit in current month (dias × qty summed). */
  currentPersonDays: number
  proposedPersonDays: number
}

export interface CostCenterTotals {
  centroCusto: string
  headcount: number
  baselinePayroll: number
  /** Weighted sum of salaries for average (salario × qty). */
  salaryMass: number
  vr: BenefitLineTotals
  vt: BenefitLineTotals
  /** Avg VR R$/day across people with VR. */
  avgVrValorDia: number
  avgVtValorDia: number
  peopleWithVr: number
  peopleWithVt: number
}

/**
 * Resolve current / proposed benefit days for one row.
 * Empty dias_mes_atual → estimate from current scale work ratio.
 * Proposed days always from target (scenario) scale estimate.
 */
export function resolveBenefitDays(
  rowDaysAtual: number | null,
  currentScale: ScaleCycle,
  targetScale: ScaleCycle,
): { currentDays: number; proposedDays: number } {
  const estimatedCurrent = estimateWorkDaysPerMonth(currentScale)
  const proposedDays = estimateWorkDaysPerMonth(targetScale)
  const currentDays =
    rowDaysAtual !== null && rowDaysAtual !== undefined
      ? rowDaysAtual
      : estimatedCurrent
  return { currentDays, proposedDays }
}

/** Aggregate imported rows by centro_custo (pre–HC-scale). */
export function aggregateByCostCenter(
  rows: PayrollRow[],
  resolveScale: (row: PayrollRow) => ScaleCycle,
  targetScale: ScaleCycle,
): CostCenterTotals[] {
  const map = new Map<
    string,
    CostCenterTotals & { vrDiaSum: number; vtDiaSum: number }
  >()

  for (const row of rows) {
    const key = row.centroCusto
    let agg = map.get(key)
    if (!agg) {
      agg = {
        centroCusto: key,
        headcount: 0,
        baselinePayroll: 0,
        salaryMass: 0,
        vr: {
          currentMonthly: 0,
          proposedMonthly: 0,
          currentPersonDays: 0,
          proposedPersonDays: 0,
        },
        vt: {
          currentMonthly: 0,
          proposedMonthly: 0,
          currentPersonDays: 0,
          proposedPersonDays: 0,
        },
        avgVrValorDia: 0,
        avgVtValorDia: 0,
        peopleWithVr: 0,
        peopleWithVt: 0,
        vrDiaSum: 0,
        vtDiaSum: 0,
      }
      map.set(key, agg)
    }

    const scale = resolveScale(row)
    const qty = row.quantidade
    agg.headcount += qty
    agg.baselinePayroll += row.salario * qty
    agg.salaryMass += row.salario * qty

    if (row.vrValorDia !== null) {
      const { currentDays, proposedDays } = resolveBenefitDays(
        row.vrDiasMesAtual,
        scale,
        targetScale,
      )
      agg.vr.currentMonthly += row.vrValorDia * currentDays * qty
      agg.vr.proposedMonthly += row.vrValorDia * proposedDays * qty
      agg.vr.currentPersonDays += currentDays * qty
      agg.vr.proposedPersonDays += proposedDays * qty
      agg.vrDiaSum += row.vrValorDia * qty
      agg.peopleWithVr += qty
    }

    if (row.vtValorDia !== null) {
      const { currentDays, proposedDays } = resolveBenefitDays(
        row.vtDiasMesAtual,
        scale,
        targetScale,
      )
      agg.vt.currentMonthly += row.vtValorDia * currentDays * qty
      agg.vt.proposedMonthly += row.vtValorDia * proposedDays * qty
      agg.vt.currentPersonDays += currentDays * qty
      agg.vt.proposedPersonDays += proposedDays * qty
      agg.vtDiaSum += row.vtValorDia * qty
      agg.peopleWithVt += qty
    }
  }

  return [...map.values()]
    .map(({ vrDiaSum, vtDiaSum, ...rest }) => ({
      ...rest,
      avgVrValorDia: rest.peopleWithVr > 0 ? vrDiaSum / rest.peopleWithVr : 0,
      avgVtValorDia: rest.peopleWithVt > 0 ? vtDiaSum / rest.peopleWithVt : 0,
    }))
    .sort((a, b) => a.centroCusto.localeCompare(b.centroCusto, 'pt-BR'))
}
