import { useEffect, useMemo, useState } from 'react'
import {
  COVERAGE_WEEKDAYS,
  COVERAGE_WEEKDAY_LABELS,
  MONTH_LABELS_PT,
  REGIME_FUNCIONAMENTO_LABELS,
  baselineCrewsForCalendar,
  buildMonthCalendarMatrix,
  coberturaPropostaFromCrews,
  compareCoverageDay,
  defaultReferencePeriod,
  deriveCoberturaAtualPorDia,
  distributeCrews,
  formatHourClock,
  formatTurmaLabel,
  hourToTimeInputValue,
  parseScale,
  resolveShiftWindows,
  timeInputToHour,
  type CoberturaPorDia,
  type CostCenterResult,
  type CoverageWeekday,
  type MonthCalendarMatrix,
  type OperatingHours,
  type SimulationResult,
  type TurmaCrew,
} from '../engine'
import { downloadEscalasTurmasExcel } from '../utils/exportExcel'
import {
  OPERACIONAL_SEM_CNPJ_KEY,
  nestCentersByCc,
} from '../utils/resultsDossier'
import { cnpjDigits } from '../apdata/cnpj'

export interface EditableTurmaRow {
  turmaIndex: number
  label: string
  escala: string
  workDays: string[]
  restDays: string[]
  headcount: number
  startHour: number
  endHour: number
}

interface ScheduleBuilderViewProps {
  result: SimulationResult
  /** Optional: print-friendly static summary (no inputs). */
  variant?: 'interactive' | 'print'
  /**
   * When set, only these centros de custo are shown (Seção 2 per CNPJ).
   * `null` / omitted = all centers from the simulation.
   */
  centroCustoFilter?: string[] | null
  /**
   * Digits-only CNPJ (or {@link OPERACIONAL_SEM_CNPJ_KEY}) for the Filial
   * accordion — keeps the same CC code under another filial out of this nest.
   */
  cnpjFilter?: string | null
  /** Hide the outer title/export chrome when nested under a Filial accordion. */
  embedded?: boolean
}

type QuadroMode = 'atual' | 'proposto'

function crewsToEditable(
  crews: TurmaCrew[],
  operatingHours: OperatingHours,
  centroCusto: string,
  shiftsPerDay: number,
): EditableTurmaRow[] {
  const windows = resolveShiftWindows(operatingHours, shiftsPerDay)
  return crews.map((c, i) => {
    const win = windows[i % windows.length] ?? windows[0]!
    return {
      turmaIndex: c.turmaIndex,
      label: formatTurmaLabel(
        win.startHour,
        win.endHour,
        c.turmaIndex,
        centroCusto,
      ),
      escala: c.escala,
      workDays: [...c.workDays],
      restDays: [...c.restDays],
      headcount: c.headcount,
      startHour: win.startHour,
      endHour: win.endHour,
    }
  })
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
      coberturaAtualPorDia: deriveCoberturaAtualPorDia(
        result.coverage.currentHeadcount,
        parseScale(escala),
        regime,
      ),
    },
  ]
}

function resolveAtualCoverage(cc: CostCenterResult): CoberturaPorDia {
  if (cc.coberturaAtualPorDia) return cc.coberturaAtualPorDia
  return deriveCoberturaAtualPorDia(
    cc.currentHeadcount,
    parseScale(cc.escalaAtual ?? '6x1'),
    cc.regimeFuncionamento,
  )
}

function toneClass(tone: ReturnType<typeof compareCoverageDay>): string {
  if (tone === 'ok') return 'bg-emerald-100 text-emerald-950'
  if (tone === 'below') return 'bg-red-100 text-red-950'
  return 'bg-neutral-100 text-neutral-700'
}

function markCellClass(mark: 'T' | 'F', print?: boolean): string {
  if (mark === 'T') {
    return print
      ? 'bg-emerald-50 text-emerald-900'
      : 'bg-emerald-50/90 text-emerald-900'
  }
  return print
    ? 'bg-amber-50 text-neutral-600'
    : 'bg-neutral-100 text-neutral-500'
}

