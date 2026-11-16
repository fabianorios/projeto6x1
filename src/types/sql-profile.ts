/**
 * SqlProfile contract — modular query slots (MSSQL + Oracle).
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

export type VaModoValor = 'DIA' | 'MES'

/** Per-client Apdata TiposBeneficios codes for parameterized benefit SQL. */
export type BenefitParams = {
  vrTipoBeneficio: number | null
  vaTipoBeneficio: number | null
  assistenciaMedicaTipo: number | null
  assistenciaOdontologicaTipo: number | null
  vaModoValor: VaModoValor
  labels?: {
    vr?: string
    va?: string
    medica?: string
    odontologica?: string
  }
}

export const FACTORY_BENEFIT_PARAMS: BenefitParams = {
  vrTipoBeneficio: 53,
  vaTipoBeneficio: 52,
  assistenciaMedicaTipo: null,
  assistenciaOdontologicaTipo: null,
  vaModoValor: 'MES',
  labels: {
    vr: 'Vale-Refeição',
    va: 'Vale-Alimentação',
    medica: 'Assistência médica titular',
    odontologica: 'Assistência odontológica',
  },
}

export function defaultBenefitParams(): BenefitParams {
  return structuredClone(FACTORY_BENEFIT_PARAMS)
}

export type SqlSlotId =
  | 'ESTABELECIMENTOS'
  | 'FOLHA_E_ESCALAS'
  | 'TIPOS_BENEFICIOS'
  | 'REGRA_VR'
  | 'REGRA_VA'
  | 'REGRA_VT'
  | 'REGRA_FIXOS'
  | 'INDICES_ENCARGOS'

export const SQL_SLOT_IDS: readonly SqlSlotId[] = [
  'ESTABELECIMENTOS',
  'FOLHA_E_ESCALAS',
  'TIPOS_BENEFICIOS',
  'REGRA_VR',
  'REGRA_VA',
  'REGRA_VT',
  'REGRA_FIXOS',
  'INDICES_ENCARGOS',
] as const

export const SQL_SLOT_LABELS: Record<SqlSlotId, string> = {
  ESTABELECIMENTOS: 'Estabelecimentos',
  FOLHA_E_ESCALAS: 'Folha e Escalas',
  TIPOS_BENEFICIOS: 'Benefícios',
  REGRA_VR: 'Regra VR',
  REGRA_VA: 'Regra VA',
  REGRA_VT: 'Regra VT',
  REGRA_FIXOS: 'Benefícios fixos',
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
  TIPOS_BENEFICIOS: [
    'cod_tipo',
    'desc_tipo',
    'valor_medio',
  ],
  REGRA_VR: [
    'cod_empresa',
    'cod_filial',
    'cod_cc',
    'valor_dia',
    'modo_dias',
    'dias_base_mes',
  ],
  REGRA_VA: [
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
  REGRA_FIXOS: [
    'cod_empresa',
    'cod_filial',
    'cod_cc',
    'valor_mes_medica',
    'valor_mes_odonto',
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
  benefitParams: BenefitParams
}

export type SqlProfileStoreFile = {
  version: 1
  activeId: string | null
  profiles: SqlProfile[]
}

export type SqlProfileInput = {
  name: string
  slots: Record<SqlSlotId, SqlSlotQueries>
  benefitParams?: BenefitParams
}

/** Human hints for Studio side panel. */
export const SQL_SLOT_EXAMPLES: Record<SqlSlotId, string> = {
  ESTABELECIMENTOS:
    'Lista CNPJs com razão social, filial e headcount ativo (sit NOT IN 0,2,3,99).',
  FOLHA_E_ESCALAS:
    'Agrega folha por CC/cargo/escala — sem PII. VR/VT/VA ficam nos slots REGRA_*.',
  TIPOS_BENEFICIOS:
    'Catálogo TiposBeneficios (CBN→PLB→PBV max PBV_DtdInicio→EBT→TBE). Na prévia, edite classificação e valor (override de sessão → motor).',
  REGRA_VR:
    "VR via ConBeneficios × PlanosBeneficiosValores (PBV_DtdInicio DESC). @tipo = benefitParams.vrTipoBeneficio. modo_dias: 'ESCALA' | 'FIXO_MES' | 'CALENDARIO_LOCAL'.",
  REGRA_VA:
    "VA — mesmo caminho de VR; @tipo = vaTipoBeneficio. Interpretação dia/mês via benefitParams.vaModoValor.",
  REGRA_VT:
    'VT via ConATransportes × MeiosTransportesItens (MRI_DtdInicioVigencia DESC). Mesmo contrato de modo_dias que VR.',
  REGRA_FIXOS:
    'Médico/odonto titular: valor_mês médio por CC. @tipoMedica / @tipoOdonto do perfil. Impacta HC adicional.',
  INDICES_ENCARGOS:
    'Percentuais patronais por empresa/filial (INSS, RAT/FAP, terceiros, FGTS). Editáveis no Passo Premissas.',
}
