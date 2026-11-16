/**
 * Apdata-faithful cadastral hierarchy for ERP parametrization / carga.
 *
 * Tree (consultant “fiel da balança”):
 *   1. Jornadas e Steps — daily hours + sequential intervals
 *   2. Horários — bind jornadas
 *   3. Ciclos de Horários — work×off matrix + required Data Início
 *   4. Grades (Vagas) — turmas T1…T7 × CC codes (no PII)
 *
 * Derived from Quadro Proposto (ScheduleBuilder / crew-distribution).
 */

import type { RegimeFuncionamento } from '../types'
import {
  COVERAGE_WEEKDAYS,
  COVERAGE_WEEKDAY_LABELS,
  type CoverageWeekday,
} from './coverage-days'
import {
  distributeCrews,
  type TurmaCrew,
  type TurmaDistribution,
} from './crew-distribution'
import {
  defaultReferencePeriod,
} from './monthly-calendar'
import {
  DEFAULT_OPERATING_HOURS,
  formatHourClock,
  tileCoverageWindow,
  widestCoverageDay,
  type OperatingHours,
} from './operating-hours'
import { MAX_SUGGESTED_DAILY_HOURS } from './schedule-policy'
import type { CostCenterResult, SimulationResult } from './types'

export const APDATA_HIERARCHY_SCHEMA_VERSION =
  'turnocheck-apdata-hierarchy-v1' as const

export type ApdataStepTipo =
  | 'ENTRADA'
  | 'INTERVALO_INICIO'
  | 'INTERVALO_FIM'
  | 'SAIDA'

export interface ApdataJornadaStep {
  /** 1-based sequential order (Apdata Steps). */
  ordem: number
  tipo: ApdataStepTipo
  /** Clock HH:MM (24:00 allowed as end-of-day). */
  hora: string
}

export interface ApdataJornada {
  codigo: string
  descricao: string
  /** Planned daily work hours. */
  horasDia: number
  steps: ApdataJornadaStep[]
}

export interface ApdataHorario {
  codigo: string
  descricao: string
  /** Jornada codes bound to this horário. */
  jornadaCodigos: string[]
  cargaSemanalHoras: number | null
  /** Optional reference to dominant Apdata horário code (Atual). */
  codHorarioAtualRef: string | null
}

export interface ApdataCicloDia {
  /** 1-based day order in the cycle. */
  ordem: number
  weekday: CoverageWeekday
  weekdayLabel: string
  /** T = Trabalho, F = Folga. */
  marca: 'T' | 'F'
}

export interface ApdataCicloHorario {
  codigo: string
  horarioCodigo: string
  /** Required vigência start (new scale / agreement). ISO date YYYY-MM-DD. */
  dataInicio: string
  escala: string
  workDays: number
  offDays: number
  dias: ApdataCicloDia[]
}

export type ApdataGradeTipo = 'VAGAS' | 'COLABORADORES'

export interface ApdataGradeTurma {
  /** T1…T7. */
  turma: string
  turmaIndex: number
  cicloCodigo: string
  /** Cost-center code / structure id — never person name/CPF. */
  centroCustoCodigo: string
  headcountProposto: number
  tipoGrade: ApdataGradeTipo
  label: string
}

/** Nested review tree: Jornada → Horário → Ciclo → Grade/Turma. */
export interface ApdataHierarchyNode {
  jornada: ApdataJornada
  horario: ApdataHorario
  ciclo: ApdataCicloHorario
  grades: ApdataGradeTurma[]
}

export interface ApdataHierarchyCenter {
  centroCustoCodigo: string
  regime: RegimeFuncionamento
  currentHeadcount: number
  requiredHeadcount: number
  dailyCoverageNeed: number
  nodes: ApdataHierarchyNode[]
}

export interface ApdataHierarchyTree {
  schemaVersion: typeof APDATA_HIERARCHY_SCHEMA_VERSION
  /** Default Data Início applied to all ciclos (consultant-editable). */
  dataInicio: string
  scenarioId: string
  scenarioLabel: string
  regimeFuncionamento: RegimeFuncionamento
  centers: ApdataHierarchyCenter[]
  /** Flat catalogs for ERP carga (deduped by codigo). */
  jornadas: ApdataJornada[]
  horarios: ApdataHorario[]
  ciclos: ApdataCicloHorario[]
  grades: ApdataGradeTurma[]
  disclaimer: string
}

export interface BuildApdataHierarchyOptions {
  /** Override Data Início (YYYY-MM-DD). Defaults to day 1 of scenario reference period. */
  dataInicio?: string
  /** Grade type — proposed quadro uses VAGAS (no PII). */
  tipoGrade?: ApdataGradeTipo
}

const DISCLAIMER =
  'Árvore cadastral Apdata (Jornada→Horário→Ciclo→Grade) gerada pelo Turnocheck ' +
  'a partir do Quadro Proposto. Códigos e HC agregados por CC/turma — sem nomes ' +
  'ou CPF. Validar Data Início e códigos com RH antes da carga no ERP.'

