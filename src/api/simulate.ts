/**
 * Client for POST /api/simulate — server-side engine (P1).
 * Network failure → throw with a clear message; caller may fall back locally
 * while `simulate` remains in the SPA bundle (documented decision).
 */

import type { SimulationInput, SimulationResult } from '../engine'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type SimulatePrefs = {
  includeScheduleSuggestions?: boolean
  includeApdataHierarchySeed?: boolean
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
  /** Optional segmented OH rules; omit → global `operatingHours` only. */
  ohScopeRules?: SimulationInput['ohScopeRules']
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
}

export type SimulateApiError = {
  ok: false
  error: string
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

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const err =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `HTTP ${res.status}`
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
