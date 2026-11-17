/**
 * Apdata-faithful cadastral hierarchy for ERP parametrization / carga.
 *
 * Guided sequence (consultant UX):
 *   1. Jornadas e Steps — work blocks named by start/end; optional lunch jornada
 *   2. Horários — abbreviated workdays + entry/exit; user selects which to create
 *   3. Ciclos de Horários — work×off matrix + required Data Início
 *   4. Grades (Vagas) — turmas T1…T7 × CC codes (no PII)
 *
 * Derived from Quadro Proposto (ScheduleBuilder / crew-distribution).
 * JSON/Excel download is an advanced export — not “enviar para o ERP”.
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
  resolveShiftWindows,
  type OperatingHours,
} from './operating-hours'
import { MAX_SUGGESTED_DAILY_HOURS } from './schedule-policy'
import type { CostCenterResult, SimulationResult } from './types'

export const APDATA_HIERARCHY_SCHEMA_VERSION =
  'turnocheck-apdata-hierarchy-v2' as const

export type ApdataStepTipo =
  | 'ENTRADA'
  | 'INTERVALO_INICIO'
  | 'INTERVALO_FIM'
  | 'SAIDA'

/** Work-block kind for split jornadas (Passo 1). */
export type ApdataJornadaKind = 'MANHA' | 'ALMOCO' | 'TARDE' | 'INTEGRAL'

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
  /** Planned daily work hours for this block. */
  horasDia: number
  steps: ApdataJornadaStep[]
  /** Split-block role (manhã / almoço / tarde / integral). */
  kind: ApdataJornadaKind
}

export interface ApdataHorario {
  codigo: string
  descricao: string
  /** Jornada codes bound to this horário (manhã, [almoço], tarde). */
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

/** Nested review tree: Jornadas → Horário → Ciclo → Grade/Turma. */
export interface ApdataHierarchyNode {
  /** Bound jornadas in order (manhã, [almoço], tarde) or single integral. */
  jornadas: ApdataJornada[]
  /** First work block — convenience for sheets that expect a single code. */
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
  includeLunchJornada: boolean
  selectedHorarioIds: string[]
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
  /**
   * Create a separate jornada de almoço between manhã/tarde blocks.
   * Default: true when the shift admits a meal window (≥6h and &lt;24h).
   */
  includeLunchJornada?: boolean
  /**
   * Horário candidate ids to materialize. Omit / empty = all candidates.
   * Ids come from `deriveApdataCandidates`.
   */
  selectedHorarioIds?: string[]
}

/** Candidate jornada preview (Passo 1). */
export interface ApdataJornadaCandidate {
  codigo: string
  descricao: string
  kind: ApdataJornadaKind
  startHour: number
  endHour: number
  horasDia: number
  steps: ApdataJornadaStep[]
}

/** Candidate horário with selection id (Passo 2). */
export interface ApdataHorarioCandidate {
  /** Stable selection key (session UI). */
  id: string
  codigo: string
  /** Human preview: abbreviated workdays + entry/exit. */
  descricao: string
  workDays: CoverageWeekday[]
  workDaysLabel: string
  startHour: number
  endHour: number
  centroCustoCodigo: string
  escala: string
  turmaIndexes: number[]
  jornadaCodigos: string[]
}

export interface ApdataShiftWindow {
  startHour: number
  endHour: number
  hours: number
}

export interface ApdataStructureCandidates {
  /** Primary / first shift (Passo 1 summary). */
  shift: ApdataShiftWindow
  /** All shift windows derived from operating hours × turnos/dia. */
  shifts: ApdataShiftWindow[]
  meal: { breakStart: number; breakEnd: number } | null
  /** Suggested default for lunch jornada toggle. */
  includeLunchDefault: boolean
  jornadas: ApdataJornadaCandidate[]
  horarios: ApdataHorarioCandidate[]
}

const DISCLAIMER =
  'Estrutura cadastral Apdata (Jornadas→Horários→Ciclo→Grade) gerada pelo Turnocheck ' +
  'a partir do Quadro Proposto. Códigos e HC agregados por CC/turma — sem nomes ' +
  'ou CPF. Validar Data Início e códigos com RH antes da carga no ERP. ' +
  'O JSON/Excel é exportação avançada — não envia dados ao ERP automaticamente.'

const WEEKDAY_ABBREV: Record<CoverageWeekday, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
}

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