function slugCc(centroCusto: string): string {
  const s = centroCusto
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (s || 'GERAL').slice(0, 24)
}

function clockCode(h: number): string {
  if (h === 24) return '2400'
  const n = ((h % 24) + 24) % 24
  const hh = Math.floor(n)
  const mm = Math.round((n - hh) * 60)
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`
}

function shiftHours(startHour: number, endHour: number): number {
  if (startHour === endHour) return 24
  if (endHour > startHour) return Math.round((endHour - startHour) * 100) / 100
  return Math.round((24 - startHour + endHour) * 100) / 100
}

/**
 * Sequential Apdata Steps for one jornada from entrada/saída.
 * Spans ≥6h insert a 1h meal interval centered in the shift.
 */
export function buildJornadaSteps(
  startHour: number,
  endHour: number,
): ApdataJornadaStep[] {
  const hours = shiftHours(startHour, endHour)
  const steps: ApdataJornadaStep[] = [
    { ordem: 1, tipo: 'ENTRADA', hora: formatHourClock(startHour) },
  ]

  if (hours >= 6 && hours < 24) {
    const mid = startHour + hours / 2
    const breakStart = mid - 0.5
    const breakEnd = mid + 0.5
    const wrap = (h: number) => {
      if (h === 24) return 24
      const x = ((h % 24) + 24) % 24
      return Math.round(x * 100) / 100
    }
    steps.push({
      ordem: 2,
      tipo: 'INTERVALO_INICIO',
      hora: formatHourClock(wrap(breakStart)),
    })
    steps.push({
      ordem: 3,
      tipo: 'INTERVALO_FIM',
      hora: formatHourClock(wrap(breakEnd)),
    })
    steps.push({
      ordem: 4,
      tipo: 'SAIDA',
      hora: formatHourClock(endHour),
    })
  } else {
    steps.push({
      ordem: 2,
      tipo: 'SAIDA',
      hora: formatHourClock(endHour),
    })
  }
  return steps
}

function defaultShiftFromOperatingHours(operatingHours: OperatingHours): {
  startHour: number
  endHour: number
  hours: number
} {
  const day = widestCoverageDay(operatingHours)
  const tiles = tileCoverageWindow(day, MAX_SUGGESTED_DAILY_HOURS, 8)
  if (tiles[0]) {
    return {
      startHour: tiles[0].startHour,
      endHour: tiles[0].endHour,
      hours: tiles[0].hours,
    }
  }
  return { startHour: 8, endHour: 17, hours: 8 }
}

function cycleDaysFromCrew(crew: TurmaCrew): ApdataCicloDia[] {
  const work = new Set(crew.workDays.map((d) => d.toLowerCase()))
  return COVERAGE_WEEKDAYS.map((weekday, i) => ({
    ordem: i + 1,
    weekday,
    weekdayLabel: COVERAGE_WEEKDAY_LABELS[weekday],
    marca: work.has(weekday) ? ('T' as const) : ('F' as const),
  }))
}

function centersFromResult(result: SimulationResult): CostCenterResult[] {
  if (result.byCostCenter.length > 0) return result.byCostCenter
  const escala = result.input.currentScale
  const regime = result.distribuicaoTurmas.regime
  return [
    {
      centroCusto: 'Geral',
      currentHeadcount: result.coverage.currentHeadcount,
      requiredHeadcount: result.coverage.requiredHeadcount,
      additionalHeadcount: result.coverage.additionalHeadcount,
      baselinePayroll: result.cost.baselineMonthlyPayroll,
      projectedPayroll: result.cost.projectedMonthlyPayroll,
      payrollMonthlyDelta: result.cost.monthlyDelta,
      vr: result.vr ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      vt: result.vt ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      va: result.va ?? {
        currentMonthly: 0,
        proposedMonthly: 0,
        monthlyDelta: 0,
        annualDelta: 0,
        proposedDaysPerMonth: 0,
      },
      assistMedicaMonthly: result.assistMedicaMonthly ?? 0,
      assistOdontoMonthly: result.assistOdontoMonthly ?? 0,
      regimeFuncionamento: regime,
      distribuicaoTurmas: result.distribuicaoTurmas,
      codHorarioAtual: null,
      escalaAtual: escala,
      cargaSemanalAtual: null,
    },
  ]
}

function resolveDist(cc: CostCenterResult, fallback: TurmaDistribution): TurmaDistribution {
  return cc.distribuicaoTurmas ?? distributeCrews(
    cc.regimeFuncionamento ?? fallback.regime,
    cc.requiredHeadcount,
  )
}

/** Default Data Início = day 1 of the scenario reference month. */
export function defaultApdataDataInicio(scenarioId: string): string {
  const { year, month } = defaultReferencePeriod(scenarioId)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Build Apdata cadastral tree from Quadro Proposto (T1…T7).
 * LGPD-safe: CC codes, schedule codes, turmas, headcount — no names/CPF.
 */
export function buildApdataHierarchy(
  result: SimulationResult,
  options: BuildApdataHierarchyOptions = {},
): ApdataHierarchyTree {
  const dataInicio =
    options.dataInicio?.trim() ||
    defaultApdataDataInicio(result.ruleVersion.params.scenarioId)
  const tipoGrade = options.tipoGrade ?? 'VAGAS'
  const operatingHours =
    result.input.operatingHours ?? DEFAULT_OPERATING_HOURS
  const shift = defaultShiftFromOperatingHours(operatingHours)
  const centersIn = centersFromResult(result)
  const regimeRoot = result.distribuicaoTurmas.regime

  const jornadasByCode = new Map<string, ApdataJornada>()
  const horariosByCode = new Map<string, ApdataHorario>()
  const ciclosByCode = new Map<string, ApdataCicloHorario>()
  const grades: ApdataGradeTurma[] = []
  const centers: ApdataHierarchyCenter[] = []

  for (const cc of centersIn) {
    const dist = resolveDist(cc, result.distribuicaoTurmas)
    const ccSlug = slugCc(cc.centroCusto)
    const nodes: ApdataHierarchyNode[] = []

    // Group crews that share the same work×off pattern + escala → one ciclo each
    // Distinct rest offsets (CONTINUO_7D) → distinct ciclos; shared jornada/horário.
    const jornadaCodigo = `JOR-${clockCode(shift.startHour)}-${clockCode(shift.endHour)}`
    if (!jornadasByCode.has(jornadaCodigo)) {
      const steps = buildJornadaSteps(shift.startHour, shift.endHour)
      jornadasByCode.set(jornadaCodigo, {
        codigo: jornadaCodigo,
        descricao: `Jornada ${formatHourClock(shift.startHour)}–${formatHourClock(shift.endHour)} (${shift.hours}h)`,
        horasDia: shift.hours,
        steps,
      })
    }
    const jornada = jornadasByCode.get(jornadaCodigo)!

    const horarioCodigo = `HOR-PROP-${ccSlug}`
    if (!horariosByCode.has(horarioCodigo)) {
      const weekly =
        cc.cargaSemanalAtual != null && Number.isFinite(cc.cargaSemanalAtual)
          ? cc.cargaSemanalAtual
          : Math.round(shift.hours * 5 * 10) / 10
      horariosByCode.set(horarioCodigo, {
        codigo: horarioCodigo,
        descricao: `Horário proposto · CC ${cc.centroCusto}`,
        jornadaCodigos: [jornadaCodigo],
        cargaSemanalHoras: weekly,
        codHorarioAtualRef: cc.codHorarioAtual ?? null,
      })
    }
    const horario = horariosByCode.get(horarioCodigo)!

    for (const crew of dist.crews) {
      const dias = cycleDaysFromCrew(crew)
      const workDays = dias.filter((d) => d.marca === 'T').length
      const offDays = dias.filter((d) => d.marca === 'F').length
      const restKey = crew.restDays
        .map((d) => d.toLowerCase().slice(0, 3))
        .join('')
        .toUpperCase() || 'OFF'
      const cicloCodigo = `CIC-${ccSlug}-T${crew.turmaIndex}-${crew.escala.replace(/×/g, 'x').toUpperCase()}-${restKey}`

      let ciclo = ciclosByCode.get(cicloCodigo)
      if (!ciclo) {
        ciclo = {
          codigo: cicloCodigo,
          horarioCodigo,
          dataInicio,
          escala: crew.escala,
          workDays,
          offDays,
          dias,
        }
        ciclosByCode.set(cicloCodigo, ciclo)
      } else {
        // Keep Data Início in sync with the tree-level override.
        ciclo.dataInicio = dataInicio
      }

      const grade: ApdataGradeTurma = {
        turma: `T${crew.turmaIndex}`,
        turmaIndex: crew.turmaIndex,
        cicloCodigo,
        centroCustoCodigo: cc.centroCusto,
        headcountProposto: Math.max(0, Math.round(crew.headcount)),
        tipoGrade,
        label: crew.label,
      }
      grades.push(grade)
      nodes.push({ jornada, horario, ciclo, grades: [grade] })
    }

    centers.push({
      centroCustoCodigo: cc.centroCusto,
      regime: dist.regime,
      currentHeadcount: cc.currentHeadcount,
      requiredHeadcount: cc.requiredHeadcount,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      nodes,
    })
  }

  return {
    schemaVersion: APDATA_HIERARCHY_SCHEMA_VERSION,
    dataInicio,
    scenarioId: result.ruleVersion.params.scenarioId,
    scenarioLabel: result.ruleVersion.label,
    regimeFuncionamento: regimeRoot,
    centers,
    jornadas: [...jornadasByCode.values()],
    horarios: [...horariosByCode.values()],
    ciclos: [...ciclosByCode.values()].map((c) => ({
      ...c,
      dataInicio,
    })),
    grades,
    disclaimer: DISCLAIMER,
  }
}
