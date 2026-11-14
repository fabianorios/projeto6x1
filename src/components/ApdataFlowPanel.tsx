/**
 * Fluxo executivo 4 passos (sem jargão de DB na visão RH):
 * 1) Origem dos Dados  2) Escopo  3) Premissas  4) Resultados
 * Reusa Ambiente Salvo / Conexão Direta (PR #21). LGPD: sem nomes de pessoas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  postEphemeralCatalog,
  postEphemeralExtract,
  type EphemeralSessionCreds,
} from '../api/ephemeral'
import {
  checkApiHealth,
  getActiveEnvironment,
  type EnvironmentPublic,
} from '../api/environments'
import { listSqlProfiles } from '../api/sql-profiles'
import { cnpjDigits, type Establishment } from '../apdata/cnpj'
import {
  establishmentsFromEphemeralCatalog,
  ramosFromEphemeralCatalog,
} from '../apdata/ephemeralCatalog'
import { exportResultFromEphemeralRows } from '../apdata/exportFromEphemeral'
import {
  exportPayrollFromApdata,
  loadEstablishmentsFromApdata,
  loadRamosFromApdata,
  type ExportProgressStep,
  type ExportResult,
} from '../apdata/exportPayroll'
import {
  sectorFromSelectedRamos,
  type RamoAtividade,
} from '../apdata/ramos'
import {
  clearScenarioBasket,
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  REGIME_FUNCIONAMENTO_LABELS,
  RULE_VERSIONS,
  simulate,
  upsertSimulationInBasket,
  loadScenarioBasket,
  type EstrategiaAbsorcao,
  type OperatingHours,
  type RegimeFuncionamento,
  type ScenarioBasket,
  type ScenarioId,
  type SectorId,
  type SimulationResult,
  type TaxRegime,
} from '../engine'
import { PILOT_TEMPLATES } from '../templates'
import type { SqlProfile } from '../types/sql-profile'
import { AptoolsExtractModal } from './AptoolsExtractModal'
import {
  DEFAULT_EPHEMERAL_CREDS_FORM,
  EphemeralCredsFields,
  ephemeralFormComplete,
  type EphemeralCredsFormValue,
} from './EphemeralCredsFields'
import { ResultsView } from './ResultsView'

type Phase = 'origem' | 'escopo' | 'premissas' | 'running' | 'resultados'
type AmbMode = 'saved' | 'direct'
type OriginCard = 'apdata' | 'aptools' | 'manual'

function formToSessionCreds(
  form: EphemeralCredsFormValue,
): EphemeralSessionCreds {
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

interface ApdataFlowPanelProps {
  open: boolean
  onClose: () => void
  /** Planilha Manual → fecha o fluxo e abre o wizard de importação. */
  onManualSheet?: () => void
}