function wrapHour(h: number): number {
  if (h === 24) return 24
  const x = ((h % 24) + 24) % 24
  return Math.round(x * 100) / 100
}

function shiftHours(startHour: number, endHour: number): number {
  if (startHour === endHour) return 24
  if (endHour > startHour) return Math.round((endHour - startHour) * 100) / 100
  return Math.round((24 - startHour + endHour) * 100) / 100
}

/** Compact workday key for códigos (SEGSEX, TERSAB, SEGQUASEX…). */
export function workdayKey(workDays: readonly string[]): string {
  const set = new Set(
    workDays.map((d) => d.toLowerCase()).filter((d): d is CoverageWeekday =>
      (COVERAGE_WEEKDAYS as readonly string[]).includes(d),
    ),
  )
  const ordered = COVERAGE_WEEKDAYS.filter((d) => set.has(d))
  if (ordered.length === 0) return 'OFF'
  if (ordered.length === 1) return ordered[0]!.toUpperCase()
  const indexes = ordered.map((d) => COVERAGE_WEEKDAYS.indexOf(d))
  const consecutive = indexes.every(
    (idx, i) => i === 0 || idx === indexes[i - 1]! + 1,
  )
  // Consecutive runs → compact SEGSEX / TERSAB; gaps keep full SEGQUASEX.
  if (consecutive && ordered.length >= 2) {
    return `${ordered[0]!.toUpperCase()}${ordered.at(-1)!.toUpperCase()}`
  }
  return ordered.map((d) => d.toUpperCase()).join('')
}

/**
 * Abbreviated workday label for horário names.
 * Consecutive runs collapse to Seg–Sex; gaps use · (Seg·Qua·Sex).
 */
export function formatWorkdayAbbrev(workDays: readonly string[]): string {
  const set = new Set(
    workDays.map((d) => d.toLowerCase()).filter((d): d is CoverageWeekday =>
      (COVERAGE_WEEKDAYS as readonly string[]).includes(d),
    ),
  )
  const ordered = COVERAGE_WEEKDAYS.filter((d) => set.has(d))
  if (ordered.length === 0) return '—'
  if (ordered.length === 1) return WEEKDAY_ABBREV[ordered[0]!]

  const indexes = ordered.map((d) => COVERAGE_WEEKDAYS.indexOf(d))
  const consecutive = indexes.every(
    (idx, i) => i === 0 || idx === indexes[i - 1]! + 1,
  )
  if (consecutive) {
    return `${WEEKDAY_ABBREV[ordered[0]!]}–${WEEKDAY_ABBREV[ordered.at(-1)!]!}`
  }
  return ordered.map((d) => WEEKDAY_ABBREV[d]).join('·')
}

/** Horário display name: abbreviated workdays + entry/exit. */
export function formatHorarioLabel(
  workDays: readonly string[],
  startHour: number,
  endHour: number,
): string {
  return `${formatWorkdayAbbrev(workDays)} ${formatHourClock(startHour)}–${formatHourClock(endHour)}`
}

/** Jornada display name from block start/end (or Almoço …). */
export function formatJornadaLabel(
  startHour: number,
  endHour: number,
  kind: ApdataJornadaKind = 'INTEGRAL',
): string {
  const range = `${formatHourClock(startHour)}–${formatHourClock(endHour)}`
  if (kind === 'ALMOCO') return `Almoço ${range}`
  return range
}

/**
 * Grade/turma description with work times in front of the turma + CC.
 * Example: `09:00–17:00 · T1 · GERAL`
 */
