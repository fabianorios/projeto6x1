import { useState } from 'react'
import {
  DEFAULT_OPERATING_HOURS,
  clearScenarioBasket,
  loadScenarioBasket,
  simulate,
  upsertSimulationInBasket,
  type OperatingHours,
  type PayrollParseIssue,
  type PayrollRow,
  type ScenarioBasket,
  type ScenarioId,
  type SimulationResult,
} from '../engine'
import { getTemplate, PILOT_TEMPLATES } from '../templates'
import { AmbientesPanel } from './AmbientesPanel'
import { ApdataFlowPanel } from './ApdataFlowPanel'
import { MapeamentoPanel } from './MapeamentoPanel'
import { ResultsView } from './ResultsView'
import { SectorStep } from './SectorStep'
import { InputsStep } from './InputsStep'

export type WizardStep = 'sector' | 'inputs' | 'results'

export interface WizardFormState {
  sectorId: string | null
  headcount: number
  currentScale: string
  averageMonthlySalary: number
  units: number
  shiftsPerDay: number
  operatingHours: OperatingHours
  scenarioId: ScenarioId
  payrollRows: PayrollRow[]
  payrollIssues: PayrollParseIssue[]
}

const initialForm: WizardFormState = {
  sectorId: null,
  headcount: 24,
  currentScale: '6x1',
  averageMonthlySalary: 2200,
  units: 1,
  shiftsPerDay: 2,
  operatingHours: DEFAULT_OPERATING_HOURS,
  scenarioId: 'pec_draft_conservative',
  payrollRows: [],
  payrollIssues: [],
}

const STEPS: WizardStep[] = ['sector', 'inputs', 'results']

const STEP_LABELS: Record<WizardStep, string> = {
  sector: 'Setor',
  inputs: 'Dados',
  results: 'Resultados',
}

export function WizardShell() {
  const [step, setStep] = useState<WizardStep>('sector')
  const [form, setForm] = useState<WizardFormState>(initialForm)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [basket, setBasket] = useState<ScenarioBasket | null>(() =>
    loadScenarioBasket(),
  )
  const [ambientesOpen, setAmbientesOpen] = useState(false)
  const [mapeamentoOpen, setMapeamentoOpen] = useState(false)
  const [apdataFlowOpen, setApdataFlowOpen] = useState(false)

  function selectSector(sectorId: string) {
    const template = getTemplate(sectorId as 'varejo' | 'hospital')
    if (!template) return
    setForm((prev) => ({
      ...prev,
      sectorId,
      ...template.defaults,
    }))
  }

  function runSimulation() {
    if (!form.sectorId) return
    const next = simulate({
      sector: form.sectorId as 'varejo' | 'hospital',
      headcount: form.headcount,
      currentScale: form.currentScale,
      averageMonthlySalary: form.averageMonthlySalary,
      units: form.units,
      shiftsPerDay: form.shiftsPerDay,
      operatingHours: form.operatingHours,
      scenarioId: form.scenarioId,
      payrollRows:
        form.payrollRows.length > 0 ? form.payrollRows : undefined,
    })
    const nextBasket = upsertSimulationInBasket(next, basket)
    setBasket(nextBasket)
    setResult(next)
    setStep('results')
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 sm:px-6">
      <header className="no-print mb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm tracking-wide text-[var(--color-accent)] uppercase">
              Projeto 6×1
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
              Simulador de impacto PEC
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setApdataFlowOpen(true)}
              className="bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white hover:opacity-95"
            >
              Apdata → Simular
            </button>
            <button
              type="button"
              onClick={() => setMapeamentoOpen(true)}
              className="border border-[var(--color-line)] bg-white/70 px-3 py-1.5 text-sm text-[var(--color-ink)] hover:border-[var(--color-accent)]"
            >
              Mapeamento
            </button>
            <button
              type="button"
              onClick={() => setAmbientesOpen(true)}
              className="border border-[var(--color-line)] bg-white/70 px-3 py-1.5 text-sm text-[var(--color-ink)] hover:border-[var(--color-accent)]"
            >
              Ambientes
            </button>
          </div>
        </div>
        <p className="mt-2 max-w-xl text-[var(--color-muted)]">
          Preencha em 3 passos e gere um relatório imprimível (PDF via
          navegador). Números são heurísticas versionadas — não parecer
          jurídico.
        </p>

        <nav
          className="mt-6 flex gap-2"
          aria-label="Etapas do wizard"
        >
          {STEPS.map((s, i) => {
            const active = s === step
            const done = i < stepIndex
            return (
              <button
                key={s}
                type="button"
                disabled={i > stepIndex && !result}
                onClick={() => {
                  if (i <= stepIndex || result) setStep(s)
                }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm transition',
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : done
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-ink)]'
                      : 'bg-white/60 text-[var(--color-muted)]',
                ].join(' ')}
              >
                {i + 1}. {STEP_LABELS[s]}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="flex-1">
        {step === 'sector' && (
          <SectorStep
            templates={PILOT_TEMPLATES}
            selectedId={form.sectorId}
            onSelect={selectSector}
            onNext={() => form.sectorId && setStep('inputs')}
          />
        )}
        {step === 'inputs' && (
          <InputsStep
            form={form}
            onChange={setForm}
            onBack={() => setStep('sector')}
            onSubmit={runSimulation}
          />
        )}
        {step === 'results' && result && (
          <ResultsView
            result={result}
            basket={basket}
            onBasketChange={setBasket}
            onBack={() => setStep('inputs')}
            onRestart={() => {
              setResult(null)
              setForm(initialForm)
              setStep('sector')
            }}
            onClearBasket={() => {
              clearScenarioBasket()
              setBasket(null)
            }}
          />
        )}
      </main>

      <AmbientesPanel
        open={ambientesOpen}
        onClose={() => setAmbientesOpen(false)}
      />
      <MapeamentoPanel
        open={mapeamentoOpen}
        onClose={() => setMapeamentoOpen(false)}
      />
      <ApdataFlowPanel
        open={apdataFlowOpen}
        onClose={() => setApdataFlowOpen(false)}
      />
    </div>
  )
}
