/**
 * Client for POST /api/query/ephemeral — volatile credentials, never persisted.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

export type EphemeralEngine = 'mssql' | 'oracle'

/** In-memory session credentials only — never write to disk/localStorage. */
export type EphemeralSessionCreds = {
  engine: EphemeralEngine
  host: string
  port: number
  /** MSSQL: optional (empty = login default). Oracle: Service Name / SID. */
  database: string
  user: string
  /** Held in React state for the panel session; cleared on unmount / mode switch. */
  password: string
}

export type EphemeralTableResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  sql?: string
}

export type EphemeralCatalogResult = {
  ok: true
  mode: 'catalog'
  engine: EphemeralEngine
  latencyMs: number
  timeoutMs?: number
  tables: Record<string, EphemeralTableResult>
  note?: string
}

export type EphemeralExtractResult = {
  ok: true
  mode?: 'extract'
  engine: EphemeralEngine
  latencyMs: number
  /** Server-side query ceiling used for this request (ms). */
  timeoutMs?: number
  rowCount: number
  columns: string[]
  rows: Record<string, unknown>[]
  note?: string
}

export type EphemeralErrorResult = {
  ok: false
  error: string
  engine?: EphemeralEngine
  latencyMs?: number
}

function defaultPort(engine: EphemeralEngine): number {
  return engine === 'oracle' ? 1521 : 1433
}

/** Build request body from session creds (password only in flight). */
export function ephemeralCredsBody(creds: EphemeralSessionCreds) {
  return {
    engine: creds.engine,
    host: creds.host.trim(),
    port: creds.port || defaultPort(creds.engine),
    database: creds.database.trim(),
    user: creds.user.trim(),
    password: creds.password,
  }
}

async function postEphemeral<T>(body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/query/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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
    throw new Error(err)
  }
  if (
    data &&
    typeof data === 'object' &&
    'ok' in data &&
    (data as { ok: unknown }).ok === false
  ) {
    const err =
      'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'ephemeral request failed'
    throw new Error(err)
  }
  return data as T
}

/** Load Empresas/Locais/Folhas/… for CNPJ + ramos panels (same UX as saved env). */
export function postEphemeralCatalog(creds: EphemeralSessionCreds) {
  return postEphemeral<EphemeralCatalogResult>({
    ...ephemeralCredsBody(creds),
    mode: 'catalog',
  })
}

export type EphemeralExtractFilters = {
  cnpjs?: string[]
  excludeSituacoes?: number[]
  incluirAfastados?: boolean
  tipoRegimeTrabalhistaIds?: number[]
  categTrabeSocIds?: number[]
  somenteEmpregaticios?: boolean
}

/** Official extractor → aggregate rows (payroll path). */
export function postEphemeralExtract(
  creds: EphemeralSessionCreds,
  filters?: EphemeralExtractFilters,
) {
  return postEphemeral<EphemeralExtractResult>({
    ...ephemeralCredsBody(creds),
    mode: 'extract',
    filters: filters ?? {},
  })
}
