import { useEffect, useId, useRef, useState } from 'react'
import {
  getAptoolsExtractorScript,
  type ExtractorDialect,
} from '../apdata/extractorSql'
import type { PayrollParseIssue, PayrollRow } from '../engine'
import { readCsvFileText } from '../utils/csvEncoding'
import { parsePayrollTolerant } from '../utils/parsePayrollTolerant'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

interface AptoolsExtractModalProps {
  onClose: () => void
  /** When set, CSV drop/picker parses and hands rows to the parent (wizard / Apdata flow). */
  onImported?: (rows: PayrollRow[], issues: PayrollParseIssue[]) => void
}

/**
 * Modal: Extrair via Aptools — 3 passos (banco → colar/exportar → TXT/CSV).
 */
export function AptoolsExtractModal({
  onClose,
  onImported,
}: AptoolsExtractModalProps) {
  const titleId = useId()
  const fileId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dialect, setDialect] = useState<ExtractorDialect>('mssql')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOk, setImportOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [sql, setSql] = useState(() => getAptoolsExtractorScript(dialect))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `${API_BASE}/api/query/extractor-sql?engine=${dialect}`,
        )
        if (!res.ok) throw new Error('api')
        const body = (await res.json()) as { sql?: string }
        if (!cancelled && body.sql) setSql(body.sql)
      } catch {
        if (!cancelled) setSql(getAptoolsExtractorScript(dialect))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [dialect])

  async function copySql() {
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(
        'Não foi possível copiar automaticamente — selecione o texto e use Ctrl+C.',
      )
    }
  }

  async function importCsvFile(file: File | null) {
    if (!file || !onImported) return
    setBusy(true)
    setImportError(null)
    setImportOk(null)
    try {
      const { text } = await readCsvFileText(file)
      const { rows, issues } = parsePayrollTolerant(text)
      if (rows.length === 0) {
        setImportError(
          issues[0]?.message ??
            'Nenhuma linha válida no arquivo. Verifique o export do Aptools (TXT TAB ou CSV).',
        )
        return
      }
      onImported(rows, issues)
      setImportOk(
        `Importadas ${rows.length} linha(s)${issues.length ? ` · ${issues.length} aviso(s)` : ''}.`,
      )
    } catch {
      setImportError('Não foi possível ler o arquivo TXT/CSV.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={titleId}
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              Extrair via Aptools (Copiar Query)
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Query oficial LGPD-safe (agregado cargo × CC × escala — sem nome,
              CPF ou matrícula). Siga os 3 passos abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Fechar
          </button>
        </div>

        <ol className="mt-5 space-y-5">
          <li className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              <span className="mr-2 text-[var(--color-accent)]">1.</span>
              Selecione o banco e copie o comando SQL
            </p>
            <div
              className="flex gap-1 border-b border-[var(--color-line)]"
              role="tablist"
              aria-label="Dialeto SQL"
            >
              {(
                [
                  ['mssql', 'MSSQL'],
                  ['oracle', 'Oracle'],
                ] as const
              ).map(([id, label]) => {
                const selected = dialect === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setDialect(id)
                      setCopied(false)
                      setCopyError(null)
                    }}
                    className={
                      selected
                        ? 'border-b-2 border-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-ink)]'
                        : 'px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copySql()}
                className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
              >
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <span className="text-xs text-[var(--color-muted)]">
                Fonte:{' '}
                <code className="text-[11px]">docs/apdata-extractor.sql</code>
                {' · '}tipos fábrica VR=53 / VA=52 (editáveis no Studio)
              </span>
            </div>
            {copyError ? (
              <p className="text-xs text-amber-900">{copyError}</p>
            ) : null}
            <label className="block">
              <span className="sr-only">Query SQL</span>
              <textarea
                readOnly
                value={sql}
                rows={12}
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]"
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          </li>

          <li>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              <span className="mr-2 text-[var(--color-accent)]">2.</span>
              Cole no Aptools, execute e exporte o resultado
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Exporte o resultado no Aptools em formato TXT (separado por TAB) ou
              CSV e arraste o arquivo aqui (sem PII — só agregados).
            </p>
          </li>

          <li className="space-y-2">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              <span className="mr-2 text-[var(--color-accent)]">3.</span>
              Importe o TXT ou CSV aqui
            </p>
            {onImported ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Arraste o TXT ou CSV ou escolha um arquivo"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      fileRef.current?.click()
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const file = e.dataTransfer.files?.[0] ?? null
                    void importCsvFile(file)
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={[
                    'cursor-pointer border border-dashed px-4 py-6 text-center transition',
                    dragOver
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40'
                      : 'border-[var(--color-line)] bg-white/70 hover:border-[var(--color-accent)]/50',
                    busy ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <p className="text-sm text-[var(--color-ink)]">
                    {busy
                      ? 'Importando…'
                      : 'Exporte o resultado no Aptools em formato TXT (separado por TAB) ou CSV e arraste o arquivo aqui'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    A importação atualiza o wizard sem fechar o fluxo Aptools.
                  </p>
                </div>
                <input
                  ref={fileRef}
                  id={fileId}
                  type="file"
                  accept=".csv,.txt,text/plain,text/csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) =>
                    void importCsvFile(e.target.files?.[0] ?? null)
                  }
                />
                {importError ? (
                  <p className="text-xs text-red-700">{importError}</p>
                ) : null}
                {importOk ? (
                  <p className="text-xs text-[var(--color-accent)]">{importOk}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Exporte o TXT/CSV e importe na etapa de folha do wizard.
              </p>
            )}
          </li>
        </ol>
      </div>
    </div>
  )
}
