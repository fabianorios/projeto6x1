/** Payroll CSV import + aggregation helpers (layout: docs/import-layout.md). */

import type { ScaleCycle } from './types'
import type { ModoDias, RegimeFuncionamento } from '../types'
import { isModoDias, isRegimeFuncionamento } from '../types'
import {
  benefitsToPayrollScalars,
  parseBeneficiosAgg,
  type ExtractedBenefit,
} from '../apdata/classifyBenefit'

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
  'desc_cc',
  'cod_cargo',
  'desc_cargo',
  'cod_vinculo',
  'cod_horario_atual',
  'horario_trabalho_atual',
  'carga_semanal_atual',
  'cod_sindicato',
  'nome_sindicato',
  'cnpj_sindicato',
  'qtd_colaboradores',
  'massa_salarial_base',
  'vr_dia_medio',
  'vt_dia_medio',
  'dias_trabalho_mes_atual',
  'modo_dias_vr',
  'modo_dias_vt',
  'dias_base_mes_vr',
  'dias_base_mes_vt',
  'va_valor_dia',
  'va_valor_mes',
  'va_valor_medio',
  'va_modo_valor',
  'assist_medica_mes',
  'assist_odonto_mes',
  'beneficios_agg',
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
  /** CentrosCustos.CCU_D1sCentroCusto — optional; display when present. */
  descCc: string | null
  codCargo: string | null
  descCargo: string | null
  codVinculo: string | null
  codHorarioAtual: string | null
  /** Current work window HH:MM-HH:MM from JornadasItens (optional). */
  horarioTrabalhoAtual: string | null
  /** Sindicatos.SIN_CdiSindicato via CON_CdiSindicato (aggregate OK). */
  codSindicato: string | null
  /** Sindicatos.SIN_D1sSindicato — org name, not person PII. */
  nomeSindicato: string | null
  /** Sindicatos.SIN_NusCNPJ (optional). */
  cnpjSindicato: string | null
  /** Existing overtime hours/month (cascade input). */
  heMediaMensalHoras: number
  regimeFuncionamento: RegimeFuncionamento | null
  /** Raw massa salarial base from extractor (before ÷ qty). */
  massaSalarialBase: number | null
  /** VR/VT day projection mode from REGRA_* SqlProfile slots. */
  modoDiasVr: ModoDias | null
  modoDiasVt: ModoDias | null
  diasBaseMesVr: number | null
  diasBaseMesVt: number | null
  /** VA R$/day when vaModoValor === 'DIA'. */
  vaValorDia: number | null
  /** VA R$/month when vaModoValor === 'MES'. */
  vaValorMes: number | null
  vaModoValor: 'DIA' | 'MES' | null
  /** Assistência médica titular — fixed R$/month (HC cost). */
  assistMedicaMes: number | null
  /** Assistência odontológica — fixed R$/month (HC cost). */
  assistOdontoMes: number | null
  /** Dynamic TiposBeneficios from extractor (auto-classified). */
  benefits: ExtractedBenefit[]
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
  | 'descCc'
  | 'codCargo'
  | 'descCargo'
  | 'codVinculo'
  | 'codHorarioAtual'
  | 'horarioTrabalhoAtual'
  | 'codSindicato'
  | 'nomeSindicato'
  | 'cnpjSindicato'
  | 'heMediaMensalHoras'
  | 'regimeFuncionamento'
  | 'massaSalarialBase'
  | 'modoDiasVr'
  | 'modoDiasVt'
  | 'diasBaseMesVr'
  | 'diasBaseMesVt'
  | 'vaValorDia'
  | 'vaValorMes'
  | 'vaModoValor'
  | 'assistMedicaMes'
  | 'assistOdontoMes'
  | 'benefits'
