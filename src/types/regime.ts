/**
 * Operating regime for coverage / crew distribution.
 */

export type RegimeFuncionamento = 'SEG_SEX' | 'SEG_SAB' | 'CONTINUO_7D'

export const DEFAULT_REGIME_FUNCIONAMENTO: RegimeFuncionamento = 'SEG_SEX'

export function isRegimeFuncionamento(
  value: string,
): value is RegimeFuncionamento {
  return value === 'SEG_SEX' || value === 'SEG_SAB' || value === 'CONTINUO_7D'
}

export const REGIME_FUNCIONAMENTO_LABELS: Record<RegimeFuncionamento, string> = {
  SEG_SEX: 'Segunda a sexta',
  SEG_SAB: 'Segunda a sábado',
  CONTINUO_7D: 'Contínuo 7 dias',
}
