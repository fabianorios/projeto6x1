import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPayrollExtras, type PayrollRow } from '../engine/payroll'
import {
  dayMarkLabel,
  excelPersonLabel,
  expandMatrixToPersonRows,
  flattenPayrollSlotsForCc,
} from './schedulePersonRows'
import type { MonthCalendarMatrix } from '../engine/display'

function row(partial: Partial<PayrollRow> & Pick<PayrollRow, 'cargo'>): PayrollRow {
  return {
    cargo: partial.cargo,
    salario: 2000,
    cargaHorariaMensal: 220,
    cargaHorariaSemanal: 44,
    centroCusto: partial.centroCusto ?? 'CC1',
    vrValorDia: null,
    vrDiasMesAtual: null,
    vtValorDia: null,
    vtDiasMesAtual: null,
    nome: partial.nome ?? null,
    quantidade: partial.quantidade ?? 1,
    escalaAtual: null,
    sourceLine: 2,
    ...emptyPayrollExtras(),
    ...partial,
  }
}

const sampleMatrix: MonthCalendarMatrix = {
  year: 2026,
  month: 12,
  days: [
    {
      day: 1,
      year: 2026,
      month: 12,
      weekday: 'seg',
      weekdayLabel: 'Seg',
      isWeekend: false,
      weekIndex: 0,
    },
    {
      day: 2,
      year: 2026,
      month: 12,
      weekday: 'ter',
      weekdayLabel: 'Ter',
      isWeekend: false,
      weekIndex: 0,
    },
  ],
  rows: [
    {
      turmaIndex: 1,
      label: '09:00–17:00 · T1',
      escala: '5x2',
      headcount: 2,
      marks: ['T', 'F'],
    },
    {
      turmaIndex: 2,
      label: '09:00–17:00 · T2',
      escala: '5x2',
      headcount: 1,
      marks: ['F', 'T'],
    },
  ],
  daily: [
    { day: 1, working: 2, need: 2, uncovered: false },
    { day: 2, working: 1, need: 2, uncovered: true },
  ],
}

describe('schedulePersonRows', () => {
  it('flattens named payroll with LGPD mask default ON', () => {
    const slots = flattenPayrollSlotsForCc(
      [
        row({ cargo: 'Operador', nome: 'João Silva', quantidade: 1 }),
        row({ cargo: 'Auxiliar', nome: null, quantidade: 2 }),
      ],
      'CC1',
    )
    assert.equal(slots.length, 3)
    assert.equal(slots[0]!.kind, 'person')
    assert.equal(slots[0]!.primaryLabel, 'J*** S****')
    assert.equal(slots[1]!.kind, 'posto')
    assert.match(slots[1]!.primaryLabel, /^Posto 01 · Auxiliar$/)
    assert.match(slots[2]!.primaryLabel, /^Posto 02 · Auxiliar$/)
  })

  it('expands matrix headcount into individual rows', () => {
    const people = expandMatrixToPersonRows(sampleMatrix, {
      maskOn: true,
      centroCusto: 'CC1',
      payrollRows: [
        row({ cargo: 'Op', nome: 'Ana Costa', quantidade: 1 }),
      ],
    })
    assert.equal(people.length, 3)
    assert.equal(people[0]!.primaryLabel, 'A** C****')
    assert.equal(people[0]!.marks[0], 'T')
    assert.equal(people[1]!.kind, 'posto')
    assert.equal(people[2]!.turmaIndex, 2)
  })

  it('excelPersonLabel never emits unmasked name when maskOn', () => {
    const people = expandMatrixToPersonRows(sampleMatrix, {
      maskOn: false,
      payrollRows: [row({ cargo: 'Op', nome: 'Maria Clara', quantidade: 1 })],
      centroCusto: 'CC1',
    })
    const slot = people[0]!
    assert.equal(excelPersonLabel(slot, true), 'M**** C****')
    assert.equal(excelPersonLabel(slot, false), 'Maria Clara')
  })

  it('dayMarkLabel distinguishes Trabalho vs Folga/DSR', () => {
    assert.equal(dayMarkLabel('T'), 'Trabalho')
    assert.equal(dayMarkLabel('F'), 'Folga/DSR')
  })
})
