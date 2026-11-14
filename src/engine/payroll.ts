/** Payroll CSV import + aggregation helpers (layout: docs/import-layout.md). */

import type { ScaleCycle } from './types'
import type { RegimeFuncionamento } from '../types'
import { isRegimeFuncionamento } from '../types'

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
  // Native Apdata extractor columns (SPEC-V2 / apdata-extractor.sql)
  'cod_empresa',
  'cod_filial',
  'cnpj_completo',
  'cod_cc',
  'cod_cargo',
  'desc_cargo',
  'cod_vinculo',
  'cod_horario_atual',
  'carga_semanal_atual',
  'qtd_colaboradores',
  'massa_salarial_base',
  'vr_dia_medio',
  'vt_dia_medio',
  'dias_trabalho_mes_atual',
  'regime_funcionamento',
  'he_media_mensal_horas',
] as const

export type PayrollCsvHeader = (typeof PAYROLL_CSV_HEADERS)[number]

const REQUIRED_HEADERS_LEGACY = [
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
  // --- SPEC-V2 / extractor fields (safe defaults when absent) ---
  codEmpresa: string | null
  codFilial: string | null
  cnpjCompleto: string | null
  codCc: string | null
  codCargo: string | null
  descCargo: string | null
  codVinculo: string | null
  codHorarioAtual: string | null
  /** Existing overtime hours/month (cascade input). */
  heMediaMensalHoras: number
  regimeFuncionamento: RegimeFuncionamento | null
  /** Raw massa salarial base from extractor (before ÷ qty). */
  massaSalarialBase: number | null
}

export interface PayrollParseIssue {
  line: number
  message: string
}

export interface PayrollParseResult {
  rows: PayrollRow[]
  issues: PayrollParseIssue[]
}

/** Empty / missing SPEC-V2 fields for legacy CSV rows. */
export function emptyPayrollExtras(): Pick<
  PayrollRow,
  | 'codEmpresa'
  | 'codFilial'
  | 'cnpjCompleto'
  | 'codCc'
  | 'codCargo'
  | 'descCargo'
  | 'codVinculo'
  | 'codHorarioAtual'
  | 'heMediaMensalHoras'
  | 'regimeFuncionamento'
  | 'massaSalarialBase'
