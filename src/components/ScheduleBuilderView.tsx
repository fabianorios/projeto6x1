import { useEffect, useMemo, useState } from 'react'
import {
  COVERAGE_WEEKDAYS,
  COVERAGE_WEEKDAY_LABELS,
  REGIME_FUNCIONAMENTO_LABELS,
  coberturaPropostaFromCrews,
  compareCoverageDay,
  deriveCoberturaAtualPorDia,
  distributeCrews,
  formatHourClock,
  hourToTimeInputValue,
  parseScale,
  timeInputToHour,
  widestCoverageDay,
  type CoberturaPorDia,
  type CostCenterResult,
  type CoverageWeekday,
  type OperatingHours,
  type SimulationResult,
  type TurmaCrew,
} from '../engine'

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
}

function defaultShiftHours(operatingHours: OperatingHours): {
  startHour: number
  endHour: number
} {
  const day = widestCoverageDay(operatingHours)
  if (day.closed) return { startHour: 8, endHour: 17 }
  if (day.openHour === day.closeHour) return { startHour: 0, endHour: 8 }
  const span =
    day.closeHour > day.openHour
      ? day.closeHour - day.openHour
      : 24 - day.openHour + day.closeHour
  const end =
    span > 10 ? day.openHour + 8 : day.closeHour === 0 ? 24 : day.closeHour
  return {
    startHour: day.openHour,
    endHour: end > 24 ? end - 24 : end,
  }
}

