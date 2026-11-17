import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPayrollExtras, type PayrollRow } from '../engine/payroll'
import { enrichPayrollCnpjFromEscopo } from './enrichPayrollCnpj'
import {
  groupOperacionalByCnpj,
  shouldShowFilialAccordion,
} from '../utils/resultsDossier'

function row(partial: Partial<PayrollRow>): PayrollRow {
  return {
    cargo: 'Operador',
    salario: 3000,
    cargaHorariaMensal: 220,
    cargaHorariaSemanal: 44,
    centroCusto: 'GERAL',
    vrValorDia: null,
    vrDiasMesAtual: null,
    vtValorDia: null,
    vtDiasMesAtual: null,
    nome: null,
    quantidade: 1,
    escalaAtual: '6x1',
    sourceLine: 2,
    ...emptyPayrollExtras(),
    ...partial,
  }
}

describe('enrichPayrollCnpjFromEscopo', () => {
  it('stamps the sole escopo CNPJ when rows lack cnpjCompleto', () => {
    const rows = [
      row({ centroCusto: 'CC-A', cnpjCompleto: null }),
      row({ centroCusto: 'CC-B', cnpjCompleto: null }),
    ]
    const next = enrichPayrollCnpjFromEscopo(rows, [
      { key: '12.345.678/0001-90', localId: 10, empresaId: 1 },
    ])
    assert.equal(next[0]!.cnpjCompleto, '12345678000190')
    assert.equal(next[0]!.codFilial, '10')
    assert.equal(next[1]!.cnpjCompleto, '12345678000190')
    assert.equal(shouldShowFilialAccordion(groupOperacionalByCnpj({
      centers: next.map((r) => ({
        centroCusto: r.centroCusto,
        currentHeadcount: 1,
        requiredHeadcount: 1,
        additionalHeadcount: 0,
        baselinePayroll: 0,
        projectedPayroll: 0,
        payrollMonthlyDelta: 0,
        vr: {
          currentMonthly: 0,
          proposedMonthly: 0,
          monthlyDelta: 0,
          annualDelta: 0,
          proposedDaysPerMonth: 0,
        },
        vt: {
          currentMonthly: 0,
          proposedMonthly: 0,
          monthlyDelta: 0,
          annualDelta: 0,
          proposedDaysPerMonth: 0,
        },
        va: {
          currentMonthly: 0,
          proposedMonthly: 0,
          monthlyDelta: 0,
          annualDelta: 0,
          proposedDaysPerMonth: 0,
        },
        assistMedicaMonthly: 0,
        assistOdontoMonthly: 0,
        cnpjCompleto: r.cnpjCompleto,
      })),
      payrollRows: next,
    })), true)
  })

  it('does not invent a split when escopo has multiple CNPJs and rows lack CNPJ', () => {
    const rows = [row({ cnpjCompleto: null })]
    const next = enrichPayrollCnpjFromEscopo(rows, [
      { key: '12345678000190' },
      { key: '98765432000111' },
    ])
    assert.equal(next[0]!.cnpjCompleto, null)
  })

  it('leaves rows that already have CNPJ unchanged', () => {
    const rows = [row({ cnpjCompleto: '11111111000191' })]
    const next = enrichPayrollCnpjFromEscopo(rows, [
      { key: '12345678000190' },
    ])
    assert.equal(next[0]!.cnpjCompleto, '11111111000191')
  })
})
