/**
 * Wizard linear unificado (5 passos):
 * 1) Segmento  2) Origem  3) Escopo  4) Premissas + benefícios  5) Resultados
 * Reusa Ambiente Salvo / Conexão Direta / Aptools. LGPD: sem nomes de pessoas.
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
import {
  isSimulateNetworkFailure,
  payrollRowsForApi,
  postSimulate,
} from '../api/simulate'
import {
  isSimulateFromEphemeralNetworkFailure,
  postSimulateFromEphemeral,
} from '../api/simulateFromEphemeral'
import { listSqlProfiles } from '../api/sql-profiles'
import { cnpjDigits, type Establishment } from '../apdata/cnpj'
import { enrichPayrollCnpjFromEscopo } from '../apdata/enrichPayrollCnpj'
import {
  categsTrabeSocFromEphemeralCatalog,
  establishmentsFromEphemeralCatalog,
  ramosFromEphemeralCatalog,
  situacoesFromEphemeralCatalog,
  tiposRegimeTrabalhistaFromEphemeralCatalog,
} from '../apdata/ephemeralCatalog'
import type {
  CategTrabeSocCatalogRow,
  SituacaoCatalogRow,
  TipoRegimeTrabalhistaCatalogRow,
} from '../apdata/extractFilters'
import {
  exportResultFromEphemeralRows,
  exportResultFromPayrollRows,
} from '../apdata/exportFromEphemeral'
import {
  exportPayrollFromApdata,
  loadEstablishmentsFromApdata,
  loadRamosFromApdata,
  type ExportProgressStep,
  type ExportResult,
} from '../apdata/exportPayroll'
import {
  segmentLabelFromSelectedRamos,
  sectorFromSelectedRamos,
  suggestedBufferPctFromSelectedRamos,
  type RamoAtividade,
} from '../apdata/ramos'
import {
  clearScenarioBasket,
  CUSTOM_SECTOR_ID,
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  REGIME_FUNCIONAMENTO_LABELS,
  RULE_VERSIONS,
  resolveSectorPreset,
  simulate,
  upsertSimulationInBasket,
  loadScenarioBasket,
  prepareOHScopeRulesForInput,
  syncOhScopeRulesWithGlobalHours,
  type EstrategiaAbsorcao,
  type OHScopeRule,
  type OperatingHours,
  type PayrollParseIssue,
  type PayrollRow,
  type RegimeFuncionamento,
  type ScenarioBasket,
  type ScenarioId,
  type SectorId,
  type SimulationResult,
  type TaxRegime,
} from '../engine'
import { PILOT_TEMPLATES } from '../templates'
import {
  defaultBenefitParams,
  normalizeBenefitParams,
  type SqlProfile,
} from '../types/sql-profile'
import { logPerf, measurePerf } from '../utils/perfTelemetry'
import {
  applyBenefitOverrides,
  benefitsToPayrollScalars,
  collectUniqueBenefits,
  mergeBenefitSessionOverride,
  resolveBenefitSlotAmounts,
  type BenefitSessionOverride,
  type BenefitSessionOverrides,
  type BenefitSlotAmounts,
  type ExtractedBenefit,
} from '../apdata/classifyBenefit'
import { AptoolsExtractModal } from './AptoolsExtractModal'
import {
  ExtractFiltersPanel,
  defaultExtractFiltersState,
  type ExtractFiltersState,
} from './ExtractFiltersPanel'
import { BenefitMappingTable } from './BenefitMappingTable'
import { BenefitSlotParamsFields } from './BenefitSlotParamsFields'
import {
  DEFAULT_EPHEMERAL_CREDS_FORM,
  EphemeralCredsFields,
  ephemeralFormComplete,
  type EphemeralCredsFormValue,
} from './EphemeralCredsFields'
import { OhScopeExceptionsSection } from './OhScopeExceptionsSection'
import { PayrollImport } from './PayrollImport'
import { ResultsView } from './ResultsView'
import { SectorStep } from './SectorStep'

type Phase =
  | 'segment'
  | 'origem'
  | 'escopo'
  | 'premissas'
  | 'running'
  | 'resultados'
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

type DirectFolhaFilters = {
  cnpjs?: string[]
  excludeSituacoes?: number[]
  incluirAfastados?: boolean
  tipoRegimeTrabalhistaIds?: number[]
  categTrabeSocIds?: number[]
  somenteEmpregaticios?: boolean
}

/**
 * P3 happy path: POST /api/simulate/from-ephemeral (extract+map on server).
 * Network/5xx → legacy ephemeral extract + client map (offline meetings).
 */
