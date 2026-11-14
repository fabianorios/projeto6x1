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
  scenarioId: 'fase1_2026_42h',
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
    const template = getTemplate(
      sectorId as 'varejo' | 'hospital' | 'construcao' | 'locacao',
    )
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
    })
    const nextBasket = upsertSimulationInBasket(next, basket)
    setBasket(nextBasket)
    setResult(next)
    setStep('results')
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Chrome alinhado ao shell Gestão (top bar #003366 + marca teal) */}
      <header className="app-chrome no-print sticky top-0 z-30 border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div
              className="app-chrome-mark flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold tracking-tight"
              aria-hidden
            >
              6×1
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold tracking-tight text-white uppercase">
                Turnocheck
              </p>
              <p className="text-[10px] leading-none text-white/80">
                Projeto 6×1 · AHR BRASIL
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setApdataFlowOpen(true)}
              className="rounded-[var(--radius)] bg-[var(--color-teal)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-teal)]/90 sm:px-3 sm:text-sm"
            >
              Apdata → Simular
            </button>
            <button
              type="button"
              onClick={() => setMapeamentoOpen(true)}
              className="rounded-[var(--radius)] border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 sm:px-3 sm:text-sm"
            >
              Mapeamento
            </button>
            <button
              type="button"
              onClick={() => setAmbientesOpen(true)}
              className="rounded-[var(--radius)] border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 sm:px-3 sm:text-sm"
            >
              Ambientes
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="no-print mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
            Simulador de impacto PEC
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
            Preencha em 3 passos e gere um relatório imprimível (PDF via
            navegador). Números são heurísticas versionadas — não parecer
            jurídico.
          </p>

          <nav
            className="mt-6 flex flex-wrap gap-2"
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
                    'rounded-[var(--radius)] px-3 py-1.5 text-sm transition',
                    active
                      ? 'bg-[var(--color-teal)] text-white'
                      : done
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-ink)]'
                        : 'bg-white/70 text-[var(--color-muted)]',
                  ].join(' ')}
                >
                  {i + 1}. {STEP_LABELS[s]}
                </button>
              )
            })}
          </nav>
        </div>

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
      </div>

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
