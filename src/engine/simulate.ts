import {
  cascadeHeOnDivisor,
  planAbsorption,
} from './absorption'
import { computeChargeBreakdown } from './charges'
import {
  distributeCrews,
  resolveRegime,
} from './crew-distribution'
import {
  aggregateByCostCenter,
  estimateWorkDaysPerMonth,
  type PayrollRow,
} from './payroll'
import {
  DEFAULT_DISCLAIMER,
  getRuleVersion,
  getSectorCalibration,
  normalizeScenarioId,
} from './rules'
import {
  type CostCenterDemand,
  suggestSchedulesFromSimulation,
} from './schedule-suggest'
import { parseScale } from './scale'
import type {
  BenefitDelta,
  CostCenterResult,
  ResultLineItem,
  ScaleCycle,
  SimulationInput,
  SimulationResult,
} from './types'
import {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_TAX_REGIME,
  type TaxRegime,
} from '../types'

/**
 * Core simulation: map wizard inputs (+ optional payroll import) →
 * explainable cost / coverage / VR-VT results.
 *
 * Model (heuristic — see docs/engine-assumptions.md + docs/import-layout.md):
 *
 * 1. Parse current scale → workRatio_current
 * 2. Resolve target scale from scenario (or preserve current for status quo)
 * 3. headcountFactor = workRatio_current / workRatio_target × buffer × friction
 * 4. Gap absorption via estrategia (contratação / HE cap / híbrido)
 * 5. Folha + encargos por regime tributário CNPJ + provisões 13º/férias
 * 6. HE cascade when salary divisor drops (220→210/200/180)
 * 7. VR/VT + crew distribution by regime_funcionamento
 */
