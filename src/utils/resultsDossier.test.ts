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
  groupFilialCcHorario,
  groupOperacionalByCnpj,
  nestCentersByCc,
  OPERACIONAL_SEM_CNPJ_KEY,
  resolveVisibleCentroCustos,
  shouldShowFilialAccordion,
  summarizeOperacionalTurmas,
} from './resultsDossier'
import type { CostCenterResult } from '../engine/types'

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

  it('builds one-line executive impact summary (numeric, no R$)', () => {
    const line = executiveImpactSummary({
      monthlyDelta: 12000,
      annualDelta: 144000,
      currentHeadcount: 40,
      requiredHeadcount: 48,
      absorcaoLabel: 'Contratação integral',
      formatSigned: (n) =>
        n >= 0
          ? `+${n.toLocaleString('pt-BR')}`
          : `−${Math.abs(n).toLocaleString('pt-BR')}`,
    })
    assert.match(line, /folha \+12\.000\/mês/)
    assert.doesNotMatch(line, /R\$/)
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
          baselineSalaryMass: 0,
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

  it('groups Bloco Operacional centers by Filial/CNPJ', () => {
    const stub = (partial: Partial<CostCenterResult>): CostCenterResult => ({
      centroCusto: 'X',
      currentHeadcount: 1,
      requiredHeadcount: 1,
      additionalHeadcount: 0,
      baselineSalaryMass: 0,
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
      ...partial,
    })

    const rows = [
      row({
        cnpjCompleto: '12345678000190',
        codFilial: '01',
        centroCusto: 'CC-A',
        codCc: 'CC-A',
      }),
      row({
        cnpjCompleto: '98765432000111',
        codFilial: '02',
        centroCusto: 'CC-C',
        codCc: 'CC-C',
      }),
    ]
    const groups = groupOperacionalByCnpj({
      centers: [
        stub({
          centroCusto: 'CC-A',
          cnpjCompleto: '12345678000190',
          distribuicaoTurmas: {
            regime: 'SEG_SEX',
            crewCount: 2,
            dailyCoverageNeed: 5,
            totalHeadcount: 10,
            crews: [],
            note: 'a',
          },
        }),
        stub({
          centroCusto: 'CC-C',
          cnpjCompleto: '98765432000111',
          distribuicaoTurmas: {
            regime: 'SEG_SEX',
            crewCount: 1,
            dailyCoverageNeed: 3,
            totalHeadcount: 3,
            crews: [],
            note: 'c',
          },
        }),
        stub({ centroCusto: 'ORFA', cnpjCompleto: null }),
      ],
      payrollRows: rows,
    })
    assert.equal(groups.length, 3)
    assert.equal(groups[0]!.centroCustos.join(','), 'CC-A')
    assert.equal(groups[1]!.centroCustos.join(','), 'CC-C')
    assert.equal(groups[2]!.key, OPERACIONAL_SEM_CNPJ_KEY)

    const sum = summarizeOperacionalTurmas(groups[0]!.centers)
    assert.equal(sum.crewCount, 2)
    assert.equal(sum.totalHeadcount, 10)
    assert.equal(shouldShowFilialAccordion(groups), true)
    assert.equal(
      shouldShowFilialAccordion([
        {
          key: OPERACIONAL_SEM_CNPJ_KEY,
          label: 'Sem CNPJ / filial',
          centroCustos: ['X'],
          centers: [],
        },
      ]),
      false,
    )
    // Single real CNPJ still gets accordion (not only when 2+)
    assert.equal(
      shouldShowFilialAccordion([
        {
          key: '12345678000190',
          label: 'Filial 01 · 12.345.678/0001-90',
          centroCustos: ['CC-A'],
          centers: [],
        },
      ]),
      true,
    )
  })

  it('nests horário slices under CC (not siblings of Filial)', () => {
    const stub = (partial: Partial<CostCenterResult>): CostCenterResult => ({
      centroCusto: 'X',
      currentHeadcount: 1,
      requiredHeadcount: 1,
      additionalHeadcount: 0,
      baselineSalaryMass: 0,
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
      ...partial,
    })

    const nested = nestCentersByCc([
      stub({
        centroCusto: 'CC-A',
        codHorarioAtual: '20',
        cnpjCompleto: '12345678000190',
      }),
      stub({
        centroCusto: 'CC-A',
        codHorarioAtual: '10',
        cnpjCompleto: '12345678000190',
      }),
      stub({
        centroCusto: 'CC-B',
        codHorarioAtual: '30',
        cnpjCompleto: '12345678000190',
      }),
    ])
    assert.equal(nested.length, 2)
    assert.equal(nested[0]!.centroCusto, 'CC-A')
    assert.deepEqual(
      nested[0]!.horarios.map((h) => h.codHorarioAtual),
      ['10', '20'],
    )
    assert.equal(nested[1]!.centroCusto, 'CC-B')

    const tree = groupFilialCcHorario({
      centers: [
        stub({
          centroCusto: 'CC-A',
          codHorarioAtual: '10',
          cnpjCompleto: '12345678000190',
        }),
        stub({
          centroCusto: 'CC-A',
          codHorarioAtual: '20',
          cnpjCompleto: '12345678000190',
        }),
        stub({
          centroCusto: 'CC-Z',
          codHorarioAtual: '99',
          cnpjCompleto: '98765432000111',
        }),
      ],
      payrollRows: [
        row({
          cnpjCompleto: '12345678000190',
          codFilial: '01',
          centroCusto: 'CC-A',
          codCc: 'CC-A',
        }),
        row({
          cnpjCompleto: '98765432000111',
          codFilial: '02',
          centroCusto: 'CC-Z',
          codCc: 'CC-Z',
        }),
      ],
    })
    assert.equal(tree.length, 2)
    assert.equal(tree[0]!.centroCustos.length, 1)
    assert.equal(tree[0]!.centroCustos[0]!.horarios.length, 2)
    assert.equal(tree[1]!.centroCustos[0]!.centroCusto, 'CC-Z')
  })
})
