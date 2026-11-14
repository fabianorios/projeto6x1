/**
 * Client for Turnocheck /api environments + SELECT proxy.
 * Password is never echoed after save — only passwordMasked.
 */

export type DbEngine = 'mssql' | 'oracle'

export type EnvironmentPublic = {
  id: string
  name: string
  engine: DbEngine
  host: string
  port: number
  database: string
  user: string
  passwordMasked: string
  hasPassword: boolean
  encrypt: boolean
  trustServerCertificate: boolean
  createdAt: string
  updatedAt: string
  active: boolean
}

export type EnvironmentInput = {
  name: string
  engine: DbEngine
  host: string
  port?: number
  database: string
  user: string
  password?: string
  encrypt?: boolean
  trustServerCertificate?: boolean
}

export type TestConnectionResult =
  | { ok: true; latencyMs: number; driver: string }
  | { ok: false; error: string; driver: string }

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`)
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

export function listEnvironments() {
  return request<{ environments: EnvironmentPublic[] }>('/api/environments')
}

export function getActiveEnvironment() {
  return request<{ environment: EnvironmentPublic | null }>(
    '/api/environments/active',
  )
}

export function createEnvironment(input: EnvironmentInput) {
  return request<{ environment: EnvironmentPublic }>('/api/environments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateEnvironment(id: string, input: Partial<EnvironmentInput>) {
  return request<{ environment: EnvironmentPublic }>(
    `/api/environments/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  )
}

export function deleteEnvironment(id: string) {
  return request<{ ok: boolean }>(`/api/environments/${id}`, {
    method: 'DELETE',
  })
}

export function activateEnvironment(id: string) {
  return request<{ environment: EnvironmentPublic }>(
    `/api/environments/${id}/activate`,
    { method: 'POST' },
  )
}

export async function testEnvironment(
  id: string,
): Promise<TestConnectionResult> {
  const res = await fetch(`${API_BASE}/api/environments/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  let body: Partial<TestConnectionResult> & {
    error?: string
    driver?: string
  } | null = null
  try {
    body = (await res.json()) as Partial<TestConnectionResult> & {
      error?: string
      driver?: string
    }
  } catch {
    return {
      ok: false,
      error: `Resposta não-JSON do proxy (HTTP ${res.status}). Verifique /api → API.`,
      driver: 'unknown',
    }
  }
  if (body && typeof body === 'object' && body.ok === true) {
    return {
      ok: true,
      latencyMs: Number(body.latencyMs ?? 0),
      driver: String(body.driver ?? 'unknown'),
    }
  }
  if (body && typeof body === 'object' && body.ok === false) {
    return {
      ok: false,
      error: String(body.error ?? `HTTP ${res.status}`),
      driver: String(body.driver ?? 'unknown'),
    }
  }
  return {
    ok: false,
    error: body?.error ?? `HTTP ${res.status}`,
    driver: 'unknown',
  }
}
