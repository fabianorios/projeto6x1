import { hospitalTemplate } from './hospital'
import type { SectorTemplate } from './types'
import { varejoTemplate } from './varejo'
import type { SectorId } from '../engine/types'

export type { SectorTemplate } from './types'
export { hospitalTemplate, varejoTemplate }

export const PILOT_TEMPLATES: SectorTemplate[] = [
  varejoTemplate,
  hospitalTemplate,
]

export function getTemplate(sector: SectorId): SectorTemplate | undefined {
  return PILOT_TEMPLATES.find((t) => t.id === sector)
}
