/**
 * Apdata → Turnocheck: one linear flow.
 * 1) Review SELECTs  2) Progress while exporting  3) Simulation via ResultsView
 * LGPD: samples show cargo / CC code / escala / qty — never employee names.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  checkApiHealth,
  getActiveEnvironment,
  type EnvironmentPublic,
} from '../api/environments'
import { EXCLUDED_SITUACOES, type Establishment } from '../apdata/cnpj'
import { REVIEW_SELECTS, LIVE_SELECT_STEPS } from '../apdata/selects'
import {
  exportPayrollFromApdata,
  loadEstablishmentsFromApdata,
  type ExportProgressStep,
  type ExportResult,
} from '../apdata/exportPayroll'
import {
  clearScenarioBasket,
  DEFAULT_OPERATING_HOURS,
  RULE_VERSIONS,
  simulate,
  upsertSimulationInBasket,
  loadScenarioBasket,
  type OperatingHours,
  type ScenarioBasket,
  type ScenarioId,
  type SimulationResult,
} from '../engine'
import { ResultsView } from './ResultsView'

type Phase = 'review' | 'running' | 'ready' | 'results'

interface ApdataFlowPanelProps {
  open: boolean
  onClose: () => void
}

const SCENARIO_ORDER: ScenarioId[] = [
  'status_quo',
  'pec_draft_conservative',
  'pec_draft_aggressive',
]

export function ApdataFlowPanel({ open, onClose }: ApdataFlowPanelProps) {
  const [phase, setPhase] = useState<Phase>('review')
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [activeEnv, setActiveEnv] = useState<EnvironmentPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ExportProgressStep[]>([])
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [basket, setBasket] = useState<ScenarioBasket | null>(() =>
    loadScenarioBasket(),
  )

  const [sector, setSector] = useState<'varejo' | 'hospital'>('varejo')
  const [scenarioId, setScenarioId] = useState<ScenarioId>(
    'pec_draft_conservative',
  )
  const [defaultSalario, setDefaultSalario] = useState('2200')
  const [vrValorDia, setVrValorDia] = useState('30.56')
  const [vtValorDia, setVtValorDia] = useState('')
  const [operatingHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedCnpjKeys, setSelectedCnpjKeys] = useState<string[]>([])
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjError, setCnpjError] = useState<string | null>(null)

  const refreshEnv = useCallback(async () => {
    setError(null)
    setCnpjError(null)
    try {
      const healthy = await checkApiHealth()
      setApiOk(healthy)
      if (!healthy) {
        setActiveEnv(null)
        setEstablishments([])
        setSelectedCnpjKeys([])
        setError(
          'API indisponível. Suba o server/ (porta 8787) ou o proxy /api na VPS.',
        )
        return
      }
      const { environment } = await getActiveEnvironment()
      setActiveEnv(environment)
      if (!environment) {
        setEstablishments([])
        setSelectedCnpjKeys([])
        setError(
          'Nenhum ambiente ativo. Abra Ambientes, cadastre a base e selecione ativo.',
        )
        return
      }
      setCnpjLoading(true)
      try {
        const list = await loadEstablishmentsFromApdata({
          environmentId: environment.id,
        })
        setEstablishments(list)
        setSelectedCnpjKeys(list.map((e) => e.key))
      } catch (err) {
        setEstablishments([])
        setSelectedCnpjKeys([])
        setCnpjError(err instanceof Error ? err.message : String(err))
      } finally {
        setCnpjLoading(false)
      }
    } catch (err) {
      setApiOk(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (open) {
      setPhase('review')
      setExported(null)
      setResult(null)
      setSteps([])
      setError(null)
      void refreshEnv()
    }
  }, [open, refreshEnv])

  if (!open) return null

  function toggleCnpj(key: string) {
    setSelectedCnpjKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  async function handleRun() {
    setError(null)
    setExported(null)
    setResult(null)
    if (establishments.length > 0 && selectedCnpjKeys.length === 0) {
      setError('Selecione ao menos um CNPJ (estabelecimento).')
      return
    }
    setPhase('running')
    const sal = Number(defaultSalario.replace(',', '.'))
    const vr = vrValorDia.trim()
      ? Number(vrValorDia.replace(',', '.'))
      : null
    const vt = vtValorDia.trim()
      ? Number(vtValorDia.replace(',', '.'))
      : null
    try {
      const out = await exportPayrollFromApdata(
        {
          environmentId: activeEnv?.id,
          defaultSalario: Number.isFinite(sal) && sal > 0 ? sal : undefined,
          vrValorDia: vr !== null && Number.isFinite(vr) ? vr : null,
          vtValorDia: vt !== null && Number.isFinite(vt) ? vt : null,
          selectedCnpjKeys:
            selectedCnpjKeys.length > 0 ? selectedCnpjKeys : undefined,
        },
        setSteps,
      )
      setExported(out)
      setSteps(out.steps)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('review')
    }
  }

  function handleSimulate() {
    if (!exported || exported.rows.length === 0) return
    // Dominant headcount scale as wizard default; per-row escalaAtual still wins.
    const byScale = new Map<string, number>()
    for (const r of exported.rows) {
      const code = r.escalaAtual || '6x1'
      byScale.set(code, (byScale.get(code) ?? 0) + r.quantidade)
    }
    let dominant = '6x1'
    let best = 0
    for (const [code, n] of byScale) {
      if (n > best) {
        best = n
        dominant = code
      }
    }
    const next = simulate({
      sector,
      headcount: exported.stats.contratadosAtivos || 1,
      currentScale: dominant,
      averageMonthlySalary: Number(defaultSalario.replace(',', '.')) || 2200,
      units: 1,
      shiftsPerDay: 2,
      operatingHours,
      scenarioId,
      payrollRows: exported.rows,
    })
    const nextBasket = upsertSimulationInBasket(next, basket)
    setBasket(nextBasket)
    setResult(next)
    setPhase('results')
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apdata-flow-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="apdata-flow-title"
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              Apdata → Turnocheck
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Revisar SELECTs · exportar folha agregada · simular impacto PEC.
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

        <ol className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Fases">
          {(
            [
              ['review', '1. Revisar'],
              ['running', '2. Processar'],
              ['ready', '3. Export'],
              ['results', '4. Resultado'],
            ] as const
          ).map(([id, label]) => {
            const active =
              phase === id ||
              (id === 'running' && phase === 'running') ||
              (id === 'ready' && (phase === 'ready' || phase === 'results')) ||
              (id === 'results' && phase === 'results')
            const past =
              (id === 'review' && phase !== 'review') ||
              (id === 'running' &&
                (phase === 'ready' || phase === 'results')) ||
              (id === 'ready' && phase === 'results')
            return (
              <li
                key={id}
                className={[
                  'border px-2.5 py-1',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]'
                    : past
                      ? 'border-[var(--color-line)] text-[var(--color-muted)]'
                      : 'border-[var(--color-line)]/60 text-[var(--color-muted)]/70',
                ].join(' ')}
              >
                {label}
              </li>
            )
          })}
        </ol>

        <p className="mt-3 border border-[var(--color-line)] bg-white/50 px-3 py-2 text-xs text-[var(--color-muted)]">
          <strong className="font-medium text-[var(--color-ink)]">LGPD:</strong>{' '}
          export omite <code>nome</code>; usa código de CC; amostras só com
          cargo, CC, escala e quantidade — sem nomes de pessoas ou clientes.
        </p>

        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {phase === 'results' && result ? (
          <div className="mt-4">
            <ResultsView
              result={result}
              basket={basket}
              onBasketChange={setBasket}
              onBack={() => setPhase('ready')}
              onRestart={() => {
                setResult(null)
                setExported(null)
                setPhase('review')
              }}
              onClearBasket={() => {
                clearScenarioBasket()
                setBasket(null)
              }}
            />
          </div>
        ) : (
          <>
            <section className="mt-5">
              <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                Ambiente
              </h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {activeEnv ? (
                  <>
                    Ativo:{' '}
                    <span className="text-[var(--color-ink)]">
                      {activeEnv.name}
                    </span>{' '}
                    · {activeEnv.engine.toUpperCase()} · {activeEnv.host}:
                    {activeEnv.port}/{activeEnv.database}
                    {apiOk && (
                      <span className="ml-2 text-[var(--color-accent)]">
                        API online
                      </span>
                    )}
                  </>
                ) : (
                  'Nenhum ambiente ativo.'
                )}
              </p>
            </section>

            {(phase === 'review' || phase === 'ready') && (
              <>
                <section className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                    Estabelecimentos (CNPJ)
                  </h3>
                  <p className="text-sm text-[var(--color-muted)]">
                    Join Folhas → Locais → Empresas. Prefixo{' '}
                    <code>EMP_NusCNPJPrefixo</code> + sufixo{' '}
                    <code>LOC_NusCNPJSufixo</code>. Situação exclui{' '}
                    <code>{EXCLUDED_SITUACOES.join(', ')}</code> (ativos +
                    afastados entram no headcount). Sem nomes de cliente.
                  </p>
                  {cnpjLoading && (
                    <p className="text-sm text-[var(--color-muted)]">
                      Carregando CNPJs do ambiente…
                    </p>
                  )}
                  {cnpjError && (
                    <p className="text-sm text-red-700" role="alert">
                      CNPJ: {cnpjError}
                    </p>
                  )}
                  {!cnpjLoading &&
                    !cnpjError &&
                    establishments.length === 0 &&
                    activeEnv && (
                      <p className="text-sm text-[var(--color-muted)]">
                        Nenhum estabelecimento com Folha/Local/Empresa no
                        ambiente.
                      </p>
                    )}
                  {establishments.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="border border-[var(--color-line)] px-2 py-1"
                          onClick={() =>
                            setSelectedCnpjKeys(
                              establishments.map((e) => e.key),
                            )
                          }
                        >
                          Todos ({establishments.length})
                        </button>
                        <button
                          type="button"
                          className="border border-[var(--color-line)] px-2 py-1"
                          onClick={() => setSelectedCnpjKeys([])}
                        >
                          Nenhum
                        </button>
                        <span className="self-center text-[var(--color-muted)]">
                          {selectedCnpjKeys.length} selecionado(s)
                        </span>
                      </div>
                      <ul className="max-h-48 overflow-y-auto border border-[var(--color-line)] bg-white/60">
                        {establishments.map((est) => {
                          const checked = selectedCnpjKeys.includes(est.key)
                          return (
                            <li
                              key={est.key}
                              className="border-b border-[var(--color-line)]/60 last:border-b-0"
                            >
                              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]/30">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCnpj(est.key)}
                                />
                                <span className="font-mono text-[var(--color-ink)]">
                                  {est.label}
                                </span>
                                <span className="text-xs text-[var(--color-muted)]">
                                  {est.folhaIds.length} folha(s)
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </section>

                <section className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                    SELECTs (revisão de lógica)
                  </h3>
                  <p className="text-sm text-[var(--color-muted)]">
                    Textos do mapeamento. Em runtime o proxy executa SELECTs
                    single-table allowlisted e o join/agregação ocorre no
                    cliente.
                  </p>
                  {REVIEW_SELECTS.map((q) => (
                    <details
                      key={q.id}
                      className="border border-[var(--color-line)] bg-white/60"
                      open={q.id === 'C' || q.id === 'F'}
                    >
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]/40">
                        {q.title}
                      </summary>
                      <p className="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)]">
                        {q.purpose}
                      </p>
                      <pre className="overflow-x-auto border-t border-[var(--color-line)] bg-[var(--color-ink)]/95 p-3 text-xs leading-relaxed text-[var(--color-accent-soft)]">
                        {q.sql}
                      </pre>
                    </details>
                  ))}
                  <details className="border border-[var(--color-line)] bg-white/60">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                      Passos live (/api/query/select)
                    </summary>
                    <ul className="space-y-1 border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)]">
                      {LIVE_SELECT_STEPS.map((s) => (
                        <li key={s.id}>
                          <code className="text-[var(--color-ink)]">
                            {s.table}
                          </code>
                          {' — '}
                          {s.note}
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>

                <section className="mt-5">
                  <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                    Parâmetros da simulação
                  </h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">Setor</span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={sector}
                        onChange={(e) =>
                          setSector(e.target.value as 'varejo' | 'hospital')
                        }
                      >
                        <option value="varejo">Varejo</option>
                        <option value="hospital">Hospital</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">Cenário</span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={scenarioId}
                        onChange={(e) =>
                          setScenarioId(e.target.value as ScenarioId)
                        }
                      >
                        {SCENARIO_ORDER.map((id) => (
                          <option key={id} value={id}>
                            {RULE_VERSIONS[id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">
                        Salário padrão (se TEMP zerado)
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={defaultSalario}
                        onChange={(e) => setDefaultSalario(e.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">
                        VR R$/dia (override)
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={vrValorDia}
                        onChange={(e) => setVrValorDia(e.target.value)}
                        inputMode="decimal"
                        placeholder="ex. 30.56"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-[var(--color-muted)]">
                        VT R$/dia (override; vazio = ConATransportes ×
                        MeiosTransportesItens, CAS_DtdFim NULL)
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={vtValorDia}
                        onChange={(e) => setVtValorDia(e.target.value)}
                        inputMode="decimal"
                        placeholder="vazio = cadastro AT"
                      />
                    </label>
                  </div>
                </section>
              </>
            )}

            {phase === 'running' && (
              <section className="mt-5" aria-live="polite">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Processando
                </h3>
                <ProgressList steps={steps} />
              </section>
            )}

            {phase === 'ready' && exported && (
              <section className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Export pronto
                </h3>
                <ProgressList steps={steps.length ? steps : exported.steps} />
                <p className="text-sm text-[var(--color-muted)]">
                  {exported.stats.contratadosAtivos} vínculos ·{' '}
                  {exported.stats.estabelecimentosFiltrados} CNPJ ·{' '}
                  {exported.stats.linhasAgregadas} linhas agregadas
                  {exported.stats.comVtCadastro > 0 && (
                    <> · {exported.stats.comVtCadastro} c/ VT cadastro</>
                  )}
                  {exported.stats.salariosZerados > 0 && (
                    <> · {exported.stats.salariosZerados} salário(s) zerado(s)</>
                  )}
                </p>
                {Object.keys(exported.stats.escalaCounts).length > 0 && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Escalas (horários):{' '}
                    {Object.entries(exported.stats.escalaCounts)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' · ')}
                  </p>
                )}
                {exported.stats.sample.length > 0 && (
                  <div className="overflow-x-auto border border-[var(--color-line)]">
                    <table className="w-full min-w-[28rem] text-left text-xs">
                      <thead className="bg-[var(--color-accent-soft)]/60">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">cargo</th>
                          <th className="px-2 py-1.5 font-medium">
                            centro_custo
                          </th>
                          <th className="px-2 py-1.5 font-medium">escala</th>
                          <th className="px-2 py-1.5 font-medium">qtd</th>
                          <th className="px-2 py-1.5 font-medium">h/mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exported.stats.sample.map((row, i) => (
                          <tr
                            key={`${row.centroCusto}-${row.cargo}-${i}`}
                            className="border-t border-[var(--color-line)] bg-white/40"
                          >
                            <td className="px-2 py-1.5">{row.cargo}</td>
                            <td className="px-2 py-1.5 font-mono">
                              {row.centroCusto}
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              {row.escala}
                            </td>
                            <td className="px-2 py-1.5">{row.quantidade}</td>
                            <td className="px-2 py-1.5">{row.cargaMensal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {exported.issues.length > 0 && (
                  <ul className="text-xs text-amber-800">
                    {exported.issues.map((iss, i) => (
                      <li key={`${iss.line}-${i}`}>{iss.message}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {phase === 'review' && (
                <button
                  type="button"
                  disabled={!activeEnv || apiOk === false}
                  onClick={() => void handleRun()}
                  className="bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  Executar export Apdata
                </button>
              )}
              {phase === 'ready' && (
                <>
                  <button
                    type="button"
                    disabled={exported?.rows.length === 0}
                    onClick={handleSimulate}
                    className="bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Simular impacto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExported(null)
                      setPhase('review')
                    }}
                    className="border border-[var(--color-line)] px-4 py-2 text-sm"
                  >
                    Voltar à revisão
                  </button>
                </>
              )}
              {phase === 'running' && (
                <span className="text-sm text-[var(--color-muted)]">
                  Aguardando SELECT-only…
                </span>
              )}
              <button
                type="button"
                onClick={() => void refreshEnv()}
                className="border border-[var(--color-line)] px-3 py-2 text-sm"
              >
                Atualizar ambiente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProgressList({ steps }: { steps: ExportProgressStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--color-muted)]">Iniciando…</p>
    )
  }
  return (
    <ol className="mt-2 space-y-1.5">
      {steps.map((s) => {
        const mark =
          s.status === 'done'
            ? '✓'
            : s.status === 'running'
              ? '…'
              : s.status === 'error'
                ? '✗'
                : '○'
        return (
          <li
            key={s.id}
            className="flex gap-2 border-b border-[var(--color-line)]/50 py-1.5 text-sm"
          >
            <span
              className={[
                'w-4 shrink-0 font-mono',
                s.status === 'done'
                  ? 'text-[var(--color-accent)]'
                  : s.status === 'error'
                    ? 'text-red-700'
                    : 'text-[var(--color-muted)]',
              ].join(' ')}
              aria-hidden
            >
              {mark}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[var(--color-ink)]">{s.label}</p>
              {s.detail && (
                <p className="text-xs text-[var(--color-muted)]">{s.detail}</p>
              )}
              {s.sql && s.status === 'done' && (
                <pre className="mt-1 overflow-x-auto bg-[var(--color-ink)]/90 p-2 text-[10px] leading-snug text-[var(--color-accent-soft)]">
                  {s.sql}
                </pre>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
