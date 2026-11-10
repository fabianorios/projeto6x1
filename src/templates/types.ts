import type { OperatingHours } from '../engine/operating-hours'
import type { SectorId } from '../engine/types'

export interface SectorTemplate {
  id: SectorId
  label: string
  shortDescription: string
  /** Short intro shown on the inputs step. */
  inputsIntro: string
  /** Hint under the escala field (e.g. plantão vs loja). */
  scaleHint: string
  /** Default wizard field values. */
  defaults: {
    headcount: number
    currentScale: string
    averageMonthlySalary: number
    units: number
    shiftsPerDay: number
    operatingHours: OperatingHours
  }
  fieldLabels: {
    units: string
    headcount: string
    currentScale: string
    averageMonthlySalary: string
    shiftsPerDay: string
  }
  resultBlurb: string
}
