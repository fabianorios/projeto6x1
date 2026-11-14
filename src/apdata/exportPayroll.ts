/**
 * Apdata → PayrollRow[] via /api/query/select (single-table) + client join.
 * LGPD: never selects CON_DssNome; centro_custo uses CCU_CosEstrutura.
 * VT: ConATransportes (CAS_DtdFim IS NULL) × MeiosTransportesItens;
 *     days = HorariosTiposDiasAT ∩ TIP_OplTrabalho=1. No ConCalculoATransportes.
 */

import { selectRows } from '../api/query'
import type { PayrollParseIssue, PayrollRow } from '../engine'
import {
  buildAtWorkDaysMap,
  buildCycleMap,
  buildMeioPrecoMap,
  buildVtValorDiaMap,
  estimateDaysFromCycle,
  estimateVtDaysFromAtAndCycle,
  resolveEscala,
  type CycleStats,
  type EscalaCode,
} from './classify'
import {
  EXCLUDED_SITUACOES,
  buildEstablishments,
  folhaToEstablishmentKey,
  isIncludedSituacao,
  type Establishment,
} from './cnpj'
import {
  activeRamos,
  buildRamos,
  type RamoAtividade,
} from './ramos'
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
  /** When set, overrides ConATransportes Σ. Empty/null → compute from cadastro. */
  vtValorDia?: number | null
  environmentId?: string
  /** Max rows per select (server clamps to SQL_MAX_ROWS). */
  limit?: number
  /**
   * Establishment keys (digits) to include.
   * Empty / undefined → all establishments reachable via Folhas→Locais→Empresas.
   */
  selectedCnpjKeys?: string[]
  /**
   * RamosAtividadesEmpresas ids to include (via EMP_CdiRamoAtividadeEmpresa).
   * Empty / undefined → no ramo filter (all empresas).
   */
  selectedRamoIds?: number[]
}