export function simulate(input: SimulationInput): SimulationResult {
  const scenarioId = normalizeScenarioId(input.scenarioId)
  const ruleVersion = getRuleVersion(scenarioId)
  const params = ruleVersion.params
  const sector = getSectorCalibration(input.sector)

  const payrollRows = input.payrollRows?.length ? input.payrollRows : null
  const usedPayrollImport = payrollRows !== null

  const wizardScale = parseScale(input.currentScale)
  const defaultTargetScale = params.preserveCurrentScale
    ? wizardScale
    : params.targetScale

  let headcount = input.headcount
  let averageMonthlySalary = input.averageMonthlySalary
  let baselineFromImport = 0
  let heHoursExisting = 0

  if (payrollRows) {
    headcount = payrollRows.reduce((s, r) => s + r.quantidade, 0)
    baselineFromImport = payrollRows.reduce(
      (s, r) => s + r.salario * r.quantidade,
      0,
    )
    averageMonthlySalary =
      headcount > 0 ? baselineFromImport / headcount : input.averageMonthlySalary
    heHoursExisting = payrollRows.reduce(
      (s, r) => s + (r.heMediaMensalHoras || 0) * r.quantidade,
      0,
    )
  }

  const effectiveInput: SimulationInput = {
    ...input,
    scenarioId,
    headcount,
    averageMonthlySalary,
    payrollRows: payrollRows ?? undefined,
  }

  const currentScale = wizardScale
  const targetScale = defaultTargetScale

  const currentWorkRatio = currentScale.workRatio
  const targetWorkRatio = targetScale.workRatio

  const safeTargetRatio = targetWorkRatio > 0 ? targetWorkRatio : currentWorkRatio
  const scaleFactor =
    safeTargetRatio > 0 ? currentWorkRatio / safeTargetRatio : 1

  const bufferMultiplier = 1 + params.coverageBuffer
  const headcountFactor =
    scaleFactor * bufferMultiplier * sector.staffingFriction

  const requiredIdeal = Math.max(
    headcount,
    Math.ceil(headcount * headcountFactor),
  )
  const gapHeadcount = params.preserveCurrentScale
    ? 0
    : Math.max(0, requiredIdeal - headcount)

  const estrategia =
    input.estrategiaAbsorcao ?? DEFAULT_ESTRATEGIA_ABSORCAO

  const absorption = planAbsorption({
    estrategia,
    currentHeadcount: headcount,
    gapHeadcount,
    averageMonthlySalary,
    scenarioDivisor: params.salaryDivisor,
    heMediaMensalHoras: heHoursExisting,
  })

  const additionalHeadcount = absorption.effectiveAdditionalHeadcount
  const effectiveRequired = headcount + additionalHeadcount

  const heCascade = cascadeHeOnDivisor({
    averageMonthlySalary,
    heHoursExisting,
    scenarioDivisor: params.salaryDivisor,
  })

  const baselineMonthlyPayroll = roundMoney(
    usedPayrollImport
      ? baselineFromImport
      : headcount * averageMonthlySalary,
  )
  const projectedSalaryMass = roundMoney(
    effectiveRequired * averageMonthlySalary,
  )

  const taxRegime = resolveInputTaxRegime(input, payrollRows)
  const charges = computeChargeBreakdown({
    projectedSalaryMass,
    baselineSalaryMass: baselineMonthlyPayroll,
    additionalHeadcount,
    requiredHeadcount: effectiveRequired,
    taxRegime,
  })

  // Prefer tax+provisions path; fall back to legacy flat factor when status_quo
  // and charges would still apply — always add charge breakdown for transparency.
  const projectedMonthlyPayroll = roundMoney(
    projectedSalaryMass +
      charges.totalMonthlyExtras +
      heCascade.heCostDelta +
      absorption.heAbsorptionCost,
  )
  const estimatedMonthlyCharges = roundMoney(
    projectedMonthlyPayroll - projectedSalaryMass,
  )
  const monthlyDelta = roundMoney(
    projectedMonthlyPayroll - baselineMonthlyPayroll,
  )
  const annualDelta = roundMoney(monthlyDelta * 12)

  const uncoveredShiftHoursPerWeek =
    Math.max(0, gapHeadcount - additionalHeadcount) *
    targetScale.workDays *
    params.hoursPerShift

  const postsPerDay = input.units * input.shiftsPerDay
  const personDaysCurrent = headcount * currentScale.workDays
  const personDaysNeededForPosts =
    postsPerDay * (currentScale.workDays + currentScale.restDays)

  const proposedDaysPerMonth = estimateWorkDaysPerMonth(targetScale)

  const defaultRegime = resolveRegime(
    input.defaultRegimeFuncionamento ??
      payrollRows?.find((r) => r.regimeFuncionamento)?.regimeFuncionamento,
  )
  const distribuicaoTurmas = distributeCrews(defaultRegime, effectiveRequired)

  let byCostCenter: CostCenterResult[] = []
  let vr: BenefitDelta | null = null
  let vt: BenefitDelta | null = null

  if (payrollRows) {
    const resolved = buildCostCenterResults(
      payrollRows,
      (row) =>
        row.escalaAtual ? parseScale(row.escalaAtual) : currentScale,
      targetScale,
      headcountFactor,
      params.preserveCurrentScale,
      proposedDaysPerMonth,
      input,
      params.salaryDivisor,
      estrategia,
    )
    byCostCenter = resolved.centers
    vr = resolved.vr
    vt = resolved.vt
  }

  const lineItems: ResultLineItem[] = [
    {
      id: 'scale-current',
      category: 'assumption',
      label: 'Escala atual (parseada)',
      amount: currentWorkRatio,
      unit: 'ratio',
      detail: `${currentScale.label} → razão de dias trabalhados ${formatRatio(currentWorkRatio)}.`,
    },
    {
      id: 'scale-target',
      category: 'assumption',
      label: 'Escala-alvo do cenário',
      amount: targetWorkRatio,
      unit: 'ratio',
      detail: params.preserveCurrentScale
        ? `Status quo: alvo = escala atual (${targetScale.label}).`
        : `${targetScale.label} → razão ${formatRatio(targetWorkRatio)} (hipótese do cenário, não texto legal).`,
    },
    {
      id: 'divisor-salario',
      category: 'assumption',
      label: 'Divisor salarial do cenário',
      amount: params.salaryDivisor,
      unit: 'none',
      detail: `Teto semanal modelado ${params.weeklyHoursCap}h; cascata de HE sobre divisor ${heCascade.baselineDivisor}→${params.salaryDivisor}.`,
    },
    {
      id: 'factor-scale',
      category: 'headcount',
      label: 'Fator de escala (razão atual ÷ alvo)',
      amount: scaleFactor,
      unit: 'factor',
      detail:
        'Mantém os mesmos person-days de cobertura ao reduzir a fração de dias trabalhados por pessoa.',
    },
    {
      id: 'factor-buffer',
      category: 'headcount',
      label: 'Buffer de cobertura',
      amount: params.coverageBuffer,
      unit: 'factor',
      detail: `${pct(params.coverageBuffer)} sobre o headcount após o fator de escala (folgas/atritos de escala).`,
    },
    {
      id: 'factor-sector',
      category: 'assumption',
      label: 'Atrito setorial',
      amount: sector.staffingFriction,
      unit: 'factor',
      detail: sector.note,
    },
    {
      id: 'hc-required',
      category: 'headcount',
      label: 'Headcount requerido (estimado)',
      amount: effectiveRequired,
      unit: 'people',
      detail: `Gap ideal ${gapHeadcount}; estratégia ${estrategia} → hires/intermitente ${additionalHeadcount}.`,
    },
    {
      id: 'hc-additional',
      category: 'headcount',
      label: 'Headcount adicional estimado',
      amount: additionalHeadcount,
      unit: 'people',
      detail: usedPayrollImport
        ? `Diferença efetiva após absorção vs Σ quantidade da folha (${headcount}).`
        : 'Diferença efetiva após estratégia de absorção.',
    },
    {
      id: 'he-cap',
      category: 'coverage',
      label: 'Horas extras usadas na absorção',
      amount: absorption.heHoursUsed,
      unit: 'none',
      detail: absorption.heCapReached
        ? `Teto legal simulado ${absorption.heCapHours} h/mês atingido — residual vira contratação/intermitente.`
        : `Capacidade HE ${absorption.heCapHours} h/mês (44h × HC atual).`,
    },
    {
      id: 'payroll-baseline',
      category: 'payroll',
      label: 'Folha mensal baseline (salários)',
      amount: baselineMonthlyPayroll,
      unit: 'BRL_month',
      detail: usedPayrollImport
        ? `Σ(salario × quantidade) da folha importada — ${payrollRows!.length} linha(s), ${headcount} pessoas.`
        : `${headcount} × R$ ${averageMonthlySalary.toLocaleString('pt-BR')} (sem encargos).`,
    },
    {
      id: 'payroll-projected',
      category: 'payroll',
      label: 'Folha mensal projetada',
      amount: projectedMonthlyPayroll,
      unit: 'BRL_month',
      detail: `Massa salarial + encargos ${charges.taxRegime} (${pct(charges.employerChargeRate)}) + provisões + HE/divisor.`,
    },
    {
      id: 'payroll-charges',
      category: 'payroll',
      label: 'Encargos estimados na projeção',
      amount: estimatedMonthlyCharges,
      unit: 'BRL_month',
      detail:
        'Encargos patronais por CNPJ + férias/13º + onboarding amortizado + Δ HE por divisor — estimativa, não memória de cálculo.',
    },
    {
      id: 'payroll-delta-month',
      category: 'payroll',
      label: 'Delta mensal de folha',
      amount: monthlyDelta,
      unit: 'BRL_month',
      detail: 'Projetada − baseline.',
    },
    {
      id: 'payroll-delta-year',
      category: 'payroll',
      label: 'Delta anual de folha',
      amount: annualDelta,
      unit: 'BRL_year',
      detail: 'Delta mensal × 12 (sem sazonalidade nem dissídio).',
    },
  ]

  if (vr) {
    lineItems.push(
      {
        id: 'vr-current',
        category: 'benefits',
        label: 'VR mensal atual',
        amount: vr.currentMonthly,
        unit: 'BRL_month',
        detail:
          'Σ(vr_valor_dia × vr_dias_mes_atual × quantidade). Dias vazios → estimativa 30 × razão da escala.',
      },
      {
        id: 'vr-proposed',
        category: 'benefits',
        label: 'VR mensal proposto',
        amount: vr.proposedMonthly,
        unit: 'BRL_month',
        detail: `valor_dia × ~${vr.proposedDaysPerMonth} dias (escala-alvo) × qty; HC adicional herda média do centro.`,
      },
      {
        id: 'vr-delta-month',
        category: 'benefits',
        label: 'Delta mensal VR',
        amount: vr.monthlyDelta,
        unit: 'BRL_month',
        detail: 'Proposto − atual.',
      },
    )
  }

  if (vt) {
    lineItems.push(
      {
        id: 'vt-current',
        category: 'benefits',
        label: 'VT mensal atual',
        amount: vt.currentMonthly,
        unit: 'BRL_month',
        detail:
          'Σ(vt_valor_dia × vt_dias_mes_atual × quantidade). Dias vazios → estimativa 30 × razão da escala.',
      },
      {
        id: 'vt-proposed',
        category: 'benefits',
        label: 'VT mensal proposto',
        amount: vt.proposedMonthly,
        unit: 'BRL_month',
        detail: `valor_dia × ~${vt.proposedDaysPerMonth} dias (escala-alvo) × qty; HC adicional herda média do centro.`,
      },
      {
        id: 'vt-delta-month',
        category: 'benefits',
        label: 'Delta mensal VT',
        amount: vt.monthlyDelta,
        unit: 'BRL_month',
        detail: 'Proposto − atual.',
      },
    )
  }

  lineItems.push(
    {
      id: 'coverage-hours',
      category: 'coverage',
      label: 'Horas/semana descobertas se não contratar',
      amount: uncoveredShiftHoursPerWeek,
      unit: 'hours_week',
      detail: `gap residual × ${targetScale.workDays} dias-alvo × ${params.hoursPerShift}h/turno.`,
    },
    {
      id: 'capacity-check',
      category: 'coverage',
      label: 'Checagem leve unidades × turnos',
      amount: postsPerDay,
      unit: 'none',
      detail:
        `Postos/dia ≈ ${postsPerDay} (unidades × turnos). Person-days/semana atuais ≈ ${round1(personDaysCurrent)}; ` +
        `demanda bruta 7d nos postos ≈ ${round1(personDaysNeededForPosts)}. ` +
        'Informativo — não altera o HC requerido nesta versão.',
    },
  )

  const explanationIds = [
    'scale-current',
    'scale-target',
    'hc-additional',
    'payroll-delta-month',
    'vr-delta-month',
    'vt-delta-month',
    'coverage-hours',
    'he-cap',
  ]

  const explanations = [
    `Regra ${ruleVersion.id}: ${ruleVersion.label}.`,
    ...(usedPayrollImport
      ? [
          `Folha importada: ${payrollRows!.length} linha(s), ${headcount} pessoas, ${byCostCenter.length} centro(s) de custo.`,
        ]
      : []),
    ...lineItems
      .filter((l) => explanationIds.includes(l.id))
      .map((l) => formatExplanation(l)),
    ruleVersion.summary,
  ]

  const scheduleDemands: CostCenterDemand[] | undefined = byCostCenter.length
    ? byCostCenter.map((c) => {
        const avgSalary =
          c.currentHeadcount > 0
            ? c.baselinePayroll / c.currentHeadcount
            : averageMonthlySalary
        const currentDays = estimateWorkDaysPerMonth(currentScale)
        const avgVr =
          c.vr.currentMonthly > 0 && c.currentHeadcount > 0 && currentDays > 0
            ? c.vr.currentMonthly / (c.currentHeadcount * currentDays)
            : null
        const avgVt =
          c.vt.currentMonthly > 0 && c.currentHeadcount > 0 && currentDays > 0
            ? c.vt.currentMonthly / (c.currentHeadcount * currentDays)
            : null
        return {
          centroCusto: c.centroCusto,
          headcount: c.currentHeadcount,
          averageMonthlySalary: avgSalary,
          currentMonthlyPayroll: c.baselinePayroll,
          avgVrValorDia: avgVr,
          avgVtValorDia: avgVt,
          currentMonthlyVr: c.vr.currentMonthly > 0 ? c.vr.currentMonthly : null,
          currentMonthlyVt: c.vt.currentMonthly > 0 ? c.vt.currentMonthly : null,
        }
      })
    : undefined

  const schedule = suggestSchedulesFromSimulation(effectiveInput, {
    projectedChargeFactor: params.projectedChargeFactor,
    coverageBuffer: params.coverageBuffer,
    costCenters: scheduleDemands,
  })

  return {
    input: effectiveInput,
    ruleVersion,
    cost: {
      baselineMonthlyPayroll,
      projectedMonthlyPayroll,
      monthlyDelta,
      annualDelta,
      estimatedMonthlyCharges,
    },
    coverage: {
      requiredHeadcount: effectiveRequired,
      currentHeadcount: headcount,
      additionalHeadcount,
      uncoveredShiftHoursPerWeek,
      currentWorkRatio,
      targetWorkRatio,
      headcountFactor,
    },
    vr,
    vt,
    byCostCenter,
    usedPayrollImport,
    scheduleSuggestions: schedule.suggestions,
    excludedScheduleNotice: schedule.excludedNotice,
    scheduleSuggestionDisclaimer: schedule.disclaimer,
    lineItems,
    explanations,
    disclaimer: DEFAULT_DISCLAIMER,
    isStub: false,
    charges,
    absorption,
    heCascade,
    distribuicaoTurmas,
  }
}

