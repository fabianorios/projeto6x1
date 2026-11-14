import { construcaoTemplate } from './construcao'
import { hospitalTemplate } from './hospital'
import { locacaoTemplate } from './locacao'
import type { SectorTemplate } from './types'
import { varejoTemplate } from './varejo'
import type { SectorId } from '../engine/types'

export type { SectorTemplate } from './types'
export {
  construcaoTemplate,
  hospitalTemplate,
  locacaoTemplate,
  varejoTemplate,
}

/** All sector templates available in the wizard (incl. Apdata ramo mapping targets). */
export const PILOT_TEMPLATES: SectorTemplate[] = [
  varejoTemplate,
  hospitalTemplate,
  construcaoTemplate,
  locacaoTemplate,
]

export function getTemplate(sector: SectorId): SectorTemplate | undefined {
  return PILOT_TEMPLATES.find((t) => t.id === sector)
}
