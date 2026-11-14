import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EphemeralCatalogResult } from '../api/ephemeral'
import {
  establishmentsFromEphemeralCatalog,
  ramosFromEphemeralCatalog,
} from './ephemeralCatalog'

function catalog(
  tables: EphemeralCatalogResult['tables'],
): EphemeralCatalogResult {
  return {
    ok: true,
    mode: 'catalog',
    engine: 'mssql',
    latencyMs: 1,
    tables,
  }
}

describe('ephemeralCatalog', () => {
  it('builds establishments and ramos without PII fields', () => {
    const result = catalog({
      Empresas: {
        columns: [],
        rowCount: 1,
        rows: [
          {
            EMP_CdiEmpresa: 1,
            EMP_DssEmpresa: 'Empresa Demo',
            EMP_NusCNPJPrefixo: '12345678',
            EMP_CdiRamoAtividadeEmpresa: 10,
          },
        ],
      },
      Locais: {
        columns: [],
        rowCount: 1,
        rows: [
          {
            LOC_CdiLocal: 2,
            LOC_CdiEmpresa: 1,
            LOC_D1sLocal: 'Matriz',
            LOC_NusCNPJSufixo: '000199',
          },
        ],
      },
      Folhas: {
        columns: [],
        rowCount: 1,
        rows: [{ FOL_CdiFolha: 3, FOL_CdiLocal: 2 }],
      },
      Contratados: {
        columns: [],
        rowCount: 2,
        rows: [
          { CON_CdiFolha: 3, CON_CdiSituacao: 1, CON_CdiVinculo: 1 },
          { CON_CdiFolha: 3, CON_CdiSituacao: 1, CON_CdiVinculo: 1 },
        ],
      },
      Vinculos: {
        columns: [],
        rowCount: 1,
        rows: [{ VIN_CdiVinculo: 1, VIN_D1sVinculo: 'CLT' }],
      },
      RamosAtividadesEmpresas: {
        columns: [],
        rowCount: 1,
        rows: [
          {
            RAE_CdiRamoAtividadeEmpresa: 10,
            RAE_D1sRamoAtividadeEmpresa: 'Comercio varejista',
            RAE_CosReferencia: 'V',
            RAE_OplDesativado: 0,
          },
        ],
      },
    })

    const establishments = establishmentsFromEphemeralCatalog(result)
    assert.equal(establishments.length, 1)
    assert.match(establishments[0]!.label, /Empresa Demo/)
    assert.match(establishments[0]!.label, /Matriz/)
    assert.equal(establishments[0]!.colaboradores, 2)
    assert.equal(establishments[0]!.porVinculo[0]?.descricao, 'CLT')

    const ramos = ramosFromEphemeralCatalog(result)
    assert.equal(ramos.length, 1)
    assert.equal(ramos[0]!.id, 10)
    assert.equal(ramos[0]!.sectorId, 'varejo')

    const blob = JSON.stringify({ establishments, ramos })
    assert.ok(!blob.toLowerCase().includes('password'))
    assert.ok(!blob.toLowerCase().includes('cpf'))
  })
})
