/**
 * Session scenario basket — keep "atual" + each proposed simulation
 * for multi-row comparison (folha, VR, VT, HC). Persisted in localStorage.
 */

import { formatShiftRange } from './schedule-suggest'
import type { ScenarioId, SimulationResult } from './types'

export const SCENARIO_BASKET_STORAGE_KEY = 'projeto6x1.scenarioBasket.v1'
export const SCENARIO_BASKET_SCHEMA_VERSION = 'scenario-basket-v1'

/** Slim metrics shown as one table row. */
export interface ScenarioRowMetrics {
  scale: string
  scheduleHint: string | null
  headcount: number
  payrollMonthly: number
  vrMonthly: number | null
  vtMonthly: number | null
  uncoveredHoursPerWeek: number
  estimatedCharges: number
}

export interface ScenarioDeltas {
  headcount: number
  payrollMonthly: number
  vrMonthly: number | null
  vtMonthly: number | null
  uncoveredHoursPerWeek: number
  estimatedCharges: number
}

export interface ScenarioBasketCurrent {
  title: string
  eyebrow: string
  metrics: ScenarioRowMetrics
}

export interface ScenarioBasketProposed {
  scenarioId: ScenarioId
  label: string
  ruleVersionId: string
  summary: string
  simulatedAt: string
  metrics: ScenarioRowMetrics
  deltas: ScenarioDeltas
}

