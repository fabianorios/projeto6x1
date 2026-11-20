/**
 * Passo 1 — six operational groups mapped onto existing SectorId presets.
 * UI shows groups only; calibration / Apdata still use SectorPreset ids.
 */

import type { RegimeFuncionamento } from '../types'
import {
  CUSTOM_SECTOR_ID,
  resolveSectorPreset,
  type SectorPresetId,
} from './sectors'
import type { SectorId } from './types'

export type OperationalGroupId =
  | 'saude'
  | 'construcao'
  | 'industria'
  | 'comercio'
  | 'servicos'
  | 'personalizado'

export interface OperationalGroup {
  id: OperationalGroupId
  /** Lead SectorId written into wizard state when the card is selected. */
  sectorId: SectorPresetId
  label: string
  shortDescription: string
  /** Consultative Lumen tip for the sidebar. */
  lumenTip: string
  /** Optional badge (e.g. 24/7 for hospitals). */
  badge?: string
  /** Passo 1 default buffer — brief: 5%. */
  defaultBufferPct: number
  defaultRegime: RegimeFuncionamento
}

/** Default buffer for Passo 1 group selection (product brief). */
export const OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT = 5

export const OPERATIONAL_GROUPS: OperationalGroup[] = [
  {
    id: 'saude',
    sectorId: 'hospital',
    label: 'Saúde & Hospitais',
    shortDescription:
      'Operação contínua 24h — plantão, postos críticos e cobertura de leitos.',
    lumenTip: 'Sugestão de escalas 12×36 ou turnos de 6h com revezamento.',
    badge: '24/7',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'CONTINUO_7D',
  },
  {
    id: 'construcao',
    sectorId: 'construcao',
    label: 'Construção & Infraestrutura',
    shortDescription:
      'Obra / canteiro — cobertura diurna, frentes e sazonalidade.',
    lumenTip: 'Priorize Seg–Sáb e buffer baixo; ajuste por frente de obra.',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'SEG_SAB',
  },
  {
    id: 'industria',
    sectorId: 'industria',
    label: 'Indústria & Operação Contínua',
    shortDescription:
      'Planta industrial — turnos, linha contínua e cobertura de produção.',
    lumenTip: 'Avalie contínuo 7d vs Seg–Sáb conforme paradas de manutenção.',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'SEG_SAB',
  },
  {
    id: 'comercio',
    sectorId: 'varejo',
    label: 'Comércio, Varejo & Atendimento',
    shortDescription:
      'Lojas, supermercados e atendimento — turnos e impacto na folha.',
    lumenTip: 'Escala 6×1 ainda comum em loja; calibre absenteísmo no fim de semana.',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'SEG_SAB',
  },
  {
    id: 'servicos',
    sectorId: 'logistica',
    label: 'Serviços, Logística & Escritório',
    shortDescription:
      'CD, transporte, facilities e escritório — janelas e jornada comercial.',
    lumenTip: 'Misture CONTINUO no CD com Seg–Sex no backoffice quando fizer sentido.',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'CONTINUO_7D',
  },
  {
    id: 'personalizado',
    sectorId: CUSTOM_SECTOR_ID,
    label: 'Personalizado / CNAE',
    shortDescription:
      'Busque pelo CNAE fiscal ou informe o nome do segmento livremente.',
    lumenTip: 'Use o CNAE fiscal do Local (não o ramo Apdata) para nomear o segmento.',
    defaultBufferPct: OPERATIONAL_GROUP_DEFAULT_BUFFER_PCT,
    defaultRegime: 'SEG_SEX',
  },
]

const GROUP_BY_ID = new Map(
  OPERATIONAL_GROUPS.map((g) => [g.id, g] as const),
)

/** Map fine-grained SectorPreset → Passo 1 group card. */
const SECTOR_TO_GROUP: Record<string, OperationalGroupId> = {
  hospital: 'saude',
  construcao: 'construcao',
  industria: 'industria',
  agronegocio: 'industria',
  varejo: 'comercio',
  contact_center: 'comercio',
  alimentacao_hotelaria: 'comercio',
  logistica: 'servicos',
  tecnologia_admin: 'servicos',
  locacao_facilities: 'servicos',
  custom: 'personalizado',
}

export function resolveOperationalGroup(
  id: OperationalGroupId | string | null | undefined,
): OperationalGroup {
  if (id && GROUP_BY_ID.has(id as OperationalGroupId)) {
    return GROUP_BY_ID.get(id as OperationalGroupId)!
  }
  return GROUP_BY_ID.get('personalizado')!
}

/**
 * Which Passo 1 card is active for a stored SectorId
 * (including Apdata-mapped fine presets).
 */
export function operationalGroupFromSector(
  sector: SectorId | string | null | undefined,
): OperationalGroup {
  const preset = resolveSectorPreset(sector ?? CUSTOM_SECTOR_ID)
  const groupId = SECTOR_TO_GROUP[preset.id] ?? 'personalizado'
  return resolveOperationalGroup(groupId)
}

export function isPersonalizadoGroup(
  group: OperationalGroup | OperationalGroupId,
): boolean {
  const id = typeof group === 'string' ? group : group.id
  return id === 'personalizado'
}