function PeriodSelector({
  year,
  month,
  onChange,
  print,
}: {
  year: number
  month: number
  onChange?: (next: { year: number; month: number }) => void
  print?: boolean
}) {
  const years = useMemo(() => {
    const base = [2025, 2026, 2027, 2028, 2029, 2030]
    if (!base.includes(year)) return [year, ...base].sort((a, b) => a - b)
    return base
  }, [year])

  if (print) {
    return (
      <p className="text-[11px] text-neutral-700">
        Período de Referência:{' '}
        <strong>
          {MONTH_LABELS_PT[month - 1]} / {year}
        </strong>
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label
          htmlFor="periodo-mes"
          className="block text-[11px] font-semibold tracking-wide text-[var(--color-ink)] uppercase"
        >
          Período de Referência
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <select
            id="periodo-mes"
            value={month}
            onChange={(e) =>
              onChange?.({ year, month: Number(e.target.value) })
            }
            className="min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            {MONTH_LABELS_PT.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
          <select
            id="periodo-ano"
            aria-label="Ano de referência"
            value={year}
            onChange={(e) =>
              onChange?.({ year: Number(e.target.value), month })
            }
            className="min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={2000}
            max={2100}
            aria-label="Ano personalizado"
            value={year}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 2000 && n <= 2100) {
                onChange?.({ year: Math.round(n), month })
              }
            }}
            className="min-h-11 w-24 border border-[var(--color-line)] bg-white px-2 py-2 text-sm tabular-nums"
          />
        </div>
      </div>
    </div>
  )
}

function QuadroToggle({
  mode,
  onChange,
  print,
}: {
  mode: QuadroMode
  onChange?: (m: QuadroMode) => void
  print?: boolean
}) {
  if (print) {
    return (
      <p className="text-[10px] font-semibold tracking-wide uppercase">
        {mode === 'atual'
          ? 'Quadro Atual (Baseline)'
          : 'Quadro Proposto (Nova Escala)'}
      </p>
    )
  }
  return (
    <div
      className="inline-flex border border-[var(--color-line)] bg-[var(--color-paper)] p-0.5"
      role="group"
      aria-label="Quadro Atual ou Proposto"
    >
      <button
        type="button"
        onClick={() => onChange?.('atual')}
        className={`min-h-11 px-3 py-2 text-xs font-medium ${
          mode === 'atual'
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-transparent text-[var(--color-ink)]'
        }`}
      >
        Quadro Atual (Baseline)
      </button>
      <button
        type="button"
        onClick={() => onChange?.('proposto')}
        className={`min-h-11 px-3 py-2 text-xs font-medium ${
          mode === 'proposto'
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-transparent text-[var(--color-ink)]'
        }`}
      >
        Quadro Proposto (Nova Escala)
      </button>
    </div>
  )
}

