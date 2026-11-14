/**
 * Export simulation → Gerador AHR JSON (SPEC-V2 handoff schema).
 * LGPD: no names/CPF/PII — aggregates only.
 */

import type { SimulationResult } from '../engine'
import type { EstrategiaAbsorcao, RegimeFuncionamento, TaxRegime } from '../types'

export const AHR_HANDOFF_SCHEMA_VERSION = 'turnocheck-ahr-handoff-v1'

export interface AhrHandoffPayload {
  schemaVersion: typeof AHR_HANDOFF_SCHEMA_VERSION
  exportedAt: string
  product: 'Turnocheck'
  scenario: {
    id: string
    label: string
    ruleVersionId: string
    salaryDivisor: number
    weeklyHoursCap: number
    targetScale: string
  }
  sector: string
  taxRegime: TaxRegime
  estrategiaAbsorcao: EstrategiaAbsorcao
  regimeFuncionamento: RegimeFuncionamento
  coverage: {
    currentHeadcount: number
    requiredHeadcount: number
    additionalHeadcount: number
    headcountFactor: number
    uncoveredShiftHoursPerWeek: number
  }
  cost: {
    baselineMonthlyPayroll: number
    projectedMonthlyPayroll: number
    monthlyDelta: number
    annualDelta: number
    estimatedMonthlyCharges: number
  }
  charges: SimulationResult['charges']
  absorption: SimulationResult['absorption']
  heCascade: SimulationResult['heCascade']
  heCapBadge: {
    capped: boolean
    hoursUsed: number
    capHours: number
    estrategia: EstrategiaAbsorcao
  }
  distribuicaoTurmas: SimulationResult['distribuicaoTurmas']
  byCostCenter: Array<{
    centroCusto: string
    currentHeadcount: number
    requiredHeadcount: number
    additionalHeadcount: number
    payrollMonthlyDelta: number
    regimeFuncionamento?: RegimeFuncionamento
    turmas?: {
      crewCount: number
      dailyCoverageNeed: number
      totalHeadcount: number
      note: string
    }
  }>
  benefits: {
    vr: SimulationResult['vr']
    vt: SimulationResult['vt']
  }
  disclaimer: string
}

/** Build Gerador AHR handoff JSON from a simulation result. */
export function buildAhrHandoff(result: SimulationResult): AhrHandoffPayload {
  const { input, ruleVersion, coverage, cost, absorption, heCascade } = result
  const taxRegime =
    input.defaultTaxRegime ??
    result.charges.taxRegime
  const estrategia =
    input.estrategiaAbsorcao ?? absorption.estrategia
  const regime =
    input.defaultRegimeFuncionamento ??
    result.distribuicaoTurmas.regime

  return {
    schemaVersion: AHR_HANDOFF_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    product: 'Turnocheck',
    scenario: {
      id: ruleVersion.params.scenarioId,
      label: ruleVersion.label,
      ruleVersionId: ruleVersion.id,
      salaryDivisor: ruleVersion.params.salaryDivisor,
      weeklyHoursCap: ruleVersion.params.weeklyHoursCap,
      targetScale: ruleVersion.params.targetScale.label,
    },
    sector: input.sector,
    taxRegime,
    estrategiaAbsorcao: estrategia,
    regimeFuncionamento: regime,
    coverage: {
      currentHeadcount: coverage.currentHeadcount,
      requiredHeadcount: coverage.requiredHeadcount,
      additionalHeadcount: coverage.additionalHeadcount,
      headcountFactor: coverage.headcountFactor,
      uncoveredShiftHoursPerWeek: coverage.uncoveredShiftHoursPerWeek,
    },
    cost: {
      baselineMonthlyPayroll: cost.baselineMonthlyPayroll,
      projectedMonthlyPayroll: cost.projectedMonthlyPayroll,
      monthlyDelta: cost.monthlyDelta,
      annualDelta: cost.annualDelta,
      estimatedMonthlyCharges: cost.estimatedMonthlyCharges,
    },
    charges: result.charges,
    absorption,
    heCascade,
    heCapBadge: {
      capped: absorption.heCapReached,
      hoursUsed: absorption.heHoursUsed,
      capHours: absorption.heCapHours,
      estrategia: absorption.estrategia,
    },
    distribuicaoTurmas: result.distribuicaoTurmas,
    byCostCenter: result.byCostCenter.map((c) => ({
      centroCusto: c.centroCusto,
      currentHeadcount: c.currentHeadcount,
      requiredHeadcount: c.requiredHeadcount,
      additionalHeadcount: c.additionalHeadcount,
      payrollMonthlyDelta: c.payrollMonthlyDelta,
      regimeFuncionamento: c.regimeFuncionamento,
      turmas: c.distribuicaoTurmas
        ? {
            crewCount: c.distribuicaoTurmas.crewCount,
            dailyCoverageNeed: c.distribuicaoTurmas.dailyCoverageNeed,
            totalHeadcount: c.distribuicaoTurmas.totalHeadcount,
            note: c.distribuicaoTurmas.note,
          }
        : undefined,
    })),
    benefits: {
      vr: result.vr,
      vt: result.vt,
    },
    disclaimer: result.disclaimer,
  }
}

/** Trigger browser download of the AHR handoff JSON. */
export function downloadAhrHandoff(result: SimulationResult): void {
  const payload = buildAhrHandoff(result)
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `turnocheck-ahr-handoff-${payload.scenario.id}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
