/**
 * Client for POST /api/folha/aptools — server parse (+ optional simulate).
 * Prefer FormData File upload so the SPA does not FileReader-parse huge TABs.
 */

import type { PayrollParseIssue, PayrollRow, SimulationResult } from '../engine'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type FolhaAptoolsLatency = {
  parse: number
  map: number
  simulate?: number
  total: number
}

export type FolhaAptoolsSuccess = {
  ok: true
  schemaVersion: number
  rowCount: number
  headcount: number
  centerCount: number
  encoding?: string
  parseWarnings: PayrollParseIssue[]
  issueCount: number
  payrollRows: PayrollRow[]
  latencyMs: FolhaAptoolsLatency
  ruleVersionId?: string
  result?: SimulationResult
  apdataHierarchy?: unknown
}

export type FolhaAptoolsErrorBody = {
  ok: false
  error: string
  parseWarnings?: PayrollParseIssue[]
  rowCount?: number
}

export type FolhaAptoolsProgressStage =
  | 'upload'
  | 'parse'
  | 'done'

/**
 * True when failure looks like connectivity / API down (not 4xx validation).
 * Caller may fall back to local parse for meetings without VPN.
 */
export function isFolhaAptoolsNetworkFailure(err: unknown): boolean {
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

/**
 * Upload Folha file via multipart — browser does not parse TAB contents.
 */
export async function postFolhaAptoolsFile(
  file: File,
  opts?: {
    simulate?: boolean
    meta?: Record<string, unknown>
    onStage?: (stage: FolhaAptoolsProgressStage) => void
  },
): Promise<FolhaAptoolsSuccess> {
  opts?.onStage?.('upload')
  const form = new FormData()
  form.append('file', file, file.name || 'folha.txt')
  if (opts?.simulate) {
    form.append('simulate', '1')
  }
  if (opts?.meta) {
    form.append('meta', JSON.stringify(opts.meta))
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/folha/aptools`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new Error(
      'Não foi possível alcançar a API de Folha. Verifique a rede ou tente de novo.',
    )
  }

  opts?.onStage?.('parse')
  const data = await readJson(res)
  if (!res.ok) throwFromResponse(res, data)

  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true ||
    !('payrollRows' in data)
  ) {
    throw new Error('Resposta inválida da API de Folha Aptools')
  }

  opts?.onStage?.('done')
  return data as FolhaAptoolsSuccess
}

/**
 * Send Folha text (paste / tests). Prefer postFolhaAptoolsFile for large bases.
 */
export async function postFolhaAptoolsText(
  text: string,
  opts?: {
    simulate?: boolean
    meta?: Record<string, unknown>
    onStage?: (stage: FolhaAptoolsProgressStage) => void
  },
): Promise<FolhaAptoolsSuccess> {
  opts?.onStage?.('upload')
  let res: Response
  try {
    if (opts?.simulate || opts?.meta) {
      res = await fetch(`${API_BASE}/api/folha/aptools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          simulate: opts.simulate ? true : undefined,
          ...opts.meta,
        }),
      })
    } else {
      res = await fetch(`${API_BASE}/api/folha/aptools`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      })
    }
  } catch {
    throw new Error(
      'Não foi possível alcançar a API de Folha. Verifique a rede ou tente de novo.',
    )
  }

  opts?.onStage?.('parse')
  const data = await readJson(res)
  if (!res.ok) throwFromResponse(res, data)

  if (
    !data ||
    typeof data !== 'object' ||
    !('ok' in data) ||
    (data as { ok: unknown }).ok !== true ||
    !('payrollRows' in data)
  ) {
    throw new Error('Resposta inválida da API de Folha Aptools')
  }

  opts?.onStage?.('done')
  return data as FolhaAptoolsSuccess
}