> {
  return {
    codEmpresa: null,
    codFilial: null,
    cnpjCompleto: null,
    codCc: null,
    descCc: null,
    codCargo: null,
    descCargo: null,
    codVinculo: null,
    codHorarioAtual: null,
    horarioTrabalhoAtual: null,
    codSindicato: null,
    nomeSindicato: null,
    cnpjSindicato: null,
    heMediaMensalHoras: 0,
    regimeFuncionamento: null,
    massaSalarialBase: null,
    modoDiasVr: null,
    modoDiasVt: null,
    diasBaseMesVr: null,
    diasBaseMesVt: null,
    vaValorDia: null,
    vaValorMes: null,
    vaModoValor: null,
    assistMedicaMes: null,
    assistOdontoMes: null,
    benefits: [],
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

/** Detect delimiter from header: prefer TAB, then `;`, else `,`. */
export function detectPayrollDelimiter(
  headerLine: string,
): '\t' | ';' | ',' {
  let tabs = 0
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
    if (ch === '\t') tabs++
    else if (ch === ';') semis++
    else if (ch === ',') commas++
  }
  // Apdata Aptools default .txt export is TAB-separated.
  if (tabs > 0) return '\t'
  return semis >= commas ? ';' : ','
}

function detectSeparator(headerLine: string): '\t' | ';' | ',' {
  return detectPayrollDelimiter(headerLine)
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/\s+/g, '_')
}

/**
 * Parse payroll CSV/TXT/paste text (TAB, `;`, or `,` separator).
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

    const modoVrRaw = cell(cols, 'modo_dias_vr').trim().toUpperCase()
    const modoVtRaw = cell(cols, 'modo_dias_vt').trim().toUpperCase()
    let modoDiasVr: ModoDias | null = null
    let modoDiasVt: ModoDias | null = null
    if (modoVrRaw) {
      if (!isModoDias(modoVrRaw)) {
        issues.push({ line: lineNo, message: 'modo_dias_vr inválido' })
        continue
      }
      modoDiasVr = modoVrRaw
    }
    if (modoVtRaw) {
      if (!isModoDias(modoVtRaw)) {
        issues.push({ line: lineNo, message: 'modo_dias_vt inválido' })
        continue
      }
      modoDiasVt = modoVtRaw
    }

    const diasBaseVr = parseOptionalNonNeg(cell(cols, 'dias_base_mes_vr'))
    const diasBaseVt = parseOptionalNonNeg(cell(cols, 'dias_base_mes_vt'))
    if (diasBaseVr === 'invalid') {
      issues.push({ line: lineNo, message: 'dias_base_mes_vr inválido' })
      continue
    }
    if (diasBaseVt === 'invalid') {
      issues.push({ line: lineNo, message: 'dias_base_mes_vt inválido' })
      continue
    }

    const vaValorDia = parseOptionalNonNeg(cell(cols, 'va_valor_dia'))
    const vaValorMes = parseOptionalNonNeg(
      cell(cols, 'va_valor_mes') || cell(cols, 'va_valor_medio'),
    )
    const assistMedicaMes = parseOptionalNonNeg(
      cell(cols, 'assist_medica_mes'),
    )
    const assistOdontoMes = parseOptionalNonNeg(
      cell(cols, 'assist_odonto_mes'),
    )
    if (vaValorDia === 'invalid') {
      issues.push({ line: lineNo, message: 'va_valor_dia inválido' })
      continue
    }
    if (vaValorMes === 'invalid') {
      issues.push({ line: lineNo, message: 'va_valor_mes inválido' })
      continue
    }
    if (assistMedicaMes === 'invalid') {
      issues.push({ line: lineNo, message: 'assist_medica_mes inválido' })
      continue
    }
    if (assistOdontoMes === 'invalid') {
      issues.push({ line: lineNo, message: 'assist_odonto_mes inválido' })
      continue
    }
    const vaModoRaw = cell(cols, 'va_modo_valor').trim().toUpperCase()
    let vaModoValor: 'DIA' | 'MES' | null = null
    if (vaModoRaw === 'DIA' || vaModoRaw === 'MES') {
      vaModoValor = vaModoRaw
    } else if (vaModoRaw) {
      issues.push({ line: lineNo, message: 'va_modo_valor inválido' })
      continue
    } else if (vaValorMes !== null) {
      vaModoValor = 'MES'
    } else if (vaValorDia !== null) {
      vaModoValor = 'DIA'
    }

    const benefits = parseBeneficiosAgg(cell(cols, 'beneficios_agg'))
    const fromAgg = benefitsToPayrollScalars(benefits)
    let resolvedVr = vrValorDia as number | null
    let resolvedVaDia = vaValorDia as number | null
    let resolvedVaMes = vaValorMes as number | null
    let resolvedMed = assistMedicaMes as number | null
    let resolvedOdonto = assistOdontoMes as number | null
    let resolvedVaModo = vaModoValor
    if (benefits.length > 0) {
      if (fromAgg.vrValorDia != null) resolvedVr = fromAgg.vrValorDia
      if (fromAgg.vaValorMes != null) {
        resolvedVaMes = fromAgg.vaValorMes
        resolvedVaModo = resolvedVaModo ?? 'MES'
      }
      if (fromAgg.assistMedicaMes != null) resolvedMed = fromAgg.assistMedicaMes
      if (fromAgg.assistOdontoMes != null) {
        resolvedOdonto = fromAgg.assistOdontoMes
      }
    }

    rows.push({
      cargo,
      salario,
      cargaHorariaMensal: cargaM,
      cargaHorariaSemanal: cargaS,
      centroCusto,
      vrValorDia: resolvedVr,
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
      descCc: cell(cols, 'desc_cc') || null,
      codCargo: cell(cols, 'cod_cargo') || null,
      descCargo,
      codVinculo: cell(cols, 'cod_vinculo') || null,
      codHorarioAtual: cell(cols, 'cod_horario_atual') || null,
      horarioTrabalhoAtual: cell(cols, 'horario_trabalho_atual') || null,
      codSindicato: cell(cols, 'cod_sindicato') || null,
      nomeSindicato: cell(cols, 'nome_sindicato') || null,
      cnpjSindicato: cell(cols, 'cnpj_sindicato') || null,
      heMediaMensalHoras,
      regimeFuncionamento,
      massaSalarialBase,
      modoDiasVr,
      modoDiasVt,
      diasBaseMesVr: diasBaseVr,
      diasBaseMesVt: diasBaseVt,
      vaValorDia: resolvedVaDia,
      vaValorMes: resolvedVaMes,
      vaModoValor: resolvedVaModo,
      assistMedicaMes: resolvedMed,
      assistOdontoMes: resolvedOdonto,
      benefits,
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

/** Prefer CC description for UI; keep code for aggregation keys. */
export function centroCustoDisplayLabel(opts: {
  centroCusto?: string | null
  codCc?: string | null
  descCc?: string | null
}): string {
  const desc = (opts.descCc ?? '').trim()
  if (desc) return desc
  const code = (opts.centroCusto || opts.codCc || 'SEM_CC').trim()
  return code || 'SEM_CC'
}