async function runDirectFolhaPipeline(
  creds: EphemeralSessionCreds,
  filters: DirectFolhaFilters,
  overrides: {
    defaultSalario?: number
    vrValorDia?: number | null
    vtValorDia?: number | null
    selectedCnpjKeys?: string[]
  } = {},
): Promise<ExportResult> {
  try {
    const remote = await postSimulateFromEphemeral(creds, { filters })
    logPerf('ephemeral-extract', remote.latencyMs.total, {
      rowCount: remote.rowCount,
      via: 'from-ephemeral',
      extractMs: remote.latencyMs.extract,
      mapMs: remote.latencyMs.map,
    })
    return exportResultFromPayrollRows(
      remote.payrollRows,
      [],
      [
        {
          id: 'ephemeral-extract',
          label: 'Conexão Direta (POST /api/simulate/from-ephemeral)',
          status: 'done',
          detail: `${remote.rowCount} linha(s) · extract ${remote.latencyMs.extract}ms · map ${remote.latencyMs.map}ms`,
        },
      ],
      'Extrator efêmero não retornou linhas após filtros.',
      overrides,
    )
  } catch (err) {
    if (!isSimulateFromEphemeralNetworkFailure(err)) {
      throw err
    }
    const extracted = await postEphemeralExtract(creds, filters)
    logPerf('ephemeral-extract', extracted.latencyMs, {
      rowCount: extracted.rowCount,
      via: 'ephemeral-legacy-fallback',
    })
    return exportResultFromEphemeralRows(extracted.rows, overrides, [
      {
        id: 'ephemeral-extract',
        label: 'Extrator efêmero (fallback POST /api/query/ephemeral)',
        status: 'done',
        detail: `${extracted.rowCount} linha(s) agregadas · ${extracted.latencyMs}ms · map local`,
      },
    ])
  }
}

interface ApdataFlowPanelProps {
  open: boolean
  onClose: () => void
  /** Planilha Manual — no modo embutido vai a Premissas; no modal chama o callback. */
  onManualSheet?: () => void
  /** Render as page body (unified wizard) instead of modal overlay. */
  embedded?: boolean
  /** Open Ambientes panel (saved DB envs) — header no longer exposes it. */
  onOpenAmbientes?: () => void
  /** Session-local benefit overrides shared with Studio SQL (classification + value). */
  benefitSessionOverrides?: BenefitSessionOverrides
  onBenefitSessionOverridesChange?: (next: BenefitSessionOverrides) => void
  /** Session scalar amounts for VR/VA/Médico/Odonto. */
  benefitSlotAmounts?: BenefitSlotAmounts
  onBenefitSlotAmountsChange?: (next: BenefitSlotAmounts) => void
}

