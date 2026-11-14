import { construcaoTemplate } from './construcao'
import { hospitalTemplate } from './hospital'
import { locacaoTemplate } from './locacao'
import { customTemplate, templateFromPreset } from './market'
import type { SectorTemplate } from './types'
import { varejoTemplate } from './varejo'
import {
  CUSTOM_SECTOR_ID,
  MARKET_SECTOR_PRESETS,
  normalizeSectorId,
  resolveSectorPreset,
} from '../engine/sectors'
import type { SectorId } from '../engine/types'

export type { SectorTemplate } from './types'
export {
  construcaoTemplate,
  hospitalTemplate,
  locacaoTemplate,
  varejoTemplate,
  customTemplate,
}

const RICH_BY_ID: Record<string, SectorTemplate> = {
  varejo: {
    ...varejoTemplate,
    label: 'Varejo e Supermercados',
  },
  hospital: {
    ...hospitalTemplate,
    label: 'Saúde e Hospitais',
  },
  construcao: {
    ...construcaoTemplate,
    label: 'Construção Civil',
  },
  locacao_facilities: {
    ...locacaoTemplate,
    label: 'Locação/Facilities',
  },
  custom: customTemplate,
}

function buildCatalogTemplates(): SectorTemplate[] {
  const out: SectorTemplate[] = []
  for (const preset of MARKET_SECTOR_PRESETS) {
    out.push(RICH_BY_ID[preset.id] ?? templateFromPreset(preset))
  }
  out.push(customTemplate)
  return out
}

/** All sector templates available in the wizard (10 market + custom). */
export const PILOT_TEMPLATES: SectorTemplate[] = buildCatalogTemplates()

/**
 * Resolve template for any sector id.
 * Unknown / empty → custom. Legacy `locacao` → locacao_facilities.
 * Never throws.
 */
export function getTemplate(sector: SectorId): SectorTemplate {
  const id = normalizeSectorId(sector)
  const rich = RICH_BY_ID[id]
  if (rich) return rich
  const preset = resolveSectorPreset(id)
  if (preset.id === CUSTOM_SECTOR_ID && id !== CUSTOM_SECTOR_ID) {
    // Free-form id: custom shell with the raw id preserved for display callers.
    return { ...customTemplate, id }
  }
  return templateFromPreset(preset)
}