/**
 * Dual-label CC for pickers / filters: `CODE — Descrição` when both exist
 * and differ; otherwise code or description alone.
 */
export function formatCentroCustoCodeDesc(opts: {
  centroCusto?: string | null
  codCc?: string | null
  descCc?: string | null
}): string {
  const code = (opts.codCc ?? opts.centroCusto ?? '').trim()
  const desc = (opts.descCc ?? '').trim()
  if (
    code &&
    desc &&
    code.toLocaleLowerCase('pt-BR') !== desc.toLocaleLowerCase('pt-BR')
  ) {
    return `${code} — ${desc}`
  }
  return desc || code || 'SEM_CC'
}

export interface CostCenterTotals {
  centroCusto: string
  /** Optional CC code from Folha `cod_cc` (when distinct from centroCusto). */
  codCc: string | null
  /** Optional CC description (CCU_D1sCentroCusto). */
  descCc: string | null
  /** Dominant cargo label (by headcount) — for OH cargo-scope matching. */
  cargo: string | null
  codCargo: string | null
  descCargo: string | null
  /** Dominant sindicato code (pass-through for Results filter — Etapa 4). */
  codSindicato: string | null
  /** Dominant sindicato name (collective framing; not person PII). */
  nomeSindicato: string | null
  headcount: number
  baselinePayroll: number
  /** Weighted sum of salaries for average (salario × qty). */
  salaryMass: number
  vr: BenefitLineTotals
  vt: BenefitLineTotals
  va: BenefitLineTotals
  /** Avg VR R$/day across people with VR. */
  avgVrValorDia: number
  avgVtValorDia: number
  avgVaValorDia: number
  avgVaValorMes: number
  avgAssistMedicaMes: number
  avgAssistOdontoMes: number
  peopleWithVr: number
  peopleWithVt: number
  peopleWithVa: number
  peopleWithAssistMedica: number
  peopleWithAssistOdonto: number
  /** Weighted HE hours/month. */
  heMediaMensalHoras: number
  regimeFuncionamento: RegimeFuncionamento | null
  cnpjCompleto: string | null
  /** Dominant Apdata schedule code (by headcount). */
  codHorarioAtual: string | null
  /** Work window HH:MM-HH:MM for the horário slice (optional). */
  horarioTrabalhoAtual: string | null
  /** Dominant escala_atual label (by headcount). */
  escalaAtual: string | null
  /** Headcount-weighted average weekly hours. */
  cargaSemanalAtual: number | null
}

