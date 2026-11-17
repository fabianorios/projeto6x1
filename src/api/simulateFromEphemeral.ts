/**
 * Client for POST /api/simulate/from-ephemeral — Conexão Direta P3 pipeline.
 * Server: Folha extract → map → optional simulate. SPA displays DTO / payrollRows.
 */

import type { PayrollRow, SimulationResult } from '../engine'
import {
  ephemeralCredsBody,
  type EphemeralExtractFilters,
  type EphemeralSessionCreds,
} from './ephemeral'
import type { SimulateApiRequest } from './simulate'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type SimulateFromEphemeralLatency = {
  extract: number
  map: number
  simulate?: number
  total: number
}

export type SimulateFromEphemeralSuccess = {
  ok: true
  schemaVersion: number
  engine?: string
  timeoutMs?: number
  rowCount: number
  headcount: number
  centerCount: number
  payrollRows: PayrollRow[]
  latencyMs: SimulateFromEphemeralLatency
  ruleVersionId?: string
  result?: SimulationResult
  apdataHierarchy?: unknown
  note?: string
}

/**
 * True when failure looks like connectivity / API down (not 4xx validation).
 * Caller may fall back to legacy extract + local map for offline meetings.
 */
export function isSimulateFromEphemeralNetworkFailure(err: unknown): boolean {
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

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function throwFromResponse(res: Response, data: unknown): never {
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

export type SimulateFromEphemeralOpts = {
  filters?: EphemeralExtractFilters
  /** When true (or meta provided), server also runs simulate → Results DTO. */
  simulate?: boolean
  /** Same premises as POST /api/simulate (without payrollRows). */
  meta?: Omit<SimulateApiRequest, 'payrollRows'>
}

/**
 * Conexão Direta pipeline — prefer this over postEphemeralExtract + client map.
 */
export async function postSimulateFromEphemeral(
  creds: EphemeralSessionCreds,
  opts?: SimulateFromEphemeralOpts,
): Promise<SimulateFromEphemeralSuccess> {
  const body: Record<string, unknown> = {
    ...ephemeralCredsBody(creds),
    filters: opts?.filters ?? {},
  }
  if (opts?.simulate) body.simulate = true
  if (opts?.meta) {
    body.meta = opts.meta
    body.simulate = true
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/simulate/from-ephemeral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      'Não foi possível alcançar a API de Conexão Direta. Verifique a rede ou tente de novo.',
    )
  }

  const data = await readJson(res)
  if (!res.ok) throwFromResponse(res, data)

  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true ||
    !('payrollRows' in data)
  ) {
    throw new Error('Resposta inválida da API de Conexão Direta (from-ephemeral)')
  }

  return data as SimulateFromEphemeralSuccess
}
