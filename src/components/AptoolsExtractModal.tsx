import { useId, useState } from 'react'
import {
  getAptoolsExtractorScript,
  type ExtractorDialect,
} from '../apdata/extractorSql'

interface AptoolsExtractModalProps {
  onClose: () => void
}

/**
 * Modal: Extrair via Aptools (Copiar Query) — MSSQL | Oracle official SQL.
 */
export function AptoolsExtractModal({ onClose }: AptoolsExtractModalProps) {
  const titleId = useId()
  const [dialect, setDialect] = useState<ExtractorDialect>('mssql')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const sql = getAptoolsExtractorScript(dialect)

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
              CPF ou matrícula). Cole no Aptools, exporte CSV e importe no
              wizard.
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

        <div
          className="mt-4 flex gap-1 border-b border-[var(--color-line)]"
          role="tablist"
          aria-label="Dialeto SQL"
        >
          {(
            [
              ['mssql', 'Microsoft SQL Server'],
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copySql()}
            className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
          >
            {copied ? 'Copiado!' : 'Copiar query'}
          </button>
          <span className="text-xs text-[var(--color-muted)]">
            Fonte: <code className="text-[11px]">docs/apdata-extractor.sql</code>
          </span>
        </div>
        {copyError ? (
          <p className="mt-2 text-xs text-amber-900">{copyError}</p>
        ) : null}

        <label className="mt-3 block">
          <span className="sr-only">Query SQL</span>
          <textarea
            readOnly
            value={sql}
            rows={18}
            className="w-full border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]"
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      </div>
    </div>
  )
}
