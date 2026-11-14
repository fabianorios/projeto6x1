/**
 * Map official extractor aggregates → PayrollRow[] (no PII).
 */

import {
  emptyPayrollExtras,
  type PayrollRow,
} from '../engine'

export type ExtractorAggregate = {
  cod_empresa?: string
  cod_filial?: string
  cnpj_completo?: string
  cod_cc?: string
  cod_cargo?: string
  desc_cargo?: string
  cod_vinculo?: string
  cod_horario_atual?: string
  escala_atual?: string
  carga_semanal_atual?: number
  qtd_colaboradores?: number
  massa_salarial_base?: number
  vr_dia_medio?: number
  vt_dia_medio?: number
  dias_trabalho_mes_atual?: number
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Convert LGPD-safe extractor rows into engine PayrollRow[]. */
export function mapExtractorAggregatesToPayroll(
  rows: ExtractorAggregate[],
): PayrollRow[] {
  return rows.map((r, i) => {
    const qty = Math.max(0, num(r.qtd_colaboradores, 0))
    const massa = num(r.massa_salarial_base, 0)
    const salario = qty > 0 ? massa / qty : massa
    const cargaSemanal = num(r.carga_semanal_atual, 44)
    const dias = num(r.dias_trabalho_mes_atual, 22)
    const vr = num(r.vr_dia_medio, 0)
    const vt = num(r.vt_dia_medio, 0)
    const cargo = (r.desc_cargo || 'NAO_INFORMADO').trim()
    const centro = (r.cod_cc || 'SEM_CC').trim()

    return {
      cargo,
      salario,
      cargaHorariaMensal: Math.round(cargaSemanal * 5 * 100) / 100,
      cargaHorariaSemanal: cargaSemanal,
      centroCusto: centro,
      vrValorDia: vr > 0 ? vr : null,
      vrDiasMesAtual: dias > 0 ? dias : null,
      vtValorDia: vt > 0 ? vt : null,
      vtDiasMesAtual: dias > 0 ? dias : null,
      nome: null,
      quantidade: qty || 1,
      escalaAtual: r.escala_atual || null,
      sourceLine: i + 2,
      ...emptyPayrollExtras(),
      codEmpresa: r.cod_empresa || null,
      codFilial: r.cod_filial || null,
      cnpjCompleto: r.cnpj_completo || null,
      codCc: r.cod_cc || null,
      codCargo: r.cod_cargo || null,
      descCargo: r.desc_cargo || null,
      codVinculo: r.cod_vinculo || null,
      codHorarioAtual: r.cod_horario_atual || null,
      massaSalarialBase: massa,
    }
  })
}