export function formatTurmaLabel(
  startHour: number,
  endHour: number,
  turmaIndex: number,
  centroCustoCodigo: string,
): string {
  const range = `${formatHourClock(startHour)}–${formatHourClock(endHour)}`
  const cc = centroCustoCodigo.trim() || 'GERAL'
  return `${range} · T${turmaIndex} · ${cc}`
}

/**
 * Apply the same `09:00–17:00 · T# · CC` prefix used on Quadro Proposto to any
 * crew list (incl. Quadro Atual / baseline). Windows cycle when there are more
 * turmas than shift tiles (same rule as ScheduleBuilder editable rows).
 */
export function applyTurmaHourLabels(
  crews: TurmaCrew[],
  windows: readonly { startHour: number; endHour: number }[],
  centroCustoCodigo: string,
): TurmaCrew[] {
  if (windows.length === 0) return crews
  return crews.map((c, i) => {
    const win = windows[i % windows.length] ?? windows[0]!
    return {
      ...c,
      label: formatTurmaLabel(
        win.startHour,
        win.endHour,
        c.turmaIndex,
        centroCustoCodigo,
      ),
    }
  })
}

export function jornadaCodigoFor(
  startHour: number,
  endHour: number,
  kind: ApdataJornadaKind = 'INTEGRAL',
): string {
  const base = `JOR-${clockCode(startHour)}-${clockCode(endHour)}`
  if (kind === 'ALMOCO') return `JOR-ALM-${clockCode(startHour)}-${clockCode(endHour)}`
  return base
}

export function horarioCodigoFor(
  workDays: readonly string[],
  startHour: number,
  endHour: number,
  centroCusto?: string,
): string {
  const days = workdayKey(workDays)
  const core = `HOR-${days}-${clockCode(startHour)}-${clockCode(endHour)}`
  if (!centroCusto) return core
  return `${core}-${slugCc(centroCusto)}`
}

/**
 * Meal window centered in the shift (1h) when span ≥6h and &lt;24h.
 * Used to split manhã / almoço / tarde jornadas.
 */
export function resolveMealWindow(
  startHour: number,
  endHour: number,
): { breakStart: number; breakEnd: number } | null {
  const hours = shiftHours(startHour, endHour)
  if (hours < 6 || hours >= 24) return null
  const mid = startHour + hours / 2
  return {
    breakStart: wrapHour(mid - 0.5),
    breakEnd: wrapHour(mid + 0.5),
  }
}

/** Two-step block: entrada → saída (Passo 1 A/B and lunch). */
export function buildBlockJornadaSteps(
  startHour: number,
  endHour: number,
): ApdataJornadaStep[] {
  return [
    { ordem: 1, tipo: 'ENTRADA', hora: formatHourClock(startHour) },
    { ordem: 2, tipo: 'SAIDA', hora: formatHourClock(endHour) },
  ]
}

/**
 * Sequential Apdata Steps for one monolithic jornada from entrada/saída.
 * Spans ≥6h insert a 1h meal interval centered in the shift.
 * Kept for compatibility; preferred path uses split blocks + lunch jornada.
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
    steps.push({
      ordem: 2,
      tipo: 'INTERVALO_INICIO',
      hora: formatHourClock(wrapHour(breakStart)),
    })
    steps.push({
      ordem: 3,
      tipo: 'INTERVALO_FIM',
      hora: formatHourClock(wrapHour(breakEnd)),
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

function candidateFromBlock(
  startHour: number,
  endHour: number,
  kind: ApdataJornadaKind,
): ApdataJornadaCandidate {
  const horasDia = shiftHours(startHour, endHour)
  return {
    codigo: jornadaCodigoFor(startHour, endHour, kind),
    descricao: formatJornadaLabel(startHour, endHour, kind),
    kind,
    startHour,
    endHour,
    horasDia,
    steps: buildBlockJornadaSteps(startHour, endHour),
  }
}

/** Build Passo 1 jornada candidates for a shift (+ optional lunch). */
export function buildJornadaCandidates(
  startHour: number,
  endHour: number,
  includeLunchJornada: boolean,
): ApdataJornadaCandidate[] {
  const meal = resolveMealWindow(startHour, endHour)
  if (!meal) {
    return [candidateFromBlock(startHour, endHour, 'INTEGRAL')]
  }
  const out: ApdataJornadaCandidate[] = [
    candidateFromBlock(startHour, meal.breakStart, 'MANHA'),
  ]
  if (includeLunchJornada) {
    out.push(candidateFromBlock(meal.breakStart, meal.breakEnd, 'ALMOCO'))
  }
  out.push(candidateFromBlock(meal.breakEnd, endHour, 'TARDE'))
  return out
}

