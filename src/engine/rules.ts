import type {
  RuleVersion,
  ScaleCycle,
  ScenarioId,
  SectorCalibration,
  SectorId,
} from './types'

/** Build a scale cycle and derive workRatio. */
export function makeScale(workDays: number, restDays: number): ScaleCycle {
  const cycle = workDays + restDays
  if (cycle <= 0 || workDays < 0 || restDays < 0) {
    throw new Error(`Invalid scale: ${workDays}x${restDays}`)
  }
  return {
    workDays,
    restDays,
    workRatio: workDays / cycle,
    label: `${workDays}×${restDays}`,
  }
}

/**
 * Versioned scenario parameters (data, not hard-coded in formulas).
 *
 * These are TRANSPARENT HEURISTICS for consulting simulations — not the
 * literal PEC text, not a legal opinion, and not calibrated to a specific
 * client's CCT/acordo coletivo. See docs/engine-assumptions.md.
 */
export const RULE_VERSIONS: Record<ScenarioId, RuleVersion> = {
  status_quo: {
    id: 'rules-status-quo-v1',
    label: 'Status quo (escala atual)',
    summary:
      'Mantém a escala informada pelo cliente. Útil como baseline: delta de ' +
      'folha e headcount adicional tendem a zero (salvo arredondamentos).',
    effectiveAsOf: '2026-01-01',
    params: {
      scenarioId: 'status_quo',
      // Placeholder target; simulate() replaces with parsed current scale.
      targetScale: makeScale(6, 1),
      preserveCurrentScale: true,
      coverageBuffer: 0,
      projectedChargeFactor: 1,
      hoursPerShift: 8,
    },
  },
  pec_draft_conservative: {
    id: 'rules-pec-draft-conservative-v1',
    label: 'PEC rascunho — conservador',
    summary:
      'Hipótese conservadora: migração estimada para escala 5×2, buffer de ' +
      'cobertura de 5% e encargos projetados leves (+8% sobre a massa ' +
      'salarial projetada). Não é o texto oficial da PEC.',
    effectiveAsOf: '2026-draft',
    params: {
      scenarioId: 'pec_draft_conservative',
      targetScale: makeScale(5, 2),
      preserveCurrentScale: false,
      coverageBuffer: 0.05,
      projectedChargeFactor: 1.08,
      hoursPerShift: 8,
    },
  },
  pec_draft_aggressive: {
    id: 'rules-pec-draft-aggressive-v1',
    label: 'PEC rascunho — agressivo',
    summary:
      'Hipótese mais agressiva: migração estimada para escala 4×3 (mais ' +
      'folgas), buffer de cobertura de 12% e encargos projetados maiores ' +
      '(+15%). Destinado a stress-test de custo — não é previsão jurídica.',
    effectiveAsOf: '2026-draft',
    params: {
      scenarioId: 'pec_draft_aggressive',
      targetScale: makeScale(4, 3),
      preserveCurrentScale: false,
      coverageBuffer: 0.12,
      projectedChargeFactor: 1.15,
      hoursPerShift: 8,
    },
  },
}

/**
 * Sector friction on staffing after the scale factor.
 * Hospital continuous ops get a small premium; varejo is baseline.
 * Construcao/locacao are placeholders until those templates ship.
 */
export const SECTOR_CALIBRATION: Record<SectorId, SectorCalibration> = {
  varejo: {
    sector: 'varejo',
    staffingFriction: 1.0,
    note: 'Rede de lojas: sem atrito extra além do buffer do cenário.',
  },
  hospital: {
    sector: 'hospital',
    staffingFriction: 1.06,
    note: 'Operação contínua / cargos críticos: +6% atrito de escala (estimativa).',
  },
  construcao: {
    sector: 'construcao',
    staffingFriction: 1.04,
    note: 'Placeholder até template de construção — +4% atrito.',
  },
  locacao: {
    sector: 'locacao',
    staffingFriction: 1.03,
    note: 'Placeholder até template de locação — +3% atrito.',
  },
}

export const DEFAULT_DISCLAIMER =
  'Este relatório é uma simulação estimativa para apoio a consultoria. ' +
  'Não constitui parecer jurídico, cálculo oficial de folha nem previsão de ' +
  'todas as mudanças operacionais. Os cenários “PEC rascunho” são hipóteses ' +
  'transparentes (escala-alvo, buffer, encargos), não o texto legal aprovado. ' +
  'Valide hipóteses e regras com assessoria jurídica e RH.'

export function getRuleVersion(scenarioId: ScenarioId): RuleVersion {
  return RULE_VERSIONS[scenarioId]
}

export function getSectorCalibration(sector: SectorId): SectorCalibration {
  return SECTOR_CALIBRATION[sector]
}

export function listScenarios(): RuleVersion[] {
  return (Object.keys(RULE_VERSIONS) as ScenarioId[]).map(
    (id) => RULE_VERSIONS[id],
  )
}
