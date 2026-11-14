/**
 * SqlProfile contract — 5 independent query slots (MSSQL + Oracle).
 * Persisted server-side under DATA_DIR/sql-profiles.json (never in Git).
 */

export type SqlDialect = 'mssql' | 'oracle'

export type ModoDias = 'ESCALA' | 'FIXO_MES' | 'CALENDARIO_LOCAL'

export const MODO_DIAS_OPTIONS: readonly ModoDias[] = [
  'ESCALA',
  'FIXO_MES',
  'CALENDARIO_LOCAL',
] as const

export function isModoDias(value: string): value is ModoDias {
  return (
    value === 'ESCALA' ||
    value === 'FIXO_MES' ||
    value === 'CALENDARIO_LOCAL'
  )
}

export type SqlSlotId =
  | 'ESTABELECIMENTOS'
  | 'FOLHA_E_ESCALAS'
  | 'REGRA_VR'
  | 'REGRA_VT'
  | 'INDICES_ENCARGOS'

export const SQL_SLOT_IDS: readonly SqlSlotId[] = [
  'ESTABELECIMENTOS',
  'FOLHA_E_ESCALAS',
  'REGRA_VR',
  'REGRA_VT',
  'INDICES_ENCARGOS',
] as const

export const SQL_SLOT_LABELS: Record<SqlSlotId, string> = {
  ESTABELECIMENTOS: 'Estabelecimentos',
  FOLHA_E_ESCALAS: 'Folha e Escalas',
  REGRA_VR: 'Regra VR',
  REGRA_VT: 'Regra VT',
  INDICES_ENCARGOS: 'Índices de Encargos',
}

/** Required output columns per slot (contract). */
export const SQL_SLOT_CONTRACT: Record<SqlSlotId, readonly string[]> = {
  ESTABELECIMENTOS: [
    'cod_empresa',
    'cod_filial',
    'razao_social',
    'nome_filial',
    'cnpj_completo',
    'qtd_ativos',
  ],
  FOLHA_E_ESCALAS: [
    'cod_empresa',
    'cod_filial',
    'cnpj_completo',
    'cod_cc',
    'cod_cargo',
    'desc_cargo',
    'cod_vinculo',
    'cod_horario_atual',
    'escala_atual',
    'carga_semanal_atual',
    'qtd_colaboradores',
    'massa_salarial_base',
    'dias_trabalho_mes_atual',
  ],
  REGRA_VR: [
    'cod_empresa',
    'cod_filial',
    'cod_cc',
    'valor_dia',
    'modo_dias',
    'dias_base_mes',
  ],
  REGRA_VT: [
    'cod_empresa',
    'cod_filial',
    'cod_cc',
    'valor_dia',
    'modo_dias',
    'dias_base_mes',
  ],
  INDICES_ENCARGOS: [
    'cod_empresa',
    'cod_filial',
    'inss_empresa_pct',
    'rat_fap_pct',
    'terceiros_pct',
    'fgts_pct',
  ],
}

export type SqlSlotQueries = {
  mssql: string
  oracle: string
}

export type SqlProfile = {
  id: string
  name: string
  /** Factory default is immutable; consultants duplicate before editing. */
  readonly: boolean
  createdAt: string
  updatedAt: string
  slots: Record<SqlSlotId, SqlSlotQueries>
}

export type SqlProfileStoreFile = {
  version: 1
  activeId: string | null
  profiles: SqlProfile[]
}

export type SqlProfileInput = {
  name: string
  slots: Record<SqlSlotId, SqlSlotQueries>
}

/** Human hints for Studio side panel. */
export const SQL_SLOT_EXAMPLES: Record<SqlSlotId, string> = {
  ESTABELECIMENTOS:
    'Lista CNPJs com razão social, filial e headcount ativo (sit NOT IN 0,2,3,99).',
  FOLHA_E_ESCALAS:
    'Agrega folha por CC/cargo/escala — sem PII. VR/VT ficam nos slots REGRA_*.',
  REGRA_VR:
    "VR Plano 53. modo_dias: 'ESCALA' (proporcional à escala-alvo) | 'FIXO_MES' | 'CALENDARIO_LOCAL' (mantém dias_base_mes).",
  REGRA_VT:
    "VT via ConATransportes × MeiosTransportesItens. Mesmo contrato de modo_dias que VR.",
  INDICES_ENCARGOS:
    'Percentuais patronais por empresa/filial (INSS, RAT/FAP, terceiros, FGTS). Editáveis no Passo Premissas.',
}