export interface ScenarioBasket {
  schemaVersion: string
  updatedAt: string
  /** Hash of baseline inputs; when it changes, proposed deltas are recomputed. */
  inputFingerprint: string
  current: ScenarioBasketCurrent
  proposed: ScenarioBasketProposed[]
  bestScenarioId: ScenarioId | null
  activeScenarioId: ScenarioId | null
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function newIso(): string {
  return new Date().toISOString()
}

/** Stable fingerprint of the client baseline (not the proposed scenario). */
export function fingerprintBaseline(result: SimulationResult): string {
  const { input } = result
  const oh = input.operatingHours
  const payrollLen = input.payrollRows?.length ?? 0
  return [
    input.sector,
    input.headcount,
    input.currentScale.trim().toLowerCase(),
    input.averageMonthlySalary,
    input.units,
    input.shiftsPerDay,
    oh.default.openHour,
    oh.default.closeHour,
    oh.default.closed ? 1 : 0,
    payrollLen,
  ].join('|')
}

function scheduleHintFrom(result: SimulationResult): string | null {
  const top = result.scheduleSuggestions[0]
  if (!top) return null
  return `Sugestão: ${top.label} · ${top.shifts
    .map((s) => `${s.label} ${formatShiftRange(s)}`)
    .join(', ')}`
}

export function metricsFromCurrentSide(
  result: SimulationResult,
): ScenarioRowMetrics {
  const { input, cost, coverage, vr, vt } = result
  return {
    scale: input.currentScale,
    scheduleHint: null,
    headcount: coverage.currentHeadcount,
    payrollMonthly: cost.baselineMonthlyPayroll,
    vrMonthly: vr?.currentMonthly ?? null,
    vtMonthly: vt?.currentMonthly ?? null,
    uncoveredHoursPerWeek: 0,
    estimatedCharges: 0,
  }
}

export function metricsFromProposedSide(
  result: SimulationResult,
): ScenarioRowMetrics {
  const { ruleVersion, cost, coverage, vr, vt, input } = result
  const scale = ruleVersion.params.preserveCurrentScale
    ? input.currentScale
    : ruleVersion.params.targetScale.label
  return {
    scale,
    scheduleHint: scheduleHintFrom(result),
    headcount: coverage.requiredHeadcount,
    payrollMonthly: cost.projectedMonthlyPayroll,
    vrMonthly: vr?.proposedMonthly ?? null,
    vtMonthly: vt?.proposedMonthly ?? null,
    uncoveredHoursPerWeek: coverage.uncoveredShiftHoursPerWeek,
    estimatedCharges: cost.estimatedMonthlyCharges,
  }
}

export function computeDeltas(
  current: ScenarioRowMetrics,
  proposed: ScenarioRowMetrics,
): ScenarioDeltas {
  return {
    headcount: proposed.headcount - current.headcount,
    payrollMonthly: proposed.payrollMonthly - current.payrollMonthly,
    vrMonthly:
      proposed.vrMonthly != null && current.vrMonthly != null
        ? proposed.vrMonthly - current.vrMonthly
        : proposed.vrMonthly != null
          ? proposed.vrMonthly
          : current.vrMonthly != null
            ? -current.vrMonthly
            : null,
    vtMonthly:
      proposed.vtMonthly != null && current.vtMonthly != null
        ? proposed.vtMonthly - current.vtMonthly
        : proposed.vtMonthly != null
          ? proposed.vtMonthly
          : current.vtMonthly != null
            ? -current.vtMonthly
            : null,
    uncoveredHoursPerWeek:
      proposed.uncoveredHoursPerWeek - current.uncoveredHoursPerWeek,
    estimatedCharges: proposed.estimatedCharges - current.estimatedCharges,
  }
}

function emptyBasket(): ScenarioBasket | null {
  return null
}

function isBasket(v: unknown): v is ScenarioBasket {
  if (!v || typeof v !== 'object') return false
  const b = v as ScenarioBasket
  return (
    b.schemaVersion === SCENARIO_BASKET_SCHEMA_VERSION &&
    b.current != null &&
    Array.isArray(b.proposed)
  )
}

export function loadScenarioBasket(): ScenarioBasket | null {
  if (!canUseStorage()) return emptyBasket()
  try {
    const raw = localStorage.getItem(SCENARIO_BASKET_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isBasket(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveScenarioBasket(basket: ScenarioBasket): ScenarioBasket {
  if (canUseStorage()) {
    localStorage.setItem(SCENARIO_BASKET_STORAGE_KEY, JSON.stringify(basket))
  }
  return basket
}

export function clearScenarioBasket(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(SCENARIO_BASKET_STORAGE_KEY)
}

/**
 * Upsert a finished simulation into the session basket.
 * - Always refreshes the "atual" row from this run's baseline.
 * - status_quo only refreshes atual (not added as proposed).
 * - Other scenarios are added/updated in run order; deltas recomputed vs atual.
 */
export function upsertSimulationInBasket(
  result: SimulationResult,
  previous: ScenarioBasket | null = loadScenarioBasket(),
): ScenarioBasket {
  const fingerprint = fingerprintBaseline(result)
  const currentMetrics = metricsFromCurrentSide(result)
  const current: ScenarioBasketCurrent = {
    eyebrow: 'Cenário atual',
    title: 'Status quo (escala informada)',
    metrics: currentMetrics,
  }

  const scenarioId = result.input.scenarioId
  const now = newIso()

  let proposed: ScenarioBasketProposed[] = previous?.proposed
    ? [...previous.proposed]
    : []

  // If baseline inputs changed, keep proposed rows but recompute deltas later.
  // Drop best if the chosen scenario is no longer present after upsert.

  if (scenarioId !== 'status_quo') {
    const proposedMetrics = metricsFromProposedSide(result)
    const entry: ScenarioBasketProposed = {
      scenarioId,
      label: result.ruleVersion.label,
      ruleVersionId: result.ruleVersion.id,
      summary: result.ruleVersion.summary,
      simulatedAt: now,
      metrics: proposedMetrics,
      deltas: computeDeltas(currentMetrics, proposedMetrics),
    }
    const idx = proposed.findIndex((p) => p.scenarioId === scenarioId)
    if (idx >= 0) {
      // Preserve first-seen order; refresh metrics/timestamp.
      proposed[idx] = { ...entry, simulatedAt: now }
    } else {
      proposed.push(entry)
    }
  }

  // Recompute all deltas against the refreshed atual.
  proposed = proposed.map((p) => ({
    ...p,
    deltas: computeDeltas(currentMetrics, p.metrics),
  }))

  let bestScenarioId = previous?.bestScenarioId ?? null
  if (
    bestScenarioId &&
    !proposed.some((p) => p.scenarioId === bestScenarioId)
  ) {
    bestScenarioId = null
  }

  const basket: ScenarioBasket = {
    schemaVersion: SCENARIO_BASKET_SCHEMA_VERSION,
    updatedAt: now,
    inputFingerprint: fingerprint,
    current,
    proposed,
    bestScenarioId,
    activeScenarioId: scenarioId,
  }

  return saveScenarioBasket(basket)
}

export function setBestScenario(
  scenarioId: ScenarioId | null,
  previous: ScenarioBasket | null = loadScenarioBasket(),
): ScenarioBasket | null {
  if (!previous) return null
  if (
    scenarioId != null &&
    !previous.proposed.some((p) => p.scenarioId === scenarioId)
  ) {
    return previous
  }
  const next: ScenarioBasket = {
    ...previous,
    bestScenarioId: scenarioId,
    updatedAt: newIso(),
  }
  return saveScenarioBasket(next)
}

export function removeProposedScenario(
  scenarioId: ScenarioId,
  previous: ScenarioBasket | null = loadScenarioBasket(),
): ScenarioBasket | null {
  if (!previous) return null
  const proposed = previous.proposed.filter((p) => p.scenarioId !== scenarioId)
  const next: ScenarioBasket = {
    ...previous,
    proposed,
    bestScenarioId:
      previous.bestScenarioId === scenarioId ? null : previous.bestScenarioId,
    updatedAt: newIso(),
  }
  return saveScenarioBasket(next)
}
