/**
 * Cycle → escala_atual classification (mapping § Classificação).
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

/** Estimate VR/VT days/month from cycle (work_days / cycle_len × 30). */
export function estimateDaysFromCycle(stats: CycleStats | null): number | null {
  if (!stats || stats.cycleLen <= 0) return null
  return Math.round((30 * stats.workDays) / stats.cycleLen * 10) / 10
}

export type JornadaRow = {
  horarioId: number
  tipoDiaId: number
  desativado: number | null
}

export type TipoDiaRow = {
  id: number
  trabalho: number
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