export function ApdataFlowPanel({
  open,
  onClose,
  onManualSheet,
  embedded = false,
  onOpenAmbientes,
  benefitSessionOverrides,
  onBenefitSessionOverridesChange,
  benefitSlotAmounts,
  onBenefitSlotAmountsChange,
}: ApdataFlowPanelProps) {
  const [phase, setPhase] = useState<Phase>(embedded ? 'segment' : 'origem')
  const [originCard, setOriginCard] = useState<OriginCard>('apdata')
  const [manualMode, setManualMode] = useState(false)
  const [localBenefitOverrides, setLocalBenefitOverrides] =
    useState<BenefitSessionOverrides>({})
  const benefitOverrides =
    benefitSessionOverrides ?? localBenefitOverrides
  const setBenefitOverrides = (
    next:
      | BenefitSessionOverrides
      | ((prev: BenefitSessionOverrides) => BenefitSessionOverrides),
  ) => {
    if (onBenefitSessionOverridesChange) {
      const resolved =
        typeof next === 'function' ? next(benefitOverrides) : next
      onBenefitSessionOverridesChange(resolved)
      return
    }
    setLocalBenefitOverrides((prev) =>
      typeof next === 'function' ? next(prev) : next,
    )
  }
  const [localSlotAmounts, setLocalSlotAmounts] = useState<BenefitSlotAmounts>(
    {},
  )
  const slotAmounts = benefitSlotAmounts ?? localSlotAmounts
  const setSlotAmounts = (next: BenefitSlotAmounts) => {
    if (onBenefitSlotAmountsChange) {
      onBenefitSlotAmountsChange(next)
      return
    }
    setLocalSlotAmounts(next)
  }
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [activeEnv, setActiveEnv] = useState<EnvironmentPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Soft notice when Passo 4→5 fell back to in-bundle simulate (API down). */
  const [simulateNotice, setSimulateNotice] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  /** Passo 4 progress while POST /api/simulate (or local fallback) runs. */
  const [simulateProgress, setSimulateProgress] =
    useState<SimulateProgressStage | null>(null)
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
  const [sectorLabel, setSectorLabel] = useState('Varejo')
  const [sectorBufferPct, setSectorBufferPct] = useState(5)
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
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(
    DEFAULT_OPERATING_HOURS,
  )
  /** Segmented OH exceptions (Etapa 4). Empty → global `operatingHours` only. */
  const [ohScopeRules, setOhScopeRules] = useState<OHScopeRule[]>([])
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
  const [extractFilters, setExtractFilters] = useState<ExtractFiltersState>(
    () => defaultExtractFiltersState(),
  )
  const [situacaoCatalog, setSituacaoCatalog] = useState<SituacaoCatalogRow[]>(
    [],
  )
  const [regimeCatalog, setRegimeCatalog] = useState<
    TipoRegimeTrabalhistaCatalogRow[]
  >([])
  const [categCatalog, setCategCatalog] = useState<CategTrabeSocCatalogRow[]>(
    [],
  )

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
    setSituacaoCatalog([])
    setRegimeCatalog([])
    setCategCatalog([])
    setExtractFilters(defaultExtractFiltersState())
  }, [])

  const applyCatalog = useCallback(
    (list: Establishment[], ramoList: RamoAtividade[]) => {
      setEstablishments(list)
      setSelectedCnpjKeys(list.map((e) => e.key))
      setRamos(ramoList)
      const ramoIds = ramoList.map((r) => r.id)
      setSelectedRamoIds(ramoIds)
      if (ramoIds.length > 0) {
        const mapped = sectorFromSelectedRamos(ramoList, ramoIds)
        const dbLabel = segmentLabelFromSelectedRamos(ramoList, ramoIds)
        const preset = resolveSectorPreset(mapped)
        setSector(mapped)
        // Always keep the real Apdata ramo description as the segment name.
        setSectorLabel(dbLabel || preset.label)
        setSectorBufferPct(suggestedBufferPctFromSelectedRamos(ramoList, ramoIds))
        setDefaultRegime(preset.defaultRegime)
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
      setPhase(embedded ? 'segment' : 'origem')
      setOriginCard('apdata')
      setManualMode(false)
      setBenefitOverrides({})
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
    } else if (!embedded) {
      // Drop volatile password when the panel closes.
      setEphemeralCreds(null)
      setDirectForm(DEFAULT_EPHEMERAL_CREDS_FORM)
      setDirectConnected(false)
      setShowAptools(false)
    }
  }, [open, embedded, refreshEnv])

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
      const sits = situacoesFromEphemeralCatalog(catalog)
      const regimes = tiposRegimeTrabalhistaFromEphemeralCatalog(catalog)
      const categs = categsTrabeSocFromEphemeralCatalog(catalog)
      setSituacaoCatalog(sits)
      setRegimeCatalog(regimes)
      setCategCatalog(categs)
      setExtractFilters(defaultExtractFiltersState(categs))
      applyCatalog(list, ramoList)
      // Keep password only in React state for the export step.
      setEphemeralCreds(creds)
      setDirectConnected(true)
      if (list.length <= 1) {
        // Skip Escopo UI when there is at most one CNPJ — extract → Premissas.
        setPhase('running')
        const cnpjs = list
          .map((e) => cnpjDigits(e.key))
          .filter(Boolean)
          .slice(0, 32)
        const filters = {
          cnpjs,
          excludeSituacoes: extractFilters.excludeSituacoes,
          incluirAfastados: extractFilters.incluirAfastados,
          tipoRegimeTrabalhistaIds: extractFilters.tipoRegimeTrabalhistaIds,
          categTrabeSocIds: extractFilters.categTrabeSocIds,
          somenteEmpregaticios: extractFilters.somenteEmpregaticios,
        }
        const out = await runDirectFolhaPipeline(creds, filters, {
          selectedCnpjKeys: list.map((e) => e.key),
        })
        setExported(out)
        setSteps(out.steps)
        setPhase('premissas')
      } else {
        setPhase('escopo')
      }
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
    // Single establishment → skip scope picker when consultant wants speed.
    if (establishments.length <= 1) {
      void handleRun()
      return
    }
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
        const mapped = sectorFromSelectedRamos(ramos, next)
        const dbLabel = segmentLabelFromSelectedRamos(ramos, next)
        const preset = resolveSectorPreset(mapped)
        setSector(mapped)
        setSectorLabel(dbLabel || preset.label)
        setSectorBufferPct(suggestedBufferPctFromSelectedRamos(ramos, next))
        setDefaultRegime(preset.defaultRegime)
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
      excludeSituacoes: extractFilters.excludeSituacoes,
      incluirAfastados: extractFilters.incluirAfastados,
    }
    try {
      if (ambMode === 'direct') {
        if (!ephemeralCreds) {
          throw new Error(
            'Conecte com IP/Porta antes de executar o export (Conectar).',
          )
        }
        setSteps([
          {
            id: 'ephemeral-extract',
            label: 'Conexão Direta (POST /api/simulate/from-ephemeral)',
            status: 'running',
            detail: 'Conexão volátil — credenciais só nesta requisição',
          },
        ])
        const cnpjs = (overrides.selectedCnpjKeys ?? [])
          .map((k) => cnpjDigits(k))
          .filter(Boolean)
          .slice(0, 32)
        const out = await runDirectFolhaPipeline(
          ephemeralCreds,
          {
            cnpjs,
            excludeSituacoes: extractFilters.excludeSituacoes,
            incluirAfastados: extractFilters.incluirAfastados,
            tipoRegimeTrabalhistaIds: extractFilters.tipoRegimeTrabalhistaIds,
            categTrabeSocIds: extractFilters.categTrabeSocIds,
            somenteEmpregaticios: extractFilters.somenteEmpregaticios,
          },
          overrides,
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

  const activeBenefitParams = useMemo(() => {
    const selected =
      (sqlProfileId
        ? sqlProfiles.find((p) => p.id === sqlProfileId)
        : null) ??
      sqlProfiles[0] ??
      null
    return normalizeBenefitParams(
      selected?.benefitParams ?? defaultBenefitParams(),
    )
  }, [sqlProfiles, sqlProfileId])

  const mappedBenefits = useMemo((): ExtractedBenefit[] => {
    if (!exported) return []
    const raw = collectUniqueBenefits(
      exported.rows.map((r) => ({
        benefits: (r as { benefits?: ExtractedBenefit[] }).benefits ?? [],
      })),
    )
    return applyBenefitOverrides(raw, benefitOverrides)
  }, [exported, benefitOverrides])

  // Seed session amounts once from extract / profile when Premissas loads.
  useEffect(() => {
    if (phase !== 'premissas' || !exported) return
    const hasSession =
      slotAmounts.vrValorDia != null ||
      slotAmounts.vaValorMes != null ||
      slotAmounts.assistMedicaMes != null ||
      slotAmounts.assistOdontoMes != null
    if (hasSession) return
    const fromAgg = benefitsToPayrollScalars(
      mappedBenefits,
      activeBenefitParams,
    )
    const seeded = resolveBenefitSlotAmounts(
      fromAgg,
      activeBenefitParams,
      null,
    )
    if (
      seeded.vrValorDia == null &&
      seeded.vaValorMes == null &&
      seeded.assistMedicaMes == null &&
      seeded.assistOdontoMes == null
    ) {
      return
    }
    setSlotAmounts({
      vrValorDia: seeded.vrValorDia,
      vaValorMes: seeded.vaValorMes,
      assistMedicaMes: seeded.assistMedicaMes,
      assistOdontoMes: seeded.assistOdontoMes,
    })
    // Only on entering premissas with empty session — ignore further deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exported])

  function applyBenefitOverridesToRows(
    rows: PayrollRow[],
  ): PayrollRow[] {
    const codeMap = activeBenefitParams
    return rows.map((row) => {
      const raw = (row as { benefits?: ExtractedBenefit[] }).benefits ?? []
      const overridden =
        raw.length > 0
          ? applyBenefitOverrides(raw, benefitOverrides)
          : raw
      const fromAgg = benefitsToPayrollScalars(overridden, codeMap)
      const extracted = {
        vrValorDia: fromAgg.vrValorDia ?? row.vrValorDia,
        vaValorMes: fromAgg.vaValorMes ?? row.vaValorMes,
        assistMedicaMes: fromAgg.assistMedicaMes ?? row.assistMedicaMes,
        assistOdontoMes: fromAgg.assistOdontoMes ?? row.assistOdontoMes,
      }
      const scalars = resolveBenefitSlotAmounts(
        extracted,
        codeMap,
        slotAmounts,
      )
      const vaModo = codeMap.vaModoValor === 'DIA' ? 'DIA' : 'MES'
      return {
        ...row,
        ...(overridden.length > 0 ? { benefits: overridden } : {}),
        vrValorDia: scalars.vrValorDia ?? row.vrValorDia,
        vaValorMes:
          scalars.vaValorMes != null && vaModo === 'MES'
            ? scalars.vaValorMes
            : row.vaValorMes,
        vaValorDia:
          scalars.vaValorMes != null && vaModo === 'DIA'
            ? scalars.vaValorMes
            : row.vaValorDia,
        vaModoValor:
          scalars.vaValorMes != null ? vaModo : row.vaModoValor,
        assistMedicaMes: scalars.assistMedicaMes ?? row.assistMedicaMes,
        assistOdontoMes: scalars.assistOdontoMes ?? row.assistOdontoMes,
      }
    })
  }

  function buildSimulatePayrollRows() {
    if (!exported || exported.rows.length === 0) return null
    const payrollRows = enrichPayrollCnpjFromEscopo(
      applyBenefitOverridesToRows(exported.rows),
      establishments.length > 0
        ? establishments.filter(
            (e) =>
              selectedCnpjKeys.length === 0 ||
              selectedCnpjKeys.includes(e.key),
          )
        : selectedCnpjKeys.map((key) => ({ key })),
    )
    // Dominant headcount scale as wizard default; per-row escalaAtual still wins.
    const byScale = new Map<string, number>()
    for (const r of payrollRows) {
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
    return { payrollRows, dominant }
  }

  /**
   * Passo 4→5: prefer POST /api/simulate (shared engine on server).
   * Decision: if the API is unreachable and the engine is still in the SPA
   * bundle, fall back to local `simulate()` so meetings without VPN still work;
   * show a clear notice. Validation (4xx) errors do not fall back.
   * Stages the visible progress bar: enviar → processar → montar.
   */
  async function runSimulatePath(
    nextAbs: EstrategiaAbsorcao,
    perfLabel: 'simulate' | 'simulate-absorcao',
  ): Promise<SimulationResult | null> {
    const built = buildSimulatePayrollRows()
    if (!built || !exported) return null
    const { payrollRows, dominant } = built
    const headcount = exported.stats.contratadosAtivos || 1
    const averageMonthlySalary =
      Number(defaultSalario.replace(',', '.')) || 2200
    const preparedOhRules = prepareOHScopeRulesForInput(
      ohScopeRules.length > 0 ? ohScopeRules : undefined,
      operatingHours,
    )
    const input = {
      sector,
      sectorLabel: sectorLabel.trim() || undefined,
      sectorBufferPct,
      headcount,
      currentScale: dominant,
      averageMonthlySalary,
      units: 1,
      shiftsPerDay: 2,
      operatingHours,
      ohScopeRules: preparedOhRules,
      scenarioId,
      payrollRows,
      estrategiaAbsorcao: nextAbs,
      defaultTaxRegime,
      defaultRegimeFuncionamento: defaultRegime,
    }
    const centerHint = new Set(payrollRows.map((r) => r.centroCusto)).size
    const t0 = performance.now()

    setSimulateProgress(SIMULATE_PROGRESS.send)
    await yieldForPaint()

    try {
      setSimulateProgress(SIMULATE_PROGRESS.calcApi)
      await yieldForPaint()
      const remote = await postSimulate({
        schemaVersion: 1,
        scenarioId,
        sector,
        sectorLabel: sectorLabel.trim() || undefined,
        sectorBufferPct,
        headcount,
        currentScale: dominant,
        averageMonthlySalary,
        units: 1,
        shiftsPerDay: 2,
        operatingHours,
        ohScopeRules: preparedOhRules,
        estrategiaAbsorcao: nextAbs,
        defaultTaxRegime,
        defaultRegimeFuncionamento: defaultRegime,
        payrollRows: payrollRowsForApi(payrollRows),
        prefs: { includeScheduleSuggestions: true },
      })
      logPerf(perfLabel, performance.now() - t0, {
        rowCount: payrollRows.length,
        centerHint,
        via: 'api',
        apiLatencyMs: remote.latencyMs.total,
      })
      setSimulateNotice(null)
      setSimulateProgress(SIMULATE_PROGRESS.assemble)
      await yieldForPaint()
      return remote.result
    } catch (err) {
      if (!isSimulateNetworkFailure(err)) {
        throw err
      }
      setSimulateProgress(SIMULATE_PROGRESS.calcLocal)
      await yieldForPaint()
      const next = measurePerf(
        perfLabel,
        () => simulate(input),
        { rowCount: payrollRows.length, centerHint, via: 'local-fallback' },
      )
      setSimulateNotice(
        'API de simulação indisponível — resultado calculado localmente neste navegador.',
      )
      setSimulateProgress(SIMULATE_PROGRESS.assemble)
      await yieldForPaint()
      return next
    }
  }

  async function handleSimulate() {
    if (!exported || exported.rows.length === 0 || simulating) return
    setSimulating(true)
    setSimulateProgress(SIMULATE_PROGRESS.send)
    setError(null)
    try {
      const next = await runSimulatePath(estrategiaAbsorcao, 'simulate')
      if (!next) return
      const nextBasket = upsertSimulationInBasket(next, basket)
      setBasket(nextBasket)
      setResult(next)
      setPhase('resultados')
    } catch (err) {
      setSimulateNotice(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao simular. Tente novamente.',
      )
    } finally {
      setSimulating(false)
      setSimulateProgress(null)
    }
  }

  async function resimulateWithAbsorcao(nextAbs: EstrategiaAbsorcao) {
    if (!exported || simulating) return
    setEstrategiaAbsorcao(nextAbs)
    setSimulating(true)
    setSimulateProgress(SIMULATE_PROGRESS.send)
    setError(null)
    try {
      const next = await runSimulatePath(nextAbs, 'simulate-absorcao')
      if (!next) return
      const nextBasket = upsertSimulationInBasket(next, basket)
      setBasket(nextBasket)
      setResult(next)
    } catch (err) {
      setSimulateNotice(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao re-simular. Tente novamente.',
      )
    } finally {
      setSimulating(false)
      setSimulateProgress(null)
    }
  }

  const stepOrder: Phase[] = embedded
    ? ['segment', 'origem', 'escopo', 'premissas', 'resultados']
    : ['origem', 'escopo', 'premissas', 'resultados']
  const stepLabels: Record<string, string> = {
    segment: 'Segmento',
    origem: 'Origem',
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

  const shellClass = embedded
    ? 'w-full'
    : 'fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8'
  const panelClass = embedded
    ? 'w-full'
    : 'w-full max-w-3xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6'

  return (
    <div
      className={shellClass}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-labelledby="apdata-flow-title"
      onClick={
        embedded
          ? undefined
          : (ev) => {
              if (ev.target === ev.currentTarget) onClose()
            }
      }
    >
      <div className={panelClass}>
        {!embedded && (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="apdata-flow-title"
                className="text-xl font-semibold text-[var(--color-ink)]"
              >
                Simulação executiva
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Origem · escopo · premissas · resultados.
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
        )}
        {embedded && (
          <div className="mb-2">
            <h2
              id="apdata-flow-title"
              className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl"
            >
              Simulador de impacto PEC
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
              Wizard linear em 5 passos. Números são heurísticas versionadas —
              não parecer jurídico. LGPD: sem nomes de pessoas.
            </p>
          </div>
        )}

        <ol className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Passos">
          {stepOrder.map((id, i) => {
            const active = visualStep === id
            const past = stepOrder.indexOf(visualStep as Phase) > i
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!past && !active && !(result && id === 'resultados')}
                  onClick={() => {
                    if (past || active || (result && id === 'resultados')) {
                      setPhase(id)
                    }
                  }}
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
                </button>
              </li>
            )
          })}
        </ol>

        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {simulateNotice && !error && (
          <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">
            {simulateNotice}
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
                setManualMode(false)
                setBenefitOverrides({})
                setPhase(embedded ? 'segment' : 'origem')
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
            {phase === 'segment' && (
              <section className="mt-5">
                <SectorStep
                  templates={PILOT_TEMPLATES}
                  selectedId={sector}
                  sectorLabel={sectorLabel}
                  sectorBufferPct={sectorBufferPct}
                  defaultRegime={defaultRegime}
                  onSelect={(id) => {
                    const preset = resolveSectorPreset(id)
                    setSector(id)
                    if (id !== CUSTOM_SECTOR_ID) {
                      setSectorLabel(preset.label)
                    }
                    setSectorBufferPct(preset.defaultBufferPct)
                    setDefaultRegime(preset.defaultRegime)
                  }}
                  onSectorMetaChange={(meta) => {
                    if (meta.sectorLabel != null) setSectorLabel(meta.sectorLabel)
                    if (meta.sectorBufferPct != null) {
                      setSectorBufferPct(meta.sectorBufferPct)
                    }
                    if (meta.defaultRegimeFuncionamento != null) {
                      setDefaultRegime(meta.defaultRegimeFuncionamento)
                    }
                  }}
                  onNext={() => setPhase('origem')}
                />
              </section>
            )}

            {phase === 'origem' && (
              <section className="mt-5 space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                  {embedded ? 'Passo 2' : 'Passo 1'} — Origem dos Dados
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      [
                        'apdata',
                        'Conexão Direta Apdata',
                        'Sessão Rápida (IP/Porta) ou Ambiente Salvo.',
                      ],
                      [
                        'aptools',
                        'Extrair via Aptools',
                        'Copiar query MSSQL/Oracle + upload .txt/.csv.',
                      ],
                      [
                        'manual',
                        'Planilha / Manual',
                        'Entrada manual ou planilha — pula Escopo.',
                      ],
                    ] as const
                  ).map(([id, title, blurb]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setOriginCard(id)
                        if (id === 'aptools') setShowAptools(true)
                        if (id === 'manual') {
                          setManualMode(true)
                          if (embedded) {
                            setPhase('premissas')
                          } else {
                            onManualSheet?.()
                            onClose()
                          }
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
                {embedded && (
                  <button
                    type="button"
                    onClick={() => setPhase('segment')}
                    className="border border-[var(--color-line)] px-3 py-2 text-sm"
                  >
                    Voltar ao Segmento
                  </button>
                )}

                {originCard === 'apdata' && (
                  <div className="space-y-3 border border-[var(--color-line)] bg-white/70 px-3 py-3">
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label="Modo de ambiente"
                    >
                      {(
                        [
                          ['direct', 'Sessão Rápida (IP / Porta)'],
                          ['saved', 'Ambiente Salvo'],
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
                          {onOpenAmbientes && (
                            <button
                              type="button"
                              onClick={onOpenAmbientes}
                              className="border border-[var(--color-line)] px-3 py-2 text-sm"
                            >
                              Gerenciar Ambientes
                            </button>
                          )}
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
                  {embedded ? 'Passo 3' : 'Passo 2'} — Escopo (Empresas & Filiais)
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
                <ExtractFiltersPanel
                  value={extractFilters}
                  onChange={setExtractFilters}
                  situacoes={situacaoCatalog}
                  regimes={regimeCatalog}
                  categs={categCatalog}
                  compact
                />

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
                  {embedded ? 'Passo 4' : 'Passo 3'} — Premissas, Encargos & Benefícios
                </h3>
                {exported && (
                  <p className="text-sm text-[var(--color-muted)]">
                    {exported.stats.contratadosAtivos} vínculos ·{' '}
                    {exported.stats.estabelecimentosFiltrados} CNPJ ·{' '}
                    {exported.stats.linhasAgregadas} linhas agregadas
                  </p>
                )}
                {manualMode && (
                  <div className="space-y-2 border border-[var(--color-line)] bg-white/80 px-3 py-3">
                    <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                      Importação planilha / manual
                    </p>
                    <PayrollImport
                      rows={exported?.rows ?? []}
                      issues={exported?.issues ?? []}
                      onParsed={(rows, issues) => {
                        const out = exportResultFromPayrollRows(rows, issues, [
                          {
                            id: 'manual-sheet',
                            label: 'Planilha / manual',
                            status: 'done',
                            detail: `${rows.length} linha(s)`,
                          },
                        ])
                        setExported(out)
                        setSteps(out.steps)
                        setError(null)
                        setBenefitOverrides({})
                      }}
                      onClear={() => {
                        setExported(null)
                        setBenefitOverrides({})
                      }}
                    />
                  </div>
                )}

                <ExtractFiltersPanel
                  value={extractFilters}
                  onChange={setExtractFilters}
                  situacoes={situacaoCatalog}
                  regimes={regimeCatalog}
                  categs={categCatalog}
                />

                <div className="space-y-2 border border-[var(--color-line)] bg-white/80 px-3 py-3">
                  <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                    VR / VA / Médico / Odonto — códigos e valores
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Valores editáveis nesta sessão. Códigos Apdata vêm do perfil
                    SQL ativo (edite e salve no Studio SQL). Vale-combustível
                    permanece no pipeline de VR.
                  </p>
                  <BenefitSlotParamsFields
                    benefitParams={activeBenefitParams}
                    onBenefitParamsChange={() => {
                      /* codes persist only via Studio SQL profile */
                    }}
                    persistAmountsOnProfile={false}
                    sessionAmounts={slotAmounts}
                    onSessionAmountsChange={setSlotAmounts}
                    codesReadOnly
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                    Mapeamento detalhado (TiposBeneficios / agg)
                  </p>
                  <BenefitMappingTable
                    benefits={mappedBenefits}
                    overrides={benefitOverrides}
                    onOverrideChange={(key, patch: BenefitSessionOverride) =>
                      setBenefitOverrides((prev) =>
                        mergeBenefitSessionOverride(prev, key, patch),
                      )
                    }
                  />
                </div>

                <OhScopeExceptionsSection
                  operatingHours={operatingHours}
                  onOperatingHoursChange={(next) => {
                    setOperatingHours(next)
                    if (ohScopeRules.length > 0) {
                      setOhScopeRules(
                        syncOhScopeRulesWithGlobalHours(ohScopeRules, next),
                      )
                    }
                  }}
                  ohScopeRules={ohScopeRules}
                  onOhScopeRulesChange={setOhScopeRules}
                  payrollRows={exported?.rows}
                />

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
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-[var(--color-muted)]">
                        Nome do segmento (texto Apdata / livre)
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={sectorLabel}
                        onChange={(e) => setSectorLabel(e.target.value)}
                        placeholder="Descrição do ramo (RAE_D1s)"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--color-muted)]">
                        Preset de calibração
                      </span>
                      <select
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        value={
                          PILOT_TEMPLATES.some((t) => t.id === sector)
                            ? sector
                            : CUSTOM_SECTOR_ID
                        }
                        onChange={(e) => {
                          const next = e.target.value as SectorId
                          const preset = resolveSectorPreset(next)
                          setSector(next)
                          setSectorBufferPct(preset.defaultBufferPct)
                          setDefaultRegime(preset.defaultRegime)
                          if (next !== CUSTOM_SECTOR_ID && !sectorLabel.trim()) {
                            setSectorLabel(preset.label)
                          }
                        }}
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
                        % Buffer / Absenteísmo
                      </span>
                      <input
                        className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        value={sectorBufferPct}
                        onChange={(e) =>
                          setSectorBufferPct(Number(e.target.value) || 0)
                        }
                      />
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
                    onClick={() =>
                      setPhase(
                        manualMode || originCard === 'aptools'
                          ? 'origem'
                          : 'escopo',
                      )
                    }
                    className="border border-[var(--color-line)] px-3 py-2 text-sm"
                    disabled={simulating}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={
                      simulating || !exported || exported.rows.length === 0
                    }
                    onClick={() => void handleSimulate()}
                    className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    aria-busy={simulating || undefined}
                  >
                    {simulating ? 'Simulando…' : 'Gerar Resultados'}
                  </button>
                </div>
                {(simulating || simulateProgress) && (
                  <SimulateProgressBar
                    progress={simulateProgress ?? SIMULATE_PROGRESS.send}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
      {showAptools && (
        <AptoolsExtractModal
          onClose={() => setShowAptools(false)}
          onImported={(rows: PayrollRow[], issues: PayrollParseIssue[]) => {
            const out = exportResultFromPayrollRows(rows, issues, [
              {
                id: 'aptools-csv',
                label: 'CSV Aptools (parse servidor)',
                status: 'done',
                detail: `${rows.length} linha(s) importadas`,
              },
            ])
            setExported(out)
            setSteps(out.steps)
            setError(null)
            setShowAptools(false)
            setOriginCard('aptools')
            setPhase('premissas')
          }}
        />
      )}
    </div>
  )
}

type SimulateProgressStage = {
  step: 1 | 2 | 3
  label: string
  pct: number
}

const SIMULATE_PROGRESS = {
  send: { step: 1, label: 'Enviando…', pct: 28 } satisfies SimulateProgressStage,
  calcApi: {
    step: 2,
    label: 'Calculando no servidor…',
    pct: 62,
  } satisfies SimulateProgressStage,
  calcLocal: {
    step: 2,
    label: 'Calculando neste navegador…',
    pct: 62,
  } satisfies SimulateProgressStage,
  assemble: {
    step: 3,
    label: 'Montando resultados…',
    pct: 92,
  } satisfies SimulateProgressStage,
} as const

/** Let React paint the progress stage before a long sync/async chunk. */
function yieldForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      // ~160ms keeps PT labels readable on fast API / local fallback.
      window.setTimeout(resolve, 160)
    })
  })
}

function SimulateProgressBar({
  progress,
}: {
  progress: SimulateProgressStage
}) {
  return (
    <div className="mt-3 space-y-2" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="font-medium text-[var(--color-ink)]">{progress.label}</p>
        <p className="shrink-0 text-xs text-[var(--color-muted)] tabular-nums">
          Etapa {progress.step} de 3
        </p>
      </div>
      <div
        className="h-3.5 w-full overflow-hidden border border-[var(--color-line)] bg-[var(--color-accent-soft)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        aria-label={progress.label}
      >
        <div
          className="h-full bg-[var(--color-teal)] transition-[width] duration-300 ease-out"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
    </div>
  )
}

function truncateSqlOneLine(sql: string, max = 72): string {
  const one = sql.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, max - 1)}…`
}

function ProgressStepRow({ step }: { step: ExportProgressStep }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const mark =
    step.status === 'done'
      ? '✓'
      : step.status === 'running'
        ? '…'
        : step.status === 'error'
          ? '✗'
          : '○'

  const hasSql = Boolean(step.sql && step.status === 'done')

  async function copySql() {
    if (!step.sql) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(step.sql)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setSqlOpen(true)
      setCopyError(
        'Não foi possível copiar automaticamente — abra Ver SQL, selecione o texto e use Ctrl+C.',
      )
    }
  }

  return (
    <li className="border-b border-[var(--color-line)]/50 py-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={[
            'w-4 shrink-0 font-mono',
            step.status === 'done'
              ? 'text-[var(--color-accent)]'
              : step.status === 'error'
                ? 'text-red-700'
                : 'text-[var(--color-muted)]',
          ].join(' ')}
          aria-hidden
        >
          {mark}
        </span>
        <p className="min-w-0 flex-1 text-[var(--color-ink)]">
          <span className="font-medium">{step.label}</span>
          {step.detail ? (
            <span className="text-[var(--color-muted)]">
              {' · '}
              {step.detail}
            </span>
          ) : null}
        </p>
        {hasSql ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:max-w-[55%]">
            <code
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--color-muted)]"
              title={truncateSqlOneLine(step.sql!, 240)}
            >
              {truncateSqlOneLine(step.sql!)}
            </code>
            <button
              type="button"
              onClick={() => void copySql()}
              className="shrink-0 border border-[var(--color-line)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)]"
            >
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button
              type="button"
              onClick={() => setSqlOpen((o) => !o)}
              aria-expanded={sqlOpen}
              className="shrink-0 border border-[var(--color-line)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              {sqlOpen ? 'Ocultar' : 'Ver SQL'}
            </button>
          </div>
        ) : null}
      </div>
      {copyError ? (
        <p className="mt-1 pl-6 text-xs text-amber-900">{copyError}</p>
      ) : null}
      {hasSql && sqlOpen ? (
        <pre className="mt-1 ml-6 max-h-40 overflow-auto bg-[var(--color-ink)]/90 p-2 text-[10px] leading-snug text-[var(--color-accent-soft)]">
          {step.sql}
        </pre>
      ) : null}
    </li>
  )
}

function ProgressList({ steps }: { steps: ExportProgressStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--color-muted)]">Iniciando…</p>
    )
  }
  return (
    <ol className="mt-2 space-y-0">
      {steps.map((s) => (
        <ProgressStepRow key={s.id} step={s} />
      ))}
    </ol>
  )
}
