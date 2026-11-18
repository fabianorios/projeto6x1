import { useEffect, useState } from 'react'
import {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  type EstrategiaAbsorcao,
  type OHScopeRule,
  type OperatingHours,
  type PayrollParseIssue,
  type PayrollRow,
  type RegimeFuncionamento,
  type ScenarioId,
  type TaxRegime,
} from '../engine'
import type {
  BenefitSessionOverrides,
  BenefitSlotAmounts,
} from '../apdata/classifyBenefit'
import {
  navigateShellMode,
  shellModeFromPath,
  type ShellMode,
} from '../shellMode'
import { AmbientesPanel } from './AmbientesPanel'
import { ApdataFlowPanel } from './ApdataFlowPanel'
import { SqlStudioPanel } from './SqlStudioPanel'

/** Shared form shape kept for InputsStep / PayrollImport compatibility. */
export interface WizardFormState {
  sectorId: string | null
  sectorLabel: string
  sectorBufferPct: number
  headcount: number
  currentScale: string
  averageMonthlySalary: number
  units: number
  shiftsPerDay: number
  operatingHours: OperatingHours
  /**
   * Segmented OH rules (Etapa 1 DTO). Empty = use `operatingHours` only.
   * UI for exceptions lands in Etapa 3.
   */
  ohScopeRules: OHScopeRule[]
  scenarioId: ScenarioId
  payrollRows: PayrollRow[]
  payrollIssues: PayrollParseIssue[]
  defaultTaxRegime: TaxRegime
  taxRegimeByCnpj: Record<string, TaxRegime>
  estrategiaAbsorcao: EstrategiaAbsorcao
  defaultRegimeFuncionamento: RegimeFuncionamento
  regimeFuncionamentoByCc: Record<string, RegimeFuncionamento>
}

export const initialWizardForm: WizardFormState = {
  sectorId: null,
  sectorLabel: '',
  sectorBufferPct: 5,
  headcount: 24,
  currentScale: '6x1',
  averageMonthlySalary: 2200,
  units: 1,
  shiftsPerDay: 2,
  operatingHours: DEFAULT_OPERATING_HOURS,
  ohScopeRules: [],
  scenarioId: 'fase1_2026_42h',
  payrollRows: [],
  payrollIssues: [],
  defaultTaxRegime: DEFAULT_TAX_REGIME,
  taxRegimeByCnpj: {},
  estrategiaAbsorcao: DEFAULT_ESTRATEGIA_ABSORCAO,
  defaultRegimeFuncionamento: DEFAULT_REGIME_FUNCIONAMENTO,
  regimeFuncionamentoByCc: {},
}

/**
 * Unified Turnocheck shell: Logo + Wizard + Studio SQL.
 * Modes are URL-driven: `/` Wizard, `/studio` Studio SQL (page, not modal-only).
 * Ambientes stays reachable from Studio / saved-env path (not top nav).
 */
export function WizardShell() {
  const [mode, setMode] = useState<ShellMode>(() =>
    typeof window !== 'undefined'
      ? shellModeFromPath(window.location.pathname)
      : 'wizard',
  )
  const [ambientesOpen, setAmbientesOpen] = useState(false)
  /** Session-local only — Studio + Passo 4; never written to sql-profiles.json. */
  const [benefitSessionOverrides, setBenefitSessionOverrides] =
    useState<BenefitSessionOverrides>({})
  /** Session scalar amounts for VR/VA/Médico/Odonto (Passo 4). */
  const [benefitSlotAmounts, setBenefitSlotAmounts] =
    useState<BenefitSlotAmounts>({})

  useEffect(() => {
    const sync = () => setMode(shellModeFromPath(window.location.pathname))
    window.addEventListener('popstate', sync)
    // Normalize unknown paths that still serve the SPA (e.g. /studio/).
    const initial = shellModeFromPath(window.location.pathname)
    navigateShellMode(initial, { replace: true })
    setMode(initial)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function go(next: ShellMode) {
    navigateShellMode(next)
    setMode(next)
  }

  const studio = mode === 'studio'

  return (
    <div className="flex min-h-screen flex-col">
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
          <nav
            className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"
            aria-label="Modo do aplicativo"
          >
            <button
              type="button"
              onClick={() => go('wizard')}
              aria-current={studio ? undefined : 'page'}
              className={
                studio
                  ? 'rounded-[var(--radius)] border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 sm:px-3 sm:text-sm'
                  : 'rounded-[var(--radius)] bg-[var(--color-teal)] px-2.5 py-1.5 text-xs font-medium text-white sm:px-3 sm:text-sm'
              }
            >
              Wizard
            </button>
            <button
              type="button"
              onClick={() => go('studio')}
              aria-current={studio ? 'page' : undefined}
              className={
                studio
                  ? 'rounded-[var(--radius)] bg-[var(--color-teal)] px-2.5 py-1.5 text-xs font-medium text-white sm:px-3 sm:text-sm'
                  : 'rounded-[var(--radius)] border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 sm:px-3 sm:text-sm'
              }
              title="Studio SQL"
            >
              ⚙️ Studio SQL
            </button>
          </nav>
        </div>
      </header>

      <div
        className={
          studio
            ? 'mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6'
            : 'mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8'
        }
      >
        {studio ? (
          <SqlStudioPanel
            open
            layout="page"
            onClose={() => go('wizard')}
            benefitSessionOverrides={benefitSessionOverrides}
            onBenefitSessionOverridesChange={setBenefitSessionOverrides}
          />
        ) : (
          <ApdataFlowPanel
            open
            embedded
            onClose={() => undefined}
            onOpenAmbientes={() => setAmbientesOpen(true)}
            benefitSessionOverrides={benefitSessionOverrides}
            onBenefitSessionOverridesChange={setBenefitSessionOverrides}
            benefitSlotAmounts={benefitSlotAmounts}
            onBenefitSlotAmountsChange={setBenefitSlotAmounts}
          />
        )}
      </div>

      <AmbientesPanel
        open={ambientesOpen}
        onClose={() => setAmbientesOpen(false)}
      />
    </div>
  )
}
