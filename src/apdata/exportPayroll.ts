/**
 * Apdata → PayrollRow[] via /api/query/select (single-table) + client join.
 * LGPD: never selects CON_DssNome; centro_custo uses CCU_CosEstrutura.
 */

import { selectRows } from '../api/query'
import type { PayrollParseIssue, PayrollRow } from '../engine'
import {
  buildCycleMap,
  estimateDaysFromCycle,
  resolveEscala,
  type CycleStats,
  type EscalaCode,
} from './classify'
import { LIVE_SELECT_STEPS } from './selects'

export type ExportProgressStep = {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
  sql?: string
}

export type ExportOverrides = {
  /** Applied when CON_VlnSalario / Integral are 0 (TEMP gap). */
  defaultSalario?: number
  vrValorDia?: number | null
  vtValorDia?: number | null
  environmentId?: string
  /** Max rows per select (server clamps to SQL_MAX_ROWS). */
  limit?: number
}

export type ExportStats = {
  contratadosAtivos: number
  linhasAgregadas: number
  salariosZerados: number
  escalaCounts: Record<string, number>
  /** LGPD-safe preview: cargo / CC code / escala / qty only — no names. */
  sample: {
    cargo: string
    centroCusto: string
    escala: string
    quantidade: number
    cargaMensal: number
  }[]
}