function resolveInputTaxRegime(
  input: SimulationInput,
  payrollRows: PayrollRow[] | null,
): TaxRegime {
  if (input.defaultTaxRegime) return input.defaultTaxRegime
  if (input.taxRegimeByCnpj && payrollRows) {
    for (const row of payrollRows) {
      const key = row.cnpjCompleto?.replace(/\D/g, '')
      if (key && input.taxRegimeByCnpj[key]) {
        return input.taxRegimeByCnpj[key]
      }
      if (row.cnpjCompleto && input.taxRegimeByCnpj[row.cnpjCompleto]) {
        return input.taxRegimeByCnpj[row.cnpjCompleto]
      }
    }
  }
  return DEFAULT_TAX_REGIME
}

function buildCostCenterResults(
  rows: PayrollRow[],
  resolveScale: (row: PayrollRow) => ScaleCycle,
  targetScale: ScaleCycle,
  headcountFactor: number,
  preserveCurrentScale: boolean,
  proposedDaysPerMonth: number,
  input: SimulationInput,
  salaryDivisor: number,
  estrategia: SimulationInput['estrategiaAbsorcao'],
): {
  centers: CostCenterResult[]
  vr: BenefitDelta
  vt: BenefitDelta
} {
  const aggs = aggregateByCostCenter(rows, resolveScale, targetScale)

  const centers: CostCenterResult[] = aggs.map((agg) => {
    const requiredIdeal = Math.max(
      agg.headcount,
      Math.ceil(agg.headcount * headcountFactor),
    )
    const gap = preserveCurrentScale
      ? 0
      : Math.max(0, requiredIdeal - agg.headcount)
    const avgSalary = agg.headcount > 0 ? agg.salaryMass / agg.headcount : 0
    const plan = planAbsorption({
      estrategia: estrategia ?? DEFAULT_ESTRATEGIA_ABSORCAO,
      currentHeadcount: agg.headcount,
      gapHeadcount: gap,
      averageMonthlySalary: avgSalary,
      scenarioDivisor: salaryDivisor,
      heMediaMensalHoras: agg.heMediaMensalHoras * agg.headcount,
    })
    const additional = plan.effectiveAdditionalHeadcount
    const effectiveRequired = agg.headcount + additional

    const taxRegime = resolveCcTaxRegime(input, agg.cnpjCompleto)
    const salaryMass = roundMoney(effectiveRequired * avgSalary)
    const charges = computeChargeBreakdown({
      projectedSalaryMass: salaryMass,
      baselineSalaryMass: agg.baselinePayroll,
      additionalHeadcount: additional,
      requiredHeadcount: effectiveRequired,
      taxRegime,
    })
    const heCascade = cascadeHeOnDivisor({
      averageMonthlySalary: avgSalary,
      heHoursExisting: agg.heMediaMensalHoras * agg.headcount,
      scenarioDivisor: salaryDivisor,
    })
    const projectedPayroll = roundMoney(
      salaryMass +
        charges.totalMonthlyExtras +
        heCascade.heCostDelta +
        plan.heAbsorptionCost,
    )
    const baselinePayroll = roundMoney(agg.baselinePayroll)

    const vrProposedExisting = agg.vr.proposedMonthly
    const vrAdditional =
      additional > 0 && agg.avgVrValorDia > 0
        ? additional * agg.avgVrValorDia * proposedDaysPerMonth
        : 0
    const vrProposed = roundMoney(vrProposedExisting + vrAdditional)
    const vrCurrent = roundMoney(agg.vr.currentMonthly)

    const vtProposedExisting = agg.vt.proposedMonthly
    const vtAdditional =
      additional > 0 && agg.avgVtValorDia > 0
        ? additional * agg.avgVtValorDia * proposedDaysPerMonth
        : 0
    const vtProposed = roundMoney(vtProposedExisting + vtAdditional)
    const vtCurrent = roundMoney(agg.vt.currentMonthly)

    const regime = resolveRegime(
      input.regimeFuncionamentoByCc?.[agg.centroCusto] ??
        agg.regimeFuncionamento ??
        input.defaultRegimeFuncionamento,
    )
    const distribuicaoTurmas = distributeCrews(regime, effectiveRequired)

    return {
      centroCusto: agg.centroCusto,
      currentHeadcount: agg.headcount,
      requiredHeadcount: effectiveRequired,
      additionalHeadcount: additional,
      baselinePayroll,
      projectedPayroll,
      payrollMonthlyDelta: roundMoney(projectedPayroll - baselinePayroll),
      vr: makeBenefitDelta(vrCurrent, vrProposed, proposedDaysPerMonth),
      vt: makeBenefitDelta(vtCurrent, vtProposed, proposedDaysPerMonth),
      regimeFuncionamento: regime,
      distribuicaoTurmas,
    }
  })

  const vr = sumBenefits(
    centers.map((c) => c.vr),
    proposedDaysPerMonth,
  )
  const vt = sumBenefits(
    centers.map((c) => c.vt),
    proposedDaysPerMonth,
  )

  return { centers, vr, vt }
}

