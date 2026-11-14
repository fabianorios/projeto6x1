import type { OperatingHours } from '../engine/operating-hours'
import type { SectorTemplate } from './types'

/** Extended commercial window for frota / apoio de locação. */
function defaultLocacaoHours(): OperatingHours {
  return {
    default: { openHour: 8, closeHour: 18 },
    byWeekday: {
      sat: { openHour: 8, closeHour: 12 },
      sun: { openHour: 0, closeHour: 0, closed: true },
    },
  }
}

export const locacaoTemplate: SectorTemplate = {
  id: 'locacao',
  label: 'Locação',
  shortDescription:
    'Locação de equipamentos / frota + equipes de apoio — cobertura e custo de escala.',
  inputsIntro:
    'Defaults de operação de locação (frota + apoio). Ajuste headcount, salário médio e número de bases/pátios com a folha do cliente.',
  scaleHint:
    'Ex.: 6x1 na equipe de apoio. 6×1 e 12×36 não são sugeridos como proposta — só como Atual se for o status quo.',
  defaults: {
    headcount: 18,
    currentScale: '6x1',
    averageMonthlySalary: 2500,
    units: 2,
    shiftsPerDay: 1,
    operatingHours: defaultLocacaoHours(),
  },
  fieldLabels: {
    units: 'Bases / pátios',
    headcount: 'Headcount (frota + apoio)',
    currentScale: 'Escala predominante da equipe',
    averageMonthlySalary: 'Salário médio mensal (R$)',
    shiftsPerDay: 'Turnos por dia (por base)',
  },
  resultBlurb:
    'Template locação: frota e apoio (+3% atrito setorial). Calibre buffers com a operação real antes da reunião.',
}