export function ApdataFlowPanel({
  open,
  onClose,
  onManualSheet,
}: ApdataFlowPanelProps) {
  const [phase, setPhase] = useState<Phase>('origem')
  const [originCard, setOriginCard] = useState<OriginCard>('apdata')
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [activeEnv, setActiveEnv] = useState<EnvironmentPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ExportProgressStep[]>([])
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [basket, setBasket] = useState<ScenarioBasket | null>(() =>
    loadScenarioBasket(),
  )
  const [escopoSearch, setEscopoSearch] = useState('')
  const [showAptools, setShowAptools] = useState(false)
  const [sqlProfiles, setSqlProfiles] = useState<SqlProfile[]>([])
  const [sqlProfileId, setSqlProfileId] = useState<string | null>(null)

  const [sector, setSector] = useState<SectorId>('varejo')
  const [scenarioId, setScenarioId] = useState<ScenarioId>(
    'fase1_2026_42h',
  )
  const [estrategiaAbsorcao, setEstrategiaAbsorcao] =
    useState<EstrategiaAbsorcao>(DEFAULT_ESTRATEGIA_ABSORCAO)
  const [defaultSalario, setDefaultSalario] = useState('2200')
  const [vrValorDia, setVrValorDia] = useState('30.56')
  const [vtValorDia, setVtValorDia] = useState('')
  const [defaultTaxRegime, setDefaultTaxRegime] =
    useState<TaxRegime>(DEFAULT_TAX_REGIME)
  const [defaultRegime, setDefaultRegime] = useState<RegimeFuncionamento>(
    DEFAULT_REGIME_FUNCIONAMENTO,
  )
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [operatingHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedCnpjKeys, setSelectedCnpjKeys] = useState<string[]>([])
  const [ramos, setRamos] = useState<RamoAtividade[]>([])
  const [selectedRamoIds, setSelectedRamoIds] = useState<number[]>([])
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjError, setCnpjError] = useState<string | null>(null)
  const [ambMode, setAmbMode] = useState<AmbMode>('saved')
  const [directForm, setDirectForm] = useState<EphemeralCredsFormValue>(
    DEFAULT_EPHEMERAL_CREDS_FORM,
  )
  /** Session-only creds after Conectar — never written to disk/localStorage. */
  const [ephemeralCreds, setEphemeralCreds] =
    useState<EphemeralSessionCreds | null>(null)
  const [directConnecting, setDirectConnecting] = useState(false)
  const [directConnected, setDirectConnected] = useState(false)

  const filteredEstablishments = useMemo(() => {
    const q = escopoSearch.trim().toLowerCase()
    if (!q) return establishments
    return establishments.filter((e) => {
      const hay = `${e.label} ${e.key} ${e.colaboradores}`.toLowerCase()
      return hay.includes(q)
    })
  }, [establishments, escopoSearch])

  const clearCatalog = useCallback(() => {
    setEstablishments([])
    setSelectedCnpjKeys([])
    setRamos([])
    setSelectedRamoIds([])
  }, [])

  const applyCatalog = useCallback(
    (list: Establishment[], ramoList: RamoAtividade[]) => {
      setEstablishments(list)
      setSelectedCnpjKeys(list.map((e) => e.key))
      setRamos(ramoList)
      const ramoIds = ramoList.map((r) => r.id)
      setSelectedRamoIds(ramoIds)
      if (ramoIds.length > 0) {
        setSector(sectorFromSelectedRamos(ramoList, ramoIds))
      }
    },
    [],
  )

  const refreshEnv = useCallback(async () => {
    setError(null)
    setCnpjError(null)
    try {
      const healthy = await checkApiHealth()
      setApiOk(healthy)
      if (!healthy) {
        setActiveEnv(null)
        clearCatalog()
        setError(
          'API indisponível. Suba o server/ (porta 8787) ou o proxy /api na VPS.',
        )
        return
      }
      if (ambMode === 'direct') {
        // Direct mode: catalog comes from Conectar (ephemeral), not Ambientes.
        setActiveEnv(null)
        return
      }
      const { environment } = await getActiveEnvironment()
      setActiveEnv(environment)
      if (!environment) {
        clearCatalog()
        setError(
          'Nenhum ambiente ativo. Abra Ambientes, cadastre a base e selecione ativo — ou use Conexão Direta.',
        )
        return
      }
      setCnpjLoading(true)
      try {
        const [list, ramoList] = await Promise.all([
          loadEstablishmentsFromApdata({
            environmentId: environment.id,
          }),
          loadRamosFromApdata({ environmentId: environment.id }),
        ])
        applyCatalog(list, ramoList)
      } catch (err) {
        clearCatalog()
        setCnpjError(err instanceof Error ? err.message : String(err))
      } finally {
        setCnpjLoading(false)
      }
    } catch (err) {
      setApiOk(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [ambMode, applyCatalog, clearCatalog])

  useEffect(() => {
    if (open) {
      setPhase('origem')
      setOriginCard('apdata')
      setExported(null)
      setResult(null)
      setSteps([])
      setError(null)
      setEscopoSearch('')
      void refreshEnv()
      void listSqlProfiles()
        .then((list) => {
          setSqlProfiles(list.profiles)
          setSqlProfileId(list.activeId ?? list.factoryId)
        })
        .catch(() => {
          setSqlProfiles([])
        })
    } else {
      // Drop volatile password when the panel closes.
      setEphemeralCreds(null)
      setDirectForm(DEFAULT_EPHEMERAL_CREDS_FORM)
      setDirectConnected(false)
      setShowAptools(false)
    }
  }, [open, refreshEnv])

  function switchAmbMode(next: AmbMode) {
    if (next === ambMode) return
    setAmbMode(next)
    setError(null)
    setCnpjError(null)
    setExported(null)
    setPhase('origem')
    clearCatalog()
    setEphemeralCreds(null)
    setDirectConnected(false)
    if (next === 'direct') {
      setActiveEnv(null)
      setDirectForm(DEFAULT_EPHEMERAL_CREDS_FORM)
    }
  }

  async function handleDirectConnect() {
    setError(null)
    setCnpjError(null)
    setDirectConnecting(true)
    setCnpjLoading(true)
    setDirectConnected(false)
    clearCatalog()
    try {
      const healthy = await checkApiHealth()
      setApiOk(healthy)
      if (!healthy) {
        setError(
          'API indisponível. Suba o server/ (porta 8787) ou o proxy /api na VPS.',
        )
        return
      }
      const creds = formToSessionCreds(directForm)
      const catalog = await postEphemeralCatalog(creds)
      const list = establishmentsFromEphemeralCatalog(catalog)
      const ramoList = ramosFromEphemeralCatalog(catalog)
      applyCatalog(list, ramoList)
      // Keep password only in React state for the export step.
      setEphemeralCreds(creds)
      setDirectConnected(true)
      setPhase('escopo')
    } catch (err) {
      setEphemeralCreds(null)
      setDirectConnected(false)
      setCnpjError(err instanceof Error ? err.message : String(err))
    } finally {
      setDirectConnecting(false)
      setCnpjLoading(false)
    }
  }

  function goEscopoFromSaved() {
    if (!activeEnv || establishments.length === 0) {
      setError(
        'Carregue um Ambiente Salvo com estabelecimentos antes de continuar.',
      )
      return
    }
    setError(null)
    setPhase('escopo')
  }

  if (!open) return null

  function toggleCnpj(key: string) {
    setSelectedCnpjKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function toggleRamo(id: number) {
    setSelectedRamoIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
      if (next.length > 0) {
        setSector(sectorFromSelectedRamos(ramos, next))
      }
      return next
    })
  }

  async function handleRun() {
    setError(null)
    setExported(null)
    setResult(null)
    if (establishments.length > 0 && selectedCnpjKeys.length === 0) {
      setError('Selecione ao menos um CNPJ (estabelecimento).')
      return
    }
    if (ramos.length > 0 && selectedRamoIds.length === 0) {
      setError('Selecione ao menos um ramo de serviço.')
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
    const overrides = {
      defaultSalario: Number.isFinite(sal) && sal > 0 ? sal : undefined,
      vrValorDia: vr !== null && Number.isFinite(vr) ? vr : null,
      vtValorDia: vt !== null && Number.isFinite(vt) ? vt : null,
      selectedCnpjKeys:
        selectedCnpjKeys.length > 0 ? selectedCnpjKeys : undefined,
      selectedRamoIds:
        selectedRamoIds.length > 0 ? selectedRamoIds : undefined,
    }
    try {
      if (ambMode === 'direct') {
        if (!ephemeralCreds) {
          throw new Error(
            'Conecte com IP/Porta antes de executar o export (Conectar).',
          )
        }
        let steps: ExportProgressStep[] = [
          {
            id: 'ephemeral-extract',
            label: 'Extrator efêmero (POST /api/query/ephemeral)',
            status: 'running',
            detail: 'Conexão volátil — credenciais só nesta requisição',
          },
        ]
        setSteps(steps)
        const cnpjs = (overrides.selectedCnpjKeys ?? [])
          .map((k) => cnpjDigits(k))
          .filter(Boolean)
          .slice(0, 32)
        const extracted = await postEphemeralExtract(ephemeralCreds, {
          cnpjs,
        })
        steps = [
          {
            id: 'ephemeral-extract',
            label: 'Extrator efêmero (POST /api/query/ephemeral)',
            status: 'done',
            detail: `${extracted.rowCount} linha(s) agregadas · ${extracted.latencyMs}ms`,
          },
        ]
        const out = exportResultFromEphemeralRows(
          extracted.rows,
          overrides,
          steps,
        )
        setExported(out)
        setSteps(out.steps)
        setPhase('premissas')
        return
      }
      const out = await exportPayrollFromApdata(
        {
          environmentId: activeEnv?.id,
          ...overrides,
        },
        setSteps,
      )
      setExported(out)
      setSteps(out.steps)
      setPhase('premissas')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('escopo')
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
      estrategiaAbsorcao,
      defaultTaxRegime,
      defaultRegimeFuncionamento: defaultRegime,
    })
    const nextBasket = upsertSimulationInBasket(next, basket)
    setBasket(nextBasket)
    setResult(next)
    setPhase('resultados')
  }

  function resimulateWithAbsorcao(nextAbs: EstrategiaAbsorcao) {
    if (!exported) return
    setEstrategiaAbsorcao(nextAbs)
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
      estrategiaAbsorcao: nextAbs,
      defaultTaxRegime,
      defaultRegimeFuncionamento: defaultRegime,
    })
    const nextBasket = upsertSimulationInBasket(next, basket)
    setBasket(nextBasket)
    setResult(next)
  }

  const stepOrder: Phase[] = ['origem', 'escopo', 'premissas', 'resultados']
  const stepLabels: Record<string, string> = {
    origem: 'Origem dos Dados',
    escopo: 'Escopo',
    premissas: 'Premissas',
    resultados: 'Resultados',
  }
  const visualStep =
    phase === 'running'
      ? 'premissas'
      : phase === 'resultados'
        ? 'resultados'
        : phase

  const canUseApdata =
    ambMode === 'saved'
      ? Boolean(activeEnv)
      : Boolean(ephemeralCreds && directConnected)

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
              Simulação executiva
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Quatro passos: origem · escopo · premissas · resultados.
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

        <ol className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Passos">
          {stepOrder.map((id, i) => {
            const active = visualStep === id
            const past = stepOrder.indexOf(visualStep as Phase) > i
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
                {i + 1}. {stepLabels[id]}
              </li>
            )
          })}
        </ol>

        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {cnpjError && phase !== 'resultados' && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {cnpjError}
          </p>
        )}

        {phase === 'resultados' && result ? (
          <div className="mt-4">
            <ResultsView
              result={result}
              basket={basket}
              onBasketChange={setBasket}
              onBack={() => setPhase('premissas')}
              onRestart={() => {
                setResult(null)
                setExported(null)
                setPhase('origem')
              }}
              onClearBasket={() => {
                clearScenarioBasket()
                setBasket(null)
              }}
              estrategiaAbsorcao={estrategiaAbsorcao}
              onEstrategiaChange={resimulateWithAbsorcao}
            />
          </div>
        ) : (
          <>
            {phase === 'origem' && (
              <section className="mt-5 space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Passo 1 — Origem dos Dados
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['apdata', 'Conexão Direta Apdata', 'Ambiente salvo ou IP/porta + perfil SQL do Studio.'],
                      ['aptools', 'Extrair via Aptools', 'Copiar queries oficiais e/ou enviar CSV agregado.'],
                      ['manual', 'Planilha Manual', 'Importar folha no wizard (CSV/;).'],
                    ] as const
                  ).map(([id, title, blurb]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setOriginCard(id)
                        if (id === 'aptools') setShowAptools(true)
                        if (id === 'manual') {
                          onManualSheet?.()
                          onClose()
                        }
                      }}
                      className={[
                        'border px-3 py-4 text-left transition',
                        originCard === id
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/50'
                          : 'border-[var(--color-line)] bg-white/70 hover:border-[var(--color-accent)]/40',
                      ].join(' ')}
                    >
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        {blurb}
                      </p>
                    </button>
                  ))}
                </div>

                {originCard === 'apdata' && (
                  <div className="space-y-3 border border-[var(--color-line)] bg-white/70 px-3 py-3">
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label="Modo de ambiente"
                    >
                      {(
                        [
                          ['saved', 'Ambiente Salvo'],
                          ['direct', 'Conexão Rápida (IP / Porta)'],
                        ] as const
                      ).map(([id, label]) => {
                        const selected = ambMode === id
                        return (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => switchAmbMode(id)}
                            className={[
                              'border px-3 py-1.5 text-sm',
                              selected
                                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                                : 'border-[var(--color-line)] text-[var(--color-muted)]',
                            ].join(' ')}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>

                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--color-muted)]">
                        Perfil SQL (Studio)
                      </span>
                      <select
                        className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
                        value={sqlProfileId ?? ''}
                        onChange={(e) => setSqlProfileId(e.target.value || null)}
                      >
                        {sqlProfiles.length === 0 && (
                          <option value="">Padrão Apdata SaaS</option>
                        )}
                        {sqlProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.readonly ? ' (fábrica)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    {ambMode === 'saved' ? (
                      <div className="space-y-2">
                        <p className="text-sm text-[var(--color-muted)]">
                          {activeEnv ? (
                            <>
                              Ativo:{' '}
                              <span className="text-[var(--color-ink)]">
                                {activeEnv.name}
                              </span>
                              {apiOk && (
                                <span className="ml-2 text-[var(--color-teal)]">
                                  API online
                                </span>
                              )}
                            </>
                          ) : (
                            'Nenhum ambiente ativo — abra Ambientes ou use Conexão Rápida.'
                          )}
                        </p>
                        {cnpjLoading && (
                          <p className="text-sm text-[var(--color-muted)]">
                            Carregando estabelecimentos…
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void refreshEnv()}
                            className="border border-[var(--color-line)] px-3 py-2 text-sm"
                          >
                            Atualizar ambiente
                          </button>
                          <button
                            type="button"
                            disabled={!activeEnv || establishments.length === 0}
                            onClick={goEscopoFromSaved}
                            className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Continuar para Escopo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--color-muted)]">
                          Credenciais só na sessão — não são gravadas em disco.
                        </p>
                        <EphemeralCredsFields
                          value={directForm}
                          onChange={setDirectForm}
                          disabled={directConnecting}
                        />
                        <button
                          type="button"
                          disabled={
                            directConnecting ||
                            !ephemeralFormComplete(directForm) ||
                            apiOk === false
                          }
                          onClick={() => void handleDirectConnect()}
                          className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {directConnecting ? 'Conectando…' : 'Conectar e ir ao Escopo'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {phase === 'escopo' && (
              <section className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Passo 2 — Escopo
                </h3>
                <p className="text-sm text-[var(--color-muted)]">
                  Selecione razão social, filial e CNPJ. Totais = colaboradores
                  ativos.
                </p>
                <input
                  type="search"
                  placeholder="Buscar razão, filial ou CNPJ…"
                  value={escopoSearch}
                  onChange={(e) => setEscopoSearch(e.target.value)}
                  className="w-full border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="border border-[var(--color-line)] px-2 py-1"
                    onClick={() =>
                      setSelectedCnpjKeys(establishments.map((e) => e.key))
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
                <div className="max-h-80 overflow-auto border border-[var(--color-line)] bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[var(--color-accent-soft)]/80 text-xs">
                      <tr>
                        <th className="px-2 py-2" />
                        <th className="px-2 py-2 font-medium">Razão</th>
                        <th className="px-2 py-2 font-medium">Filial</th>
                        <th className="px-2 py-2 font-medium">CNPJ</th>
                        <th className="px-2 py-2 font-medium">Ativos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEstablishments.map((est) => {
                        const checked = selectedCnpjKeys.includes(est.key)
                        const parts = est.label.split(' · ')
                        const razao = parts[0] ?? est.label
                        const filial = parts[1] ?? '—'
                        const cnpj = parts[2] ?? est.key
                        return (
                          <tr
                            key={est.key}
                            className="border-t border-[var(--color-line)]/60 hover:bg-[var(--color-accent-soft)]/20"
                          >
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCnpj(est.key)}
                                aria-label={`Selecionar ${est.label}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">{razao}</td>
                            <td className="px-2 py-1.5">{filial}</td>
                            <td className="px-2 py-1.5 font-mono text-xs">
                              {cnpj}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {est.colaboradores}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {ramos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--color-muted)] uppercase">
                      Ramos de serviço
                    </p>
                    <ul className="max-h-32 overflow-y-auto border border-[var(--color-line)] bg-white/60">
                      {ramos.map((ramo) => (
                        <li
                          key={ramo.id}
                          className="border-b border-[var(--color-line)]/60 last:border-b-0"
                        >
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedRamoIds.includes(ramo.id)}
                              onChange={() => toggleRamo(ramo.id)}
                            />
                            <span>{ramo.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('origem')}
                    className="border border-[var(--color-line)] px-3 py-2 text-sm"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={!canUseApdata || selectedCnpjKeys.length === 0}
                    onClick={() => void handleRun()}
                    className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Continuar para Premissas
                  </button>
                </div>
              </section>
            )}

            {phase === 'running' && (
              <section className="mt-5" aria-live="polite">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Carregando dados…
                </h3>
                <ProgressList steps={steps} />
              </section>
            )}

            {phase === 'premissas' && (
              <section className="mt-5 space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  Passo 3 — Premissas
                </h3>
                {exported && (
                  <p className="text-sm text-[var(--color-muted)]">
                    {exported.stats.contratadosAtivos} vínculos ·{' '}
                    {exported.stats.estabelecimentosFiltrados} CNPJ ·{' '}
                    {exported.stats.linhasAgregadas} linhas agregadas
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-[var(--color-line)] bg-white/80 px-3 py-3">
                    <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                      Encargos por CNPJ
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Pré-preenchido do slot Índices (quando disponível) ou
                      preset editável.
                    </p>
                    <label className="mt-2 block text-sm">
                      <span className="text-[var(--color-muted)]">Regime tributário</span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={defaultTaxRegime}
                        onChange={(e) =>
                          setDefaultTaxRegime(e.target.value as TaxRegime)
                        }
                      >
                        <option value="SIMPLES">Simples</option>
                        <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                        <option value="LUCRO_REAL">Lucro Real</option>
                      </select>
                    </label>
                  </div>

                  <div className="border border-[var(--color-line)] bg-white/80 px-3 py-3">
                    <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                      Regime de funcionamento por CC
                    </p>
                    <label className="mt-2 block text-sm">
                      <span className="text-[var(--color-muted)]">Padrão</span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={defaultRegime}
                        onChange={(e) =>
                          setDefaultRegime(
                            e.target.value as RegimeFuncionamento,
                          )
                        }
                      >
                        {(
                          Object.keys(
                            REGIME_FUNCIONAMENTO_LABELS,
                          ) as RegimeFuncionamento[]
                        ).map((id) => (
                          <option key={id} value={id}>
                            {REGIME_FUNCIONAMENTO_LABELS[id]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="border border-[var(--color-line)] bg-white/80 px-3 py-3 sm:col-span-2">
                    <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                      Cenário alvo
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        [
                          ['fase1_2026_42h', '2026 · 42h'],
                          ['fase2_2027_40h', '2027 · 40h'],
                          ['status_quo', 'Status quo'],
                          ['stress_test_4x3', 'Stress 4×3'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setScenarioId(id)}
                          className={[
                            'border px-3 py-1.5 text-sm',
                            scenarioId === id
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                              : 'border-[var(--color-line)] text-[var(--color-muted)]',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      {RULE_VERSIONS[scenarioId].label}
                    </p>
                  </div>
                </div>

                <details
                  className="border border-[var(--color-line)] bg-white/60"
                  open={overridesOpen}
                  onToggle={(e) =>
                    setOverridesOpen((e.target as HTMLDetailsElement).open)
                  }
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    Overrides (salário / VR / VT / setor)
                  </summary>
                  <div className="grid gap-3 border-t border-[var(--color-line)] px-3 py-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">Setor</span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={sector}
                        onChange={(e) =>
                          setSector(e.target.value as SectorId)
                        }
                      >
                        {PILOT_TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">
                        Salário padrão
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={defaultSalario}
                        onChange={(e) => setDefaultSalario(e.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">VR R$/dia</span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={vrValorDia}
                        onChange={(e) => setVrValorDia(e.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">VT R$/dia</span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={vtValorDia}
                        onChange={(e) => setVtValorDia(e.target.value)}
                        inputMode="decimal"
                        placeholder="vazio = cadastro"
                      />
                    </label>
                  </div>
                </details>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('escopo')}
                    className="border border-[var(--color-line)] px-3 py-2 text-sm"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={!exported || exported.rows.length === 0}
                    onClick={handleSimulate}
                    className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Gerar Resultados
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {showAptools && (
        <AptoolsExtractModal onClose={() => setShowAptools(false)} />
      )}
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
