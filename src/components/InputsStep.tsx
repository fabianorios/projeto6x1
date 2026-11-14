import { useMemo } from 'react'
import {
  REGIME_FUNCIONAMENTO_LABELS,
  RULE_VERSIONS,
  checkScheduleExclusion,
  formatShiftRange,
  loadScenarioBasket,
  simulate,
  type EstrategiaAbsorcao,
  type PayrollParseIssue,
  type PayrollRow,
  type RegimeFuncionamento,
  type ScenarioId,
  type TaxRegime,
} from '../engine'
import { getTemplate } from '../templates'
import type { WizardFormState } from './WizardShell'
import { EphemeralConnectPanel } from './EphemeralConnectPanel'
import { OperatingHoursFields } from './OperatingHoursFields'
import { PayrollImport } from './PayrollImport'
import {
  ScenarioComparePanel,
  sidesFromSimulation,
} from './ScenarioComparePanel'

const TAX_OPTIONS: { id: TaxRegime; label: string }[] = [
  { id: 'SIMPLES', label: 'Simples Nacional' },
  { id: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { id: 'LUCRO_REAL', label: 'Lucro Real' },
]

const ABSORCAO_OPTIONS: { id: EstrategiaAbsorcao; label: string }[] = [
  { id: 'CONTRATACAO_INTEGRAL', label: 'Contratação integral' },
  { id: 'HORA_EXTRA_MAXIMA', label: 'Hora extra máxima (cap 44h/mês)' },
  { id: 'HIBRIDO_INTERMITENTE', label: 'Híbrido / intermitente' },
]

const REGIME_OPTIONS = (
  Object.keys(REGIME_FUNCIONAMENTO_LABELS) as RegimeFuncionamento[]
).map((id) => ({ id, label: REGIME_FUNCIONAMENTO_LABELS[id] }))

interface InputsStepProps {
  form: WizardFormState
  onChange: (next: WizardFormState) => void
  onBack: () => void
  onSubmit: () => void
}

const SCENARIO_ORDER: ScenarioId[] = [
  'status_quo',
  'fase1_2026_42h',
  'fase2_2027_40h',
  'stress_test_4x3',
]

export function InputsStep({
  form,
  onChange,
  onBack,
  onSubmit,
}: InputsStepProps) {
  const template = form.sectorId
    ? getTemplate(
        form.sectorId as 'varejo' | 'hospital' | 'construcao' | 'locacao',
      )
    : undefined

  const selectedScenario = RULE_VERSIONS[form.scenarioId]
  const scaleExclusion = checkScheduleExclusion(form.currentScale)
  // Re-read each render so returning from Resultados shows the latest cesta.
  const basketSnapshot = loadScenarioBasket()

  const preview = useMemo(() => {
    if (!form.sectorId) return null
    try {
      return simulate({
        sector: form.sectorId as
          | 'varejo'
          | 'hospital'
          | 'construcao'
          | 'locacao',
        headcount: form.headcount,
        currentScale: form.currentScale,
        averageMonthlySalary: form.averageMonthlySalary,
        units: form.units,
        shiftsPerDay: form.shiftsPerDay,
        operatingHours: form.operatingHours,
        scenarioId: form.scenarioId,
        payrollRows:
          form.payrollRows.length > 0 ? form.payrollRows : undefined,
        defaultTaxRegime: form.defaultTaxRegime,
        taxRegimeByCnpj:
          Object.keys(form.taxRegimeByCnpj).length > 0
            ? form.taxRegimeByCnpj
            : undefined,
        estrategiaAbsorcao: form.estrategiaAbsorcao,
        defaultRegimeFuncionamento: form.defaultRegimeFuncionamento,
        regimeFuncionamentoByCc:
          Object.keys(form.regimeFuncionamentoByCc).length > 0
            ? form.regimeFuncionamentoByCc
            : undefined,
      })
    } catch {
      return null
    }
  }, [form])

  const compareSides = useMemo(() => {
    if (!preview) return null
    const top = preview.scheduleSuggestions[0]
    const scheduleHint = top
      ? `Sugestão: ${top.label} · ${top.shifts.map((s) => `${s.label} ${formatShiftRange(s)}`).join(', ')}`
      : null
    const targetLabel = preview.ruleVersion.params.preserveCurrentScale
      ? preview.input.currentScale
      : preview.ruleVersion.params.targetScale.label
    return sidesFromSimulation({
      currentScale: preview.input.currentScale,
      proposedScaleLabel: targetLabel,
      proposedTitle: preview.ruleVersion.label,
      currentHeadcount: preview.coverage.currentHeadcount,
      proposedHeadcount: preview.coverage.requiredHeadcount,
      baselinePayroll: preview.cost.baselineMonthlyPayroll,
      projectedPayroll: preview.cost.projectedMonthlyPayroll,
      vrCurrent: preview.vr?.currentMonthly ?? null,
      vrProposed: preview.vr?.proposedMonthly ?? null,
      vtCurrent: preview.vt?.currentMonthly ?? null,
      vtProposed: preview.vt?.proposedMonthly ?? null,
      scheduleHint,
    })
  }, [preview])

  function patch<K extends keyof WizardFormState>(
    key: K,
    value: WizardFormState[K],
  ) {
    onChange({ ...form, [key]: value })
  }

  return (
    <section className="no-print space-y-6">
      <div>
        <h2 className="text-xl font-semibold">
          Dados — {template?.label ?? 'setor'}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {template?.inputsIntro ??
            'Preencha headcount, escala, salários e unidades. Defaults vêm do template do setor.'}
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <fieldset className="border border-[var(--color-line)] bg-white/70 p-4">
          <legend className="px-1 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
            Operação
          </legend>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Headcount, escala, salário e horário de funcionamento.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                {template?.fieldLabels.headcount ?? 'Headcount'}
              </span>
              <input
                type="number"
                min={1}
                required
                value={form.headcount}
                onChange={(e) => patch('headcount', Number(e.target.value))}
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                {template?.fieldLabels.currentScale ?? 'Escala atual'}
              </span>
              <input
                type="text"
                required
                placeholder="6x1"
                value={form.currentScale}
                onChange={(e) => patch('currentScale', e.target.value)}
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              />
              {template?.scaleHint ? (
                <span className="mt-1 block text-xs text-[var(--color-muted)]">
                  {template.scaleHint}
                </span>
              ) : null}
              {scaleExclusion.excluded ? (
                <span
                  className={
                    scaleExclusion.severity === 'soft'
                      ? 'mt-2 block border border-[var(--color-line)] bg-white/80 px-2 py-1.5 text-xs text-[var(--color-muted)]'
                      : 'mt-2 block border border-amber-700/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-950'
                  }
                  role="status"
                >
                  <span className="font-semibold tracking-wide uppercase">
                    {scaleExclusion.badge}
                  </span>
                  {' — '}
                  {scaleExclusion.label}. {scaleExclusion.reason}
                  {scaleExclusion.severity === 'soft'
                    ? ' Continuará no lado Atual da comparação.'
                    : ' O motor não sugerirá esta escala como saída da PEC.'}
                </span>
              ) : null}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                {template?.fieldLabels.averageMonthlySalary ??
                  'Salário médio mensal (R$)'}
              </span>
              <input
                type="number"
                min={0}
                required
                value={form.averageMonthlySalary}
                onChange={(e) =>
                  patch('averageMonthlySalary', Number(e.target.value))
                }
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                {template?.fieldLabels.units ?? 'Unidades'}
              </span>
              <input
                type="number"
                min={1}
                required
                value={form.units}
                onChange={(e) => patch('units', Number(e.target.value))}
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                {template?.fieldLabels.shiftsPerDay ?? 'Turnos por dia'}
              </span>
              <input
                type="number"
                min={1}
                required
                value={form.shiftsPerDay}
                onChange={(e) => patch('shiftsPerDay', Number(e.target.value))}
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              />
            </label>

            <div className="sm:col-span-2">
              <OperatingHoursFields
                value={form.operatingHours}
                onChange={(operatingHours) =>
                  patch('operatingHours', operatingHours)
                }
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-[var(--color-line)] bg-white/70 p-4">
          <legend className="px-1 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
            Folha (CSV)
          </legend>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Importação opcional — atualiza headcount e salário médio quando
            houver linhas válidas.
          </p>
          <div className="mb-3 space-y-3">
            <EphemeralConnectPanel
              onImported={(rows, issues) => {
                const hc = rows.reduce((s, r) => s + r.quantidade, 0)
                const mass = rows.reduce(
                  (s, r) => s + r.salario * r.quantidade,
                  0,
                )
                onChange({
                  ...form,
                  payrollRows: rows,
                  payrollIssues: issues,
                  ...(rows.length > 0
                    ? {
                        headcount: hc,
                        averageMonthlySalary:
                          hc > 0
                            ? Math.round(mass / hc)
                            : form.averageMonthlySalary,
                      }
                    : {}),
                })
              }}
            />
          </div>
          <PayrollImport
            rows={form.payrollRows}
            issues={form.payrollIssues}
            onParsed={(rows: PayrollRow[], issues: PayrollParseIssue[]) => {
              const hc = rows.reduce((s, r) => s + r.quantidade, 0)
              const mass = rows.reduce(
                (s, r) => s + r.salario * r.quantidade,
                0,
              )
              onChange({
                ...form,
                payrollRows: rows,
                payrollIssues: issues,
                ...(rows.length > 0
                  ? {
                      headcount: hc,
                      averageMonthlySalary:
                        hc > 0
                          ? Math.round(mass / hc)
                          : form.averageMonthlySalary,
                    }
                  : {}),
              })
            }}
            onClear={() =>
              onChange({
                ...form,
                payrollRows: [],
                payrollIssues: [],
              })
            }
          />
        </fieldset>

        <fieldset className="border border-[var(--color-line)] bg-white/70 p-4">
          <legend className="px-1 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
            Premissas (encargos / absorção / regime)
          </legend>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Regime tributário por CNPJ, estratégia de absorção do gap e
            funcionamento do estabelecimento (turmas).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                Regime tributário (padrão)
              </span>
              <select
                value={form.defaultTaxRegime}
                onChange={(e) =>
                  patch('defaultTaxRegime', e.target.value as TaxRegime)
                }
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              >
                {TAX_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">
                Estratégia de absorção
              </span>
              <select
                value={form.estrategiaAbsorcao}
                onChange={(e) =>
                  patch(
                    'estrategiaAbsorcao',
                    e.target.value as EstrategiaAbsorcao,
                  )
                }
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              >
                {ABSORCAO_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-[var(--color-muted)]">
                Regime de funcionamento (padrão / CC)
              </span>
              <select
                value={form.defaultRegimeFuncionamento}
                onChange={(e) =>
                  patch(
                    'defaultRegimeFuncionamento',
                    e.target.value as RegimeFuncionamento,
                  )
                }
                className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              >
                {REGIME_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TaxRegimeByCnpjFields form={form} onChange={onChange} />
          <RegimeByCcFields form={form} onChange={onChange} />
        </fieldset>

        <fieldset className="border border-[var(--color-line)] bg-white/70 p-4">
          <legend className="px-1 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
            Cenário normativo
          </legend>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Status quo ou hipótese PEC — entra na cesta de comparação ao
            simular.
          </p>
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Cenário normativo"
          >
            {SCENARIO_ORDER.map((id) => {
              const rule = RULE_VERSIONS[id]
              const selected = form.scenarioId === id
              return (
                <label
                  key={id}
                  className={[
                    'flex min-h-11 cursor-pointer gap-3 border px-3 py-3 transition',
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-line)] bg-white/70 hover:border-[var(--color-accent)]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="scenarioId"
                    value={id}
                    checked={selected}
                    onChange={() => patch('scenarioId', id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--color-ink)]">
                      {rule.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                      {rule.summary}
                    </span>
                    <span className="mt-1 block text-[10px] tracking-wide text-[var(--color-muted)] uppercase">
                      {rule.id} · {rule.effectiveAsOf}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          {selectedScenario ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Selecionado: <strong>{selectedScenario.label}</strong> — ao
              simular, este cenário entra/atualiza a cesta de comparação
              (atual + propostas da sessão).
            </p>
          ) : null}
          {basketSnapshot && basketSnapshot.proposed.length > 0 ? (
            <p className="mt-2 border border-[var(--color-line)] bg-white/80 px-3 py-2 text-xs text-[var(--color-muted)]">
              Cesta da sessão:{' '}
              <strong className="text-[var(--color-ink)]">
                {basketSnapshot.proposed.length} proposta
                {basketSnapshot.proposed.length === 1 ? '' : 's'}
              </strong>
              {' · '}
              {basketSnapshot.proposed.map((p) => p.label).join(' · ')}
              {basketSnapshot.bestScenarioId
                ? ` · melhor: ${
                    basketSnapshot.proposed.find(
                      (p) => p.scenarioId === basketSnapshot.bestScenarioId,
                    )?.label ?? '—'
                  }`
                : ''}
              . Simule outro cenário para acrescentar/atualizar; veja a
              tabela completa em Resultados.
            </p>
          ) : null}
        </fieldset>

        {compareSides ? (
          <fieldset className="border border-[var(--color-line)] bg-white/70 p-4">
            <legend className="px-1 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
              Prévia
            </legend>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Comparação ao vivo Atual × Proposto — confirme com Simular para
              o relatório completo.
            </p>
            <ScenarioComparePanel
              current={compareSides.current}
              proposed={compareSides.proposed}
              footerNote={
                preview
                  ? `Prévia ao vivo · Δ folha ${preview.cost.monthlyDelta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}/mês. Clique em Simular para o relatório completo.`
                  : undefined
              }
            />
          </fieldset>
        ) : null}

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm"
          >
            Voltar
          </button>
          <button
            type="submit"
            className="min-h-11 bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white"
          >
            Simular
          </button>
        </div>
      </form>
    </section>
  )
}

function uniqueCnpjs(rows: PayrollRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const dig = (r.cnpjCompleto ?? '').replace(/\D/g, '')
    if (dig.length >= 8) set.add(dig)
  }
  return [...set].sort()
}

function uniqueCostCenters(rows: PayrollRow[]): string[] {
  return [...new Set(rows.map((r) => r.centroCusto).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )
}

function TaxRegimeByCnpjFields({
  form,
  onChange,
}: {
  form: WizardFormState
  onChange: (next: WizardFormState) => void
}) {
  const cnpjs = uniqueCnpjs(form.payrollRows)
  if (cnpjs.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-[var(--color-muted)]">
        Regime por CNPJ (da folha importada)
      </p>
      {cnpjs.map((cnpj) => (
        <label key={cnpj} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono">{cnpj}</span>
          <select
            value={form.taxRegimeByCnpj[cnpj] ?? form.defaultTaxRegime}
            onChange={(e) =>
              onChange({
                ...form,
                taxRegimeByCnpj: {
                  ...form.taxRegimeByCnpj,
                  [cnpj]: e.target.value as TaxRegime,
                },
              })
            }
            className="border border-[var(--color-line)] bg-white px-2 py-1"
          >
            {TAX_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

function RegimeByCcFields({
  form,
  onChange,
}: {
  form: WizardFormState
  onChange: (next: WizardFormState) => void
}) {
  const ccs = uniqueCostCenters(form.payrollRows)
  if (ccs.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-[var(--color-muted)]">
        Regime de funcionamento por centro de custo
      </p>
      {ccs.map((cc) => (
        <label key={cc} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-24">{cc}</span>
          <select
            value={
              form.regimeFuncionamentoByCc[cc] ??
              form.defaultRegimeFuncionamento
            }
            onChange={(e) =>
              onChange({
                ...form,
                regimeFuncionamentoByCc: {
                  ...form.regimeFuncionamentoByCc,
                  [cc]: e.target.value as RegimeFuncionamento,
                },
              })
            }
            className="border border-[var(--color-line)] bg-white px-2 py-1"
          >
            {REGIME_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
