import { useState, type ReactNode } from 'react'
import {
  REGIME_FUNCIONAMENTO_LABELS,
  buildFeedbackEntry,
  buildScenarioWhyBullets,
  clearCalibrationHistory,
  defaultApdataDataInicio,
  downloadCalibrationJson,
  formatShiftRange,
  getSectorDisplayLabel,
  loadCalibrationHistory,
  removeProposedScenario,
  saveCalibrationEntry,
  setBestScenario,
  type CalibrationFeedbackEntry,
  type EditedShiftFields,
  type EstrategiaAbsorcao,
  type ExclusionHit,
  type FeedbackAction,
  type ResultLineItem,
  type ScenarioBasket,
  type ScenarioId,
  type ScheduleSuggestion,
  type SimulationResult,
} from '../engine'
import { getTemplate } from '../templates'
import {
  EXECUTIVE_KPI_CARD_HERO_CLASS,
  EXECUTIVE_KPI_CARD_PLAIN_CLASS,
  EXECUTIVE_KPI_HINT_CLASS,
  executiveKpiValueClass,
  formatExecutiveNumber,
  formatSignedExecutiveNumber,
} from '../utils/executiveKpi'
import { downloadAhrHandoff } from '../utils/exportHandoff'
import { buildHcIncreaseSummary } from '../utils/hcIncreaseSummary'
import {
  DEFAULT_DOSSIER_OPEN,
  collapseAllDossier,
  executiveImpactSummary,
  expandAllDossier,
  OPERACIONAL_SEM_CNPJ_KEY,
  groupOperacionalByCnpj,
  nestCentersByCc,
  shouldShowFilialAccordion,
  summarizeOperacionalTurmas,
  type DossierOpenState,
  type DossierSectionId,
  type OperacionalFilialGroup,
} from '../utils/resultsDossier'
import { ApdataHierarchyView } from './ApdataHierarchyView'
import { CalibrationHistory } from './CalibrationHistory'
import { HcIncreaseSummary } from './HcIncreaseSummary'
import { PrintableReport } from './PrintableReport'
import { ScheduleBuilderView } from './ScheduleBuilderView'
import { ScenarioBasketCompare } from './ScenarioBasketCompare'
import {
  ScenarioComparePanel,
  sidesFromSimulation,
} from './ScenarioComparePanel'
import { ScenarioWhyPanel } from './ScenarioWhyPanel'
import { SuggestionFeedbackControls } from './SuggestionFeedbackControls'

interface ResultsViewProps {
  result: SimulationResult
  basket: ScenarioBasket | null
  onBasketChange: (basket: ScenarioBasket | null) => void
  onBack: () => void
  onRestart: () => void
  onClearBasket: () => void
  estrategiaAbsorcao: EstrategiaAbsorcao
  onEstrategiaChange: (next: EstrategiaAbsorcao) => void
}

const ABSORCAO_OPTIONS: { id: EstrategiaAbsorcao; label: string }[] = [
  { id: 'CONTRATACAO_INTEGRAL', label: 'Contratação integral' },
  { id: 'HORA_EXTRA_MAXIMA', label: 'Hora extra máxima (cap 44h/mês)' },
  { id: 'HIBRIDO_INTERMITENTE', label: 'Híbrido / intermitente' },
]

const DOSSIER_META: Record<
  DossierSectionId,
  { title: string; hint: string }
> = {
  executivo: {
    title: 'Bloco Executivo (C-Level)',
    hint: 'KPIs macro + estratégia de absorção',
  },
  operacional: {
    title: 'Bloco Operacional (Escalas & Turnos)',
    hint: 'Calendário Atual × Proposto · turmas com faixas OH',
  },
  cadastral: {
    title: 'Bloco Cadastral — Estrutura Apdata',
    hint: 'Jornadas → Horários → árvore · filtros Filial/CNPJ e CC',
  },
}

