/**
 * Cycle → escala_atual classification + VT day estimate (AT ∩ trabalho).
 */

export type CycleStats = {
  cycleLen: number
  workDays: number
  offDays: number
}

export type EscalaCode = '6x1' | '5x2' | '4x3' | '12x36' | 'other'

export function classifyCycle(stats: CycleStats): Exclude<EscalaCode, '12x36'> {
  const { cycleLen, workDays, offDays } = stats
  if (cycleLen === 7 && workDays === 6 && offDays === 1) return '6x1'
  if (cycleLen === 7 && workDays === 5 && offDays === 2) return '5x2'
  if (cycleLen === 7 && workDays === 4 && offDays === 3) return '4x3'
  return 'other'
}

/** Prefer 12x36 when Horarios.HOR_CdiTipoEscala = 3. */
export function resolveEscala(
  ciclo: Exclude<EscalaCode, '12x36'> | null,
  tipoEscala: number | null,
): EscalaCode {
  if (tipoEscala === 3) return '12x36'
  return ciclo ?? 'other'
}

/** Estimate VR days/month from cycle (work_days / cycle_len × 30). */
export function estimateDaysFromCycle(stats: CycleStats | null): number | null {
  if (!stats || stats.cycleLen <= 0) return null
  return Math.round((30 * stats.workDays) / stats.cycleLen * 10) / 10
}

/**
 * Calendar day matches HorariosTiposDiasAT mask.
 * Type 88 = Mon–Fri covers TiposDiasCalendarios 2..6.
 */
export function calendarMatchesAtMask(
  tipoDiaCalendario: number,
  atTypes: ReadonlySet<number>,
): boolean {
  if (atTypes.has(tipoDiaCalendario)) return true
  if (atTypes.has(88) && tipoDiaCalendario >= 2 && tipoDiaCalendario <= 6) {
    return true
  }
  return false
}

/**
 * VT days/month: AT-eligible calendar types ∩ jornada work days (TIP_OplTrabalho=1).
 * Returns null when the horário has no AT mask or zero intersecting work days.
 */
export function estimateVtDaysFromAtAndCycle(
  stats: CycleStats | null,
  atWorkDaysInCycle: number | null,
): number | null {
  if (!stats || stats.cycleLen <= 0) return null
  if (atWorkDaysInCycle == null || atWorkDaysInCycle <= 0) return null
  return Math.round((30 * atWorkDaysInCycle) / stats.cycleLen * 10) / 10
}

export type JornadaRow = {
  horarioId: number
  tipoDiaId: number
  /** TiposDiasCalendarios id on the cycle day (for AT ∩ trabalho). */
  tipoDiaCalendario: number | null
  desativado: number | null
}

export type TipoDiaRow = {
  id: number
  trabalho: number
}

export type AtTipoRow = {
  horarioId: number
  tipoDiaCalendario: number
  desativado: number | null
}

/**
 * Aggregate active HorariosJornadas rows into per-horario cycle stats + escala.
 */
export function buildCycleMap(
  jornadas: JornadaRow[],
  tipos: TipoDiaRow[],
): Map<number, CycleStats & { escala: Exclude<EscalaCode, '12x36'> }> {
  const trabalhoByTipo = new Map(tipos.map((t) => [t.id, t.trabalho]))
  const buckets = new Map<number, { work: number; off: number; len: number }>()

  for (const j of jornadas) {
    if (j.desativado != null && Number(j.desativado) !== 0) continue
    const trabalho = trabalhoByTipo.get(j.tipoDiaId)
    if (trabalho === undefined) continue
    let b = buckets.get(j.horarioId)
    if (!b) {
      b = { work: 0, off: 0, len: 0 }
      buckets.set(j.horarioId, b)
    }
    b.len += 1
    if (trabalho === 1) b.work += 1
    else b.off += 1
  }

  const out = new Map<
    number,
    CycleStats & { escala: Exclude<EscalaCode, '12x36'> }
  >()
  for (const [id, b] of buckets) {
    const stats: CycleStats = {
      cycleLen: b.len,
      workDays: b.work,
      offDays: b.off,
    }
    out.set(id, { ...stats, escala: classifyCycle(stats) })
  }
  return out
}

/**
 * Per-horário count of cycle days that are trabalho AND match HorariosTiposDiasAT.
 */
export function buildAtWorkDaysMap(
  jornadas: JornadaRow[],
  tipos: TipoDiaRow[],
  atRows: AtTipoRow[],
): Map<number, number> {
  const trabalhoByTipo = new Map(tipos.map((t) => [t.id, t.trabalho]))
  const atByHorario = new Map<number, Set<number>>()
  for (const a of atRows) {
    if (a.desativado != null && Number(a.desativado) !== 0) continue
    let set = atByHorario.get(a.horarioId)
    if (!set) {
      set = new Set()
      atByHorario.set(a.horarioId, set)
    }
    set.add(a.tipoDiaCalendario)
  }

  const counts = new Map<number, number>()
  for (const j of jornadas) {
    if (j.desativado != null && Number(j.desativado) !== 0) continue
    const trabalho = trabalhoByTipo.get(j.tipoDiaId)
    if (trabalho !== 1) continue
    const mask = atByHorario.get(j.horarioId)
    if (!mask || mask.size === 0) continue
    if (j.tipoDiaCalendario == null) continue
    if (!calendarMatchesAtMask(j.tipoDiaCalendario, mask)) continue
    counts.set(j.horarioId, (counts.get(j.horarioId) ?? 0) + 1)
  }
  return counts
}

export type VtLinha = {
  contratadoId: number
  meioId: number
  passesDia: number
  desativado: number | null
  dtdFim: unknown
}

export type MeioPreco = {
  meioId: number
  unitario: number
  inicioVigencia: string | number | Date | null
  desativado: number | null
}

/** Latest unit price per meio (MRI_DtdInicioVigencia DESC), active rows only. */
export function buildMeioPrecoMap(itens: MeioPreco[]): Map<number, number> {
  const best = new Map<number, { unitario: number; inicio: number }>()
  for (const it of itens) {
    if (it.desativado != null && Number(it.desativado) !== 0) continue
    if (!Number.isFinite(it.unitario)) continue
    const t =
      it.inicioVigencia == null || it.inicioVigencia === ''
        ? 0
        : new Date(it.inicioVigencia).getTime()
    const prev = best.get(it.meioId)
    if (!prev || t >= prev.inicio) {
      best.set(it.meioId, {
        unitario: it.unitario,
        inicio: Number.isFinite(t) ? t : 0,
      })
    }
  }
  const out = new Map<number, number>()
  for (const [id, v] of best) out.set(id, v.unitario)
  return out
}

/**
 * vt_valor_dia per contratado: Σ (CAS_QtiPassesDia × MRI_VlnUnitario).
 * Only CAS_DtdFim IS NULL and not desativado.
 */
export function buildVtValorDiaMap(
  linhas: VtLinha[],
  precos: Map<number, number>,
): Map<number, number> {
  const sums = new Map<number, number>()
  for (const L of linhas) {
    if (L.desativado != null && Number(L.desativado) !== 0) continue
    if (L.dtdFim != null && L.dtdFim !== '') continue
    const unit = precos.get(L.meioId) ?? 0
    const add = (Number.isFinite(L.passesDia) ? L.passesDia : 0) * unit
    sums.set(L.contratadoId, (sums.get(L.contratadoId) ?? 0) + add)
  }
  return sums
}
