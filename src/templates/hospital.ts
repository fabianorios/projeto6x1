import { defaultHospitalHours } from '../engine/operating-hours'
import type { SectorTemplate } from './types'

export const hospitalTemplate: SectorTemplate = {
  id: 'hospital',
  label: 'Hospital',
  shortDescription:
    'Operação contínua 24h — plantão, cobertura de postos críticos e custo de escala.',
  inputsIntro:
    'Defaults de planta hospitalar com cobertura contínua (plantões / turnos). Use headcount operacional, horário de funcionamento (24h por padrão) e salário médio do mix informado pelo RH.',
  scaleHint:
    'Informe a escala predominante da equipe (ex.: 6x1). 6×1 e 12×36 não são sugeridos como proposta — só como Atual se for o status quo.',
  defaults: {
    headcount: 180,
    currentScale: '6x1',
    averageMonthlySalary: 4500,
    units: 1,
    shiftsPerDay: 3,
    operatingHours: defaultHospitalHours(),
  },
  fieldLabels: {
    units: 'Plantas / unidades hospitalares',
    headcount: 'Headcount operacional (plantão + cobertura)',
    currentScale: 'Escala predominante da equipe',
    averageMonthlySalary: 'Salário médio mensal do mix (R$)',
    shiftsPerDay: 'Plantões / turnos por dia (cobertura 24h)',
  },
  resultBlurb:
    'Template hospital: cobertura contínua e cargos críticos (+6% atrito setorial). Valide plantões, CCT e postos por turno com o cliente.',
}
