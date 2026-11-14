/**
 * Client for Turnocheck /api/query (SELECT-only, allowlisted tables).
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type SelectQueryInput = {
  environmentId?: string
  table: string
  columns?: string[]
  where?: Record<string, string | number | boolean | null>
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  limit?: number
}

export type SelectQueryResult = {
  environmentId: string
  table: string
  sql: string
  limit: number
  rowCount: number
  columns: string[]
  rows: Record<string, unknown>[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const err =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${res.status}`
    throw new Error(err)
  }
  return body as T
}

export function listAllowlistedTables() {
  return request<{ tables: string[]; count: number; note: string }>(
    '/api/query/tables',
  )
}

export function selectRows(input: SelectQueryInput) {
  return request<SelectQueryResult>('/api/query/select', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
