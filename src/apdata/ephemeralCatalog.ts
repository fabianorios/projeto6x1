/**
 * Map ephemeral catalog tables → establishments + ramos (same builders as saved-env).
 * LGPD: no employee names; labels from admin DB at runtime only.
 */

import type { EphemeralCatalogResult } from '../api/ephemeral'
import {
  EXCLUDED_SITUACOES,
  buildEstablishments,
  type Establishment,
} from './cnpj'
import {
  activeRamos,
  buildRamos,
  type RamoAtividade,
} from './ramos'

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function tableRows(
  catalog: EphemeralCatalogResult,
  name: string,
): Record<string, unknown>[] {
  return catalog.tables[name]?.rows ?? []
}

export function establishmentsFromEphemeralCatalog(
  catalog: EphemeralCatalogResult,
): Establishment[] {
  const empresas = tableRows(catalog, 'Empresas')
  const locais = tableRows(catalog, 'Locais')
  const folhas = tableRows(catalog, 'Folhas')
  const contratados = tableRows(catalog, 'Contratados')
  const vinculos = tableRows(catalog, 'Vinculos')

  return buildEstablishments(
    empresas.map((r) => ({
      empresaId: num(r.EMP_CdiEmpresa) ?? 0,
      prefixo: str(r.EMP_NusCNPJPrefixo),
      razaoSocial: str(r.EMP_DssEmpresa),
      ramoId: num(r.EMP_CdiRamoAtividadeEmpresa),
    })),
    locais.map((r) => ({
      localId: num(r.LOC_CdiLocal) ?? 0,
      empresaId: num(r.LOC_CdiEmpresa) ?? 0,
      sufixo: str(r.LOC_NusCNPJSufixo),
      nomeFilial: str(r.LOC_D1sLocal),
    })),
    folhas.map((r) => ({
      folhaId: num(r.FOL_CdiFolha) ?? 0,
      localId: num(r.FOL_CdiLocal) ?? 0,
    })),
    contratados.map((r) => ({
      folhaId: num(r.CON_CdiFolha) ?? 0,
      situacao: num(r.CON_CdiSituacao),
      vinculoId: num(r.CON_CdiVinculo),
    })),
    vinculos.map((r) => ({
      vinculoId: num(r.VIN_CdiVinculo) ?? 0,
      descricao: str(r.VIN_D1sVinculo),
    })),
  )
}

export function ramosFromEphemeralCatalog(
  catalog: EphemeralCatalogResult,
): RamoAtividade[] {
  const rows = tableRows(catalog, 'RamosAtividadesEmpresas')
  const all = buildRamos(
    rows.map((r) => ({
      id: num(r.RAE_CdiRamoAtividadeEmpresa) ?? 0,
      label: str(r.RAE_D1sRamoAtividadeEmpresa),
      referencia: str(r.RAE_CosReferencia),
      desativado: num(r.RAE_OplDesativado),
    })),
  )
  const active = activeRamos(all)
  return active.length > 0 ? active : all
}

/** Situações excluded from headcount — kept for tests/docs parity. */
export const EPHEMERAL_CATALOG_EXCLUDED_SITUACOES = EXCLUDED_SITUACOES