/**
 * Entrada/saída windows from operating hours / shift tiles.
 * Long funcionamento (09–21) → tiles 09–17 + 13–21 even when turnos/dia = 1,
 * matching schedule suggestions — never a silent lone 09–17.
 */
export function resolveApdataShiftWindows(
  operatingHours: OperatingHours,
  shiftsPerDay: number,
): ApdataShiftWindow[] {
  const windows = resolveShiftWindows(
    operatingHours,
    shiftsPerDay,
    MAX_SUGGESTED_DAILY_HOURS,
    8,
  )
  if (windows.length > 0) return windows
  return [{ startHour: 8, endHour: 17, hours: 8 }]
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

function normalizeWorkDays(days: readonly string[]): CoverageWeekday[] {
  const set = new Set(
    days.map((d) => d.toLowerCase()).filter((d): d is CoverageWeekday =>
      (COVERAGE_WEEKDAYS as readonly string[]).includes(d),
    ),
  )
  return COVERAGE_WEEKDAYS.filter((d) => set.has(d))
}

/** Default Data Início = day 1 of the scenario reference month. */
export function defaultApdataDataInicio(scenarioId: string): string {
  const { year, month } = defaultReferencePeriod(scenarioId)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Derive jornada + horário candidates from Quadro Proposto / simulation.
 * Entrada/saída come from operating hours × turnos/dia (shift tiles), not a
 * hardcoded 09–17. Horário ids are stable for session selection UI.
 */
export function deriveApdataCandidates(
  result: SimulationResult,
  options: Pick<BuildApdataHierarchyOptions, 'includeLunchJornada'> = {},
): ApdataStructureCandidates {
  const operatingHours =
    result.input.operatingHours ?? DEFAULT_OPERATING_HOURS
  const shiftsPerDay = Math.max(1, result.input.shiftsPerDay || 1)
  const shifts = resolveApdataShiftWindows(operatingHours, shiftsPerDay)
  const shift = shifts[0]!
  const meal = resolveMealWindow(shift.startHour, shift.endHour)
  const includeLunchDefault = shifts.some(
    (s) => resolveMealWindow(s.startHour, s.endHour) != null,
  )
  const includeLunch =
    options.includeLunchJornada ?? includeLunchDefault

  const jornadasByCode = new Map<string, ApdataJornadaCandidate>()
  const jornadasForShift = new Map<string, string[]>()
  for (const s of shifts) {
    const shiftMeal = resolveMealWindow(s.startHour, s.endHour)
    const blocks = buildJornadaCandidates(
      s.startHour,
      s.endHour,
      includeLunch && shiftMeal != null,
    )
    const codes: string[] = []
    for (const b of blocks) {
      if (!jornadasByCode.has(b.codigo)) jornadasByCode.set(b.codigo, b)
      codes.push(b.codigo)
    }
    jornadasForShift.set(`${clockCode(s.startHour)}-${clockCode(s.endHour)}`, codes)
  }
  const jornadas = [...jornadasByCode.values()]

  const centersIn = centersFromResult(result)
  const horarioMap = new Map<string, ApdataHorarioCandidate>()

  for (const cc of centersIn) {
    const dist = resolveDist(cc, result.distribuicaoTurmas)
    // Group crews that share the same workday pattern + escala → one base group.
    const groups = new Map<string, TurmaCrew[]>()
    for (const crew of dist.crews) {
      const work = normalizeWorkDays(crew.workDays)
      const key = `${workdayKey(work)}|${crew.escala}`
      const list = groups.get(key) ?? []
      list.push(crew)
      groups.set(key, list)
    }

    for (const crews of groups.values()) {
      const lead = crews[0]!
      const work = normalizeWorkDays(lead.workDays)
      for (const s of shifts) {
        const shiftKey = `${clockCode(s.startHour)}-${clockCode(s.endHour)}`
        const jornadaCodigos = jornadasForShift.get(shiftKey) ?? []
        const codigo = horarioCodigoFor(
          work,
          s.startHour,
          s.endHour,
          cc.centroCusto,
        )
        const id = `${slugCc(cc.centroCusto)}::${workdayKey(work)}::${lead.escala}::${shiftKey}`
        const existing = horarioMap.get(id)
        if (existing) {
          for (const c of crews) {
            if (!existing.turmaIndexes.includes(c.turmaIndex)) {
              existing.turmaIndexes.push(c.turmaIndex)
            }
          }
          existing.turmaIndexes.sort((a, b) => a - b)
          continue
        }
        horarioMap.set(id, {
          id,
          codigo,
          descricao: formatHorarioLabel(work, s.startHour, s.endHour),
          workDays: work,
          workDaysLabel: formatWorkdayAbbrev(work),
          startHour: s.startHour,
          endHour: s.endHour,
          centroCustoCodigo: cc.centroCusto,
          escala: lead.escala,
          turmaIndexes: crews.map((c) => c.turmaIndex).sort((a, b) => a - b),
          jornadaCodigos: [...jornadaCodigos],
        })
      }
    }
  }

  return {
    shift,
    shifts,
    meal,
    includeLunchDefault,
    jornadas,
    horarios: [...horarioMap.values()],
  }
}

/**
 * Build Apdata cadastral tree from Quadro Proposto (T1…T7).
 * LGPD-safe: CC codes, schedule codes, turmas, headcount — no names/CPF.
 * Respects horário selection and lunch-jornada toggle from the wizard.
 */
export function buildApdataHierarchy(
  result: SimulationResult,
  options: BuildApdataHierarchyOptions = {},
): ApdataHierarchyTree {
  const dataInicio =
    options.dataInicio?.trim() ||
    defaultApdataDataInicio(result.ruleVersion.params.scenarioId)
  const tipoGrade = options.tipoGrade ?? 'VAGAS'
  const candidates = deriveApdataCandidates(result, {
    includeLunchJornada: options.includeLunchJornada,
  })
  const includeLunchJornada =
    options.includeLunchJornada ?? candidates.includeLunchDefault

  const selectedSet =
    options.selectedHorarioIds && options.selectedHorarioIds.length > 0
      ? new Set(options.selectedHorarioIds)
      : null
  const selectedHorarios = candidates.horarios.filter((h) =>
    selectedSet ? selectedSet.has(h.id) : true,
  )
  const selectedHorarioIds = selectedHorarios.map((h) => h.id)
  const selectedByCc = new Map<string, ApdataHorarioCandidate[]>()
  for (const h of selectedHorarios) {
    const list = selectedByCc.get(h.centroCustoCodigo) ?? []
    list.push(h)
    selectedByCc.set(h.centroCustoCodigo, list)
  }

  const jornadasByCode = new Map<string, ApdataJornada>()
  for (const jc of candidates.jornadas) {
    jornadasByCode.set(jc.codigo, {
      codigo: jc.codigo,
      descricao: jc.descricao,
      horasDia: jc.horasDia,
      steps: jc.steps,
      kind: jc.kind,
    })
  }

  const horariosByCode = new Map<string, ApdataHorario>()
  const ciclosByCode = new Map<string, ApdataCicloHorario>()
  const grades: ApdataGradeTurma[] = []
  const centers: ApdataHierarchyCenter[] = []
  const centersIn = centersFromResult(result)
  const regimeRoot = result.distribuicaoTurmas.regime
  // Only keep jornadas actually bound to selected horários.
  const usedJornadaCodes = new Set<string>()

  for (const cc of centersIn) {
    const dist = resolveDist(cc, result.distribuicaoTurmas)
    const ccSlug = slugCc(cc.centroCusto)
    const nodes: ApdataHierarchyNode[] = []
    const ccHorarios = selectedByCc.get(cc.centroCusto) ?? []

    for (const cand of ccHorarios) {
      const candHours = shiftHours(cand.startHour, cand.endHour)
      if (!horariosByCode.has(cand.codigo)) {
        const weekly =
          cc.cargaSemanalAtual != null && Number.isFinite(cc.cargaSemanalAtual)
            ? cc.cargaSemanalAtual
            : Math.round(candHours * cand.workDays.length * 10) / 10
        horariosByCode.set(cand.codigo, {
          codigo: cand.codigo,
          descricao: cand.descricao,
          jornadaCodigos: [...cand.jornadaCodigos],
          cargaSemanalHoras: weekly,
          codHorarioAtualRef: cc.codHorarioAtual ?? null,
        })
      }
      const horario = horariosByCode.get(cand.codigo)!
      for (const code of cand.jornadaCodigos) usedJornadaCodes.add(code)

      const boundJornadas = cand.jornadaCodigos
        .map((code) => jornadasByCode.get(code))
        .filter((j): j is ApdataJornada => j != null)

      const crewsForHorario = dist.crews.filter((c) =>
        cand.turmaIndexes.includes(c.turmaIndex),
      )

      for (const crew of crewsForHorario) {
        const dias = cycleDaysFromCrew(crew)
        const workDays = dias.filter((d) => d.marca === 'T').length
        const offDays = dias.filter((d) => d.marca === 'F').length
        const restKey = crew.restDays
          .map((d) => d.toLowerCase().slice(0, 3))
          .join('')
          .toUpperCase() || 'OFF'
        const shiftKey = `${clockCode(cand.startHour)}${clockCode(cand.endHour)}`
        const cicloCodigo = `CIC-${ccSlug}-T${crew.turmaIndex}-${crew.escala.replace(/×/g, 'x').toUpperCase()}-${restKey}-${shiftKey}`

        let ciclo = ciclosByCode.get(cicloCodigo)
        if (!ciclo) {
          ciclo = {
            codigo: cicloCodigo,
            horarioCodigo: horario.codigo,
            dataInicio,
            escala: crew.escala,
            workDays,
            offDays,
            dias,
          }
          ciclosByCode.set(cicloCodigo, ciclo)
        } else {
          ciclo.dataInicio = dataInicio
        }

        const grade: ApdataGradeTurma = {
          turma: `T${crew.turmaIndex}`,
          turmaIndex: crew.turmaIndex,
          cicloCodigo,
          centroCustoCodigo: cc.centroCusto,
          headcountProposto: Math.max(0, Math.round(crew.headcount)),
          tipoGrade,
          label: formatTurmaLabel(
            cand.startHour,
            cand.endHour,
            crew.turmaIndex,
            cc.centroCusto,
          ),
        }
        grades.push(grade)
        nodes.push({
          jornadas: boundJornadas,
          jornada: boundJornadas[0]!,
          horario,
          ciclo,
          grades: [grade],
        })
      }
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

  const catalogJornadas =
    usedJornadaCodes.size > 0
      ? [...jornadasByCode.values()].filter((j) => usedJornadaCodes.has(j.codigo))
      : [...jornadasByCode.values()]

  return {
    schemaVersion: APDATA_HIERARCHY_SCHEMA_VERSION,
    dataInicio,
    scenarioId: result.ruleVersion.params.scenarioId,
    scenarioLabel: result.ruleVersion.label,
    regimeFuncionamento: regimeRoot,
    includeLunchJornada,
    selectedHorarioIds,
    centers,
    jornadas: catalogJornadas,
    horarios: [...horariosByCode.values()],
    ciclos: [...ciclosByCode.values()].map((c) => ({
      ...c,
      dataInicio,
    })),
    grades,
    disclaimer: DISCLAIMER,
  }
}