/**
 * Prefer `cod · HH:MM–HH:MM` when Folha horario_trabalho_atual is present.
 * Tolerates multi-period strings (`08:00-12:00 / intervalo 60min / 13:00-17:48`):
 * only HH:MM-HH:MM ranges get an en-dash; delimiters/labels stay intact.
 */
export function formatHorarioAtualLabel(opts: {
  codHorarioAtual?: string | null
  horarioTrabalhoAtual?: string | null
}): string {
  const cod = (opts.codHorarioAtual ?? '').trim() || '—'
  const win = (opts.horarioTrabalhoAtual ?? '')
    .trim()
    .replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
  return win ? `${cod} · ${win}` : cod
}

/**
 * Resolve current / proposed benefit days for one row.
 *
 * modo_dias:
 * - ESCALA (default): empty dias → estimate from scale; proposed = target scale days
 * - FIXO_MES / CALENDARIO_LOCAL: keep dias_base_mes fixed in projection
 *   (multiply valor_dia × fixed days × new headcount only)
 */
export function resolveBenefitDays(
  rowDaysAtual: number | null,
  currentScale: ScaleCycle,
  targetScale: ScaleCycle,
  modoDias: ModoDias | null = null,
  diasBaseMes: number | null = null,
): { currentDays: number; proposedDays: number } {
  const estimatedCurrent = estimateWorkDaysPerMonth(currentScale)
  const estimatedTarget = estimateWorkDaysPerMonth(targetScale)
  const fixedBase =
    diasBaseMes !== null && diasBaseMes !== undefined
      ? diasBaseMes
      : rowDaysAtual !== null && rowDaysAtual !== undefined
        ? rowDaysAtual
        : estimatedCurrent

  const mode = modoDias ?? 'ESCALA'
  if (mode === 'FIXO_MES' || mode === 'CALENDARIO_LOCAL') {
    return { currentDays: fixedBase, proposedDays: fixedBase }
  }

  const currentDays =
    rowDaysAtual !== null && rowDaysAtual !== undefined
      ? rowDaysAtual
      : estimatedCurrent
  return { currentDays, proposedDays: estimatedTarget }
}

