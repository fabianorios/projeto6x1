/**
 * Soft client session gate for first paint (login / continue without auth).
 * Ephemeral only — no IdP, no server credentials check.
 */

export type ClientSession = {
  /** Soft gate cleared — wizard/shell may render. */
  open: boolean
  /** Optional email from soft login; never treated as verified identity. */
  email?: string
  /** How the gate was cleared. */
  via: 'login' | 'continue' | null
}

export const CLOSED_CLIENT_SESSION: ClientSession = {
  open: false,
  via: null,
}

/** Soft login: accept non-empty email; password is UI-only for future AHR IdP. */
export function openSessionFromLogin(email: string): ClientSession {
  const trimmed = email.trim()
  if (!trimmed) {
    return CLOSED_CLIENT_SESSION
  }
  return { open: true, email: trimmed, via: 'login' }
}

/** Enter wizard without auth — open session, no email. */
export function openSessionWithoutLogin(): ClientSession {
  return { open: true, via: 'continue' }
}
