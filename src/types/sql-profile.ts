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

export type BenefitSlotId = 'vr' | 'va' | 'medica' | 'odonto'

/** Per-client Apdata TiposBeneficios codes + optional default amounts. */
export type BenefitParams = {
  /** Primary code for SQL @tipo (REGRA_VR). */
  vrTipoBeneficio: number | null
  vaTipoBeneficio: number | null
  assistenciaMedicaTipo: number | null
  assistenciaOdontologicaTipo: number | null
  /** Extra codes that also map into the slot (beneficios_agg). */
  vrTiposExtras: number[]
  vaTiposExtras: number[]
  medicaTiposExtras: number[]
  odontoTiposExtras: number[]
  vaModoValor: VaModoValor
  /** Profile-persisted default amounts (consultant seed). */
  vrValorDiaPadrao: number | null
  vaValorMesPadrao: number | null
  assistenciaMedicaValorMes: number | null
  assistenciaOdontologicaValorMes: number | null
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
  vrTiposExtras: [],
  vaTiposExtras: [],
  medicaTiposExtras: [],
  odontoTiposExtras: [],
  vaModoValor: 'MES',
  vrValorDiaPadrao: null,
  vaValorMesPadrao: null,
  assistenciaMedicaValorMes: null,
  assistenciaOdontologicaValorMes: null,
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

function parseTipoClient(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  return n
}

function parseTipoListClient(v: unknown): number[] {
  if (v == null) return []
  if (Array.isArray(v)) {
    const out: number[] = []
    for (const item of v) {
      const n = parseTipoClient(item)
      if (n != null && !out.includes(n)) out.push(n)
    }
    return out
  }
  if (typeof v === 'string') return parseTipoCodeList(v)
  const single = parseTipoClient(v)
  return single != null ? [single] : []
}

function parseAmountClient(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n =
    typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** Backfill older profiles missing extras / amount defaults. */
export function normalizeBenefitParams(
  raw: unknown | undefined | null,
): BenefitParams {
  const base = defaultBenefitParams()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const modo =
    o.vaModoValor === 'DIA' || o.vaModoValor === 'MES'
      ? o.vaModoValor
      : base.vaModoValor
  const labelsRaw =
    o.labels && typeof o.labels === 'object'
      ? (o.labels as Record<string, unknown>)
      : undefined
  const vrPrimary =
    'vrTipoBeneficio' in o ? parseTipoClient(o.vrTipoBeneficio) : base.vrTipoBeneficio
  const vaPrimary =
    'vaTipoBeneficio' in o ? parseTipoClient(o.vaTipoBeneficio) : base.vaTipoBeneficio
  const medPrimary =
    'assistenciaMedicaTipo' in o
      ? parseTipoClient(o.assistenciaMedicaTipo)
      : base.assistenciaMedicaTipo
  const odPrimary =
    'assistenciaOdontologicaTipo' in o
      ? parseTipoClient(o.assistenciaOdontologicaTipo)
      : base.assistenciaOdontologicaTipo
  return {
    vrTipoBeneficio: vrPrimary,
    vaTipoBeneficio: vaPrimary,
    assistenciaMedicaTipo: medPrimary,
    assistenciaOdontologicaTipo: odPrimary,
    vrTiposExtras: parseTipoListClient(
      'vrTiposExtras' in o ? o.vrTiposExtras : base.vrTiposExtras,
    ).filter((c) => c !== vrPrimary),
    vaTiposExtras: parseTipoListClient(
      'vaTiposExtras' in o ? o.vaTiposExtras : base.vaTiposExtras,
    ).filter((c) => c !== vaPrimary),
    medicaTiposExtras: parseTipoListClient(
      'medicaTiposExtras' in o ? o.medicaTiposExtras : base.medicaTiposExtras,
    ).filter((c) => c !== medPrimary),
    odontoTiposExtras: parseTipoListClient(
      'odontoTiposExtras' in o ? o.odontoTiposExtras : base.odontoTiposExtras,
    ).filter((c) => c !== odPrimary),
    vaModoValor: modo,
    vrValorDiaPadrao:
      'vrValorDiaPadrao' in o
        ? parseAmountClient(o.vrValorDiaPadrao)
        : base.vrValorDiaPadrao,
    vaValorMesPadrao:
      'vaValorMesPadrao' in o
        ? parseAmountClient(o.vaValorMesPadrao)
        : base.vaValorMesPadrao,
    assistenciaMedicaValorMes:
      'assistenciaMedicaValorMes' in o
        ? parseAmountClient(o.assistenciaMedicaValorMes)
        : base.assistenciaMedicaValorMes,
    assistenciaOdontologicaValorMes:
      'assistenciaOdontologicaValorMes' in o
        ? parseAmountClient(o.assistenciaOdontologicaValorMes)
        : base.assistenciaOdontologicaValorMes,
    labels: {
      vr: labelsRaw?.vr != null ? String(labelsRaw.vr) : base.labels?.vr,
      va: labelsRaw?.va != null ? String(labelsRaw.va) : base.labels?.va,
      medica:
        labelsRaw?.medica != null
          ? String(labelsRaw.medica)
          : base.labels?.medica,
      odontologica:
        labelsRaw?.odontologica != null
          ? String(labelsRaw.odontologica)
          : base.labels?.odontologica,
    },
  }
}

/** Parse "53, 80" into unique non-negative ints. */
export function parseTipoCodeList(raw: string): number[] {
  const out: number[] = []
  for (const part of String(raw ?? '').split(/[,;\s]+/)) {
    const t = part.trim()
    if (!t) continue
    const n = Number.parseInt(t, 10)
    if (!Number.isFinite(n) || n < 0) continue
    if (!out.includes(n)) out.push(n)
  }
  return out
}

export function formatTipoCodeList(
  primary: number | null,
  extras: readonly number[] = [],
): string {
  const codes = [
    ...(primary != null ? [primary] : []),
    ...extras.filter((c) => c !== primary),
  ]
  return codes.join(', ')
}

export function splitTipoCodeList(codes: readonly number[]): {
  primary: number | null
  extras: number[]
} {
  if (codes.length === 0) return { primary: null, extras: [] }
  const [primary, ...rest] = codes
  return { primary: primary ?? null, extras: rest }
}

export function allTiposForSlot(
  params: BenefitParams,
  slot: BenefitSlotId,
): number[] {
  if (slot === 'vr') {
    return [
      ...(params.vrTipoBeneficio != null ? [params.vrTipoBeneficio] : []),
      ...params.vrTiposExtras.filter((c) => c !== params.vrTipoBeneficio),
    ]
  }
  if (slot === 'va') {
    return [
      ...(params.vaTipoBeneficio != null ? [params.vaTipoBeneficio] : []),
      ...params.vaTiposExtras.filter((c) => c !== params.vaTipoBeneficio),
    ]
  }
  if (slot === 'medica') {
    return [
      ...(params.assistenciaMedicaTipo != null
        ? [params.assistenciaMedicaTipo]
        : []),
      ...params.medicaTiposExtras.filter(
        (c) => c !== params.assistenciaMedicaTipo,
      ),
    ]
  }
  return [
    ...(params.assistenciaOdontologicaTipo != null
      ? [params.assistenciaOdontologicaTipo]
      : []),
    ...params.odontoTiposExtras.filter(
      (c) => c !== params.assistenciaOdontologicaTipo,
    ),
  ]
}

export function slotForBenefitCodigo(
  codigo: string | number,
  params: BenefitParams,
): BenefitSlotId | null {
  const n =
    typeof codigo === 'number' ? codigo : Number.parseInt(String(codigo), 10)
  if (!Number.isFinite(n)) return null
  for (const slot of ['vr', 'va', 'medica', 'odonto'] as const) {
    if (allTiposForSlot(params, slot).includes(n)) return slot
  }
  return null
}

/** Apply a comma-list edit onto one slot of BenefitParams. */
export function setSlotTipoCodes(
  params: BenefitParams,
  slot: BenefitSlotId,
  raw: string,
): BenefitParams {
  const { primary, extras } = splitTipoCodeList(parseTipoCodeList(raw))
  if (slot === 'vr') {
    return { ...params, vrTipoBeneficio: primary, vrTiposExtras: extras }
  }
  if (slot === 'va') {
    return { ...params, vaTipoBeneficio: primary, vaTiposExtras: extras }
  }
  if (slot === 'medica') {
    return {
      ...params,
      assistenciaMedicaTipo: primary,
      medicaTiposExtras: extras,
    }
  }
  return {
    ...params,
    assistenciaOdontologicaTipo: primary,
    odontoTiposExtras: extras,
  }
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
    'desc_cc',
    'cod_cargo',
    'desc_cargo',
    'cod_vinculo',
    'cod_horario_atual',
    'horario_trabalho_atual',
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
    'Catálogo TiposBeneficios (opcional). Códigos→slot e valores padrão ficam em «Códigos e valores» acima — sem precisar testar este bloco. Prévia ainda permite override fino de classificação/valor.',
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
