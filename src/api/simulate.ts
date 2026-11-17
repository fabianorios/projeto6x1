/**
 * Client for POST /api/simulate — server-side engine (P1).
 * P4 progressive: shell + GET filial / full from ephemeral simulationId.
 * Network failure → throw with a clear message; caller may fall back locally
 * while `simulate` remains in the SPA bundle (documented decision).
 */

import type { CostCenterResult, SimulationInput, SimulationResult } from '../engine'
import type { ScheduleSuggestion } from '../engine/schedule-suggest'
import type { FilialIndexEntry } from '../utils/progressiveFilial'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type SimulatePrefs = {
  includeScheduleSuggestions?: boolean
  includeApdataHierarchySeed?: boolean
  /** P4: request shell + per-filial slices when many filiais. */
  progressivePayload?: boolean
}

/** Request body aligned with turnocheck-api POST /api/simulate. */
export type SimulateApiRequest = {
  schemaVersion?: number
  scenarioId: SimulationInput['scenarioId']
  sector: SimulationInput['sector']
  sectorLabel?: string
  sectorBufferPct?: number
  headcount?: number
  currentScale: string
  averageMonthlySalary?: number
  units?: number
  shiftsPerDay?: number
  operatingHours: SimulationInput['operatingHours']
  defaultRegimeFuncionamento?: SimulationInput['defaultRegimeFuncionamento']
  regimeFuncionamentoByCc?: SimulationInput['regimeFuncionamentoByCc']
  defaultTaxRegime?: SimulationInput['defaultTaxRegime']
  taxRegimeByCnpj?: SimulationInput['taxRegimeByCnpj']
  estrategiaAbsorcao?: SimulationInput['estrategiaAbsorcao']
  /** Prefer mapped Folha rows (nome stripped client-side too). */
  payrollRows?: SimulationInput['payrollRows']
  prefs?: SimulatePrefs
}

export type SimulateApiSuccess = {
  ok: true
  schemaVersion: number
  latencyMs: { map: number; simulate: number; total: number }
  ruleVersionId: string
  result: SimulationResult
  apdataHierarchy?: unknown
  /** Present when server returned a progressive shell (P4). */
  progressive?: boolean
  simulationId?: string
  filialIndex?: FilialIndexEntry[]
}

export type SimulateApiError = {
  ok: false
  error: string
}

export type FilialSliceSuccess = {
  ok: true
  simulationId: string
  filialKey: string
  centers: CostCenterResult[]
  scheduleSuggestions: ScheduleSuggestion[]
}

export type SimulateFullSuccess = {
  ok: true
  simulationId: string
  result: SimulationResult
}

/**
 * True when the failure looks like connectivity / API down (not 4xx validation).
 * Used to decide optional local fallback.
 */
export function isSimulateNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('api unreachable') ||
    msg.includes('http 5') ||
    /^http 50\d/.test(msg)
  )
}

/** Strip PII before wire — defense in depth (server also forces nome=null). */
export function payrollRowsForApi(
  rows: NonNullable<SimulationInput['payrollRows']>,
): NonNullable<SimulationInput['payrollRows']> {
  return rows.map((r) => ({ ...r, nome: null }))
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function errorFromBody(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  ) {
    return (data as { error: string }).error
  }
  return fallback
}

export async function postSimulate(
  body: SimulateApiRequest,
): Promise<SimulateApiSuccess> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      'Não foi possível alcançar a API de simulação. Verifique a rede ou tente de novo.',
    )
  }

  const data = await readJson(res)

  if (!res.ok) {
    const err = errorFromBody(data, `HTTP ${res.status}`)
    if (res.status >= 500) {
      throw new Error(`API unreachable (${err})`)
    }
    throw new Error(err)
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true ||
    !('result' in data)
  ) {
    throw new Error('Resposta inválida da API de simulação')
  }

  return data as SimulateApiSuccess
}

/** Fetch CostCenter + suggestions for one open Filial (P4). */
export async function getSimulateFilialSlice(
  simulationId: string,
  filialKey: string,
): Promise<FilialSliceSuccess> {
  let res: Response
  try {
    res = await fetch(
      `${API_BASE}/api/simulate/${encodeURIComponent(simulationId)}/filial/${encodeURIComponent(filialKey)}`,
    )
  } catch {
    throw new Error(
      'Não foi possível carregar os dados desta filial. Verifique a rede.',
    )
  }

  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(errorFromBody(data, `HTTP ${res.status}`))
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true
  ) {
    throw new Error('Resposta inválida ao carregar filial')
  }
  return data as FilialSliceSuccess
}

/** Hydrate full Results DTO (print / cadastral / export) — P4. */
export async function getSimulateFull(
  simulationId: string,
): Promise<SimulateFullSuccess> {
  let res: Response
  try {
    res = await fetch(
      `${API_BASE}/api/simulate/${encodeURIComponent(simulationId)}`,
    )
  } catch {
    throw new Error(
      'Não foi possível carregar o resultado completo. Verifique a rede.',
    )
  }

  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(errorFromBody(data, `HTTP ${res.status}`))
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true ||
    !('result' in data)
  ) {
    throw new Error('Resposta inválida ao carregar resultado completo')
  }
  return data as SimulateFullSuccess
}
