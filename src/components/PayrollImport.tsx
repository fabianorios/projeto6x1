import { useId, useState } from 'react'
import {
  parsePayrollCsv,
  type PayrollParseIssue,
  type PayrollRow,
} from '../engine'

interface PayrollImportProps {
  rows: PayrollRow[]
  issues: PayrollParseIssue[]
  onParsed: (rows: PayrollRow[], issues: PayrollParseIssue[]) => void
  onClear: () => void
}

/**
 * CSV file + paste import mapped to docs/import-layout.md headers.
 */
export function PayrollImport({
  rows,
  issues,
  onParsed,
  onClear,
}: PayrollImportProps) {
  const fileId = useId()
  const pasteId = useId()
  const [paste, setPaste] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingSample, setLoadingSample] = useState(false)

  function applyText(text: string, name: string | null) {
    const result = parsePayrollCsv(text)
    setFileName(name)
    setLoadError(null)
    setPaste(text)
    onParsed(result.rows, result.issues)
  }

  function onFileChange(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      applyText(text, file.name)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function loadValidationSample() {
    setLoadingSample(true)
    setLoadError(null)
    try {
      const res = await fetch('/sample-folha.csv')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const text = await res.text()
      applyText(text, 'sample-folha.csv (validação)')
    } catch {
      setLoadError(
        'Não foi possível carregar sample-folha.csv. Cole o CSV ou escolha um arquivo.',
      )
    } finally {
      setLoadingSample(false)
    }
  }

  const headcount = rows.reduce((s, r) => s + r.quantidade, 0)
  const centers = new Set(rows.map((r) => r.centroCusto)).size

  return (
    <fieldset className="sm:col-span-2 space-y-3 border border-[var(--color-line)] bg-white/70 p-4">
      <legend className="px-1 text-sm font-medium text-[var(--color-ink)]">
        Importar folha (CSV / colar)
      </legend>
      <p className="text-xs text-[var(--color-muted)]">
        Separador <strong>;</strong>, UTF-8. Cabeçalhos exatos:{' '}
        <code className="text-[11px]">
          cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo
        </code>{' '}
        + VR/VT (<code className="text-[11px]">vr_valor_dia</code>,{' '}
        <code className="text-[11px]">vr_dias_mes_atual</code>,{' '}
        <code className="text-[11px]">vt_valor_dia</code>,{' '}
        <code className="text-[11px]">vt_dias_mes_atual</code>). Ver{' '}
        <a
          href="/sample-folha.csv"
          download
          className="text-[var(--color-accent)] underline"
        >
          sample-folha.csv
        </a>
        .
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void loadValidationSample()}
          disabled={loadingSample}
          className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loadingSample ? 'Carregando…' : 'Carregar folha de validação'}
        </button>
        <label
          htmlFor={fileId}
          className="cursor-pointer border border-[var(--color-line)] bg-white px-3 py-2 text-sm hover:border-[var(--color-accent)]"
        >
          Escolher CSV
        </label>
        <input
          id={fileId}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        {fileName ? (
          <span className="text-xs text-[var(--color-muted)]">{fileName}</span>
        ) : null}
        <a
          href="/sample-folha.csv"
          download
          className="text-xs text-[var(--color-accent)] underline"
        >
          Baixar exemplo
        </a>
      </div>
      {loadError ? (
        <p className="text-xs text-red-700">{loadError}</p>
      ) : null}

      <label className="block text-sm" htmlFor={pasteId}>
        <span className="mb-1 block text-[var(--color-muted)]">
          Ou cole o CSV aqui
        </span>
        <textarea
          id={pasteId}
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="cargo;salario;carga_horaria_mensal;..."
          className="w-full border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-xs"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyText(paste, fileName)}
          className="bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Processar importação
        </button>
        {rows.length > 0 || issues.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setPaste('')
              setFileName(null)
              onClear()
            }}
            className="border border-[var(--color-line)] bg-white px-4 py-2 text-sm"
          >
            Limpar importação
          </button>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <p className="text-sm text-[var(--color-ink)]">
          <strong>{rows.length}</strong> linha(s) válida(s) ·{' '}
          <strong>{headcount}</strong> pessoas ·{' '}
          <strong>{centers}</strong> centro(s) de custo. Headcount e salário
          médio do formulário serão sobrescritos na simulação.
        </p>
      ) : null}

      {issues.length > 0 ? (
        <div className="border border-amber-700/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-medium">Avisos / linhas inválidas</p>
          <ul className="mt-1 list-inside list-disc">
            {issues.slice(0, 12).map((issue, i) => (
              <li key={`${issue.line}-${i}`}>
                {issue.line > 0 ? `Linha ${issue.line}: ` : ''}
                {issue.message}
              </li>
            ))}
            {issues.length > 12 ? (
              <li>… e mais {issues.length - 12} aviso(s)</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <th className="py-1 pr-2 font-normal">Cargo</th>
                <th className="py-1 pr-2 font-normal">Centro</th>
                <th className="py-1 pr-2 font-normal">Salário</th>
                <th className="py-1 pr-2 font-normal">Qtd</th>
                <th className="py-1 pr-2 font-normal">VR/dia</th>
                <th className="py-1 font-normal">VT/dia</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r) => (
                <tr
                  key={`${r.sourceLine}-${r.cargo}-${r.centroCusto}`}
                  className="border-b border-[var(--color-line)]"
                >
                  <td className="py-1 pr-2">{r.cargo}</td>
                  <td className="py-1 pr-2">{r.centroCusto}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    {r.salario.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                  <td className="py-1 pr-2 tabular-nums">{r.quantidade}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    {r.vrValorDia ?? '—'}
                  </td>
                  <td className="py-1 tabular-nums">{r.vtValorDia ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 ? (
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Mostrando 8 de {rows.length} linhas.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}
