import { useState } from 'react'
import {
  postEphemeralExtract,
  type EphemeralSessionCreds,
} from '../api/ephemeral'
import { mapExtractorAggregatesToPayroll } from '../apdata/mapExtractorRows'
import type { PayrollParseIssue, PayrollRow } from '../engine'
import {
  DEFAULT_EPHEMERAL_CREDS_FORM,
  EphemeralCredsFields,
  ephemeralFormComplete,
  type EphemeralCredsFormValue,
} from './EphemeralCredsFields'

interface EphemeralConnectPanelProps {
  onImported: (rows: PayrollRow[], issues: PayrollParseIssue[]) => void
}

function formToCreds(form: EphemeralCredsFormValue): EphemeralSessionCreds {
  return {
    engine: form.engine,
    host: form.host.trim(),
    port:
      Number.parseInt(form.port, 10) ||
      (form.engine === 'oracle' ? 1521 : 1433),
    database: form.database.trim(),
    user: form.user.trim(),
    password: form.password,
  }
}

/**
 * Quick volatile DB connection → POST /api/query/ephemeral.
 * Credentials never leave the request body (not stored).
 */
export function EphemeralConnectPanel({
  onImported,
}: EphemeralConnectPanelProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EphemeralCredsFormValue>(
    DEFAULT_EPHEMERAL_CREDS_FORM,
  )
  const [cnpjFilter, setCnpjFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  async function runExtract() {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    const creds = formToCreds(form)
    try {
      const data = await postEphemeralExtract(creds, {
        cnpjs: cnpjFilter
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 32),
      })
      const rows = mapExtractorAggregatesToPayroll(
        (data.rows ?? []) as Parameters<
          typeof mapExtractorAggregatesToPayroll
        >[0],
      )
      onImported(rows, [])
      setOkMsg(
        `Importadas ${rows.length} linha(s) agregadas (sem PII). Conexão efêmera encerrada.`,
      )
      setForm((f) => ({ ...f, password: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setForm((f) => ({ ...f, password: '' }))
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
          <EphemeralCredsFields
            value={form}
            onChange={setForm}
            disabled={busy}
          >
            <label className="block text-xs sm:col-span-2">
              Filtro CNPJ (opcional, separados por vírgula)
              <input
                value={cnpjFilter}
                disabled={busy}
                onChange={(e) => setCnpjFilter(e.target.value)}
                placeholder="somente dígitos ou formatado"
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </EphemeralCredsFields>
          <button
            type="button"
            disabled={busy || !ephemeralFormComplete(form)}
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
