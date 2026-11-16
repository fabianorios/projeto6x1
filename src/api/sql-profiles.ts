/**
 * Client for /api/sql-profiles + /api/query/test-slot.
 */

import type {
  BenefitParams,
  SqlDialect,
  SqlProfile,
  SqlSlotId,
  SqlSlotQueries,
} from '../types/sql-profile'
import type { EphemeralSessionCreds } from './ephemeral'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

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
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(err)
  }
  return body as T
}

export type SqlProfilesListResponse = {
  profiles: SqlProfile[]
  activeId: string | null
  factoryId: string
  contracts: Record<SqlSlotId, readonly string[]>
  slots: SqlSlotId[]
}

export type TestSlotResult = {
  ok: boolean
  slot: SqlSlotId
  dialect: SqlDialect
  latencyMs: number
  rowCount: number
  columns: string[]
  rows: Record<string, unknown>[]
  contract: {
    required: readonly string[]
    ok: boolean
    missing: string[]
  }
  error?: string
}

export function listSqlProfiles(): Promise<SqlProfilesListResponse> {
  return request('/api/sql-profiles')
}

export function getSqlProfile(
  id: string,
): Promise<{ profile: SqlProfile; contracts: Record<SqlSlotId, readonly string[]> }> {
  return request(`/api/sql-profiles/${id}`)
}

export function createSqlProfile(input: {
  name: string
  slots?: Record<SqlSlotId, SqlSlotQueries>
  benefitParams?: BenefitParams
}): Promise<{ profile: SqlProfile }> {
  return request('/api/sql-profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function duplicateSqlProfile(
  id: string,
  name?: string,
): Promise<{ profile: SqlProfile }> {
  return request(`/api/sql-profiles/${id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  })
}

export function updateSqlProfile(
  id: string,
  input: {
    name?: string
    slots?: Record<SqlSlotId, SqlSlotQueries>
    benefitParams?: BenefitParams
  },
): Promise<{ profile: SqlProfile }> {
  return request(`/api/sql-profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function activateSqlProfile(
  id: string,
): Promise<{ profile: SqlProfile; activeId: string }> {
  return request(`/api/sql-profiles/${id}/activate`, { method: 'POST' })
}

export function deleteSqlProfile(id: string): Promise<{ ok: boolean }> {
  return request(`/api/sql-profiles/${id}`, { method: 'DELETE' })
}

export function testSqlSlot(input: {
  profileId?: string
  slot: SqlSlotId
  dialect?: SqlDialect
  sql?: string
  benefitParams?: BenefitParams
  environmentId?: string
  connection?: EphemeralSessionCreds
}): Promise<TestSlotResult> {
  return request('/api/query/test-slot', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
