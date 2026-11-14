import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAtWorkDaysMap,
  buildMeioPrecoMap,
  buildVtValorDiaMap,
  calendarMatchesAtMask,
  estimateVtDaysFromAtAndCycle,
} from './classify'

describe('calendarMatchesAtMask', () => {
  it('matches exact tipo and 88 covering weekdays', () => {
    const mask = new Set([1, 7, 88])
    assert.equal(calendarMatchesAtMask(1, mask), true)
    assert.equal(calendarMatchesAtMask(7, mask), true)
    assert.equal(calendarMatchesAtMask(2, mask), true)
    assert.equal(calendarMatchesAtMask(6, mask), true)
    assert.equal(calendarMatchesAtMask(99, mask), false)
  })
})

describe('estimateVtDaysFromAtAndCycle', () => {
  it('scales at_work days over cycle', () => {
    const days = estimateVtDaysFromAtAndCycle(
      { cycleLen: 7, workDays: 6, offDays: 1 },
      6,
    )
    assert.equal(days, 25.7)
  })

  it('returns null without AT work days', () => {
    assert.equal(
      estimateVtDaysFromAtAndCycle(
        { cycleLen: 7, workDays: 5, offDays: 2 },
        0,
      ),
      null,
    )
  })
})

describe('buildAtWorkDaysMap', () => {
  it('counts trabalho days that hit AT mask (88 → 2..6)', () => {
    const tipos = [
      { id: 1, trabalho: 1 },
      { id: 2, trabalho: 0 },
    ]
    const jornadas = [
      { horarioId: 10, tipoDiaId: 1, tipoDiaCalendario: 2, desativado: 0 },
      { horarioId: 10, tipoDiaId: 1, tipoDiaCalendario: 3, desativado: 0 },
      { horarioId: 10, tipoDiaId: 2, tipoDiaCalendario: 1, desativado: 0 },
      { horarioId: 10, tipoDiaId: 1, tipoDiaCalendario: 7, desativado: 0 },
    ]
    const at = [
      { horarioId: 10, tipoDiaCalendario: 88, desativado: 0 },
      { horarioId: 10, tipoDiaCalendario: 7, desativado: 0 },
    ]
    const map = buildAtWorkDaysMap(jornadas, tipos, at)
    assert.equal(map.get(10), 3)
  })
})

describe('buildVtValorDiaMap', () => {
  it('sums passes × unit only for CAS_DtdFim NULL', () => {
    const precos = buildMeioPrecoMap([
      {
        meioId: 1,
        unitario: 5,
        inicioVigencia: '2024-01-01',
        desativado: 0,
      },
      {
        meioId: 1,
        unitario: 6,
        inicioVigencia: '2025-01-01',
        desativado: 0,
      },
    ])
    assert.equal(precos.get(1), 6)

    const map = buildVtValorDiaMap(
      [
        {
          contratadoId: 100,
          meioId: 1,
          passesDia: 2,
          desativado: 0,
          dtdFim: null,
        },
        {
          contratadoId: 100,
          meioId: 1,
          passesDia: 2,
          desativado: 0,
          dtdFim: '2020-01-01',
        },
        {
          contratadoId: 101,
          meioId: 1,
          passesDia: 1,
          desativado: 1,
          dtdFim: null,
        },
      ],
      precos,
    )
    assert.equal(map.get(100), 12)
    assert.equal(map.has(101), false)
  })
})