function crewsToEditable(
  crews: TurmaCrew[],
  operatingHours: OperatingHours,
): EditableTurmaRow[] {
  const { startHour, endHour } = defaultShiftHours(operatingHours)
  return crews.map((c) => ({
    turmaIndex: c.turmaIndex,
    label: c.label,
    escala: c.escala,
    workDays: [...c.workDays],
    restDays: [...c.restDays],
    headcount: c.headcount,
    startHour,
    endHour,
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

function CoverageMiniMatrix({
  cobertura,
  caption,
}: {
  cobertura: CoberturaPorDia
  caption: string
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      <p className="mb-1 text-[11px] text-[var(--color-muted)]">{caption}</p>
      <table className="w-full min-w-[18rem] border-collapse text-center text-xs">
        <thead>
          <tr>
            {COVERAGE_WEEKDAYS.map((d) => (
              <th
                key={d}
                className="border border-[var(--color-line)] px-1.5 py-1 font-semibold"
              >
                {COVERAGE_WEEKDAY_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COVERAGE_WEEKDAYS.map((d) => (
              <td
                key={d}
                className="border border-[var(--color-line)] px-1.5 py-1 tabular-nums"
              >
                {cobertura[d]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
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
        Cobertura Diária (Atual → Proposto)
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
  variant,
}: {
  cc: CostCenterResult
  operatingHours: OperatingHours
  variant: 'interactive' | 'print'
}) {
  const print = variant === 'print'
  const dist =
    cc.distribuicaoTurmas ??
    distributeCrews(cc.regimeFuncionamento ?? 'SEG_SEX', cc.requiredHeadcount)
  const atual = resolveAtualCoverage(cc)

  const crewSeed = `${cc.centroCusto}|${dist.regime}|${dist.totalHeadcount}|${dist.crews.map((c) => `${c.turmaIndex}:${c.headcount}`).join(',')}`
  const [rows, setRows] = useState<EditableTurmaRow[]>(() =>
    crewsToEditable(dist.crews, operatingHours),
  )

  useEffect(() => {
    setRows(crewsToEditable(dist.crews, operatingHours))
  }, [crewSeed, dist.crews, operatingHours])

  const proposto = useMemo(() => coberturaPropostaFromCrews(rows), [rows])

  const escalaLabel = cc.escalaAtual ?? '—'
  const cargaLabel =
    cc.cargaSemanalAtual != null
      ? `${cc.cargaSemanalAtual.toLocaleString('pt-BR')} h/sem`
      : '—'
  const codLabel = cc.codHorarioAtual?.trim() || '—'
  const regimeLabel = REGIME_FUNCIONAMENTO_LABELS[dist.regime]

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
          {cc.centroCusto}
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

      {/* Escala Atual (De) */}
      <section
        className={
          print
            ? 'mt-3 border-t border-neutral-200 pt-2'
            : 'mt-3 border-t border-[var(--color-line)] pt-3'
        }
      >
        <h5
          className={
            print
              ? 'text-xs font-semibold uppercase tracking-wide'
              : 'text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase'
          }
        >
          Escala Atual (Baseline)
        </h5>
        <dl
          className={
            print
              ? 'mt-1 grid gap-1 text-[11px] sm:grid-cols-3'
              : 'mt-2 grid gap-2 text-xs sm:grid-cols-3'
          }
        >
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
        <CoverageMiniMatrix
          cobertura={atual}
          caption="Cobertura atual (pessoas no posto / dia)"
        />
      </section>

      {/* Escala Proposta (Para) */}
      <section
        className={
          print
            ? 'mt-3 border-t border-neutral-200 pt-2'
            : 'mt-4 border-t border-[var(--color-line)] pt-3'
        }
      >
        <h5
          className={
            print
              ? 'text-xs font-semibold uppercase tracking-wide'
              : 'text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase'
          }
        >
          Escala Proposta (Alvo)
        </h5>
        <p
          className={
            print
              ? 'mt-0.5 text-[10px] text-neutral-600'
              : 'mt-1 text-[11px] text-[var(--color-muted)]'
          }
        >
          {dist.note}
        </p>

        {print ? (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1 pr-2 font-semibold">Turma</th>
                <th className="py-1 pr-2 font-semibold">HC</th>
                <th className="py-1 pr-2 font-semibold">Entrada–Saída</th>
                <th className="py-1 font-semibold">Trabalha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.turmaIndex}
                  className="border-b border-neutral-200"
                >
                  <td className="py-1 pr-2 font-medium">
                    T{row.turmaIndex}
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
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-muted)]">
                  <th className="px-2 py-1.5 font-normal">Turma</th>
                  <th className="px-2 py-1.5 font-normal">HC</th>
                  <th className="px-2 py-1.5 font-normal">Entrada</th>
                  <th className="px-2 py-1.5 font-normal">Saída</th>
                  <th className="px-2 py-1.5 font-normal">Trabalha</th>
                  <th className="px-2 py-1.5 font-normal">Folga</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.turmaIndex}
                    className="border-b border-[var(--color-line)]"
                  >
                    <td className="px-2 py-1.5 font-medium">
                      T{row.turmaIndex}
                      <span className="ml-1 font-normal text-[var(--color-muted)]">
                        {row.escala}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
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
                          setRows((prev) =>
                            prev.map((p, j) =>
                              j === i
                                ? {
                                    ...p,
                                    headcount: Number.isFinite(n)
                                      ? Math.max(0, Math.round(n))
                                      : p.headcount,
                                  }
                                : p,
                            ),
                          )
                        }}
                        className="min-h-11 w-16 border border-[var(--color-line)] bg-white px-2 py-1.5 tabular-nums"
                      />
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
        )}

        <CoverageCompareFooter atual={atual} proposto={proposto} print={print} />
        {!print ? (
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            Verde: proposto ≥ cobertura atual do dia. Vermelho: abaixo do
            mínimo atual. Sem nomes de pessoas (LGPD).
          </p>
        ) : null}
      </section>
    </article>
  )
}

/**
 * Escala Atual (De) × Escala Proposta (Para) por centro de custo.
 * Interactive in Results; static in PrintableReport.
 */
export function ScheduleBuilderView({
  result,
  variant = 'interactive',
}: ScheduleBuilderViewProps) {
  const centers = centersFromResult(result)
  const print = variant === 'print'
  const maxCrews = centers.reduce(
    (m, c) => Math.max(m, c.distribuicaoTurmas?.crewCount ?? 1),
    1,
  )

  return (
    <section
      className={print ? 'mt-6' : ''}
      aria-label="Escala Atual × Escala Proposta"
    >
      <h3
        className={
          print
            ? 'text-base font-semibold tracking-wide uppercase'
            : 'text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase'
        }
      >
        Escala Atual → Escala Proposta
      </h3>
      <p
        className={
          print
            ? 'mt-1 text-xs text-neutral-600'
            : 'mt-1 text-xs text-[var(--color-muted)]'
        }
      >
        Comparativo por centro de custo: baseline (cód. horário, modelo, carga)
        × turmas sugeridas (T1…T{maxCrews}) com cobertura diária Atual →
        Proposto.
      </p>
      <div className={print ? 'mt-3 space-y-3' : 'mt-3 space-y-4'}>
        {centers.map((cc) => (
          <CostCenterScheduleCard
            key={cc.centroCusto}
            cc={cc}
            operatingHours={result.input.operatingHours}
            variant={variant}
          />
        ))}
      </div>
    </section>
  )
}