/**
 * Aggregate imported rows by Filial (CNPJ) → centro_custo → horário
 * (pre–HC-scale). Same CC under two CNPJs or two horários stays separate.
 */
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
      vaDiaSum: number
      vaMesSum: number
      medSum: number
      odontoSum: number
      heSum: number
      cargaSemanalSum: number
      escalaVotes: Map<string, number>
      horarioVotes: Map<string, number>
      cargoVotes: Map<string, number>
      codCargoByLabel: Map<string, string>
      descCargoByLabel: Map<string, string>
      sindicatoVotes: Map<string, number>
      nomeSindicatoByCod: Map<string, string>
    }
  >()

  for (const row of rows) {
    // Filial → CC → horário: keep each schedule slice distinct under its CC.
    const cnpjKey = (row.cnpjCompleto ?? '').replace(/\D/g, '')
    const horarioKey = (row.codHorarioAtual ?? '').trim()
    const key =
      cnpjKey.length >= 8
        ? `${cnpjKey}\u0001${row.centroCusto}\u0001${horarioKey}`
        : `${row.centroCusto}\u0001${horarioKey}`
    let agg = map.get(key)
    if (!agg) {
      agg = {
        centroCusto: row.centroCusto,
        codCc: row.codCc?.trim() || null,
        descCc: row.descCc?.trim() || null,
        cargo: null,
        codCargo: null,
        descCargo: null,
        codSindicato: null,
        nomeSindicato: null,
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
        va: {
          currentMonthly: 0,
          proposedMonthly: 0,
          currentPersonDays: 0,
          proposedPersonDays: 0,
        },
        avgVrValorDia: 0,
        avgVtValorDia: 0,
        avgVaValorDia: 0,
        avgVaValorMes: 0,
        avgAssistMedicaMes: 0,
        avgAssistOdontoMes: 0,
        peopleWithVr: 0,
        peopleWithVt: 0,
        peopleWithVa: 0,
        peopleWithAssistMedica: 0,
        peopleWithAssistOdonto: 0,
        heMediaMensalHoras: 0,
        regimeFuncionamento: row.regimeFuncionamento,
        cnpjCompleto: row.cnpjCompleto,
        codHorarioAtual: horarioKey || null,
        horarioTrabalhoAtual: row.horarioTrabalhoAtual?.trim() || null,
        escalaAtual: null,
        cargaSemanalAtual: null,
        vrDiaSum: 0,
        vtDiaSum: 0,
        vaDiaSum: 0,
        vaMesSum: 0,
        medSum: 0,
        odontoSum: 0,
        heSum: 0,
        cargaSemanalSum: 0,
        escalaVotes: new Map(),
        horarioVotes: new Map(),
        cargoVotes: new Map(),
        codCargoByLabel: new Map(),
        descCargoByLabel: new Map(),
        sindicatoVotes: new Map(),
        nomeSindicatoByCod: new Map(),
      }
      map.set(key, agg)
    }

    const scale = resolveScale(row)
    const qty = row.quantidade
    agg.headcount += qty
    agg.baselinePayroll += row.salario * qty
    agg.salaryMass += row.salario * qty
    agg.heSum += (row.heMediaMensalHoras || 0) * qty
    agg.cargaSemanalSum += row.cargaHorariaSemanal * qty
    if (row.escalaAtual) {
      agg.escalaVotes.set(
        row.escalaAtual,
        (agg.escalaVotes.get(row.escalaAtual) ?? 0) + qty,
      )
    }
    if (row.codHorarioAtual) {
      agg.horarioVotes.set(
        row.codHorarioAtual,
        (agg.horarioVotes.get(row.codHorarioAtual) ?? 0) + qty,
      )
    }
    const cargoLabel =
      (row.cargo ?? '').trim() ||
      (row.descCargo ?? '').trim() ||
      (row.codCargo ?? '').trim()
    if (cargoLabel) {
      agg.cargoVotes.set(
        cargoLabel,
        (agg.cargoVotes.get(cargoLabel) ?? 0) + qty,
      )
      if (row.codCargo?.trim()) {
        agg.codCargoByLabel.set(cargoLabel, row.codCargo.trim())
      }
      if (row.descCargo?.trim()) {
        agg.descCargoByLabel.set(cargoLabel, row.descCargo.trim())
      }
    }
    const sindicatoCod = (row.codSindicato ?? '').trim()
    if (sindicatoCod && sindicatoCod !== '0') {
      agg.sindicatoVotes.set(
        sindicatoCod,
        (agg.sindicatoVotes.get(sindicatoCod) ?? 0) + qty,
      )
      const nome = (row.nomeSindicato ?? '').trim()
      if (nome) agg.nomeSindicatoByCod.set(sindicatoCod, nome)
    }
    if (!agg.regimeFuncionamento && row.regimeFuncionamento) {
      agg.regimeFuncionamento = row.regimeFuncionamento
    }
    if (!agg.cnpjCompleto && row.cnpjCompleto) {
      agg.cnpjCompleto = row.cnpjCompleto
    }
    if (!agg.codCc && row.codCc?.trim()) {
      agg.codCc = row.codCc.trim()
    }
    if (!agg.descCc && row.descCc?.trim()) {
      agg.descCc = row.descCc.trim()
    }
    if (!agg.horarioTrabalhoAtual && row.horarioTrabalhoAtual?.trim()) {
      agg.horarioTrabalhoAtual = row.horarioTrabalhoAtual.trim()
    }

    if (row.vrValorDia !== null) {
      const { currentDays, proposedDays } = resolveBenefitDays(
        row.vrDiasMesAtual,
        scale,
        targetScale,
        row.modoDiasVr,
        row.diasBaseMesVr,
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
        row.modoDiasVt,
        row.diasBaseMesVt,
      )
      agg.vt.currentMonthly += row.vtValorDia * currentDays * qty
      agg.vt.proposedMonthly += row.vtValorDia * proposedDays * qty
      agg.vt.currentPersonDays += currentDays * qty
      agg.vt.proposedPersonDays += proposedDays * qty
      agg.vtDiaSum += row.vtValorDia * qty
      agg.peopleWithVt += qty
    }

    const vaModo = row.vaModoValor ?? (row.vaValorMes != null ? 'MES' : 'DIA')
    if (vaModo === 'MES' && row.vaValorMes != null && row.vaValorMes > 0) {
      agg.va.currentMonthly += row.vaValorMes * qty
      agg.va.proposedMonthly += row.vaValorMes * qty
      agg.vaMesSum += row.vaValorMes * qty
      agg.peopleWithVa += qty
    } else if (vaModo === 'DIA' && row.vaValorDia != null && row.vaValorDia > 0) {
      const { currentDays, proposedDays } = resolveBenefitDays(
        row.vrDiasMesAtual,
        scale,
        targetScale,
        row.modoDiasVr,
        row.diasBaseMesVr,
      )
      agg.va.currentMonthly += row.vaValorDia * currentDays * qty
      agg.va.proposedMonthly += row.vaValorDia * proposedDays * qty
      agg.va.currentPersonDays += currentDays * qty
      agg.va.proposedPersonDays += proposedDays * qty
      agg.vaDiaSum += row.vaValorDia * qty
      agg.peopleWithVa += qty
    }

    if (row.assistMedicaMes != null && row.assistMedicaMes > 0) {
      agg.medSum += row.assistMedicaMes * qty
      agg.peopleWithAssistMedica += qty
    }
    if (row.assistOdontoMes != null && row.assistOdontoMes > 0) {
      agg.odontoSum += row.assistOdontoMes * qty
      agg.peopleWithAssistOdonto += qty
    }
  }

  return [...map.values()]
    .map(
      ({
        vrDiaSum,
        vtDiaSum,
        vaDiaSum,
        vaMesSum,
        medSum,
        odontoSum,
        heSum,
        cargaSemanalSum,
        escalaVotes,
        horarioVotes,
        cargoVotes,
        codCargoByLabel,
        descCargoByLabel,
        sindicatoVotes,
        nomeSindicatoByCod,
        ...rest
      }) => {
        const cargo = dominantVote(cargoVotes)
        const codSindicato = dominantVote(sindicatoVotes)
        return {
          ...rest,
          avgVrValorDia:
            rest.peopleWithVr > 0 ? vrDiaSum / rest.peopleWithVr : 0,
          avgVtValorDia:
            rest.peopleWithVt > 0 ? vtDiaSum / rest.peopleWithVt : 0,
          avgVaValorDia:
            rest.peopleWithVa > 0 ? vaDiaSum / rest.peopleWithVa : 0,
          avgVaValorMes:
            rest.peopleWithVa > 0 ? vaMesSum / rest.peopleWithVa : 0,
          avgAssistMedicaMes:
            rest.peopleWithAssistMedica > 0
              ? medSum / rest.peopleWithAssistMedica
              : 0,
          avgAssistOdontoMes:
            rest.peopleWithAssistOdonto > 0
              ? odontoSum / rest.peopleWithAssistOdonto
              : 0,
          heMediaMensalHoras: rest.headcount > 0 ? heSum / rest.headcount : 0,
          cargaSemanalAtual:
            rest.headcount > 0
              ? Math.round((cargaSemanalSum / rest.headcount) * 100) / 100
              : null,
          escalaAtual: dominantVote(escalaVotes),
          // Prefer the slice key horário; fall back to dominant vote if empty.
          codHorarioAtual: rest.codHorarioAtual || dominantVote(horarioVotes),
          cargo,
          codCargo: cargo ? codCargoByLabel.get(cargo) ?? null : null,
          descCargo: cargo ? descCargoByLabel.get(cargo) ?? null : null,
          codSindicato,
          nomeSindicato: codSindicato
            ? nomeSindicatoByCod.get(codSindicato) ?? null
            : null,
        }
      },
    )
    .sort((a, b) => {
      const ca = (a.cnpjCompleto ?? '').replace(/\D/g, '')
      const cb = (b.cnpjCompleto ?? '').replace(/\D/g, '')
      if (ca !== cb) return ca.localeCompare(cb)
      const ccCmp = a.centroCusto.localeCompare(b.centroCusto, 'pt-BR')
      if (ccCmp !== 0) return ccCmp
      return (a.codHorarioAtual ?? '').localeCompare(
        b.codHorarioAtual ?? '',
        'pt-BR',
      )
    })
}

function dominantVote(votes: Map<string, number>): string | null {
  let best: string | null = null
  let bestN = 0
  for (const [key, n] of votes) {
    if (n > bestN) {
      best = key
      bestN = n
    }
  }
  return best
}
