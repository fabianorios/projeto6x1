/**
 * Build ExportResult from ephemeral extractor rows (payroll path).
 * LGPD: samples omit names; only cargo / CC / escala / qty.
 */

import { mapExtractorAggregatesToPayroll } from './mapExtractorRows'
import type { ExportProgressStep, ExportResult } from './exportPayroll'
import { cnpjDigits } from './cnpj'
import type { PayrollParseIssue } from '../engine'

export type EphemeralExportOverrides = {
  defaultSalario?: number
  vrValorDia?: number | null
  vtValorDia?: number | null
  /** Digits-only establishment keys selected in the UI. */
  selectedCnpjKeys?: string[]
}

function applyOverrides(
  rows: ReturnType<typeof mapExtractorAggregatesToPayroll>,
  overrides: EphemeralExportOverrides,
): { rows: typeof rows; salariosZerados: number; comVtCadastro: number } {
  let salariosZerados = 0
  let comVtCadastro = 0
  const next = rows.map((r) => {
    let salario = r.salario
    if (!(salario > 0) && overrides.defaultSalario && overrides.defaultSalario > 0) {
      salariosZerados += 1
      salario = overrides.defaultSalario
    } else if (!(salario > 0)) {
      salariosZerados += 1
    }
    let vrValorDia = r.vrValorDia
    if (overrides.vrValorDia != null && Number.isFinite(overrides.vrValorDia)) {
      vrValorDia = overrides.vrValorDia
    }
    let vtValorDia = r.vtValorDia
    if (overrides.vtValorDia != null && Number.isFinite(overrides.vtValorDia)) {
      vtValorDia = overrides.vtValorDia
    } else if (vtValorDia != null && vtValorDia > 0) {
      comVtCadastro += 1
    }
    return { ...r, salario, vrValorDia, vtValorDia }
  })
  return { rows: next, salariosZerados, comVtCadastro }
}

function filterByCnpj(
  rows: ReturnType<typeof mapExtractorAggregatesToPayroll>,
  selectedKeys: string[] | undefined,
): typeof rows {
  if (!selectedKeys || selectedKeys.length === 0) return rows
  const keys = new Set(selectedKeys.map((k) => cnpjDigits(k)).filter(Boolean))
  if (keys.size === 0) return rows
  return rows.filter((r) => {
    const dig = cnpjDigits(r.cnpjCompleto ?? '')
    return dig.length > 0 && keys.has(dig)
  })
}

/**
 * Apply Premissas salary / VR / VT overrides on already-mapped PayrollRow[]
 * (server P3 path — no client aggregate→payroll map).
 */
export function applyEphemeralPayrollOverrides(
  rows: ReturnType<typeof mapExtractorAggregatesToPayroll>,
  overrides: EphemeralExportOverrides = {},
): {
  rows: ReturnType<typeof mapExtractorAggregatesToPayroll>
  salariosZerados: number
  comVtCadastro: number
} {
  const filtered = filterByCnpj(rows, overrides.selectedCnpjKeys)
  return applyOverrides(filtered, overrides)
}

/** Build ExportResult stats from already-mapped payroll rows. */
export function exportResultFromPayrollRows(
  payrollRows: ReturnType<typeof mapExtractorAggregatesToPayroll>,
  parseIssues: PayrollParseIssue[] = [],
  steps?: ExportProgressStep[],
  emptyMessage = 'Nenhuma linha válida após o parse.',
  overrides?: EphemeralExportOverrides,
): ExportResult {
  const applied = overrides
    ? applyEphemeralPayrollOverrides(payrollRows, overrides)
    : {
        rows: payrollRows,
        salariosZerados: payrollRows.filter((r) => !(r.salario > 0)).length,
        comVtCadastro: payrollRows.filter(
          (r) => r.vtValorDia != null && r.vtValorDia > 0,
        ).length,
      }
  const rows = applied.rows
  const escalaCounts: Record<string, number> = {}
  let contratadosAtivos = 0
  const cnpjs = new Set<string>()
  for (const r of rows) {
    contratadosAtivos += r.quantidade
    const esc = r.escalaAtual || 'NA'
    escalaCounts[esc] = (escalaCounts[esc] ?? 0) + r.quantidade
    const dig = cnpjDigits(r.cnpjCompleto ?? '')
    if (dig) cnpjs.add(dig)
  }

  const issues = [...parseIssues]
  if (rows.length === 0) {
    issues.push({ line: 0, message: emptyMessage })
  }

  const doneSteps: ExportProgressStep[] = steps ?? [
    {
      id: 'aptools-csv',
      label: 'CSV Aptools (parse servidor)',
      status: 'done',
      detail: `${rows.length} linha(s)`,
    },
  ]

  return {
    rows,
    issues,
    stats: {
      contratadosAtivos,
      linhasAgregadas: rows.length,
      salariosZerados: applied.salariosZerados,
      comVtCadastro: applied.comVtCadastro,
      estabelecimentosFiltrados: cnpjs.size,
      escalaCounts,
      sample: rows.slice(0, 8).map((r) => ({
        cargo: r.cargo,
        centroCusto: r.centroCusto,
        escala: r.escalaAtual || '—',
        quantidade: r.quantidade,
        cargaMensal: r.cargaHorariaMensal,
      })),
    },
    steps: doneSteps,
  }
}

/** Map extractor API rows → ExportResult for ApdataFlowPanel ready phase. */
export function exportResultFromEphemeralRows(
  rawRows: Record<string, unknown>[],
  overrides: EphemeralExportOverrides = {},
  steps?: ExportProgressStep[],
): ExportResult {
  const mapped = mapExtractorAggregatesToPayroll(
    rawRows as Parameters<typeof mapExtractorAggregatesToPayroll>[0],
  )
  const filtered = filterByCnpj(mapped, overrides.selectedCnpjKeys)
  const { rows, salariosZerados, comVtCadastro } = applyOverrides(
    filtered,
    overrides,
  )

  const base = exportResultFromPayrollRows(
    rows,
    [],
    steps ?? [
      {
        id: 'ephemeral-extract',
        label: 'Extrator efêmero (POST /api/query/ephemeral)',
        status: 'done',
        detail: `${rawRows.length} linha(s) agregadas`,
      },
    ],
    'Extrator efêmero não retornou linhas após filtros.',
  )

  return {
    ...base,
    stats: {
      ...base.stats,
      salariosZerados,
      comVtCadastro,
    },
  }
}