function MonthlyCalendarGrid({
  matrix,
  mode,
  print,
  editable,
  onHeadcountChange,
}: {
  matrix: MonthCalendarMatrix
  mode: QuadroMode
  print?: boolean
  editable?: boolean
  onHeadcountChange?: (turmaIndex: number, headcount: number) => void
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-center text-[11px]">
        <thead>
          <tr>
            <th
              className={`sticky left-0 z-10 px-2 py-1.5 text-left font-semibold ${
                print
                  ? 'border border-neutral-300 bg-white'
                  : 'border border-[var(--color-line)] bg-[var(--color-paper)]'
              }`}
            >
              Turma
            </th>
            <th
              className={`px-2 py-1.5 font-semibold ${
                print
                  ? 'border border-neutral-300'
                  : 'border border-[var(--color-line)]'
              }`}
            >
              HC
            </th>
            {matrix.days.map((d) => (
              <th
                key={d.day}
                className={`min-w-[2.1rem] px-1 py-1 font-semibold ${
                  print
                    ? 'border border-neutral-300'
                    : 'border border-[var(--color-line)]'
                } ${
                  d.isWeekend
                    ? print
                      ? 'bg-amber-50 text-amber-950'
                      : 'bg-amber-50/80 text-amber-950'
                    : ''
                }`}
                title={`${d.weekdayLabel} ${String(d.day).padStart(2, '0')}`}
              >
                <span className="block text-[9px] font-normal opacity-80">
                  {d.weekdayLabel}
                </span>
                {String(d.day).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={`${mode}-${row.turmaIndex}`}>
              <th
                scope="row"
                className={`sticky left-0 z-10 px-2 py-1 text-left font-medium whitespace-nowrap ${
                  print
                    ? 'border border-neutral-300 bg-white'
                    : 'border border-[var(--color-line)] bg-white'
                }`}
              >
                <span className="tabular-nums">
                  {row.label?.trim() || `T${row.turmaIndex}`}
                </span>
                <span
                  className={`ml-1 font-normal ${
                    print ? 'text-neutral-600' : 'text-[var(--color-muted)]'
                  }`}
                >
                  ({row.escala})
                </span>
              </th>
              <td
                className={`px-1 py-1 tabular-nums ${
                  print
                    ? 'border border-neutral-300'
                    : 'border border-[var(--color-line)]'
                }`}
              >
                {editable && onHeadcountChange ? (
                  <>
                    <label className="sr-only">
                      Headcount T{row.turmaIndex}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.headcount}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        onHeadcountChange(
                          row.turmaIndex,
                          Number.isFinite(n)
                            ? Math.max(0, Math.round(n))
                            : row.headcount,
                        )
                      }}
                      className="min-h-9 w-14 border border-[var(--color-line)] bg-white px-1 py-1 text-center tabular-nums"
                    />
                  </>
                ) : (
                  row.headcount
                )}
              </td>
              {row.marks.map((mark, i) => (
                <td
                  key={`${row.turmaIndex}-${matrix.days[i].day}`}
                  className={`px-1 py-1 font-semibold ${
                    print
                      ? 'border border-neutral-300'
                      : 'border border-[var(--color-line)]'
                  } ${markCellClass(mark, print)} ${
                    matrix.days[i].isWeekend ? 'opacity-95' : ''
                  }`}
                >
                  {mark}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th
              scope="row"
              className={`sticky left-0 z-10 px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide uppercase ${
                print
                  ? 'border border-neutral-300 bg-neutral-50'
                  : 'border border-[var(--color-line)] bg-[var(--color-paper)]'
              }`}
            >
              Total no dia
            </th>
            <td
              className={
                print
                  ? 'border border-neutral-300 bg-neutral-50'
                  : 'border border-[var(--color-line)] bg-[var(--color-paper)]'
              }
            />
            {matrix.daily.map((d) => (
              <td
                key={`tot-${d.day}`}
                className={`px-1 py-1.5 tabular-nums font-semibold ${
                  print
                    ? 'border border-neutral-300'
                    : 'border border-[var(--color-line)]'
                } ${
                  d.uncovered
                    ? 'bg-red-100 text-red-950'
                    : print
                      ? 'bg-neutral-50'
                      : 'bg-[var(--color-paper)]'
                }`}
                title={
                  d.uncovered
                    ? `Descoberto: ${d.working} < mínimo ${d.need}`
                    : `${d.working} / mínimo ${d.need}`
                }
              >
                {d.working}
                <span
                  className={`mt-0.5 block text-[9px] font-normal ${
                    d.uncovered
                      ? 'text-red-800'
                      : print
                        ? 'text-neutral-500'
                        : 'text-[var(--color-muted)]'
                  }`}
                >
                  /{d.need}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {!print ? (
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          T = trabalha · F = folga. Sáb/Dom destacados. Vermelho no rodapé =
          dia abaixo do mínimo do regime ({'SEG_SEX'} / {'SEG_SAB'} /{' '}
          {'CONTINUO_7D'}). Sem nomes de pessoas (LGPD).
        </p>
      ) : null}
    </div>
  )
}

function CoverageCompareFooter({
  atual,
  proposto,
  print,
}: {
  atual: CoberturaPorDia
  proposto: CoberturaPorDia
  print?: boolean
}) {
  return (
    <div className={print ? 'mt-2' : 'mt-3'}>
      <p
        className={
          print
            ? 'mb-1 text-[10px] font-semibold uppercase tracking-wide'
            : 'mb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink)] uppercase'
        }
      >
        Cobertura semanal (Atual → Proposto)
      </p>
      <table className="w-full min-w-[22rem] border-collapse text-center text-xs">
        <thead>
          <tr>
            {COVERAGE_WEEKDAYS.map((d) => (
              <th
                key={d}
                className={
                  print
                    ? 'border border-neutral-300 px-1 py-1 font-semibold'
                    : 'border border-[var(--color-line)] px-1.5 py-1 font-semibold'
                }
              >
                {COVERAGE_WEEKDAY_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COVERAGE_WEEKDAYS.map((d: CoverageWeekday) => {
              const a = atual[d]
              const p = proposto[d]
              const tone = compareCoverageDay(a, p)
              return (
                <td
                  key={d}
                  className={`border px-1.5 py-1.5 tabular-nums font-medium ${
                    print ? 'border-neutral-300' : 'border-[var(--color-line)]'
                  } ${toneClass(tone)}`}
                  title={
                    tone === 'below'
                      ? 'Proposto abaixo da cobertura atual'
                      : tone === 'ok'
                        ? 'Proposto cobre o mínimo atual'
                        : 'Sem cobertura'
                  }
                >
                  {a} → {p}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function CostCenterScheduleCard({
  cc,
  operatingHours,
  shiftsPerDay,
  variant,
  year,
  month,
  mode,
  onModeChange,
  nestedUnderCc = false,
}: {
  cc: CostCenterResult
  operatingHours: OperatingHours
  shiftsPerDay: number
  variant: 'interactive' | 'print'
  year: number
  month: number
  mode: QuadroMode
  onModeChange?: (m: QuadroMode) => void
  /** When true, title is the horário (CC already shown as parent). */
  nestedUnderCc?: boolean
}) {
  const print = variant === 'print'
  const dist =
    cc.distribuicaoTurmas ??
    distributeCrews(cc.regimeFuncionamento ?? 'SEG_SEX', cc.requiredHeadcount)
  const atual = resolveAtualCoverage(cc)
  const regime = dist.regime

  const crewSeed = `${cc.centroCusto}|${dist.regime}|${dist.totalHeadcount}|${shiftsPerDay}|${dist.crews.map((c) => `${c.turmaIndex}:${c.headcount}`).join(',')}`
  const [rows, setRows] = useState<EditableTurmaRow[]>(() =>
    crewsToEditable(dist.crews, operatingHours, cc.centroCusto, shiftsPerDay),
  )

  useEffect(() => {
    setRows(
      crewsToEditable(dist.crews, operatingHours, cc.centroCusto, shiftsPerDay),
    )
  }, [crewSeed, dist.crews, operatingHours, cc.centroCusto, shiftsPerDay])

  const proposto = useMemo(() => coberturaPropostaFromCrews(rows), [rows])

  const atualCrews = useMemo(
    () =>
      baselineCrewsForCalendar({
        currentHeadcount: cc.currentHeadcount,
        escalaAtual: cc.escalaAtual,
        regime,
      }),
    [cc.currentHeadcount, cc.escalaAtual, regime],
  )

  const matrix = useMemo(() => {
    const crews =
      mode === 'atual'
        ? atualCrews
        : rows.map((r) => ({
            turmaIndex: r.turmaIndex,
            label: r.label,
            escala: r.escala,
            workDays: r.workDays,
            restDays: r.restDays,
            headcount: r.headcount,
          }))
    return buildMonthCalendarMatrix({
      year,
      month,
      crews,
      regime,
      dailyCoverageNeed: dist.dailyCoverageNeed,
      rotateWeekly: regime === 'CONTINUO_7D',
    })
  }, [mode, atualCrews, rows, year, month, regime, dist.dailyCoverageNeed])

  const escalaLabel = cc.escalaAtual ?? '—'
  const cargaLabel =
    cc.cargaSemanalAtual != null
      ? `${cc.cargaSemanalAtual.toLocaleString('pt-BR')} h/sem`
      : '—'
  const codLabel = cc.codHorarioAtual?.trim() || '—'
  const regimeLabel = REGIME_FUNCIONAMENTO_LABELS[regime]
  const title = nestedUnderCc
    ? `Horário ${codLabel}`
    : cc.centroCusto

  return (
    <article
      className={
        print
          ? 'break-inside-avoid border border-neutral-300 px-3 py-3'
          : 'border border-[var(--color-line)] bg-white/80 px-4 py-4'
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          className={
            print
              ? 'text-sm font-semibold'
              : 'text-sm font-semibold text-[var(--color-ink)]'
          }
        >
          {title}
        </h4>
        <p
          className={
            print
              ? 'text-[10px] text-neutral-600'
              : 'text-xs text-[var(--color-muted)]'
          }
        >
          {regimeLabel} · HC {cc.currentHeadcount} → {cc.requiredHeadcount}
        </p>
      </header>

      <section
        className={
          print
            ? 'mt-2 border-t border-neutral-200 pt-2'
            : 'mt-3 border-t border-[var(--color-line)] pt-3'
        }
      >
        <dl
          className={
            print
              ? 'grid gap-1 text-[11px] sm:grid-cols-3'
              : 'grid gap-2 text-xs sm:grid-cols-3'
          }
        >
          {!nestedUnderCc ? (
            <div>
              <dt
                className={
                  print ? 'text-neutral-600' : 'text-[var(--color-muted)]'
                }
              >
                Cód. horário (Apdata)
              </dt>
              <dd className="font-medium tabular-nums">{codLabel}</dd>
            </div>
          ) : (
            <div>
              <dt
                className={
                  print ? 'text-neutral-600' : 'text-[var(--color-muted)]'
                }
              >
                Centro de custo
              </dt>
              <dd className="font-medium tabular-nums">{cc.centroCusto}</dd>
            </div>
          )}
          <div>
            <dt
              className={
                print ? 'text-neutral-600' : 'text-[var(--color-muted)]'
              }
            >
              Modelo atual
            </dt>
            <dd className="font-medium">{escalaLabel}</dd>
          </div>
          <div>
            <dt
              className={
                print ? 'text-neutral-600' : 'text-[var(--color-muted)]'
              }
            >
              Carga semanal
            </dt>
            <dd className="font-medium tabular-nums">{cargaLabel}</dd>
          </div>
        </dl>
      </section>

      <section
        className={
          print
            ? 'mt-3 border-t border-neutral-200 pt-2'
            : 'mt-4 border-t border-[var(--color-line)] pt-3'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <QuadroToggle
            mode={mode}
            onChange={onModeChange}
            print={print}
          />
          <p
            className={
              print
                ? 'text-[10px] text-neutral-600'
                : 'text-[11px] text-[var(--color-muted)]'
            }
          >
            {dist.note}
          </p>
        </div>

        <MonthlyCalendarGrid
          matrix={matrix}
          mode={mode}
          print={print}
          editable={!print && mode === 'proposto'}
          onHeadcountChange={(turmaIndex, headcount) => {
            setRows((prev) =>
              prev.map((p) =>
                p.turmaIndex === turmaIndex ? { ...p, headcount } : p,
              ),
            )
          }}
        />

        {mode === 'proposto' && !print ? (
          <div className="mt-3 overflow-x-auto">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink)] uppercase">
              Turnos (entrada / saída)
            </p>
            <table className="w-full min-w-[28rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-muted)]">
                  <th className="px-2 py-1.5 font-normal">Turma</th>
                  <th className="px-2 py-1.5 font-normal">Entrada</th>
                  <th className="px-2 py-1.5 font-normal">Saída</th>
                  <th className="px-2 py-1.5 font-normal">Trabalha (base)</th>
                  <th className="px-2 py-1.5 font-normal">Folga (base)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.turmaIndex}
                    className="border-b border-[var(--color-line)]"
                  >
                    <td className="px-2 py-1.5 font-medium tabular-nums">
                      {row.label || `T${row.turmaIndex}`}
                    </td>
                    <td className="px-2 py-1.5">
                      <label className="sr-only">
                        Entrada T{row.turmaIndex}
                      </label>
                      <input
                        type="time"
                        value={hourToTimeInputValue(row.startHour)}
                        onChange={(e) => {
                          const startHour = timeInputToHour(e.target.value)
                          setRows((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, startHour } : p,
                            ),
                          )
                        }}
                        className="min-h-11 border border-[var(--color-line)] bg-white px-2 py-1.5"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <label className="sr-only">
                        Saída T{row.turmaIndex}
                      </label>
                      <input
                        type="time"
                        value={hourToTimeInputValue(row.endHour)}
                        onChange={(e) => {
                          const endHour = timeInputToHour(e.target.value)
                          setRows((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, endHour } : p,
                            ),
                          )
                        }}
                        className="min-h-11 border border-[var(--color-line)] bg-white px-2 py-1.5"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-[var(--color-muted)]">
                      {row.workDays.map((d) => d.toUpperCase()).join(', ')}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--color-muted)]">
                      {row.restDays.map((d) => d.toUpperCase()).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {print && mode === 'proposto' ? (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1 pr-2 font-semibold">Turma</th>
                <th className="py-1 pr-2 font-semibold">HC</th>
                <th className="py-1 pr-2 font-semibold">Entrada–Saída</th>
                <th className="py-1 font-semibold">Base (sem rot.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.turmaIndex}
                  className="border-b border-neutral-200"
                >
                  <td className="py-1 pr-2 font-medium tabular-nums">
                    {row.label || `T${row.turmaIndex}`}
                    <span className="ml-1 font-normal text-neutral-600">
                      ({row.escala})
                    </span>
                  </td>
                  <td className="py-1 pr-2 tabular-nums">{row.headcount}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    {formatHourClock(row.startHour)}–
                    {formatHourClock(row.endHour)}
                  </td>
                  <td className="py-1">
                    {row.workDays.map((d) => d.toUpperCase()).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <CoverageCompareFooter atual={atual} proposto={proposto} print={print} />
      </section>
    </article>
  )
}

/**
 * Escala Atual × Proposta: calendário mensal T/F por turma + cobertura diária.
 */
function matchesCnpjFilter(
  cc: CostCenterResult,
  cnpjFilter: string | null | undefined,
): boolean {
  if (!cnpjFilter) return true
  const dig = cnpjDigits(cc.cnpjCompleto)
  if (cnpjFilter === OPERACIONAL_SEM_CNPJ_KEY) {
    return dig.length < 8
  }
  return dig.length >= 8 && dig === cnpjFilter
}

export function ScheduleBuilderView({
  result,
  variant = 'interactive',
  centroCustoFilter = null,
  cnpjFilter = null,
  embedded = false,
}: ScheduleBuilderViewProps) {
  const allCenters = centersFromResult(result)
  const allowCc = centroCustoFilter?.length
    ? new Set(centroCustoFilter.map((x) => x.trim()))
    : null
  const centers = allCenters.filter((c) => {
    if (!matchesCnpjFilter(c, cnpjFilter)) return false
    if (allowCc && !allowCc.has(c.centroCusto.trim())) return false
    return true
  })
  const ccGroups = nestCentersByCc(centers)
  const print = variant === 'print'
  const defaults = defaultReferencePeriod(result.input.scenarioId)
  const [year, setYear] = useState(defaults.year)
  const [month, setMonth] = useState(defaults.month)
  const [mode, setMode] = useState<QuadroMode>('proposto')

  useEffect(() => {
    const next = defaultReferencePeriod(result.input.scenarioId)
    setYear(next.year)
    setMonth(next.month)
  }, [result.input.scenarioId])

  const maxCrews = centers.reduce(
    (m, c) => Math.max(m, c.distribuicaoTurmas?.crewCount ?? 1),
    1,
  )

  return (
    <section
      className={print ? 'mt-6' : ''}
      aria-label="Calendário mensal Escala Atual × Proposta"
    >
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className={
                print
                  ? 'text-base font-semibold tracking-wide uppercase'
                  : 'text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase'
              }
            >
              Calendário mensal — Atual × Proposto
            </h3>
            <p
              className={
                print
                  ? 'mt-1 text-xs text-neutral-600'
                  : 'mt-1 text-xs text-[var(--color-muted)]'
              }
            >
              Projeção dia a dia (T/F) por turma (T1…T{maxCrews}) no período
              selecionado, com total operacional vs mínimo do centro de custo.
            </p>
          </div>
          {!print ? (
            <button
              type="button"
              onClick={() =>
                downloadEscalasTurmasExcel(result, { year, month })
              }
              className="min-h-11 border border-[var(--color-line)] bg-white px-4 py-2 text-sm"
            >
              Exportar Excel (Escalas e Turmas)
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          print || embedded ? 'mt-2' : 'mt-3',
          'flex flex-wrap items-end justify-between gap-3',
        ].join(' ')}
      >
        <PeriodSelector
          year={year}
          month={month}
          print={print}
          onChange={({ year: y, month: m }) => {
            setYear(y)
            setMonth(m)
          }}
        />
        {embedded && !print ? (
          <button
            type="button"
            onClick={() =>
              downloadEscalasTurmasExcel(result, { year, month })
            }
            className="min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-xs"
          >
            Exportar Excel
          </button>
        ) : null}
      </div>

      {centers.length === 0 ? (
        <p
          className={
            print
              ? 'mt-3 text-xs text-neutral-600'
              : 'mt-3 text-xs text-[var(--color-muted)]'
          }
        >
          Nenhum centro de custo neste estabelecimento.
        </p>
      ) : print ? (
        <div className="mt-3 space-y-4">
          {(['atual', 'proposto'] as const).map((m) => (
            <div key={m} className="space-y-4">
              {ccGroups.map((group) => (
                <div
                  key={`${m}-${group.centroCusto}`}
                  className="space-y-2 border border-neutral-300 px-2 py-2"
                >
                  <h4 className="text-xs font-semibold tracking-wide uppercase">
                    Centro de custo {group.centroCusto}
                  </h4>
                  {group.horarios.map((cc) => (
                    <CostCenterScheduleCard
                      key={`${m}-${cc.cnpjCompleto ?? ''}-${cc.centroCusto}-${cc.codHorarioAtual ?? ''}`}
                      cc={cc}
                      operatingHours={result.input.operatingHours}
                      shiftsPerDay={result.input.shiftsPerDay}
                      variant="print"
                      year={year}
                      month={month}
                      mode={m}
                      nestedUnderCc
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {ccGroups.map((group) => (
            <div
              key={group.centroCusto}
              className="space-y-3 border border-[var(--color-line)] bg-[var(--color-surface)]/60 px-3 py-3"
            >
              <header>
                <h4 className="text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                  Centro de custo {group.centroCusto}
                </h4>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                  {group.horarios.length} horário(s) neste CC
                </p>
              </header>
              {group.horarios.map((cc) => (
                <CostCenterScheduleCard
                  key={`${cc.cnpjCompleto ?? ''}-${cc.centroCusto}-${cc.codHorarioAtual ?? ''}`}
                  cc={cc}
                  operatingHours={result.input.operatingHours}
                  shiftsPerDay={result.input.shiftsPerDay}
                  variant="interactive"
                  year={year}
                  month={month}
                  mode={mode}
                  onModeChange={setMode}
                  nestedUnderCc
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
