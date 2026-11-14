import { useState } from 'react'
import { mapExtractorAggregatesToPayroll } from '../apdata/mapExtractorRows'
import type { PayrollParseIssue, PayrollRow } from '../engine'

type Engine = 'mssql' | 'oracle'

interface EphemeralConnectPanelProps {
  onImported: (rows: PayrollRow[], issues: PayrollParseIssue[]) => void
}

/**
 * Quick volatile DB connection → POST /api/query/ephemeral.
 * Credentials never leave the request body (not stored).
 */
export function EphemeralConnectPanel({
  onImported,
}: EphemeralConnectPanelProps) {
  const [open, setOpen] = useState(false)
  const [engine, setEngine] = useState<Engine>('mssql')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('1433')
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [cnpjFilter, setCnpjFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  async function runExtract() {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    const body = {
      engine,
      host: host.trim(),
      port: Number.parseInt(port, 10) || (engine === 'oracle' ? 1521 : 1433),
      database: database.trim(),
      user: user.trim(),
      password,
      filters: {
        cnpjs: cnpjFilter
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 32),
      },
    }
    try {
      const res = await fetch('/api/query/ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        rows?: Record<string, unknown>[]
        rowCount?: number
      }
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const rows = mapExtractorAggregatesToPayroll(
        (data.rows ?? []) as Parameters<
          typeof mapExtractorAggregatesToPayroll
        >[0],
      )
      onImported(rows, [])
      setOkMsg(
        `Importadas ${rows.length} linha(s) agregadas (sem PII). Conexão efêmera encerrada.`,
      )
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-[var(--color-line)] bg-white/80 px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-[var(--color-ink)] underline-offset-2 hover:underline"
      >
        {open ? '▾' : '▸'} Conexão volátil (extrator efêmero)
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[var(--color-muted)]">
            Credenciais só nesta requisição (15s timeout) — não são gravadas.
            Usa a query oficial do extrator Apdata.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              Engine
              <select
                value={engine}
                onChange={(e) => {
                  const next = e.target.value as Engine
                  setEngine(next)
                  setPort(next === 'oracle' ? '1521' : '1433')
                }}
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              >
                <option value="mssql">MSSQL</option>
                <option value="oracle">Oracle</option>
              </select>
            </label>
            <label className="block text-xs">
              Host
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              Porta
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              Database / service
              <input
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              Usuário
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              Senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              Filtro CNPJ (opcional, separados por vírgula)
              <input
                value={cnpjFilter}
                onChange={(e) => setCnpjFilter(e.target.value)}
                placeholder="somente dígitos ou formatado"
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !database || !user || !password}
            onClick={() => void runExtract()}
            className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Extraindo…' : 'Extrair e importar'}
          </button>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          {okMsg ? (
            <p className="text-xs text-[var(--color-accent)]">{okMsg}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