export type ExportStats = {
  contratadosAtivos: number
  linhasAgregadas: number
  salariosZerados: number
  comVtCadastro: number
  estabelecimentosFiltrados: number
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
      label: 'Classificar ciclos + VT (AT ∩ trabalho)',
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
 * List establishments reachable via Folhas→Locais→Empresas.
 * Labels: EMP_DssEmpresa · LOC_D1sLocal · CNPJ (admin runtime OK).
 * UI count: colaboradores (vínculos) with CON_CdiSituacao NOT IN (0,2,3,99).
 */
export async function loadEstablishmentsFromApdata(opts: {
  environmentId?: string
  limit?: number
} = {}): Promise<Establishment[]> {
  const limit = opts.limit ?? 5000
  const envOpts = { environmentId: opts.environmentId, limit }
  const [empresasRes, locaisRes, folhasRes, contratadosRes] =
    await Promise.all([
      selectRows({
        ...envOpts,
        table: 'Empresas',
        columns: [
          'EMP_CdiEmpresa',
          'EMP_DssEmpresa',
          'EMP_NusCNPJPrefixo',
          'EMP_CdiRamoAtividadeEmpresa',
        ],
      }),
      selectRows({
        ...envOpts,
        table: 'Locais',
        columns: [
          'LOC_CdiLocal',
          'LOC_CdiEmpresa',
          'LOC_D1sLocal',
          'LOC_NusCNPJSufixo',
        ],
      }),
      selectRows({
        ...envOpts,
        table: 'Folhas',
        columns: ['FOL_CdiFolha', 'FOL_CdiLocal'],
      }),
      selectRows({
        ...envOpts,
        table: 'Contratados',
        columns: ['CON_CdiFolha', 'CON_CdiSituacao'],
        whereNotIn: { CON_CdiSituacao: [...EXCLUDED_SITUACOES] },
      }),
    ])
  return buildEstablishments(
    empresasRes.rows.map((r) => ({
      empresaId: num(r.EMP_CdiEmpresa) ?? 0,
      prefixo: str(r.EMP_NusCNPJPrefixo),
      razaoSocial: str(r.EMP_DssEmpresa),
      ramoId: num(r.EMP_CdiRamoAtividadeEmpresa),
    })),
    locaisRes.rows.map((r) => ({
      localId: num(r.LOC_CdiLocal) ?? 0,
      empresaId: num(r.LOC_CdiEmpresa) ?? 0,
      sufixo: str(r.LOC_NusCNPJSufixo),
      nomeFilial: str(r.LOC_D1sLocal),
    })),
    folhasRes.rows.map((r) => ({
      folhaId: num(r.FOL_CdiFolha) ?? 0,
      localId: num(r.FOL_CdiLocal) ?? 0,
    })),
    contratadosRes.rows.map((r) => ({
      folhaId: num(r.CON_CdiFolha) ?? 0,
      situacao: num(r.CON_CdiSituacao),
    })),
  )
}

/**
 * List RamosAtividadesEmpresas (active preferred) for UI multi-select.
 */
export async function loadRamosFromApdata(opts: {
  environmentId?: string
  limit?: number
} = {}): Promise<RamoAtividade[]> {
  const limit = opts.limit ?? 5000
  const res = await selectRows({
    environmentId: opts.environmentId,
    limit,
    table: 'RamosAtividadesEmpresas',
    columns: [
      'RAE_CdiRamoAtividadeEmpresa',
      'RAE_D1sRamoAtividadeEmpresa',
      'RAE_CosReferencia',
      'RAE_OplDesativado',
    ],
  })
  const all = buildRamos(
    res.rows.map((r) => ({
      id: num(r.RAE_CdiRamoAtividadeEmpresa) ?? 0,
      label: str(r.RAE_D1sRamoAtividadeEmpresa),
      referencia: str(r.RAE_CosReferencia),
      desativado: num(r.RAE_OplDesativado),
    })),
  )
  const active = activeRamos(all)
  return active.length > 0 ? active : all
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
      whereNotIn: def.whereNotIn,
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
    const atMaskRes = await runStep('at-mask')
    const empresasRes = await runStep('empresas')
    const locaisRes = await runStep('locais')
    await runStep('ramos')
    const folhasRes = await runStep('folhas')
    const contratadosRes = await runStep('contratados')
    const cargosRes = await runStep('cargos')
    const centrosRes = await runStep('centros')
    const hmvRes = await runStep('hmv')
    const conAtRes = await runStep('con-at')
    const meiosRes = await runStep('meios-itens')

    const establishments = buildEstablishments(
      empresasRes.rows.map((r) => ({
        empresaId: num(r.EMP_CdiEmpresa) ?? 0,
        prefixo: str(r.EMP_NusCNPJPrefixo),
        razaoSocial: str(r.EMP_DssEmpresa),
        ramoId: num(r.EMP_CdiRamoAtividadeEmpresa),
      })),
      locaisRes.rows.map((r) => ({
        localId: num(r.LOC_CdiLocal) ?? 0,
        empresaId: num(r.LOC_CdiEmpresa) ?? 0,
        sufixo: str(r.LOC_NusCNPJSufixo),
        nomeFilial: str(r.LOC_D1sLocal),
      })),
      folhasRes.rows.map((r) => ({
        folhaId: num(r.FOL_CdiFolha) ?? 0,
        localId: num(r.FOL_CdiLocal) ?? 0,
      })),
      contratadosRes.rows.map((r) => ({
        folhaId: num(r.CON_CdiFolha) ?? 0,
        situacao: num(r.CON_CdiSituacao),
      })),
    )
    const folhaCnpj = folhaToEstablishmentKey(establishments)
    const selectedKeys = new Set(
      (overrides.selectedCnpjKeys ?? [])
        .map((k) => k.trim())
        .filter(Boolean),
    )
    const selectedRamos = new Set(
      (overrides.selectedRamoIds ?? []).filter((id) => Number.isFinite(id)),
    )
    const filterByCnpj = selectedKeys.size > 0
    const filterByRamo = selectedRamos.size > 0
    const establishmentByKey = new Map(
      establishments.map((e) => [e.key, e]),
    )

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
      tipoDiaCalendario: num(r.HRI_CdiTipoDiaCalendario),
      desativado: num(r.HRI_OplDesativado),
    }))
    const cycleMap = buildCycleMap(jornadas, tipos)
    const atRows = atMaskRes.rows.map((r) => ({
      horarioId: num(r.HTD_CdiHorario) ?? 0,
      tipoDiaCalendario: num(r.HTD_CdiTipoDiaCalendario) ?? 0,
      desativado: num(r.HTD_OplDesativado),
    }))
    const atWorkByHorario = buildAtWorkDaysMap(jornadas, tipos, atRows)

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

    const precos = buildMeioPrecoMap(
      meiosRes.rows.map((r) => ({
        meioId: num(r.MRI_CdiMeioTransporte) ?? 0,
        unitario: num(r.MRI_VlnUnitario) ?? 0,
        inicioVigencia: (r.MRI_DtdInicioVigencia as string | null) ?? null,
        desativado: num(r.MRI_OplDesativado),
      })),
    )
    const vtValorByContratado = buildVtValorDiaMap(
      conAtRes.rows.map((r) => ({
        contratadoId: num(r.CAS_CdiContratado) ?? 0,
        meioId: num(r.CAS_CdiMeioTransporte) ?? 0,
        passesDia: num(r.CAS_QtiPassesDia) ?? 0,
        desativado: num(r.CAS_OplDesativado),
        dtdFim: r.CAS_DtdFim,
      })),
      precos,
    )

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
        detail: `${cycleMap.size} horário(s) · ${vtValorByContratado.size} VT cadastro`,
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
      vrDays: number | null
      vtDays: number | null
      vtValorSum: number
      vtValorN: number
      quantidade: number
    }

    const groups = new Map<AggKey, Agg>()
    let salariosZerados = 0
    let contratadosAtivos = 0
    let comVtCadastro = 0
    const usedEstKeys = new Set<string>()

    const vtOverride =
      overrides.vtValorDia !== undefined &&
      overrides.vtValorDia !== null &&
      Number.isFinite(overrides.vtValorDia)
        ? overrides.vtValorDia
        : null

    for (const r of contratadosRes.rows) {
      if (!isIncludedSituacao(num(r.CON_CdiSituacao))) continue

      const folhaId = num(r.CON_CdiFolha)
      const estKey = folhaId !== null ? folhaCnpj.get(folhaId) : undefined
      if (!estKey) continue
      if (filterByCnpj && !selectedKeys.has(estKey)) continue
      if (filterByRamo) {
        const est = establishmentByKey.get(estKey)
        if (!est || !selectedRamos.has(est.ramoId)) continue
      }
      usedEstKeys.add(estKey)
      contratadosAtivos += 1

      const contratadoId = num(r.CON_CdiContratado)
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
      const vrDays = estimateDaysFromCycle(cycle ?? null)
      const atWork =
        horarioId !== null ? (atWorkByHorario.get(horarioId) ?? null) : null
      const vtDays = estimateVtDaysFromAtAndCycle(cycle ?? null, atWork)

      let vtValor: number | null = null
      if (vtOverride !== null) {
        vtValor = vtOverride
      } else if (contratadoId !== null) {
        const computed = vtValorByContratado.get(contratadoId)
        if (computed != null && computed > 0) {
          vtValor = computed
          comVtCadastro += 1
        }
      }

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
        String(vrDays ?? ''),
        String(vtDays ?? ''),
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
          vrDays,
          vtDays,
          vtValorSum: 0,
          vtValorN: 0,
          quantidade: 0,
        }
        groups.set(key, agg)
      }
      agg.quantidade += 1
      if (salario > 0) {
        agg.salarioSum += salario
        agg.salarioN += 1
      }
      if (vtValor != null && vtValor > 0) {
        agg.vtValorSum += vtValor
        agg.vtValorN += 1
      }
    }

    const defaultSal =
      overrides.defaultSalario != null && overrides.defaultSalario > 0
        ? overrides.defaultSalario
        : 0
    const vr =
      overrides.vrValorDia !== undefined ? overrides.vrValorDia : null

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
      const vtValorDia =
        vtOverride !== null
          ? vtOverride
          : agg.vtValorN > 0
            ? agg.vtValorSum / agg.vtValorN
            : null
      rows.push({
        cargo: agg.cargo,
        salario,
        cargaHorariaMensal: agg.cargaMensal,
        cargaHorariaSemanal: agg.cargaSemanal,
        centroCusto: agg.centroCusto,
        vrValorDia: vr,
        vrDiasMesAtual: agg.vrDays,
        vtValorDia,
        vtDiasMesAtual: agg.vtDays,
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
          'Nenhuma linha agregada. Verifique ambiente, filtro CNPJ e situações (exclui 0/2/3/99).',
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
        detail: `${rows.length} linha(s) · ${contratadosAtivos} vínculo(s) · ${usedEstKeys.size} CNPJ · ${comVtCadastro} c/ VT`,
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
        comVtCadastro,
        estabelecimentosFiltrados: usedEstKeys.size,
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
