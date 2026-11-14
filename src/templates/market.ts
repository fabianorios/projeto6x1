/**
 * Lightweight templates for market presets that do not have a dedicated file.
 * Rich defaults stay in varejo/hospital/construcao/locacao modules.
 */

import {
  DEFAULT_OPERATING_HOURS,
  defaultHospitalHours,
  defaultVarejoHours,
} from '../engine/operating-hours'
import type { OperatingHours } from '../engine/operating-hours'
import type { SectorPreset } from '../engine/sectors'
import type { SectorTemplate } from './types'

function hoursForRegime(
  regime: SectorPreset['defaultRegime'],
): OperatingHours {
  if (regime === 'CONTINUO_7D') return defaultHospitalHours()
  if (regime === 'SEG_SEX') {
    return {
      default: { openHour: 8, closeHour: 18 },
      byWeekday: {
        sat: { openHour: 0, closeHour: 0, closed: true },
        sun: { openHour: 0, closeHour: 0, closed: true },
      },
    }
  }
  return defaultVarejoHours()
}

export function templateFromPreset(preset: SectorPreset): SectorTemplate {
  const continuous = preset.defaultRegime === 'CONTINUO_7D'
  return {
    id: preset.id,
    label: preset.label,
    shortDescription: preset.shortDescription,
    inputsIntro: `Defaults de ${preset.label.toLowerCase()}. Ajuste headcount, salário médio, horário e unidades com os dados do cliente. Buffer sugerido: ${preset.defaultBufferPct}%.`,
    scaleHint:
      'Ex.: 6x1. Aceita 6×1, 5x2 etc. — o motor interpreta a razão trabalho/folga. 6×1 só como Atual.',
    defaults: {
      headcount: continuous ? 80 : 30,
      currentScale: '6x1',
      averageMonthlySalary: continuous ? 3200 : 2400,
      units: continuous ? 1 : 2,
      shiftsPerDay: continuous ? 3 : 2,
      operatingHours: hoursForRegime(preset.defaultRegime) ?? DEFAULT_OPERATING_HOURS,
    },
    fieldLabels: {
      units: 'Unidades / sites',
      headcount: 'Headcount operacional',
      currentScale: 'Escala predominante da equipe',
      averageMonthlySalary: 'Salário médio mensal (R$)',
      shiftsPerDay: 'Turnos por dia',
    },
    resultBlurb: `Template ${preset.label}: calibre o buffer/absenteísmo (${preset.defaultBufferPct}% sugerido) e encargos com a folha real antes da reunião.`,
  }
}

export const customTemplate: SectorTemplate = {
  id: 'custom',
  label: 'Outro / Personalizado',
  shortDescription:
    'Segmento livre — nome em texto + % de buffer / absenteísmo editável.',
  inputsIntro:
    'Informe o nome do segmento e o % de buffer/absenteísmo. Use a folha do cliente para headcount e salário médio.',
  scaleHint:
    'Ex.: 6x1. Aceita 6×1, 5x2 etc. — o motor interpreta a razão trabalho/folga. 6×1 só como Atual.',
  defaults: {
    headcount: 24,
    currentScale: '6x1',
    averageMonthlySalary: 2200,
    units: 1,
    shiftsPerDay: 2,
    operatingHours: DEFAULT_OPERATING_HOURS,
  },
  fieldLabels: {
    units: 'Unidades',
    headcount: 'Headcount total',
    currentScale: 'Escala atual da equipe',
    averageMonthlySalary: 'Salário médio mensal (R$)',
    shiftsPerDay: 'Turnos por dia',
  },
  resultBlurb:
    'Segmento personalizado: valide nome, buffer/absenteísmo e encargos com o cliente.',
}
