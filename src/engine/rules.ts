import type {
  LegacyScenarioId,
  RuleVersion,
  ScaleCycle,
  ScenarioId,
  SectorCalibration,
  SectorId,
} from './types'
import { SALARY_DIVISOR_BASELINE } from '../types'

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
 * Map legacy basket / UI IDs onto the v2 scenario set.
 * `pec_draft_conservative` → fase1; `pec_draft_aggressive` → stress 4×3.
 */
export function normalizeScenarioId(
  id: string,
): ScenarioId {
  if (id === 'pec_draft_conservative') return 'fase1_2026_42h'
  if (id === 'pec_draft_aggressive') return 'stress_test_4x3'
  if (
    id === 'status_quo' ||
    id === 'fase1_2026_42h' ||
    id === 'fase2_2027_40h' ||
    id === 'stress_test_4x3'
  ) {
    return id
  }
  return 'fase1_2026_42h'
}

export function isLegacyScenarioId(id: string): id is LegacyScenarioId {
  return id === 'pec_draft_conservative' || id === 'pec_draft_aggressive'
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
    id: 'rules-status-quo-v2',
    label: 'Status quo (escala atual)',
    summary:
      'Mantém a escala informada pelo cliente e o divisor salarial 220. ' +
      'Útil como baseline: delta de folha e headcount adicional tendem a zero ' +
      '(salvo arredondamentos e provisões configuradas).',
    effectiveAsOf: '2026-01-01',
    params: {
      scenarioId: 'status_quo',
      targetScale: makeScale(6, 1),
      preserveCurrentScale: true,
      coverageBuffer: 0,
      projectedChargeFactor: 1,
      hoursPerShift: 8,
      weeklyHoursCap: 44,
      salaryDivisor: SALARY_DIVISOR_BASELINE,
    },
  },
  fase1_2026_42h: {
    id: 'rules-fase1-2026-42h-v1',
    label: 'Fase 1 — 2026 (42h)',
    summary:
      'Hipótese de fase 1: teto semanal ~42h, divisor salarial 210, migração ' +
      'estimada para 5×2, buffer de cobertura de 5%. Encargos vêm do regime ' +
      'tributário por CNPJ (não deste fator). Não é o texto oficial da PEC.',
    effectiveAsOf: '2026-fase1',
    params: {
      scenarioId: 'fase1_2026_42h',
      targetScale: makeScale(5, 2),
      preserveCurrentScale: false,
      coverageBuffer: 0.05,
      projectedChargeFactor: 1.08,
      hoursPerShift: 8,
      weeklyHoursCap: 42,
      salaryDivisor: 210,
    },
  },
  fase2_2027_40h: {
    id: 'rules-fase2-2027-40h-v1',
    label: 'Fase 2 — 2027 (40h)',
    summary:
      'Hipótese de fase 2: teto semanal ~40h, divisor salarial 200, 5×2 com ' +
      'buffer de 8%. Destinado a projetar o segundo degrau de jornada — ' +
      'estimativa de consultoria, não previsão jurídica.',
    effectiveAsOf: '2027-fase2',
    params: {
      scenarioId: 'fase2_2027_40h',
      targetScale: makeScale(5, 2),
      preserveCurrentScale: false,
      coverageBuffer: 0.08,
      projectedChargeFactor: 1.1,
      hoursPerShift: 8,
      weeklyHoursCap: 40,
      salaryDivisor: 200,
    },
  },
  stress_test_4x3: {
    id: 'rules-stress-test-4x3-v1',
    label: 'Stress-test 4×3',
    summary:
      'Stress-test agressivo: escala-alvo 4×3, divisor 180, buffer de 12%. ' +
      'Serve para teto de custo — não é previsão de desfecho normativo.',
    effectiveAsOf: '2026-stress',
    params: {
      scenarioId: 'stress_test_4x3',
      targetScale: makeScale(4, 3),
      preserveCurrentScale: false,
      coverageBuffer: 0.12,
      projectedChargeFactor: 1.15,
      hoursPerShift: 8,
      weeklyHoursCap: 36,
      salaryDivisor: 180,
    },
  },
}

/**
 * Sector friction on staffing after the scale factor.
 * Hospital continuous ops get a small premium; varejo is baseline.
 * Construcao/locacao templates ship with modest friction.
 * Apdata ramos (RamosAtividadesEmpresas) map onto these SectorIds.
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
    note: 'Obra / canteiro: +4% atrito de escala (estimativa).',
  },
  locacao: {
    sector: 'locacao',
    staffingFriction: 1.03,
    note: 'Locação / frota + apoio: +3% atrito de escala (estimativa).',
  },
}

export const DEFAULT_DISCLAIMER =
  'Este relatório é uma simulação estimativa para apoio a consultoria. ' +
  'Não constitui parecer jurídico, cálculo oficial de folha nem previsão de ' +
  'todas as mudanças operacionais. Os cenários de fase / stress-test são ' +
  'hipóteses transparentes (escala-alvo, divisor, buffer, encargos por CNPJ), ' +
  'não o texto legal aprovado. Valide hipóteses e regras com assessoria ' +
  'jurídica e RH.'

export function getRuleVersion(scenarioId: ScenarioId | string): RuleVersion {
  const id = normalizeScenarioId(String(scenarioId))
  return RULE_VERSIONS[id]
}

export function getSectorCalibration(sector: SectorId): SectorCalibration {
  return SECTOR_CALIBRATION[sector]
}

export function listScenarios(): RuleVersion[] {
  return (Object.keys(RULE_VERSIONS) as ScenarioId[]).map(
    (id) => RULE_VERSIONS[id],
  )
}
