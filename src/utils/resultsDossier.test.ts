import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPayrollExtras, type PayrollRow } from '../engine/payroll'
import {
  collapseAllDossier,
  DEFAULT_DOSSIER_OPEN,
  dossierCentroCustoOptions,
  dossierEstablishmentOptions,
  executiveImpactSummary,
  expandAllDossier,
  resolveVisibleCentroCustos,
} from './resultsDossier'

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

describe('resultsDossier helpers', () => {
  it('defaults: executivo+operacional open, cadastral collapsed', () => {
    assert.deepEqual(DEFAULT_DOSSIER_OPEN, {
      executivo: true,
      operacional: true,
      cadastral: false,
    })
    assert.equal(expandAllDossier().cadastral, true)
    assert.equal(collapseAllDossier().executivo, false)
  })

  it('builds one-line executive impact summary', () => {
    const line = executiveImpactSummary({
      monthlyDelta: 12000,
      annualDelta: 144000,
      currentHeadcount: 40,
      requiredHeadcount: 48,
      absorcaoLabel: 'Contratação integral',
      formatSignedBrl: (n) => (n >= 0 ? `+R$ ${n}` : `−R$ ${Math.abs(n)}`),
    })
    assert.match(line, /folha \+R\$ 12000\/mês/)
    assert.match(line, /HC 40→48/)
    assert.match(line, /Contratação integral/)
  })

  it('derives Filial/CNPJ options and visible CCs', () => {
    const rows = [
      row({
        cnpjCompleto: '12345678000190',
        codFilial: '01',
        centroCusto: 'CC-A',
        codCc: 'CC-A',
      }),
      row({
        cnpjCompleto: '12345678000190',
        codFilial: '01',
        centroCusto: 'CC-B',
        codCc: 'CC-B',
      }),
      row({
        cnpjCompleto: '98765432000111',
        codFilial: '02',
        centroCusto: 'CC-C',
        codCc: 'CC-C',
      }),
    ]
    const est = dossierEstablishmentOptions(rows)
    assert.equal(est.length, 2)
    assert.match(est[0]!.label, /12\.345\.678\/0001-90|Filial 01/)
    const ccs = dossierCentroCustoOptions(
      [
        {
          centroCusto: 'CC-A',
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
        },
      ],
      rows,
    )
    assert.deepEqual(ccs, ['CC-A', 'CC-B', 'CC-C'])

    const key01 = est.find((e) => e.centroCustos.includes('CC-A'))!.key
    const visible = resolveVisibleCentroCustos({
      allCentroCustos: ccs,
      establishments: est,
      filterCnpjKey: key01,
      filterCc: '',
    })
    assert.deepEqual(visible?.sort(), ['CC-A', 'CC-B'])

    const onlyB = resolveVisibleCentroCustos({
      allCentroCustos: ccs,
      establishments: est,
      filterCnpjKey: key01,
      filterCc: 'CC-B',
    })
    assert.deepEqual(onlyB, ['CC-B'])

    assert.equal(
      resolveVisibleCentroCustos({
        allCentroCustos: ccs,
        establishments: est,
        filterCnpjKey: '',
        filterCc: '',
      }),
      null,
    )
  })
})
