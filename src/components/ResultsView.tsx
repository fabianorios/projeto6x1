import { useState } from 'react'
import {
  buildFeedbackEntry,
  clearCalibrationHistory,
  downloadCalibrationJson,
  formatShiftRange,
  loadCalibrationHistory,
  removeProposedScenario,
  saveCalibrationEntry,
  setBestScenario,
  type CalibrationFeedbackEntry,
  type EditedShiftFields,
  type FeedbackAction,
  type ResultLineItem,
  type ScenarioBasket,
  type ScenarioId,
  type ScheduleSuggestion,
  type SimulationResult,
} from '../engine'
import { getTemplate } from '../templates'
import { CalibrationHistory } from './CalibrationHistory'
import { PrintableReport } from './PrintableReport'
import { ScenarioBasketCompare } from './ScenarioBasketCompare'
import {
  ScenarioComparePanel,
  sidesFromSimulation,
} from './ScenarioComparePanel'
import { SuggestionFeedbackControls } from './SuggestionFeedbackControls'

interface ResultsViewProps {
  result: SimulationResult
  basket: ScenarioBasket | null
  onBasketChange: (basket: ScenarioBasket | null) => void
  onBack: () => void
  onRestart: () => void
  onClearBasket: () => void
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

export function ResultsView({
  result,
  basket,
  onBasketChange,
  onBack,
  onRestart,
  onClearBasket,
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
  } = result

  const [history, setHistory] = useState<CalibrationFeedbackEntry[]>(() =>
    loadCalibrationHistory(),
  )
  const [recorded, setRecorded] = useState<Record<string, FeedbackAction>>(
    {},
  )
  const [detailOpen, setDetailOpen] = useState(false)

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

  const suggestionsByCenter = groupSuggestions(scheduleSuggestions)

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
  const folhaDir = deltaDirection(cost.monthlyDelta)
  const folhaToneClass =
    folhaDir.tone === 'up'
      ? 'text-red-800'
      : folhaDir.tone === 'down'
        ? 'text-[var(--color-accent)]'
        : 'text-[var(--color-ink)]'

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
              Voltar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-11 bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="min-h-11 px-4 py-2.5 text-sm text-[var(--color-muted)] underline"
            >
              Nova simulação
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Resultados da simulação</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {template?.resultBlurb ??
              'Estimativas do motor com hipóteses explícitas.'}
{' '}
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
            {template?.label ?? input.sector} · escala {input.currentScale} ·{' '}
            {input.headcount} pessoas
            {usedPayrollImport ? ' · folha importada' : ''}
          </p>
        </div>

        {/* (1) Δ hero above the fold */}
        <div
          className="border-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]/60 px-5 py-5"
          aria-labelledby="folha-delta-hero"
        >
          <p
            id="folha-delta-hero"
            className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)] uppercase"
          >
            Δ folha mensal (salários)
          </p>
          <p
            className={`mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl ${folhaToneClass}`}
          >
            <span aria-hidden="true" className="mr-2 text-3xl sm:text-4xl">
              {folhaDir.arrow}
            </span>
            {signedBrl(cost.monthlyDelta)}
            <span className="ml-2 text-base font-medium text-[var(--color-muted)]">
              /mês
            </span>
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink)]">
            <span className="font-medium">{folhaDir.label}</span>
            <span className="text-[var(--color-muted)]">
              {' '}
              · anual {signedBrl(cost.annualDelta)} · HC{' '}
              {coverage.currentHeadcount} → {coverage.requiredHeadcount} (+
              {coverage.additionalHeadcount})
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Baseline {brl(cost.baselineMonthlyPayroll)} → projetado{' '}
            {brl(cost.projectedMonthlyPayroll)}
          </p>
        </div>

        {/* (2) Atual × Proposto: basket when ≥2 proposals; panel when 0–1 */}
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

        {/* Secondary KPIs (non-hero) */}
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

        {excludedScheduleNotice ? (
          <div
            className={
              excludedScheduleNotice.severity === 'soft'
                ? 'border border-[var(--color-line)] bg-white/80 px-4 py-3 text-sm text-[var(--color-ink)]'
                : 'border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm text-amber-950'
            }
            role="status"
          >
            <p className="flex flex-wrap items-center gap-2">
              <span
                className={
                  excludedScheduleNotice.severity === 'soft'
                    ? 'inline-block border border-[var(--color-line)] bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'
                    : 'inline-block border border-amber-800/40 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'
                }
              >
                {excludedScheduleNotice.badge}
              </span>
              <span className="font-medium">{excludedScheduleNotice.label}</span>
            </p>
            <p
              className={
                excludedScheduleNotice.severity === 'soft'
                  ? 'mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]'
                  : 'mt-1.5 text-xs leading-relaxed text-amber-900/90'
              }
            >
              {excludedScheduleNotice.reason}{' '}
              {excludedScheduleNotice.severity === 'soft'
                ? 'Permanece no lado Atual; as candidatas abaixo são só 5×2, turnos 8h e (se o cenário admitir) 4×3.'
                : 'Esta escala não é recomendada pelo motor; as candidatas abaixo respeitam a lista de exclusão (docs/schedule-policy.md).'}
            </p>
          </div>
        ) : null}

        {scheduleSuggestions.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
              Escalas sugeridas
            </h3>
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
                          HC {s.totalHeadcount} · ~{s.workDaysPerMonth} dias/mês
                          · folha {brl(s.estimated.monthlyPayroll)}
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
                          onAccept={() => recordFeedback(s, 'accepted')}
                          onReject={() => recordFeedback(s, 'rejected')}
                          onEditSave={(shifts) =>
                            recordFeedback(s, 'edited', shifts)
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

        {/* (3) Technical detail collapsible */}
        <div className="border border-[var(--color-line)] bg-white/70">
          <button
            type="button"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
          >
            <span>Detalhe técnico</span>
            <span className="text-xs font-normal text-[var(--color-muted)]">
              {detailOpen ? 'Ocultar' : 'Mostrar'} · calibração, centros, linhas
              do motor
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
                  Snapshot completo (cenário + feedback) fica no histórico local.
                  Use <strong>Baixar JSON</strong> para exportar o dataset da Fase
                  A.
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
                  <h3 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                    Por centro de custo
                  </h3>
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
                            key={c.centroCusto}
                            className="border-b border-[var(--color-line)]"
                          >
                            <td className="px-3 py-2 font-medium">
                              {c.centroCusto}
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
                <h3 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                  Linhas explicáveis do motor
                </h3>
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
