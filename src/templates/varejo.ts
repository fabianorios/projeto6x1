import { defaultVarejoHours } from '../engine/operating-hours'
import type { SectorTemplate } from './types'

export const varejoTemplate: SectorTemplate = {
  id: 'varejo',
  label: 'Varejo',
  shortDescription:
    'Rede de lojas com escala 6×1 comum — cobertura de turnos e impacto na folha.',
  inputsIntro:
    'Defaults de uma rede pequena/média (várias lojas, dois turnos). Ajuste headcount, salário médio, horário de funcionamento e número de lojas com os dados do cliente.',
  scaleHint:
    'Ex.: 6x1 (trabalha 6, folga 1). Aceita 6×1, 5x2 etc. — o motor interpreta a razão trabalho/folga. 6×1 só como Atual.',
  defaults: {
    headcount: 24,
    currentScale: '6x1',
    averageMonthlySalary: 2200,
    units: 3,
    shiftsPerDay: 2,
    operatingHours: defaultVarejoHours(),
  },
  fieldLabels: {
    units: 'Lojas / unidades',
    headcount: 'Headcount total (todas as lojas)',
    currentScale: 'Escala atual da equipe',
    averageMonthlySalary: 'Salário médio mensal (R$)',
    shiftsPerDay: 'Turnos por dia (por loja)',
  },
  resultBlurb:
    'Template varejo: cobertura de lojas e turnos. Calibre buffers e encargos com a folha real do cliente antes da reunião.',
}
