/**
 * Shared volatile connection fields (MSSQL | Oracle).
 * Password stays in parent state only — never localStorage/disk.
 */

import type { ReactNode } from 'react'
import type { EphemeralEngine } from '../api/ephemeral'

export type EphemeralCredsFormValue = {
  engine: EphemeralEngine
  host: string
  port: string
  database: string
  user: string
  password: string
}

interface EphemeralCredsFieldsProps {
  value: EphemeralCredsFormValue
  onChange: (next: EphemeralCredsFormValue) => void
  disabled?: boolean
  /** Extra fields below the credential grid (e.g. CNPJ filter). */
  children?: ReactNode
}

export const DEFAULT_EPHEMERAL_CREDS_FORM: EphemeralCredsFormValue = {
  engine: 'mssql',
  host: '127.0.0.1',
  port: '1433',
  database: '',
  user: '',
  password: '',
}

export function ephemeralFormComplete(v: EphemeralCredsFormValue): boolean {
  return Boolean(
    v.database.trim() && v.user.trim() && v.password && v.host.trim(),
  )
}

export function EphemeralCredsFields({
  value,
  onChange,
  disabled = false,
  children,
}: EphemeralCredsFieldsProps) {
  function patch(partial: Partial<EphemeralCredsFormValue>) {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          Engine
          <select
            value={value.engine}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value as EphemeralEngine
              patch({
                engine: next,
                port: next === 'oracle' ? '1521' : '1433',
              })
            }}
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          >
            <option value="mssql">MSSQL</option>
            <option value="oracle">Oracle</option>
          </select>
        </label>
        <label className="block text-xs">
          IP / Host
          <input
            value={value.host}
            disabled={disabled}
            onChange={(e) => patch({ host: e.target.value })}
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          Porta
          <input
            value={value.port}
            disabled={disabled}
            onChange={(e) => patch({ port: e.target.value })}
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          Database / Service
          <input
            value={value.database}
            disabled={disabled}
            onChange={(e) => patch({ database: e.target.value })}
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          Usuário
          <input
            value={value.user}
            disabled={disabled}
            onChange={(e) => patch({ user: e.target.value })}
            autoComplete="off"
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          Senha
          <input
            type="password"
            value={value.password}
            disabled={disabled}
            onChange={(e) => patch({ password: e.target.value })}
            autoComplete="new-password"
            className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {children}
    </div>
  )
}
