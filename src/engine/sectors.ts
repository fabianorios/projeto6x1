/**
 * Open sector catalog: 10 market presets + custom.
 * SectorId is a free string; presets provide label / buffer / regime defaults.
 */

import type { RegimeFuncionamento } from '../types'
import type { SectorCalibration, SectorId } from './types'

/** Known market preset ids (plus custom). Not an exhaustive SectorId union. */
export type SectorPresetId =
  | 'varejo'
  | 'hospital'
  | 'industria'
  | 'logistica'
  | 'contact_center'
  | 'construcao'
  | 'alimentacao_hotelaria'
  | 'agronegocio'
  | 'tecnologia_admin'
  | 'locacao_facilities'
  | 'custom'

export interface SectorPreset {
  id: SectorPresetId
  label: string
  /** Suggested buffer / absenteísmo % (0–100). Drives staffingFriction. */
  defaultBufferPct: number
  defaultRegime: RegimeFuncionamento
  shortDescription: string
}

export const CUSTOM_SECTOR_ID: SectorPresetId = 'custom'

/** Legacy id kept in saved sims / localStorage → current preset. */
const LEGACY_SECTOR_ALIASES: Record<string, SectorPresetId> = {
  locacao: 'locacao_facilities',
}

export const MARKET_SECTOR_PRESETS: SectorPreset[] = [
  {
    id: 'varejo',
    label: 'Varejo',
    // Legacy friction 1.0 — baseline (no extra absenteísmo beyond scenario buffer).
    defaultBufferPct: 0,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Rede de lojas — cobertura de turnos e impacto na folha.',
  },
  {
    id: 'hospital',
    label: 'Hospital / Saúde',
    defaultBufferPct: 6,
    defaultRegime: 'CONTINUO_7D',
    shortDescription:
      'Operação contínua 24h — plantão e postos críticos.',
  },
  {
    id: 'industria',
    label: 'Indústria',
    defaultBufferPct: 5,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Planta industrial — turnos, produção e cobertura de linha.',
  },
  {
    id: 'logistica',
    label: 'Logística',
    defaultBufferPct: 7,
    defaultRegime: 'CONTINUO_7D',
    shortDescription:
      'CD / transporte — janelas de expedição e cobertura.',
  },
  {
    id: 'contact_center',
    label: 'Contact Center',
    defaultBufferPct: 10,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Atendimento — filas, absenteísmo e escalas por faixa horária.',
  },
  {
    id: 'construcao',
    label: 'Construção',
    defaultBufferPct: 4,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Obra / canteiro — cobertura diurna e sazonalidade.',
  },
  {
    id: 'alimentacao_hotelaria',
    label: 'Alimentação / Hotelaria',
    defaultBufferPct: 8,
    defaultRegime: 'CONTINUO_7D',
    shortDescription:
      'Restaurantes, hotéis e food service — picos e finais de semana.',
  },
  {
    id: 'agronegocio',
    label: 'Agronegócio',
    defaultBufferPct: 6,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Campo / planta agro — sazonalidade e jornadas estendidas.',
  },
  {
    id: 'tecnologia_admin',
    label: 'Tecnologia / Admin',
    defaultBufferPct: 3,
    defaultRegime: 'SEG_SEX',
    shortDescription:
      'Escritório / TI — jornada comercial e baixa cobertura 24h.',
  },
  {
    id: 'locacao_facilities',
    label: 'Locação / Facilities',
    defaultBufferPct: 3,
    defaultRegime: 'SEG_SAB',
    shortDescription:
      'Locação, frota e facilities — bases, pátios e apoio.',
  },
]

export const CUSTOM_SECTOR_PRESET: SectorPreset = {
  id: 'custom',
  label: 'Outro / Personalizado',
  defaultBufferPct: 5,
  defaultRegime: 'SEG_SEX',
  shortDescription:
    'Segmento livre — informe o nome e calibre o % de buffer / absenteísmo.',
}

/** Presets shown in the wizard (10 market + custom). */
export const ALL_SECTOR_PRESETS: SectorPreset[] = [
  ...MARKET_SECTOR_PRESETS,
  CUSTOM_SECTOR_PRESET,
]

const PRESET_BY_ID = new Map<string, SectorPreset>(
  ALL_SECTOR_PRESETS.map((p) => [p.id, p]),
)

/** Normalize legacy / unknown ids onto catalog keys. */
export function normalizeSectorId(sector: SectorId | string): string {
  const raw = String(sector ?? '').trim()
  if (!raw) return CUSTOM_SECTOR_ID
  const aliased = LEGACY_SECTOR_ALIASES[raw] ?? raw
  if (PRESET_BY_ID.has(aliased)) return aliased
  return aliased
}

export function isKnownSectorPreset(id: string): id is SectorPresetId {
  return PRESET_BY_ID.has(normalizeSectorId(id))
}

/** Resolve preset; unknown ids → custom (never throws). */
export function resolveSectorPreset(sector: SectorId | string): SectorPreset {
  const id = normalizeSectorId(sector)
  return PRESET_BY_ID.get(id) ?? CUSTOM_SECTOR_PRESET
}

export function getSectorDisplayLabel(
  sector: SectorId | string,
  sectorLabel?: string | null,
): string {
  const override = (sectorLabel ?? '').trim()
  if (override) return override
  return resolveSectorPreset(sector).label
}

export function bufferPctToFriction(bufferPct: number): number {
  const pct = Number.isFinite(bufferPct) ? Math.max(0, bufferPct) : 0
  return 1 + pct / 100
}

export function frictionToBufferPct(friction: number): number {
  if (!Number.isFinite(friction) || friction <= 0) return 0
  return Math.round((friction - 1) * 1000) / 10
}

/**
 * Calibration from catalog (+ optional buffer override).
 * Unknown sector → custom defaults.
 */
export function calibrationFromSector(
  sector: SectorId | string,
  bufferPctOverride?: number | null,
): SectorCalibration {
  const preset = resolveSectorPreset(sector)
  const pct =
    bufferPctOverride != null && Number.isFinite(bufferPctOverride)
      ? Math.max(0, Number(bufferPctOverride))
      : preset.defaultBufferPct
  const friction = bufferPctToFriction(pct)
  const note =
    preset.id === 'custom'
      ? `Segmento personalizado: ${pct}% buffer/absenteísmo (estimativa editável).`
      : `${preset.label}: ${pct}% buffer/absenteísmo setorial (estimativa).`
  return {
    sector: normalizeSectorId(sector),
    staffingFriction: friction,
    note,
  }
}
