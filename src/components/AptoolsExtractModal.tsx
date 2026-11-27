import { useEffect, useId, useRef, useState } from 'react'
import {
  isFolhaAptoolsNetworkFailure,
  postFolhaAptoolsFile,
  type FolhaAptoolsProgressStage,
} from '../api/folhaAptools'
import {
  DEFAULT_APTOOLS_GRAIN,
  DEFAULT_INCLUDE_BENEFITS,
  getAptoolsExtractorScript,
  type ExtractorDialect,
  type ExtractorGrain,
} from '../apdata/extractorSql'
import type { PayrollParseIssue, PayrollRow } from '../engine'
import { readCsvFileText } from '../utils/csvEncoding'
import { logPerf } from '../utils/perfTelemetry'
import { parsePayrollTolerant } from '../utils/parsePayrollTolerant'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

interface AptoolsExtractModalProps {
  onClose: () => void
  /** When set, CSV drop/picker parses (server preferred) and hands rows to the parent. */
  onImported?: (rows: PayrollRow[], issues: PayrollParseIssue[]) => void
}

type ImportProgress = {
  stage: FolhaAptoolsProgressStage | 'local'
  label: string
  pct: number
}

const PROGRESS: Record<FolhaAptoolsProgressStage | 'local', ImportProgress> = {
  upload: { stage: 'upload', label: 'Enviando arquivo…', pct: 30 },
  parse: { stage: 'parse', label: 'Processando no servidor…', pct: 70 },
  done: { stage: 'done', label: 'Finalizando…', pct: 95 },
  local: {
    stage: 'local',
    label: 'Processando neste navegador…',
    pct: 70,
  },
}

/**
 * Modal: Extrair via Aptools — 3 passos (banco → colar/exportar → TXT/CSV).
 * File import prefers POST /api/folha/aptools (no full client parse on large bases).
 */
