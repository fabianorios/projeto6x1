import type { OperatingHours } from '../engine/operating-hours'
import type { SectorTemplate } from './types'

/** Weekday daytime coverage typical of obra / canteiro. */
function defaultConstrucaoHours(): OperatingHours {
  return {
    default: { openHour: 7, closeHour: 17 },
    byWeekday: {
      sat: { openHour: 7, closeHour: 12 },
      sun: { openHour: 0, closeHour: 0, closed: true },
    },
  }
}

export const construcaoTemplate: SectorTemplate = {
  id: 'construcao',
  label: 'Construção',
  shortDescription:
    'Obra / canteiro — cobertura diurna, sazonalidade e impacto de escala na folha.',
  inputsIntro:
    'Defaults de canteiro com jornada diurna. Ajuste headcount operacional, salário médio do mix e unidades de obra com os dados do cliente.',
  scaleHint:
    'Informe a escala predominante (ex.: 6x1). 6×1 só como Atual — propostas usam 5×2 / 4×3 conforme o cenário.',
  defaults: {
    headcount: 40,
    currentScale: '6x1',
    averageMonthlySalary: 2800,
    units: 2,
    shiftsPerDay: 1,
    operatingHours: defaultConstrucaoHours(),
  },
  fieldLabels: {
    units: 'Obras / canteiros',
    headcount: 'Headcount operacional (obra)',
    currentScale: 'Escala predominante da equipe',
    averageMonthlySalary: 'Salário médio mensal (R$)',
    shiftsPerDay: 'Turnos por dia (por obra)',
  },
  resultBlurb:
    'Template construção: cobertura de canteiro (+4% atrito setorial). Valide CCT, feriados e sazonalidade com o cliente.',
}