function suggestionKey(s: ScheduleSuggestion): string {
  return `${s.centroCusto}::${s.code}`
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function signedBrl(n: number) {
  const abs = brl(Math.abs(n))
  if (n > 0) return `+${abs}`
  if (n < 0) return `−${abs}`
  return abs
}

function formatLineAmount(item: ResultLineItem): string {
  if (item.amount === null) return '—'
  switch (item.unit) {
    case 'BRL_month':
    case 'BRL_year':
      return brl(item.amount)
    case 'people':
      return String(item.amount)
    case 'hours_week':
      return `${item.amount.toFixed(0)} h/sem`
    case 'ratio':
      return `${(item.amount * 100).toFixed(1)}%`
    case 'factor':
      return item.amount.toFixed(3)
    default:
      return String(item.amount)
  }
}

function deltaDirection(n: number): {
  arrow: string
  label: string
  tone: 'up' | 'down' | 'flat'
} {
  if (n > 0) return { arrow: '↑', label: 'custo sobe', tone: 'up' }
  if (n < 0) return { arrow: '↓', label: 'custo cai', tone: 'down' }
  return { arrow: '→', label: 'sem variação', tone: 'flat' }
}

/** Accordion panel that keeps children mounted (state survives collapse). */
function DossierSection({
  sectionId,
  open,
  onToggle,
  collapsedSummary,
  children,
}: {
  sectionId: DossierSectionId
  open: boolean
  onToggle: () => void
  collapsedSummary?: string | null
  children: ReactNode
}) {
  const meta = DOSSIER_META[sectionId]
  const panelId = `dossier-panel-${sectionId}`
  return (
    <div className="border border-[var(--color-line)] bg-white/80">
      <h3 className="m-0">
        <button
          type="button"
          id={`dossier-trigger-${sectionId}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-[var(--color-ink)]">
              {meta.title}
            </span>
            <span className="mt-0.5 block text-xs font-normal text-[var(--color-muted)]">
              {meta.hint}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            {open ? 'Recolher' : 'Expandir'}
          </span>
        </button>
      </h3>
      {!open && collapsedSummary ? (
        <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-xs text-[var(--color-ink)]">
          {collapsedSummary}
        </p>
      ) : null}
      <div
        id={panelId}
        role="region"
        aria-labelledby={`dossier-trigger-${sectionId}`}
        className={
          open
            ? 'space-y-6 border-t border-[var(--color-line)] px-4 py-4'
            : 'hidden'
        }
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  )
}

export function ResultsView({
  result,
  basket,
  onBasketChange,
  onBack,
  onRestart,
  onClearBasket,
  estrategiaAbsorcao,
  onEstrategiaChange,
}: ResultsViewProps) {
  const template = getTemplate(result.input.sector)
  const {
    cost,
    coverage,
    ruleVersion,
    lineItems,
    disclaimer,
    input,
    vr,
    vt,
    byCostCenter,
    usedPayrollImport,
    scheduleSuggestions,
    excludedScheduleNotice,
    scheduleSuggestionDisclaimer,
    absorption,
    heCascade,
    distribuicaoTurmas,
    charges,
  } = result
  const sectorDisplay = getSectorDisplayLabel(
    input.sector,
    input.sectorLabel,
  )

  const [history, setHistory] = useState<CalibrationFeedbackEntry[]>(() =>
    loadCalibrationHistory(),
  )
  const [recorded, setRecorded] = useState<Record<string, FeedbackAction>>(
    {},
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const [apdataDataInicio, setApdataDataInicio] = useState(() =>
    defaultApdataDataInicio(result.ruleVersion.params.scenarioId),
  )
  const [dossier, setDossier] = useState<DossierOpenState>(DEFAULT_DOSSIER_OPEN)

  function toggleSection(id: DossierSectionId) {
    setDossier((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  /** Open cadastral (if needed) then smooth-scroll — does not download/send JSON. */
  function handleIrParaEstruturaApdata() {
    setDossier((prev) => ({ ...prev, cadastral: true }))
    window.setTimeout(() => {
      const section = document.getElementById('hierarquia-apdata')
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        section.focus({ preventScroll: true })
      }
    }, 40)
  }

  function handleSelectBest(scenarioId: ScenarioId | null) {
    const next = setBestScenario(scenarioId, basket)
    onBasketChange(next)
  }

  function handleRemoveProposed(scenarioId: ScenarioId) {
    const next = removeProposedScenario(scenarioId, basket)
    onBasketChange(next)
  }

  function recordFeedback(
    suggestion: ScheduleSuggestion,
    action: FeedbackAction,
    editedShifts?: EditedShiftFields[],
  ) {
    const entry = buildFeedbackEntry({
      result,
      suggestion,
      action,
      editedShifts,
    })
    const next = saveCalibrationEntry(entry)
    setHistory(next)
    setRecorded((prev) => ({
      ...prev,
      [suggestionKey(suggestion)]: action,
    }))
  }

  const operacionalGroups = groupOperacionalByCnpj({
    centers:
      byCostCenter.length > 0
        ? byCostCenter
        : [
            {
              centroCusto: 'Geral',
              currentHeadcount: coverage.currentHeadcount,
              requiredHeadcount: coverage.requiredHeadcount,
              additionalHeadcount: coverage.additionalHeadcount,
              baselineSalaryMass:
                cost.baselineSalaryMass ??
                coverage.currentHeadcount * input.averageMonthlySalary,
              baselinePayroll: cost.baselineMonthlyPayroll,
              projectedPayroll: cost.projectedMonthlyPayroll,
              payrollMonthlyDelta: cost.monthlyDelta,
              vr: vr ?? {
                currentMonthly: 0,
                proposedMonthly: 0,
                monthlyDelta: 0,
                annualDelta: 0,
                proposedDaysPerMonth: 0,
              },
              vt: vt ?? {
                currentMonthly: 0,
                proposedMonthly: 0,
                monthlyDelta: 0,
                annualDelta: 0,
                proposedDaysPerMonth: 0,
              },
              va: {
                currentMonthly: 0,
                proposedMonthly: 0,
                monthlyDelta: 0,
                annualDelta: 0,
                proposedDaysPerMonth: 0,
              },
              assistMedicaMonthly: 0,
              assistOdontoMonthly: 0,
              regimeFuncionamento: distribuicaoTurmas.regime,
              distribuicaoTurmas,
            },
          ],
    payrollRows: input.payrollRows,
  })
  /** Accordion whenever ≥1 real Filial/CNPJ (not only when 2+). */
  const filialAccordion = shouldShowFilialAccordion(operacionalGroups)
  const multiFilial =
    operacionalGroups.filter((g) => g.key !== OPERACIONAL_SEM_CNPJ_KEY)
      .length > 1

  const topSuggestion = scheduleSuggestions[0]
  const proposedScaleLabel = ruleVersion.params.preserveCurrentScale
    ? input.currentScale
    : ruleVersion.params.targetScale.label
  const scheduleHint = topSuggestion
    ? `Sugestão: ${topSuggestion.label} · ${topSuggestion.shifts
        .map((s) => `${s.label} ${formatShiftRange(s)}`)
        .join(', ')}`
    : null
  const compareSides = sidesFromSimulation({
    currentScale: input.currentScale,
    proposedScaleLabel,
    proposedTitle: ruleVersion.label,
    currentHeadcount: coverage.currentHeadcount,
    proposedHeadcount: coverage.requiredHeadcount,
    baselinePayroll: cost.baselineMonthlyPayroll,
    projectedPayroll: cost.projectedMonthlyPayroll,
    vrCurrent: vr?.currentMonthly ?? null,
    vrProposed: vr?.proposedMonthly ?? null,
    vtCurrent: vt?.currentMonthly ?? null,
    vtProposed: vt?.proposedMonthly ?? null,
    scheduleHint,
  })

  const proposedCount = basket?.proposed.length ?? 0
  const showMultiBasket = proposedCount >= 2
  const showSidePanel = proposedCount < 2
  const scenarioWhyBullets = buildScenarioWhyBullets(result)
  const hcIncreaseSummary = buildHcIncreaseSummary(result)
  const folhaDir = deltaDirection(cost.monthlyDelta)
  const folhaToneClass =
    folhaDir.tone === 'up'
      ? 'text-red-800'
      : folhaDir.tone === 'down'
        ? 'text-[var(--color-accent)]'
        : 'text-[var(--color-ink)]'
  // C-Level KPIs: numeric pt-BR (no R$) — keep signs / arrows (PX-130)
  const folhaValue = formatSignedExecutiveNumber(cost.monthlyDelta)
  const folhaHint = `${folhaDir.label} · anual ${formatSignedExecutiveNumber(cost.annualDelta)}`
  const hcValue = `${coverage.currentHeadcount} → ${coverage.requiredHeadcount}`
  const vrValue = vr ? formatSignedExecutiveNumber(vr.monthlyDelta) : '—'
  const vrHint = vr
    ? `${formatExecutiveNumber(vr.currentMonthly)} → ${formatExecutiveNumber(vr.proposedMonthly)}`
    : 'Sem VR na folha'
  const vtValue = vt ? formatSignedExecutiveNumber(vt.monthlyDelta) : '—'
  const vtHint = vt
    ? `${formatExecutiveNumber(vt.currentMonthly)} → ${formatExecutiveNumber(vt.proposedMonthly)}`
    : 'Sem VT na folha'

  const absorcaoLabel =
    ABSORCAO_OPTIONS.find((o) => o.id === estrategiaAbsorcao)?.label ??
    estrategiaAbsorcao
  const execSummary = executiveImpactSummary({
    monthlyDelta: cost.monthlyDelta,
    annualDelta: cost.annualDelta,
    currentHeadcount: coverage.currentHeadcount,
    requiredHeadcount: coverage.requiredHeadcount,
    absorcaoLabel,
    formatSigned: formatSignedExecutiveNumber,
  })

  return (
    <>
      <section className="no-print space-y-6 pb-24">
        <div
          className="results-sticky-actions sticky top-0 z-20 -mx-4 border-b border-[var(--color-line)] px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6"
          role="region"
          aria-label="Ações do resultado"
        >
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="min-h-11 border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
            >
              ◀ Voltar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-11 bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              🖨️ Imprimir PDF
            </button>
            <button
              type="button"
              title="Rola até o Bloco Cadastral (não envia ao ERP)"
              onClick={handleIrParaEstruturaApdata}
              className="min-h-11 border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-2.5 text-sm font-medium text-[var(--color-ink)]"
            >
              ⚙️ Ir para Estrutura Apdata
            </button>
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm text-[var(--color-muted)]">
                📥 Exportação Avançada
              </summary>
              <div className="absolute left-0 z-30 mt-1 w-72 border border-[var(--color-line)] bg-white p-3 shadow-sm">
                <p className="text-[11px] text-[var(--color-muted)]">
                  JSON Handoff AHR offline. Não envia dados ao ERP — só download
                  local para carga manual / Gerador AHR.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadAhrHandoff(result, {
                      dataInicio: apdataDataInicio,
                    })
                  }
                  className="mt-2 min-h-11 w-full border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
                >
                  Baixar JSON Handoff (offline)
                </button>
              </div>
            </details>
            <button
              type="button"
              onClick={onRestart}
              className="min-h-11 px-4 py-2.5 text-sm text-[var(--color-muted)] underline"
            >
              🔄 Nova Simulação
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Resultados da simulação</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {template?.resultBlurb ??
                'Estimativas do motor com hipóteses explícitas.'}{' '}
              Números são heurísticas — não parecer jurídico.
            </p>
            <p className="mt-2 text-sm">
              <span className="text-[var(--color-muted)]">Cenário:</span>{' '}
              <strong>{ruleVersion.label}</strong>
              <span className="ml-2 font-mono text-xs text-[var(--color-muted)]">
                {ruleVersion.id}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {sectorDisplay} · escala {input.currentScale} ·{' '}
              {input.headcount} pessoas
              {usedPayrollImport ? ' · folha importada' : ''}
              {input.sectorBufferPct != null
                ? ` · buffer ${input.sectorBufferPct}%`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDossier(expandAllDossier())}
              className="min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium"
            >
              Expandir Todos
            </button>
            <button
              type="button"
              onClick={() => setDossier(collapseAllDossier())}
              className="min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium"
            >
              Recolher Todos
            </button>
          </div>
        </div>

        <DossierSection
          sectionId="executivo"
          open={dossier.executivo}
          onToggle={() => toggleSection('executivo')}
          collapsedSummary={execSummary}
        >
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className={EXECUTIVE_KPI_CARD_HERO_CLASS}
              aria-labelledby="folha-delta-hero"
            >
              <dt
                id="folha-delta-hero"
                className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)] uppercase"
              >
                Δ folha / mês
              </dt>
              <dd
                className={executiveKpiValueClass(folhaValue, folhaToneClass)}
                title={`${folhaDir.arrow} ${folhaValue}`}
              >
                <span aria-hidden="true" className="mr-1">
                  {folhaDir.arrow}
                </span>
                {folhaValue}
              </dd>
              <dd className={EXECUTIVE_KPI_HINT_CLASS} title={folhaHint}>
                {folhaHint}
              </dd>
            </div>
            <div className={EXECUTIVE_KPI_CARD_PLAIN_CLASS}>
              <dt className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)] uppercase">
                Headcount
              </dt>
              <dd className={executiveKpiValueClass(hcValue)} title={hcValue}>
                {hcValue}
              </dd>
              <dd className={EXECUTIVE_KPI_HINT_CLASS}>
                +{coverage.additionalHeadcount} adicional
              </dd>
            </div>
            <div className={EXECUTIVE_KPI_CARD_PLAIN_CLASS}>
              <dt className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)] uppercase">
                Δ VR / mês
              </dt>
              <dd className={executiveKpiValueClass(vrValue)} title={vrValue}>
                {vrValue}
              </dd>
              <dd className={EXECUTIVE_KPI_HINT_CLASS} title={vrHint}>
                {vrHint}
              </dd>
            </div>
            <div className={EXECUTIVE_KPI_CARD_PLAIN_CLASS}>
              <dt className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)] uppercase">
                Δ VT / mês
              </dt>
              <dd className={executiveKpiValueClass(vtValue)} title={vtValue}>
                {vtValue}
              </dd>
              <dd className={EXECUTIVE_KPI_HINT_CLASS} title={vtHint}>
                {vtHint}
              </dd>
            </div>
          </dl>

          <div className="border border-[var(--color-line)] bg-white/80 px-4 py-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Estratégia de absorção
            </p>
            <div className="flex flex-wrap gap-2" role="tablist">
              {ABSORCAO_OPTIONS.map((o) => {
                const selected = estrategiaAbsorcao === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onEstrategiaChange(o.id)}
                    className={[
                      'border px-3 py-1.5 text-sm',
                      selected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)] text-[var(--color-muted)]',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <label className="block text-sm sr-only">
                Estratégia de absorção
                <select
                  value={estrategiaAbsorcao}
                  onChange={(e) =>
                    onEstrategiaChange(e.target.value as EstrategiaAbsorcao)
                  }
                  className="border border-[var(--color-line)] bg-white px-3 py-2"
                >
                  {ABSORCAO_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    absorption.heCapReached
                      ? 'inline-block border border-amber-800/40 bg-amber-100 px-2 py-1 text-[11px] font-semibold tracking-wide text-amber-950 uppercase'
                      : 'inline-block border border-[var(--color-line)] bg-white px-2 py-1 text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase'
                  }
                  title="Teto legal simulado de HE (44h/mês × HC atual)"
                >
                  HE cap{' '}
                  {absorption.heCapReached ? 'atingido' : 'ok'} ·{' '}
                  {absorption.heHoursUsed.toFixed(0)}/
                  {absorption.heCapHours.toFixed(0)} h
                </span>
                <span className="text-xs text-[var(--color-muted)]">
                  Encargos {charges.taxRegime} · divisor{' '}
                  {heCascade.baselineDivisor}→{heCascade.scenarioDivisor}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Hires {absorption.hiresHeadcount} · intermitente{' '}
              {absorption.intermittentHeadcount} · custo HE absorção{' '}
              {brl(absorption.heAbsorptionCost)} · Δ HE por divisor{' '}
              {brl(heCascade.heCostDelta)}
            </p>
          </div>

          {showMultiBasket && basket ? (
            <ScenarioBasketCompare
              basket={basket}
              onSelectBest={handleSelectBest}
              onRemoveProposed={handleRemoveProposed}
              onClear={onClearBasket}
            />
          ) : null}

          {showSidePanel ? (
            <ScenarioComparePanel
              current={compareSides.current}
              proposed={compareSides.proposed}
              footerNote={`${ruleVersion.summary} · Δ folha ${brl(cost.monthlyDelta)}/mês · Δ anual ${brl(cost.annualDelta)}. Detalhe do cenário ativo (${ruleVersion.label}).`}
            />
          ) : (
            <details className="border border-[var(--color-line)] bg-white/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                Detalhe Atual × Proposto (cenário ativo)
              </summary>
              <div className="mt-3">
                <ScenarioComparePanel
                  current={compareSides.current}
                  proposed={compareSides.proposed}
                  footerNote={`${ruleVersion.summary} · cenário ativo: ${ruleVersion.label}.`}
                />
              </div>
            </details>
          )}

          <dl className="grid gap-3 sm:grid-cols-2">
            {vr ? (
              <div className="border border-[var(--color-line)] bg-white/70 p-4">
                <dt className="text-sm text-[var(--color-muted)]">
                  Delta mensal VR
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {signedBrl(vr.monthlyDelta)}
                </dd>
                <dd className="mt-1 text-xs text-[var(--color-muted)]">
                  {brl(vr.currentMonthly)} → {brl(vr.proposedMonthly)} (~
                  {vr.proposedDaysPerMonth} dias/mês na escala-alvo)
                </dd>
              </div>
            ) : null}
            {vt ? (
              <div className="border border-[var(--color-line)] bg-white/70 p-4">
                <dt className="text-sm text-[var(--color-muted)]">
                  Delta mensal VT
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {signedBrl(vt.monthlyDelta)}
                </dd>
                <dd className="mt-1 text-xs text-[var(--color-muted)]">
                  {brl(vt.currentMonthly)} → {brl(vt.proposedMonthly)} (~
                  {vt.proposedDaysPerMonth} dias/mês na escala-alvo)
                </dd>
              </div>
            ) : null}
            <div className="border border-[var(--color-line)] bg-white/70 p-4">
              <dt className="text-sm text-[var(--color-muted)]">
                Headcount adicional estimado
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                +{coverage.additionalHeadcount}
              </dd>
              <dd className="mt-1 text-xs text-[var(--color-muted)]">
                {coverage.currentHeadcount} → {coverage.requiredHeadcount}{' '}
                (fator {coverage.headcountFactor.toFixed(3)})
              </dd>
            </div>
            <div className="border border-[var(--color-line)] bg-white/70 p-4">
              <dt className="text-sm text-[var(--color-muted)]">
                Gap de cobertura (se não contratar)
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {coverage.uncoveredShiftHoursPerWeek.toFixed(0)} h/sem
              </dd>
              <dd className="mt-1 text-xs text-[var(--color-muted)]">
                Razão trabalho {(coverage.currentWorkRatio * 100).toFixed(1)}% →{' '}
                {(coverage.targetWorkRatio * 100).toFixed(1)}%
              </dd>
            </div>
          </dl>

          <ScenarioWhyPanel
            bullets={scenarioWhyBullets}
            scenarioLabel={ruleVersion.label}
          />

          {hcIncreaseSummary ? (
            <HcIncreaseSummary summary={hcIncreaseSummary} />
          ) : null}

          <div className="border border-[var(--color-line)] bg-white/70">
            <button
              type="button"
              aria-expanded={detailOpen}
              onClick={() => setDetailOpen((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
            >
              <span>Detalhe técnico</span>
              <span className="text-xs font-normal text-[var(--color-muted)]">
                {detailOpen ? 'Ocultar' : 'Mostrar'} · calibração, centros,
                linhas do motor
              </span>
            </button>
            {detailOpen ? (
              <div className="space-y-6 border-t border-[var(--color-line)] px-4 py-4">
                <CalibrationHistory
                  entries={history}
                  onClear={() => {
                    clearCalibrationHistory()
                    setHistory([])
                    setRecorded({})
                  }}
                />

                {history.length > 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">
                    Snapshot completo (cenário + feedback) fica no histórico
                    local. Use <strong>Baixar JSON</strong> para exportar o
                    dataset da Fase A.
                    {history[0] ? (
                      <>
                        {' '}
                        Último:{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            downloadCalibrationJson(
                              [history[0]],
                              `projeto6x1-feedback-${history[0].id.slice(0, 8)}.json`,
                            )
                          }
                        >
                          baixar só o último registro
                        </button>
                        .
                      </>
                    ) : null}
                  </p>
                ) : null}

                {byCostCenter.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                      Por centro de custo
                    </h4>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Salários e VR/VT agregados da folha importada, com HC
                      adicional proporcional ao fator de escala.
                    </p>
                    <div className="mt-3 overflow-x-auto border border-[var(--color-line)] bg-white">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                            <th className="px-3 py-2 font-normal">Centro</th>
                            <th className="px-3 py-2 font-normal">HC</th>
                            <th className="px-3 py-2 font-normal">Δ Folha</th>
                            <th className="px-3 py-2 font-normal">Δ VR</th>
                            <th className="px-3 py-2 font-normal">Δ VT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byCostCenter.map((c) => (
                            <tr
                              key={`${c.cnpjCompleto ?? ''}-${c.centroCusto}-${c.codHorarioAtual ?? ''}`}
                              className="border-b border-[var(--color-line)]"
                            >
                              <td className="px-3 py-2 font-medium">
                                {c.centroCusto}
                                {c.codHorarioAtual?.trim()
                                  ? ` · hor. ${c.codHorarioAtual.trim()}`
                                  : ''}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {c.currentHeadcount} → {c.requiredHeadcount}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {brl(c.payrollMonthlyDelta)}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {brl(c.vr.monthlyDelta)}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {brl(c.vt.monthlyDelta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h4 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                    Linhas explicáveis do motor
                  </h4>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Cada linha aponta a hipótese ou fórmula usada no cálculo.
                  </p>
                  <ul className="mt-3 divide-y divide-[var(--color-line)] border border-[var(--color-line)] bg-white">
                    {lineItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {item.detail}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatLineAmount(item)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="border-l-2 border-[var(--color-accent)] pl-3 text-xs text-[var(--color-muted)]">
                  {disclaimer}
                </p>
              </div>
            ) : null}
          </div>
        </DossierSection>

        <DossierSection
          sectionId="operacional"
          open={dossier.operacional}
          onToggle={() => toggleSection('operacional')}
          collapsedSummary={
            filialAccordion
              ? `${operacionalGroups.filter((g) => g.key !== OPERACIONAL_SEM_CNPJ_KEY).length} filiais/CNPJ · ${REGIME_FUNCIONAMENTO_LABELS[distribuicaoTurmas.regime]} · HC ${distribuicaoTurmas.totalHeadcount}`
              : `${REGIME_FUNCIONAMENTO_LABELS[distribuicaoTurmas.regime]} · ${distribuicaoTurmas.crewCount} turma(s) · HC ${distribuicaoTurmas.totalHeadcount}`
          }
        >
          {filialAccordion ? (
            <p className="text-xs text-[var(--color-muted)]">
              Horários, jornadas e escalas por Filial/CNPJ
              {multiFilial
                ? ` (${operacionalGroups.filter((g) => g.key !== OPERACIONAL_SEM_CNPJ_KEY).length} estabelecimentos)`
                : ''}
              . Cada filial abre/recolhe no acordeão abaixo.
            </p>
          ) : null}

          {excludedScheduleNotice ? (
            <ExcludedScheduleNotice notice={excludedScheduleNotice} />
          ) : null}

          {filialAccordion ? (
            <div className="space-y-3">
              {operacionalGroups.map((group, idx) => (
                <OperacionalFilialPanel
                  key={group.key}
                  group={group}
                  defaultOpen={idx === 0}
                  result={result}
                  scheduleSuggestions={scheduleSuggestions}
                  scheduleSuggestionDisclaimer={scheduleSuggestionDisclaimer}
                  recorded={recorded}
                  onFeedback={recordFeedback}
                />
              ))}
            </div>
          ) : operacionalGroups[0] ? (
            <OperacionalFilialBody
              group={operacionalGroups[0]}
              result={result}
              embeddedSchedule={false}
              showFilialHeader={false}
              scheduleSuggestions={scheduleSuggestions}
              scheduleSuggestionDisclaimer={scheduleSuggestionDisclaimer}
              recorded={recorded}
              onFeedback={recordFeedback}
              globalTurmasNote={distribuicaoTurmas.note}
            />
          ) : (
            <ScheduleBuilderView result={result} />
          )}
        </DossierSection>

        <DossierSection
          sectionId="cadastral"
          open={dossier.cadastral}
          onToggle={() => toggleSection('cadastral')}
          collapsedSummary="Assistente Jornadas → Horários → Estrutura (fechado). Use “Ir para Estrutura Apdata” ou Expandir."
        >
          <ApdataHierarchyView
            result={result}
            dataInicio={apdataDataInicio}
            onDataInicioChange={setApdataDataInicio}
          />
        </DossierSection>
      </section>

      <PrintableReport result={result} basket={basket} />
    </>
  )
}

function groupSuggestions(
  suggestions: ScheduleSuggestion[],
): [string, ScheduleSuggestion[]][] {
  const map = new Map<string, ScheduleSuggestion[]>()
  for (const s of suggestions) {
    const list = map.get(s.centroCusto) ?? []
    list.push(s)
    map.set(s.centroCusto, list)
  }
  return [...map.entries()]
}

function ExcludedScheduleNotice({ notice }: { notice: ExclusionHit }) {
  return (
    <div
      className={
        notice.severity === 'soft'
          ? 'border border-[var(--color-line)] bg-white/80 px-4 py-3 text-sm text-[var(--color-ink)]'
          : 'border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm text-amber-950'
      }
      role="status"
    >
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={
            notice.severity === 'soft'
              ? 'inline-block border border-[var(--color-line)] bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'
              : 'inline-block border border-amber-800/40 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'
          }
        >
          {notice.badge}
        </span>
        <span className="font-medium">{notice.label}</span>
      </p>
      <p
        className={
          notice.severity === 'soft'
            ? 'mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]'
            : 'mt-1.5 text-xs leading-relaxed text-amber-900/90'
        }
      >
        {notice.reason}{' '}
        {notice.severity === 'soft'
          ? 'Permanece no lado Atual; as candidatas abaixo são só 5×2, turnos 8h e (se o cenário admitir) 4×3.'
          : 'Esta escala não é recomendada pelo motor; as candidatas abaixo respeitam a lista de exclusão (docs/schedule-policy.md).'}
      </p>
    </div>
  )
}

function OperacionalFilialPanel({
  group,
  defaultOpen,
  result,
  scheduleSuggestions,
  scheduleSuggestionDisclaimer,
  recorded,
  onFeedback,
}: {
  group: OperacionalFilialGroup
  defaultOpen: boolean
  result: SimulationResult
  scheduleSuggestions: ScheduleSuggestion[]
  scheduleSuggestionDisclaimer: string
  recorded: Record<string, FeedbackAction>
  onFeedback: (
    suggestion: ScheduleSuggestion,
    action: FeedbackAction,
    editedShifts?: EditedShiftFields[],
  ) => void
}) {
  // Controlled open — bare `open={defaultOpen}` stuck the first panel open.
  const [open, setOpen] = useState(defaultOpen)
  const turmas = summarizeOperacionalTurmas(group.centers)
  return (
    <details
      className="border border-[var(--color-line)] bg-white/90"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        if (next !== open) setOpen(next)
      }}
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {group.label}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {group.centroCustos.length} centro(s) · {turmas.crewCount}{' '}
              turma(s) · HC {turmas.totalHeadcount}
            </p>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            {open ? 'Recolher' : 'Expandir'}
          </span>
        </div>
      </summary>
      <div className="space-y-4 border-t border-[var(--color-line)] px-4 py-4">
        <OperacionalFilialBody
          group={group}
          result={result}
          embeddedSchedule
          showFilialHeader={false}
          scheduleSuggestions={scheduleSuggestions}
          scheduleSuggestionDisclaimer={scheduleSuggestionDisclaimer}
          recorded={recorded}
          onFeedback={onFeedback}
        />
      </div>
    </details>
  )
}

function OperacionalFilialBody({
  group,
  result,
  embeddedSchedule,
  showFilialHeader,
  scheduleSuggestions,
  scheduleSuggestionDisclaimer,
  recorded,
  onFeedback,
  globalTurmasNote,
}: {
  group: OperacionalFilialGroup
  result: SimulationResult
  embeddedSchedule: boolean
  showFilialHeader: boolean
  scheduleSuggestions: ScheduleSuggestion[]
  scheduleSuggestionDisclaimer: string
  recorded: Record<string, FeedbackAction>
  onFeedback: (
    suggestion: ScheduleSuggestion,
    action: FeedbackAction,
    editedShifts?: EditedShiftFields[],
  ) => void
  globalTurmasNote?: string
}) {
  const turmas = summarizeOperacionalTurmas(group.centers)
  const ccGroups = nestCentersByCc(group.centers)
  const allow = new Set(group.centroCustos)
  const suggestions = scheduleSuggestions.filter((s) =>
    allow.has(s.centroCusto),
  )
  const suggestionsByCenter = groupSuggestions(suggestions)
  const regimeLabels = turmas.regimes
    .map((r) => REGIME_FUNCIONAMENTO_LABELS[r as keyof typeof REGIME_FUNCIONAMENTO_LABELS] ?? r)
    .join(' · ')

  return (
    <div className="space-y-4">
      {showFilialHeader ? (
        <header className="border border-[var(--color-line)] bg-white/80 px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Filial / CNPJ
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">
            {group.label}
          </p>
        </header>
      ) : null}

      <ScheduleBuilderView
        result={result}
        centroCustoFilter={group.centroCustos}
        cnpjFilter={group.key}
        embedded={embeddedSchedule}
      />

      <div className="border border-[var(--color-line)] bg-white/80 px-4 py-4">
        <h4 className="text-sm font-semibold text-[var(--color-ink)]">
          Distribuição de turmas
          {embeddedSchedule || showFilialHeader ? ' (filial)' : ' (agregado)'}
        </h4>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {regimeLabels || '—'} · {turmas.crewCount} turma(s) · cobertura diária{' '}
          {turmas.dailyCoverageNeed} · HC total {turmas.totalHeadcount}
        </p>
        {globalTurmasNote ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {globalTurmasNote}
          </p>
        ) : null}
        <ul className="mt-2 space-y-2 text-xs text-[var(--color-muted)]">
          {ccGroups.map((ccGroup) => (
            <li key={ccGroup.centroCusto}>
              <p className="font-medium text-[var(--color-ink)]">
                CC {ccGroup.centroCusto}
              </p>
              <ul className="mt-1 space-y-0.5 border-l border-[var(--color-line)] pl-3">
                {ccGroup.horarios.map((c) => {
                  const d = c.distribuicaoTurmas
                  const escala = c.escalaAtual?.trim() || '—'
                  const carga =
                    c.cargaSemanalAtual != null
                      ? `${c.cargaSemanalAtual.toLocaleString('pt-BR')} h/sem`
                      : '—'
                  const cod = c.codHorarioAtual?.trim() || '—'
                  return (
                    <li
                      key={`${c.cnpjCompleto ?? ''}-${c.centroCusto}-${cod}`}
                    >
                      Horário {cod} · escala {escala} · carga {carga}
                      {d
                        ? ` · ${d.crewCount} turma(s) · HC ${d.totalHeadcount}`
                        : ` · HC ${c.requiredHeadcount}`}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {suggestionsByCenter.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
            Escalas sugeridas
          </h4>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            1–2 candidatas por centro (horário início/fim, HC por turno) com
            custo estimado folha + VR/VT vs atual. Nunca inclui 6×1, 12×36,
            24×48 nem jornada diária &gt; 10h.
          </p>
          <div className="mt-3 space-y-4">
            {suggestionsByCenter.map(([centro, items]) => (
              <div
                key={centro}
                className="border border-[var(--color-line)] bg-white/70 p-4"
              >
                <p className="text-sm font-medium">{centro}</p>
                <ul className="mt-3 space-y-3">
                  {items.map((s) => (
                    <li
                      key={`${s.centroCusto}-${s.code}`}
                      className="border-t border-[var(--color-line)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">{s.label}</p>
                        <p className="text-sm tabular-nums">
                          Δ total {brl(s.monthlyDeltaVsCurrent)}/mês
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {s.description}
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        HC {s.totalHeadcount} · ~{s.workDaysPerMonth} dias/mês ·
                        folha {brl(s.estimated.monthlyPayroll)}
                        {s.estimated.monthlyVr != null
                          ? ` · VR ${brl(s.estimated.monthlyVr)}`
                          : ''}
                        {s.estimated.monthlyVt != null
                          ? ` · VT ${brl(s.estimated.monthlyVt)}`
                          : ''}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                        {s.shifts.map((w) => (
                          <li
                            key={`${s.code}-${w.label}`}
                            className="border border-[var(--color-line)] bg-white px-2 py-1"
                          >
                            <span className="font-medium">{w.label}</span>{' '}
                            {formatShiftRange(w)} · {w.hours}h · {w.headcount}{' '}
                            pess.
                          </li>
                        ))}
                      </ul>
                      <SuggestionFeedbackControls
                        suggestion={s}
                        recordedAction={recorded[suggestionKey(s)] ?? null}
                        onAccept={() => onFeedback(s, 'accepted')}
                        onReject={() => onFeedback(s, 'rejected')}
                        onEditSave={(shifts) =>
                          onFeedback(s, 'edited', shifts)
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 border-l-2 border-[var(--color-accent)] pl-3 text-xs text-[var(--color-muted)]">
            {scheduleSuggestionDisclaimer}
          </p>
        </div>
      ) : null}
    </div>
  )
}