function resolveCcTaxRegime(
  input: SimulationInput,
  cnpj: string | null,
): TaxRegime {
  if (cnpj && input.taxRegimeByCnpj) {
    const digits = cnpj.replace(/\D/g, '')
    if (input.taxRegimeByCnpj[digits]) return input.taxRegimeByCnpj[digits]
    if (input.taxRegimeByCnpj[cnpj]) return input.taxRegimeByCnpj[cnpj]
  }
  return input.defaultTaxRegime ?? DEFAULT_TAX_REGIME
}

function makeBenefitDelta(
  currentMonthly: number,
  proposedMonthly: number,
  proposedDaysPerMonth: number,
): BenefitDelta {
  const monthlyDelta = roundMoney(proposedMonthly - currentMonthly)
  return {
    currentMonthly,
    proposedMonthly,
    monthlyDelta,
    annualDelta: roundMoney(monthlyDelta * 12),
    proposedDaysPerMonth,
  }
}

function sumBenefits(
  parts: BenefitDelta[],
  proposedDaysPerMonth: number,
): BenefitDelta {
  const current = roundMoney(parts.reduce((s, p) => s + p.currentMonthly, 0))
  const proposed = roundMoney(
    parts.reduce((s, p) => s + p.proposedMonthly, 0),
  )
  return makeBenefitDelta(current, proposed, proposedDaysPerMonth)
}

/** Keep BRL line items free of float dust (e.g. 50929.999999). */
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function formatRatio(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function formatFactor(n: number): string {
  return n.toFixed(3)
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

function round1(n: number): string {
  return n.toFixed(1)
}

function formatExplanation(item: ResultLineItem): string {
  const value =
    item.amount === null
      ? ''
      : item.unit === 'BRL_month' || item.unit === 'BRL_year'
        ? ` ${item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
        : item.unit === 'people'
          ? ` ${item.amount}`
          : item.unit === 'hours_week'
            ? ` ${item.amount.toFixed(0)} h`
            : item.unit === 'ratio'
              ? ` ${formatRatio(item.amount)}`
              : item.unit === 'factor'
                ? ` ${formatFactor(item.amount)}`
                : ` ${item.amount}`
  return `${item.label}:${value}. ${item.detail}`
}
