import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_EXCLUDED_SITUACOES,
  DEFAULT_TIPO_REGIME_TRABALHISTA_IDS,
  buildSituacaoSqlPredicate,
  buildVinculoSqlJoins,
  buildVinculoSqlPredicate,
  defaultCategTrabeSocIds,
  isIncludedSituacao,
  resolveExtractFilters,
} from './extractFilters'

describe('extractFilters', () => {
  it('defaults exclude 0/2/3/99, incluir afastados, CLT, empregatícios flag', () => {
    const r = resolveExtractFilters()
    assert.deepEqual(r.excludeSituacoes, [...DEFAULT_EXCLUDED_SITUACOES])
    assert.equal(r.incluirAfastados, true)
    assert.deepEqual(r.tipoRegimeTrabalhistaIds, [
      ...DEFAULT_TIPO_REGIME_TRABALHISTA_IDS,
    ])
    assert.equal(r.empregaticiosByFlag, true)
    assert.deepEqual(r.categTrabeSocIds, [])
  })

  it('isIncludedSituacao respects exclude + afastamento codes', () => {
    assert.equal(isIncludedSituacao(1), true)
    assert.equal(isIncludedSituacao(2), false)
    assert.equal(
      isIncludedSituacao(7, {
        incluirAfastados: false,
        afastamentoCodes: [7, 51],
      }),
      false,
    )
    assert.equal(
      isIncludedSituacao(7, {
        incluirAfastados: true,
        afastamentoCodes: [7, 51],
      }),
      true,
    )
  })

  it('builds situacao predicate with optional afastados EXISTS', () => {
    const base = resolveExtractFilters()
    const sql = buildSituacaoSqlPredicate(base, 'mssql')
    assert.match(sql, /NOT IN \(0, 2, 3, 99\)/)
    assert.ok(!sql.includes('SIT_OplAfastamento'))

    const noAf = resolveExtractFilters({ incluirAfastados: false })
    const sql2 = buildSituacaoSqlPredicate(noAf, 'mssql')
    assert.match(sql2, /SIT_OplAfastamento/)
    assert.match(sql2, /ISNULL/)
  })

  it('builds vinculo joins for empregatícios flag and regime predicate', () => {
    const r = resolveExtractFilters()
    const joins = buildVinculoSqlJoins(r, 'mssql')
    assert.match(joins, /INNER JOIN Vinculos v/)
    assert.match(joins, /CategsTrabseSoc/)
    assert.match(joins, /SDK_OplVinculoEmpregaticio/)
    assert.equal(buildVinculoSqlPredicate(r), 'v.VIN_CdiTipoRegimeTrabalhista IN (1)')

    const explicit = resolveExtractFilters({
      categTrabeSocIds: [101, 102],
      tipoRegimeTrabalhistaIds: [1, 2],
      somenteEmpregaticios: true,
    })
    assert.equal(explicit.empregaticiosByFlag, false)
    assert.ok(!buildVinculoSqlJoins(explicit, 'mssql').includes('CategsTrabseSoc'))
    assert.match(
      buildVinculoSqlPredicate(explicit),
      /VIN_CdiCategTrabeSoc IN \(101, 102\)/,
    )
  })

  it('defaultCategTrabeSocIds keeps only empregatícios', () => {
    assert.deepEqual(
      defaultCategTrabeSocIds([
        { code: 101, label: 'Empregado', oplVinculoEmpregaticio: true },
        { code: 901, label: 'Estagiário', oplVinculoEmpregaticio: false },
      ]),
      [101],
    )
  })
})
