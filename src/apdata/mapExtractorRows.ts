/**
 * Map official extractor rows → PayrollRow[].
 * Aggregate grain omits nome; Aptools nominal grain carries CON_DssNome.
 */

import {
  emptyPayrollExtras,
  type PayrollRow,
} from '../engine'
import type { BenefitParams } from '../types/sql-profile'
import {
  applyBenefitOverrides,
  benefitsToPayrollScalars,
  parseBeneficiosAgg,
  resolveBenefitSlotAmounts,
  type BenefitSessionOverrides,
  type BenefitSlotAmounts,
  type ExtractedBenefit,
} from './classifyBenefit'

export type ExtractorAggregate = {
  cod_empresa?: string
  cod_filial?: string
  cnpj_completo?: string
  cod_cc?: string
  desc_cc?: string
  cod_cargo?: string
  desc_cargo?: string
  /** Aptools nominal grain — CON_DssNome (absent on LGPD aggregate). */
  nome?: string | null
  cod_vinculo?: string
  cod_horario_atual?: string
  /** Outer work window HH:MM-HH:MM (optional). */
  horario_trabalho_atual?: string
  escala_atual?: string
  carga_semanal_atual?: number
  /** QuantidadesHorasMes.HMV_QtnQuantidadeHoraMes (Horas Base). */
  carga_horaria_mensal?: number
  /** Sindicatos via CON_CdiSindicato. */
  cod_sindicato?: string
  nome_sindicato?: string
  cnpj_sindicato?: string
  qtd_colaboradores?: number
  massa_salarial_base?: number
  vr_dia_medio?: number
  vt_dia_medio?: number
  qtd_passes_dia_medio?: number
  va_valor_medio?: number
  assist_medica_mes?: number
  assist_odonto_mes?: number
  dias_trabalho_mes_atual?: number
  /** Dynamic TiposBeneficios: codigo|desc|valor;… */
  beneficios_agg?: string
  /** From SqlProfile.benefitParams.vaModoValor when mapping after extract. */
  va_modo_valor?: 'DIA' | 'MES'
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export type PayrollRowWithBenefits = PayrollRow & {
  benefits: ExtractedBenefit[]
}

export type MapExtractorOptions = {
  sessionOverrides?: BenefitSessionOverrides
  /** SqlProfile code→slot map (and optional amount defaults). */
  benefitParams?: BenefitParams | null
  /** Session scalar overrides for VR/VA/médico/odonto. */
  slotAmounts?: BenefitSlotAmounts | null
}

/** Convert extractor rows into engine PayrollRow[] (nome when present). */
export function mapExtractorAggregatesToPayroll(
  rows: ExtractorAggregate[],
  sessionOverridesOrOpts: BenefitSessionOverrides | MapExtractorOptions = {},
): PayrollRowWithBenefits[] {
  const opts: MapExtractorOptions =
    'sessionOverrides' in sessionOverridesOrOpts ||
    'benefitParams' in sessionOverridesOrOpts ||
    'slotAmounts' in sessionOverridesOrOpts
      ? (sessionOverridesOrOpts as MapExtractorOptions)
      : { sessionOverrides: sessionOverridesOrOpts as BenefitSessionOverrides }
  const sessionOverrides = opts.sessionOverrides ?? {}
  const codeMap = opts.benefitParams ?? null
  const slotAmounts = opts.slotAmounts ?? null

  return rows.map((r, i) => {
    const qty = Math.max(0, num(r.qtd_colaboradores, 0))
    const massa = num(r.massa_salarial_base, 0)
    const salario = qty > 0 ? massa / qty : massa
    const cargaSemanal = num(r.carga_semanal_atual, 44)
    const cargaMensalRaw = num(r.carga_horaria_mensal, 0)
    const cargaMensal =
      cargaMensalRaw > 0
        ? cargaMensalRaw
        : Math.round(cargaSemanal * 5 * 100) / 100
    const dias = num(r.dias_trabalho_mes_atual, 22)
    const benefits = applyBenefitOverrides(
      parseBeneficiosAgg(r.beneficios_agg),
      sessionOverrides,
    )
    const fromAgg = benefitsToPayrollScalars(benefits, codeMap)

    // Prefer dynamic agg classification; fall back to legacy scalar columns.
    const vrLegacy = num(r.vr_dia_medio, 0)
    const vt = num(r.vt_dia_medio, 0)
    const vaLegacy = num(r.va_valor_medio, 0)
    const medLegacy = num(r.assist_medica_mes, 0)
    const odontoLegacy = num(r.assist_odonto_mes, 0)
    const vaModo =
      codeMap?.vaModoValor === 'DIA' || r.va_modo_valor === 'DIA'
        ? 'DIA'
        : 'MES'

    const extracted = {
      vrValorDia:
        fromAgg.vrValorDia != null && fromAgg.vrValorDia > 0
          ? fromAgg.vrValorDia
          : vrLegacy > 0
            ? vrLegacy
            : null,
      vaValorMes:
        fromAgg.vaValorMes != null && fromAgg.vaValorMes > 0
          ? fromAgg.vaValorMes
          : vaLegacy > 0
            ? vaLegacy
            : null,
      assistMedicaMes:
        fromAgg.assistMedicaMes != null && fromAgg.assistMedicaMes > 0
          ? fromAgg.assistMedicaMes
          : medLegacy > 0
            ? medLegacy
            : null,
      assistOdontoMes:
        fromAgg.assistOdontoMes != null && fromAgg.assistOdontoMes > 0
          ? fromAgg.assistOdontoMes
          : odontoLegacy > 0
            ? odontoLegacy
            : null,
    }
    const resolved = resolveBenefitSlotAmounts(
      extracted,
      codeMap,
      slotAmounts,
    )
    const vr = resolved.vrValorDia
    const va = resolved.vaValorMes
    const med = resolved.assistMedicaMes
    const odonto = resolved.assistOdontoMes

    const cargo = (r.desc_cargo || 'NAO_INFORMADO').trim()
    const centro = (r.cod_cc || 'SEM_CC').trim()

    return {
      cargo,
      salario,
      cargaHorariaMensal: cargaMensal,
      cargaHorariaSemanal: cargaSemanal,
      centroCusto: centro,
      vrValorDia: vr != null && vr > 0 ? vr : null,
      vrDiasMesAtual: dias > 0 ? dias : null,
      vtValorDia: vt > 0 ? vt : null,
      vtDiasMesAtual: dias > 0 ? dias : null,
      /** Nominal Aptools: CON_DssNome; aggregate LGPD grain: null. */
      nome: (r.nome ?? '').trim() || null,
      quantidade: qty || 1,
      escalaAtual: r.escala_atual || null,
      sourceLine: i + 2,
      ...emptyPayrollExtras(),
      codEmpresa: r.cod_empresa || null,
      codFilial: r.cod_filial || null,
      cnpjCompleto: r.cnpj_completo || null,
      codCc: r.cod_cc || null,
      descCc: r.desc_cc?.trim() || null,
      codCargo: r.cod_cargo || null,
      descCargo: r.desc_cargo || null,
      codVinculo: r.cod_vinculo || null,
      codHorarioAtual: r.cod_horario_atual || null,
      horarioTrabalhoAtual: r.horario_trabalho_atual?.trim() || null,
      codSindicato: r.cod_sindicato || null,
      nomeSindicato: r.nome_sindicato?.trim() || null,
      cnpjSindicato: r.cnpj_sindicato?.trim() || null,
      massaSalarialBase: massa,
      vaModoValor: va != null && va > 0 ? vaModo : null,
      vaValorDia: va != null && va > 0 && vaModo === 'DIA' ? va : null,
      vaValorMes: va != null && va > 0 && vaModo === 'MES' ? va : null,
      assistMedicaMes: med != null && med > 0 ? med : null,
      assistOdontoMes: odonto != null && odonto > 0 ? odonto : null,
      benefits,
    }
  })
}