export type ExportResult = {
  rows: PayrollRow[]
  issues: PayrollParseIssue[]
  stats: ExportStats
  steps: ExportProgressStep[]
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function initialSteps(): ExportProgressStep[] {
  return [
    ...LIVE_SELECT_STEPS.map((s) => ({
      id: s.id,
      label: s.label,
      status: 'pending' as const,
    })),
    {
      id: 'classify',
      label: 'Classificar ciclos → escala_atual',
      status: 'pending',
    },
    {
      id: 'aggregate',
      label: 'Agregar cargo × CC × HMV × escala → PayrollRow[]',
      status: 'pending',
    },
  ]
}

type ProgressCb = (steps: ExportProgressStep[]) => void

function patchStep(
  steps: ExportProgressStep[],
  id: string,
  patch: Partial<ExportProgressStep>,
  onProgress?: ProgressCb,
): ExportProgressStep[] {
  const next = steps.map((s) => (s.id === id ? { ...s, ...patch } : s))
  onProgress?.(next)
  return next
}

/**
 * Run the Apdata export against the active Ambientes connection.
 */
export async function exportPayrollFromApdata(
  overrides: ExportOverrides = {},
  onProgress?: ProgressCb,
): Promise<ExportResult> {
  const limit = overrides.limit ?? 5000
  const envOpts = {
    environmentId: overrides.environmentId,
    limit,
  }
  let steps = initialSteps()
  const issues: PayrollParseIssue[] = []

  async function runStep(stepId: string) {
    const def = LIVE_SELECT_STEPS.find((s) => s.id === stepId)
    if (!def) throw new Error(`unknown step ${stepId}`)
    steps = patchStep(
      steps,
      stepId,
      { status: 'running', detail: def.note },
      onProgress,
    )
    const result = await selectRows({
      ...envOpts,
      table: def.table,
      columns: def.columns,
      where: def.where,
    })
    steps = patchStep(
      steps,
      stepId,
      {
        status: 'done',
        detail: `${result.rowCount} linha(s)`,
        sql: result.sql,
      },
      onProgress,
    )
    return result
  }

  try {
    const tiposRes = await runStep('tipos-dia')
    const jornadasRes = await runStep('jornadas')
    const horariosRes = await runStep('horarios')
    const contratadosRes = await runStep('contratados')
    const cargosRes = await runStep('cargos')
    const centrosRes = await runStep('centros')
    const hmvRes = await runStep('hmv')

    steps = patchStep(
      steps,
      'classify',
      { status: 'running' },
      onProgress,
    )

    const tipos = tiposRes.rows.map((r) => ({
      id: num(r.TIP_CdiTipoDiaPonto) ?? 0,
      trabalho: num(r.TIP_OplTrabalho) ?? 0,
    }))
    const jornadas = jornadasRes.rows.map((r) => ({
      horarioId: num(r.HRI_CdiHorario) ?? 0,
      tipoDiaId: num(r.HRI_CdiTipoDiaPonto) ?? 0,
      desativado: num(r.HRI_OplDesativado),
    }))
    const cycleMap = buildCycleMap(jornadas, tipos)

    const tipoEscalaByHorario = new Map<number, number>()
    for (const r of horariosRes.rows) {
      const id = num(r.HOR_CdiHorario)
      if (id === null) continue
      if (num(r.HOR_OplDesativado) != null && num(r.HOR_OplDesativado) !== 0) {
        continue
      }
      const te = num(r.HOR_CdiTipoEscala)
      if (te !== null) tipoEscalaByHorario.set(id, te)
    }

    const escalaCounts: Record<string, number> = {}
    for (const [hid, c] of cycleMap) {
      const code = resolveEscala(c.escala, tipoEscalaByHorario.get(hid) ?? null)
      escalaCounts[code] = (escalaCounts[code] ?? 0) + 1
    }

    steps = patchStep(
      steps,
      'classify',
      {
        status: 'done',
        detail: `${cycleMap.size} horário(s) classificados`,
      },
      onProgress,
    )

    steps = patchStep(
      steps,
      'aggregate',
      { status: 'running' },
      onProgress,
    )

    const cargoById = new Map<number, string>()
    for (const r of cargosRes.rows) {
      const id = num(r.CAR_CdiCargo)
      if (id === null) continue
      cargoById.set(id, str(r.CAR_D1sCargo) || `cargo#${id}`)
    }

    const ccById = new Map<number, string>()
    for (const r of centrosRes.rows) {
      const id = num(r.CCU_CdiCentroCusto)
      if (id === null) continue
      const code = str(r.CCU_CosEstrutura) || `cc#${id}`
      ccById.set(id, code)
    }

    const hmvById = new Map<
      number,
      { mensal: number | null; semanal: number | null }
    >()
    for (const r of hmvRes.rows) {
      const id = num(r.HMV_CdiQuantidadeHoraMes)
      if (id === null) continue
      hmvById.set(id, {
        mensal: num(r.HMV_QtnQuantidadeHoraMes),
        semanal: num(r.HMV_QtnHorasSemanal),
      })
    }

    type AggKey = string
    type Agg = {
      cargo: string
      centroCusto: string
      salarioSum: number
      salarioN: number
      cargaMensal: number
      cargaSemanal: number
      escala: EscalaCode
      days: number | null
      quantidade: number
    }

    const groups = new Map<AggKey, Agg>()
    let salariosZerados = 0
    let contratadosAtivos = 0

    for (const r of contratadosRes.rows) {
      if (num(r.CON_CdiSituacao) !== 1) continue
      contratadosAtivos += 1

      const cargoId = num(r.CON_CdiCargo)
      const ccId = num(r.CON_CdiCentroCusto)
      const hmvId = num(r.CON_CdiQuantidadeHoraMes)
      const horarioId = num(r.CON_CdiHorario)

      const cargo =
        cargoId !== null
          ? (cargoById.get(cargoId) ?? `cargo#${cargoId}`)
          : 'sem-cargo'
      const centroCusto =
        ccId !== null ? (ccById.get(ccId) ?? `cc#${ccId}`) : 'sem-cc'

      const hmv = hmvId !== null ? hmvById.get(hmvId) : undefined
      const cargaMensal = hmv?.mensal ?? 220
      const cargaSemanal = hmv?.semanal ?? 44

      const cycle: (CycleStats & { escala: Exclude<EscalaCode, '12x36'> }) | undefined =
        horarioId !== null ? cycleMap.get(horarioId) : undefined
      const tipoEscala =
        horarioId !== null
          ? (tipoEscalaByHorario.get(horarioId) ?? null)
          : null
      const escala = resolveEscala(cycle?.escala ?? null, tipoEscala)
      const days = estimateDaysFromCycle(cycle ?? null)

      let salario =
        num(r.CON_VlnSalario) ?? num(r.CON_VlnSalarioIntegral) ?? 0
      if (salario <= 0) {
        salariosZerados += 1
        if (
          overrides.defaultSalario != null &&
          overrides.defaultSalario > 0
        ) {
          salario = overrides.defaultSalario
        }
      }

      const key = [
        cargo,
        centroCusto,
        String(cargaMensal),
        String(cargaSemanal),
        escala,
        String(days ?? ''),
      ].join('\u0001')

      let agg = groups.get(key)
      if (!agg) {
        agg = {
          cargo,
          centroCusto,
          salarioSum: 0,
          salarioN: 0,
          cargaMensal,
          cargaSemanal,
          escala,
          days,
          quantidade: 0,
        }
        groups.set(key, agg)
      }
      agg.quantidade += 1
      if (salario > 0) {
        agg.salarioSum += salario
        agg.salarioN += 1
      }
    }

    const defaultSal =
      overrides.defaultSalario != null && overrides.defaultSalario > 0
        ? overrides.defaultSalario
        : 0
    const vr =
      overrides.vrValorDia !== undefined ? overrides.vrValorDia : null
    const vt =
      overrides.vtValorDia !== undefined ? overrides.vtValorDia : null

    const rows: PayrollRow[] = []
    let line = 2
    for (const agg of groups.values()) {
      const salario =
        agg.salarioN > 0 ? agg.salarioSum / agg.salarioN : defaultSal
      if (salario < 0) {
        issues.push({
          line,
          message: `salario inválido no grupo ${agg.cargo}`,
        })
        continue
      }
      if (!agg.cargo || !agg.centroCusto) {
        issues.push({ line, message: 'cargo ou centro_custo vazio' })
        continue
      }
      rows.push({
        cargo: agg.cargo,
        salario,
        cargaHorariaMensal: agg.cargaMensal,
        cargaHorariaSemanal: agg.cargaSemanal,
        centroCusto: agg.centroCusto,
        vrValorDia: vr,
        vrDiasMesAtual: agg.days,
        vtValorDia: vt,
        vtDiasMesAtual: agg.days,
        nome: null,
        quantidade: agg.quantidade,
        escalaAtual: agg.escala,
        sourceLine: line,
      })
      line += 1
    }

    rows.sort((a, b) => {
      const c = a.centroCusto.localeCompare(b.centroCusto, 'pt-BR')
      if (c !== 0) return c
      return a.cargo.localeCompare(b.cargo, 'pt-BR')
    })

    if (rows.length === 0) {
      issues.push({
        line: 0,
        message:
          'Nenhuma linha agregada. Verifique ambiente ativo e Contratados sit=1.',
      })
    }
    if (salariosZerados > 0 && defaultSal <= 0) {
      issues.push({
        line: 0,
        message: `${salariosZerados} vínculo(s) com salário 0 na TEMP — informe salário padrão no fluxo ou use base com folha.`,
      })
    }

    const sample = rows.slice(0, 8).map((r) => ({
      cargo: r.cargo,
      centroCusto: r.centroCusto,
      escala: r.escalaAtual ?? 'other',
      quantidade: r.quantidade,
      cargaMensal: r.cargaHorariaMensal,
    }))

    steps = patchStep(
      steps,
      'aggregate',
      {
        status: 'done',
        detail: `${rows.length} linha(s) · ${contratadosAtivos} ativo(s)`,
      },
      onProgress,
    )

    return {
      rows,
      issues,
      stats: {
        contratadosAtivos,
        linhasAgregadas: rows.length,
        salariosZerados,
        escalaCounts,
        sample,
      },
      steps,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const running = steps.find((s) => s.status === 'running')
    if (running) {
      steps = patchStep(
        steps,
        running.id,
        { status: 'error', detail: msg },
        onProgress,
      )
    }
    throw err
  }
}
