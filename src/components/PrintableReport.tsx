import {
  formatShiftRange,
  summarizeOperatingHours,
  type ResultLineItem,
  type ScenarioBasket,
  type SimulationResult,
} from '../engine'
import { getTemplate } from '../templates'
import { ScenarioBasketCompare } from './ScenarioBasketCompare'
import {
  ScenarioComparePanel,
  sidesFromSimulation,
} from './ScenarioComparePanel'

interface PrintableReportProps {
  result: SimulationResult
  basket?: ScenarioBasket | null
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
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

/**
 * Relatório HTML imprimível (browser print → PDF).
 * Visível só em @media print.
 */
export function PrintableReport({
  result,
  basket = null,
}: PrintableReportProps) {
  const template = getTemplate(result.input.sector)
  const {
    input,
    cost,
    coverage,
    ruleVersion,
    lineItems,
    disclaimer,
    vr,
    vt,
    byCostCenter,
    usedPayrollImport,
    scheduleSuggestions,
    excludedScheduleNotice,
    scheduleSuggestionDisclaimer,
  } = result

  const bestLabel =
    basket?.bestScenarioId != null
      ? (basket.proposed.find((p) => p.scenarioId === basket.bestScenarioId)
          ?.label ?? null)
      : null

  const generatedAt = new Date().toLocaleString('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const unitsLabel =
    template?.fieldLabels.units ?? 'Unidades'
  const headcountLabel =
    template?.fieldLabels.headcount ?? 'Headcount'
  const shiftsLabel =
    template?.fieldLabels.shiftsPerDay ?? 'Turnos/dia'

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

  return (
    <article className="print-only report-sheet mx-auto max-w-[210mm] bg-white text-black">
      <header className="report-header border-b-2 border-neutral-800 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase">
              Turnocheck · Projeto 6×1 · AHR Brasil
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">
              Relatório de impacto — PEC escala 6×1
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              Segmento:{' '}
              <strong>{template?.label ?? input.sector}</strong>
              {' · '}
              Cenário ativo: <strong>{ruleVersion.label}</strong>
              {bestLabel ? (
                <>
                  {' · '}
                  Melhor na cesta: <strong>{bestLabel}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-neutral-600">
            <p>Gerado em</p>
            <p className="mt-0.5 font-medium text-neutral-800">{generatedAt}</p>
            <p className="mt-2 font-mono text-[10px]">{ruleVersion.id}</p>
            <p className="font-mono text-[10px]">
              vigência: {ruleVersion.effectiveAsOf}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-5 rounded border border-amber-700/40 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-neutral-800">
        <p className="font-semibold tracking-wide text-amber-900 uppercase">
          Disclaimer
        </p>
        <p className="mt-1">{disclaimer}</p>
      </section>

      {basket && basket.proposed.length > 0 ? (
        <section className="mt-6">
          <ScenarioBasketCompare basket={basket} variant="print" />
        </section>
      ) : null}

      <section className="mt-6">
        <ScenarioComparePanel
          variant="print"
          current={compareSides.current}
          proposed={compareSides.proposed}
          footerNote={`Cenário ativo · Δ folha ${brl(cost.monthlyDelta)}/mês · Δ anual ${brl(cost.annualDelta)} · HC adicional +${coverage.additionalHeadcount} · gap ${coverage.uncoveredShiftHoursPerWeek.toFixed(0)} h/sem se não contratar. ${ruleVersion.summary}`}
        />
      </section>

      {excludedScheduleNotice ? (
        <section className="mt-6 rounded border border-amber-800/50 bg-amber-50 px-4 py-3 text-xs">
          <p className="font-semibold tracking-wide uppercase">
            {excludedScheduleNotice.badge}: {excludedScheduleNotice.label}
          </p>
          <p className="mt-1 text-neutral-800">{excludedScheduleNotice.reason}</p>
        </section>
      ) : null}

      {scheduleSuggestions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-base font-semibold tracking-wide uppercase">
            Escalas sugeridas
          </h2>
          <p className="mt-1 text-xs text-neutral-600">
            Candidatas operacionais (allowlist). 12×36, 24×48 e jornada &gt; 10h
            estão excluídas da sugestão.
          </p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="py-1.5 pr-2 font-semibold">Centro</th>
                <th className="py-1.5 pr-2 font-semibold">Escala</th>
                <th className="py-1.5 pr-2 font-semibold">Turnos</th>
                <th className="py-1.5 pr-2 font-semibold">HC</th>
                <th className="py-1.5 pr-2 font-semibold">Custo est.</th>
                <th className="py-1.5 font-semibold">Δ vs atual</th>
              </tr>
            </thead>
            <tbody>
              {scheduleSuggestions.map((s) => (
                <tr
                  key={`print-${s.centroCusto}-${s.code}`}
                  className="border-b border-neutral-200 align-top"
                >
                  <td className="py-1.5 pr-2 font-medium">{s.centroCusto}</td>
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{s.label}</span>
                    <span className="mt-0.5 block text-neutral-600">
                      {s.description}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {s.shifts.map((w) => (
                      <span key={w.label} className="block">
                        {w.label} {formatShiftRange(w)} · {w.headcount}p
                      </span>
                    ))}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{s.totalHeadcount}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(s.estimated.monthlyTotal)}
                  </td>
                  <td className="py-1.5 font-medium tabular-nums">
                    {brl(s.monthlyDeltaVsCurrent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
            {scheduleSuggestionDisclaimer}
          </p>
        </section>
      ) : null}

      {byCostCenter.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-base font-semibold tracking-wide uppercase">
            Por centro de custo
          </h2>
          <p className="mt-1 text-xs text-neutral-600">
            Agregação da folha importada
            {usedPayrollImport ? ` (${input.payrollRows?.length ?? 0} linhas)` : ''}
            .
          </p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="py-1.5 pr-2 font-semibold">Centro</th>
                <th className="py-1.5 pr-2 font-semibold">HC</th>
                <th className="py-1.5 pr-2 font-semibold">Folha base</th>
                <th className="py-1.5 pr-2 font-semibold">Δ Folha</th>
                <th className="py-1.5 pr-2 font-semibold">VR atual</th>
                <th className="py-1.5 pr-2 font-semibold">Δ VR</th>
                <th className="py-1.5 pr-2 font-semibold">VT atual</th>
                <th className="py-1.5 font-semibold">Δ VT</th>
              </tr>
            </thead>
            <tbody>
              {byCostCenter.map((c) => (
                <tr
                  key={c.centroCusto}
                  className="border-b border-neutral-200"
                >
                  <td className="py-1.5 pr-2 font-medium">{c.centroCusto}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {c.currentHeadcount}→{c.requiredHeadcount}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(c.baselinePayroll)}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(c.payrollMonthlyDelta)}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(c.vr.currentMonthly)}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(c.vr.monthlyDelta)}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {brl(c.vt.currentMonthly)}
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {brl(c.vt.monthlyDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold tracking-wide uppercase">
            Entradas do cliente
          </h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">{headcountLabel}</dt>
              <dd className="font-medium tabular-nums">{input.headcount}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Escala atual</dt>
              <dd className="font-medium">{input.currentScale}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Salário médio</dt>
              <dd className="font-medium tabular-nums">
                {brl(input.averageMonthlySalary)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Fonte da folha</dt>
              <dd className="font-medium">
                {usedPayrollImport
                  ? `CSV importado (${input.payrollRows?.length ?? 0} linhas)`
                  : 'Média manual do wizard'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">{unitsLabel}</dt>
              <dd className="font-medium tabular-nums">{input.units}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">{shiftsLabel}</dt>
              <dd className="font-medium tabular-nums">{input.shiftsPerDay}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Funcionamento</dt>
              <dd className="text-right font-medium">
                {summarizeOperatingHours(input.operatingHours)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="text-base font-semibold tracking-wide uppercase">
            Cenário / versão
          </h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Nome</dt>
              <dd className="text-right font-medium">{ruleVersion.label}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">ID da regra</dt>
              <dd className="font-mono text-xs">{ruleVersion.id}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Vigência / tag</dt>
              <dd className="font-medium">{ruleVersion.effectiveAsOf}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-100 py-1">
              <dt className="text-neutral-600">Segmento</dt>
              <dd className="font-medium">
                {template?.label ?? input.sector}
              </dd>
            </div>
          </dl>
          {template?.resultBlurb ? (
            <p className="mt-3 text-xs text-neutral-600">
              {template.resultBlurb}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold tracking-wide uppercase">
          Hipóteses e linhas do motor
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Cada número do resumo aponta para uma hipótese ou fórmula abaixo.
        </p>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th className="py-1.5 pr-2 font-semibold">Linha</th>
              <th className="py-1.5 pr-2 font-semibold">Valor</th>
              <th className="py-1.5 font-semibold">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line) => (
              <tr key={line.id} className="border-b border-neutral-150 align-top">
                <td className="py-1.5 pr-2 font-medium">{line.label}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">
                  {formatLineAmount(line)}
                </td>
                <td className="py-1.5 text-neutral-700">{line.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="report-footer mt-8 border-t border-neutral-400 pt-3 text-[10px] leading-relaxed text-neutral-600">
        <p>{disclaimer}</p>
        <p className="mt-2">
          Projeto 6×1 · {ruleVersion.id} · {ruleVersion.label} · gerado em{' '}
          {generatedAt} · exportação via impressão do navegador (PDF). Não
          substitui parecer jurídico nem memória de cálculo de folha.
        </p>
      </footer>
    </article>
  )
}