export function AptoolsExtractModal({
  onClose,
  onImported,
}: AptoolsExtractModalProps) {
  const titleId = useId()
  const fileId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dialect, setDialect] = useState<ExtractorDialect>('mssql')
  /**
   * Aptools default = nominal (1 row/colaborador with nome).
   * Optional aggregate = LGPD omit (cargo×CC×escala) — off unless user opts in.
   */
  const [grain, setGrain] = useState<ExtractorGrain>(DEFAULT_APTOOLS_GRAIN)
  /** Default ON — VT + beneficios_agg. Off omits benefit CTEs/cols. */
  const [includeBenefits, setIncludeBenefits] = useState(
    DEFAULT_INCLUDE_BENEFITS,
  )
  const [copied, setCopied] = useState(false)
  /** Manual “pronto / já usei” — auto-checks after a successful Copiar SQL. */
  const [itemReady, setItemReady] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [sqlOpen, setSqlOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOk, setImportOk] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [sql, setSql] = useState(() =>
    getAptoolsExtractorScript(dialect, {
      grain: DEFAULT_APTOOLS_GRAIN,
      includeBenefits: DEFAULT_INCLUDE_BENEFITS,
    }),
  )

  useEffect(() => {
    let cancelled = false
    // Sync dialect/grain/benefits immediately so Copiar never ships the previous SQL
    // while the API refresh is in flight (Oracle tab + MSSQL body → Aptools errors).
    setSql(getAptoolsExtractorScript(dialect, { grain, includeBenefits }))
    async function load() {
      try {
        const benParam = includeBenefits ? '1' : '0'
        const res = await fetch(
          `${API_BASE}/api/query/extractor-sql?engine=${dialect}&grain=${grain}&includeBenefits=${benParam}`,
        )
        if (!res.ok) throw new Error('api')
        const body = (await res.json()) as {
          sql?: string
          engine?: string
          grain?: string
          includeBenefits?: boolean
        }
        if (
          !cancelled &&
          body.sql &&
          (body.engine === undefined || body.engine === dialect) &&
          (body.grain === undefined || body.grain === grain) &&
          (body.includeBenefits === undefined ||
            body.includeBenefits === includeBenefits)
        ) {
          const next =
            dialect === 'oracle' ? body.sql.replace(/;\s*$/, '') : body.sql
          setSql(next)
        }
      } catch {
        // Client fallback already applied above.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [dialect, grain, includeBenefits])

  async function copySql() {
    setCopyError(null)
    try {
      // Oracle Aptools rejects trailing `;` (ORA-00933). Strip on copy even if
      // a stale API/cache still appends one.
      const text =
        dialect === 'oracle' ? sql.replace(/;\s*$/, '') : sql
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setItemReady(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(
        'Não foi possível copiar automaticamente — abra Ver SQL, selecione o texto e use Ctrl+C.',
      )
      setSqlOpen(true)
    }
  }

  async function importLocalFallback(file: File): Promise<{
    rows: PayrollRow[]
    issues: PayrollParseIssue[]
  }> {
    setProgress(PROGRESS.local)
    const { text } = await readCsvFileText(file)
    const t0 = performance.now()
    const { rows, issues } = parsePayrollTolerant(text)
    logPerf('parse-folha', performance.now() - t0, {
      rowCount: rows.length,
      issueCount: issues.length,
      charCount: text.length,
      via: 'local-fallback',
    })
    return { rows, issues }
  }

  async function importCsvFile(file: File | null) {
    if (!file || !onImported) return
    setBusy(true)
    setImportError(null)
    setImportOk(null)
    setImportNotice(null)
    setProgress(PROGRESS.upload)
    const t0 = performance.now()
    try {
      let rows: PayrollRow[]
      let issues: PayrollParseIssue[]
      let via: 'api' | 'local-fallback' = 'api'

      try {
        const remote = await postFolhaAptoolsFile(file, {
          onStage: (stage) => setProgress(PROGRESS[stage]),
        })
        rows = remote.payrollRows
        issues = remote.parseWarnings ?? []
        logPerf('parse-folha', performance.now() - t0, {
          rowCount: remote.rowCount,
          issueCount: remote.issueCount,
          via: 'api',
          apiLatencyMs: remote.latencyMs.total,
        })
      } catch (err) {
        if (!isFolhaAptoolsNetworkFailure(err)) {
          throw err
        }
        via = 'local-fallback'
        const local = await importLocalFallback(file)
        rows = local.rows
        issues = local.issues
        setImportNotice(
          'API de Folha indisponível — arquivo processado localmente neste navegador.',
        )
      }

      if (rows.length === 0) {
        setImportError(
          issues[0]?.message ??
            'Nenhuma linha válida no arquivo. Verifique o export do Aptools (TXT TAB ou CSV).',
        )
        return
      }
      onImported(rows, issues)
      setImportOk(
        `Importadas ${rows.length} linha(s)${issues.length ? ` · ${issues.length} aviso(s)` : ''}${via === 'api' ? ' · servidor' : ' · local'}.`,
      )
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o arquivo TXT/CSV.',
      )
    } finally {
      setBusy(false)
      setProgress(null)
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
              Query oficial por colaborador (nome + 1 linha cada). Omissão LGPD
              agregada é opcional — não liga sozinha. Siga os 3 passos abaixo.
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
          <li className="space-y-2">
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
                      setSql(
                        getAptoolsExtractorScript(id, {
                          grain,
                          includeBenefits,
                        }),
                      )
                      setCopied(false)
                      setItemReady(false)
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
            <p className="text-xs text-[var(--color-muted)]">
              Dialeto:{' '}
              <strong className="font-medium text-[var(--color-ink)]">
                {dialect === 'oracle'
                  ? 'Oracle (NVL / LISTAGG / ||)'
                  : 'MSSQL (ISNULL / STRING_AGG / +)'}
              </strong>
              {' · '}
              <code className="text-[11px]">docs/apdata-extractor.sql</code>
            </p>
            <ul className="border border-[var(--color-line)] bg-white/70" role="list">
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={itemReady}
                    onChange={(e) => setItemReady(e.target.checked)}
                    className="shrink-0"
                    aria-label="Extrator Folha marcado como pronto"
                  />
                  <span className="min-w-0 font-medium leading-snug">
                    Extrator Folha
                    <span className="mt-0.5 block text-xs font-normal text-[var(--color-muted)] sm:mt-0 sm:ml-1.5 sm:inline">
                      {grain === 'nominal'
                        ? '(nominal — 1 linha/colaborador com nome)'
                        : '(agregado LGPD — sem nome/CPF/matrícula)'}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copySql()}
                    className="bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    {copied ? 'Copiado!' : 'Copiar SQL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSqlOpen((o) => !o)}
                    aria-expanded={sqlOpen}
                    className="border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    {sqlOpen ? 'Ocultar SQL' : 'Ver SQL'}
                  </button>
                </div>
              </li>
              <li className="border-t border-[var(--color-line)] px-3 py-2">
                <label className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={grain === 'aggregate'}
                    onChange={(e) => {
                      setGrain(e.target.checked ? 'aggregate' : 'nominal')
                      setCopied(false)
                      setItemReady(false)
                      setCopyError(null)
                    }}
                    className="mt-0.5 shrink-0"
                    data-testid="aptools-lgpd-omit-toggle"
                    aria-describedby="aptools-lgpd-omit-hint"
                  />
                  <span>
                    <span className="font-medium">
                      Omitir nomes (agregado LGPD)
                    </span>
                    <span
                      id="aptools-lgpd-omit-hint"
                      className="mt-0.5 block text-xs font-normal text-[var(--color-muted)]"
                    >
                      Desligado por padrão. Ligado: cargo × CC × escala sem
                      nome/CPF/matrícula. A máscara LGPD da UI nos resultados
                      continua independente.
                    </span>
                  </span>
                </label>
              </li>
              <li className="border-t border-[var(--color-line)] px-3 py-2">
                <label className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={includeBenefits}
                    onChange={(e) => {
                      setIncludeBenefits(e.target.checked)
                      setCopied(false)
                      setItemReady(false)
                      setCopyError(null)
                    }}
                    className="mt-0.5 shrink-0"
                    data-testid="aptools-include-benefits-toggle"
                    aria-describedby="aptools-include-benefits-hint"
                  />
                  <span>
                    <span className="font-medium">Incluir benefícios</span>
                    <span
                      id="aptools-include-benefits-hint"
                      className="mt-0.5 block text-xs font-normal text-[var(--color-muted)]"
                    >
                      Ligado por padrão (VT + planos em beneficios_agg).
                      Desligado: SQL sem CTEs/colunas de benefícios; folha, HC e
                      escala permanecem. Import tolera colunas ausentes.
                    </span>
                  </span>
                </label>
              </li>
            </ul>
            {copyError ? (
              <p className="text-xs text-amber-900">{copyError}</p>
            ) : null}
            {sqlOpen ? (
              <label className="block">
                <span className="sr-only">Query SQL</span>
                <textarea
                  readOnly
                  value={sql}
                  rows={8}
                  className="w-full border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
            ) : null}
          </li>

          <li>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              <span className="mr-2 text-[var(--color-accent)]">2.</span>
              Cole no Aptools, execute e exporte o resultado
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Exporte o resultado no Aptools em formato TXT (separado por TAB) ou
              CSV e arraste o arquivo aqui
              {grain === 'nominal'
                ? ' (nominal — coluna nome por colaborador)'
                : ' (agregado LGPD — sem PII)'}
              . O parse roda no servidor em bases grandes.
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
                  aria-busy={busy || undefined}
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
                      ? progress?.label ?? 'Importando…'
                      : 'Exporte o resultado no Aptools em formato TXT (separado por TAB) ou CSV e arraste o arquivo aqui'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Upload para a API — sem parse completo no navegador em bases
                    grandes.
                  </p>
                  {busy && progress ? (
                    <div
                      className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-sm bg-[var(--color-line)]"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress.pct}
                      aria-label={progress.label}
                    >
                      <div
                        className="h-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                  ) : null}
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
                {importNotice ? (
                  <p className="text-xs text-amber-900">{importNotice}</p>
                ) : null}
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