> {
  return {
    codEmpresa: null,
    codFilial: null,
    cnpjCompleto: null,
    codCc: null,
    codCargo: null,
    descCargo: null,
    codVinculo: null,
    codHorarioAtual: null,
    heMediaMensalHoras: 0,
    regimeFuncionamento: null,
    massaSalarialBase: null,
  }
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

function splitCsvLine(line: string, separator: string): string[] {
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
    if (ch === separator && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function detectSeparator(headerLine: string): ';' | ',' {
  // Prefer `;` when present (canonical); else comma.
  let semis = 0
  let commas = 0
  let inQuotes = false
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (inQuotes) continue
    if (ch === ';') semis++
    if (ch === ',') commas++
  }
  return semis >= commas ? ';' : ','
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/\s+/g, '_')
}

/**
 * Parse payroll CSV/paste text (`;` or `,` separator, UTF-8 header row).
 * Accepts legacy layout and native extractor columns (safe defaults).
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

  const separator = detectSeparator(lines[0])
  const headerCells = splitCsvLine(lines[0], separator).map(normalizeHeader)
  const index: Partial<Record<PayrollCsvHeader, number>> = {}
  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i] as PayrollCsvHeader
    if ((PAYROLL_CSV_HEADERS as readonly string[]).includes(h)) {
      index[h] = i
    }
  }

  const hasNative =
    index.desc_cargo !== undefined ||
    index.cod_cc !== undefined ||
    index.massa_salarial_base !== undefined ||
    index.qtd_colaboradores !== undefined

  if (!hasNative) {
    for (const req of REQUIRED_HEADERS_LEGACY) {
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
  } else {
    // Native extractor: need cargo-like + cc-like + qty/mass or salario
    const hasCargo =
      index.cargo !== undefined || index.desc_cargo !== undefined
    const hasCc =
      index.centro_custo !== undefined || index.cod_cc !== undefined
    if (!hasCargo) {
      issues.push({
        line: 1,
        message: 'Cabeçalho obrigatório ausente: cargo ou desc_cargo',
      })
    }
    if (!hasCc) {
      issues.push({
        line: 1,
        message: 'Cabeçalho obrigatório ausente: centro_custo ou cod_cc',
      })
    }
    if (issues.some((i) => i.line === 1 && i.message.includes('ausente'))) {
      return { rows: [], issues }
    }
  }

  const cell = (cols: string[], key: PayrollCsvHeader): string => {
    const i = index[key]
    if (i === undefined) return ''
    return cols[i] ?? ''
  }

  const rows: PayrollRow[] = []

  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1
    const cols = splitCsvLine(lines[li], separator)

    const cargo =
      cell(cols, 'cargo') || cell(cols, 'desc_cargo') || 'NAO_INFORMADO'
    const centroCusto =
      cell(cols, 'centro_custo') || cell(cols, 'cod_cc') || 'SEM_CC'

    const qtyRaw =
      cell(cols, 'quantidade') || cell(cols, 'qtd_colaboradores')
    let quantidade = 1
    if (qtyRaw.trim() !== '') {
      const q = parseNumberBr(qtyRaw)
      if (q === null || q <= 0) {
        issues.push({ line: lineNo, message: 'quantidade inválida' })
        continue
      }
      quantidade = q
    }

    const massaRaw = cell(cols, 'massa_salarial_base')
    const salarioRaw = cell(cols, 'salario')
    let salario: number | null = null
    let massaSalarialBase: number | null = null
    if (massaRaw.trim() !== '') {
      const massa = parseNumberBr(massaRaw)
      if (massa === null || massa < 0) {
        issues.push({ line: lineNo, message: 'massa_salarial_base inválida' })
        continue
      }
      massaSalarialBase = massa
      salario = quantidade > 0 ? massa / quantidade : massa
    } else if (salarioRaw.trim() !== '') {
      salario = parseNumberBr(salarioRaw)
    } else {
      salario = 0
    }
    if (salario === null || salario < 0) {
      issues.push({ line: lineNo, message: 'salario inválido' })
      continue
    }

    const cargaSRaw =
      cell(cols, 'carga_horaria_semanal') || cell(cols, 'carga_semanal_atual')
    let cargaS = parseNumberBr(cargaSRaw)
    if (cargaSRaw.trim() === '') cargaS = 44
    if (cargaS === null || cargaS < 0) {
      issues.push({
        line: lineNo,
        message: 'carga_horaria_semanal inválida',
      })
      continue
    }

    const cargaMRaw = cell(cols, 'carga_horaria_mensal')
    let cargaM = parseNumberBr(cargaMRaw)
    if (cargaMRaw.trim() === '') {
      // Derive from weekly ≈ weekly × 5 (legacy 220 for 44h)
      cargaM = Math.round(cargaS * 5 * 100) / 100
    }
    if (cargaM === null || cargaM < 0) {
      issues.push({
        line: lineNo,
        message: 'carga_horaria_mensal inválida',
      })
      continue
    }

    const vrValorDia = parseOptionalNonNeg(
      cell(cols, 'vr_valor_dia') || cell(cols, 'vr_dia_medio'),
    )
    const vtValorDia = parseOptionalNonNeg(
      cell(cols, 'vt_valor_dia') || cell(cols, 'vt_dia_medio'),
    )
    const diasTrabalho = parseOptionalNonNeg(
      cell(cols, 'dias_trabalho_mes_atual'),
    )
    const vrDiasMesAtual = parseOptionalNonNeg(
      cell(cols, 'vr_dias_mes_atual') ||
        (diasTrabalho !== 'invalid' && diasTrabalho !== null
          ? String(diasTrabalho)
          : ''),
    )
    const vtDiasMesAtual = parseOptionalNonNeg(
      cell(cols, 'vt_dias_mes_atual') ||
        (diasTrabalho !== 'invalid' && diasTrabalho !== null
          ? String(diasTrabalho)
          : ''),
    )

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
    if (diasTrabalho === 'invalid') {
      issues.push({ line: lineNo, message: 'dias_trabalho_mes_atual inválido' })
      continue
    }

    const heRaw = cell(cols, 'he_media_mensal_horas')
    let heMediaMensalHoras = 0
    if (heRaw.trim() !== '') {
      const he = parseNumberBr(heRaw)
      if (he === null || he < 0) {
        issues.push({ line: lineNo, message: 'he_media_mensal_horas inválido' })
        continue
      }
      heMediaMensalHoras = he
    }

    const regimeRaw = cell(cols, 'regime_funcionamento').trim().toUpperCase()
    let regimeFuncionamento: RegimeFuncionamento | null = null
    if (regimeRaw) {
      if (!isRegimeFuncionamento(regimeRaw)) {
        issues.push({
          line: lineNo,
          message: 'regime_funcionamento inválido',
        })
        continue
      }
      regimeFuncionamento = regimeRaw
    }

    const nomeRaw = cell(cols, 'nome')
    const escalaRaw = cell(cols, 'escala_atual')
    const descCargo = cell(cols, 'desc_cargo') || null

    rows.push({
      cargo,
      salario,
      cargaHorariaMensal: cargaM,
      cargaHorariaSemanal: cargaS,
      centroCusto,
      vrValorDia: vrValorDia as number | null,
      vrDiasMesAtual: vrDiasMesAtual as number | null,
      vtValorDia: vtValorDia as number | null,
      vtDiasMesAtual: vtDiasMesAtual as number | null,
      nome: nomeRaw || null,
      quantidade,
      escalaAtual: escalaRaw || null,
      sourceLine: lineNo,
      codEmpresa: cell(cols, 'cod_empresa') || null,
      codFilial: cell(cols, 'cod_filial') || null,
      cnpjCompleto: cell(cols, 'cnpj_completo') || null,
      codCc: cell(cols, 'cod_cc') || null,
      codCargo: cell(cols, 'cod_cargo') || null,
      descCargo,
      codVinculo: cell(cols, 'cod_vinculo') || null,
      codHorarioAtual: cell(cols, 'cod_horario_atual') || null,
      heMediaMensalHoras,
      regimeFuncionamento,
      massaSalarialBase,
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
  /** Weighted HE hours/month. */
  heMediaMensalHoras: number
  regimeFuncionamento: RegimeFuncionamento | null
  cnpjCompleto: string | null
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
    CostCenterTotals & {
      vrDiaSum: number
      vtDiaSum: number
      heSum: number
    }
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
        heMediaMensalHoras: 0,
        regimeFuncionamento: row.regimeFuncionamento,
        cnpjCompleto: row.cnpjCompleto,
        vrDiaSum: 0,
        vtDiaSum: 0,
        heSum: 0,
      }
      map.set(key, agg)
    }

    const scale = resolveScale(row)
    const qty = row.quantidade
    agg.headcount += qty
    agg.baselinePayroll += row.salario * qty
    agg.salaryMass += row.salario * qty
    agg.heSum += (row.heMediaMensalHoras || 0) * qty
    if (!agg.regimeFuncionamento && row.regimeFuncionamento) {
      agg.regimeFuncionamento = row.regimeFuncionamento
    }
    if (!agg.cnpjCompleto && row.cnpjCompleto) {
      agg.cnpjCompleto = row.cnpjCompleto
    }

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
    .map(({ vrDiaSum, vtDiaSum, heSum, ...rest }) => ({
      ...rest,
      avgVrValorDia: rest.peopleWithVr > 0 ? vrDiaSum / rest.peopleWithVr : 0,
      avgVtValorDia: rest.peopleWithVt > 0 ? vtDiaSum / rest.peopleWithVt : 0,
      heMediaMensalHoras: rest.headcount > 0 ? heSum / rest.headcount : 0,
    }))
    .sort((a, b) => a.centroCusto.localeCompare(b.centroCusto, 'pt-BR'))
}
