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
import type {
  CategTrabeSocCatalogRow,
  SituacaoCatalogRow,
  TipoRegimeTrabalhistaCatalogRow,
} from './extractFilters'
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

function flag01(v: unknown): boolean {
  const n = num(v)
  return n === 1
}

export function situacoesFromEphemeralCatalog(
  catalog: EphemeralCatalogResult,
): SituacaoCatalogRow[] {
  return tableRows(catalog, 'Situacoes')
    .map((r) => ({
      code: num(r.SIT_CdiSituacao) ?? 0,
      label: str(r.SIT_D1sSituacao) || `Situação ${num(r.SIT_CdiSituacao) ?? ''}`,
      oplAfastamento: flag01(r.SIT_OplAfastamento),
      oplRemuneracao: flag01(r.SIT_OplRemuneracao),
      oplDesativado: flag01(r.SIT_OplDesativado),
    }))
    .filter((r) => Number.isFinite(r.code))
    .sort((a, b) => a.code - b.code)
}

export function categsTrabeSocFromEphemeralCatalog(
  catalog: EphemeralCatalogResult,
): CategTrabeSocCatalogRow[] {
  return tableRows(catalog, 'CategsTrabseSoc')
    .map((r) => ({
      code: num(r.SDK_CdiCategTrabeSoc) ?? 0,
      label:
        str(r.SDK_D1sCategTrabeSoc) ||
        `Categoria ${num(r.SDK_CdiCategTrabeSoc) ?? ''}`,
      cos: str(r.SDK_CosCategTrabeSoc) || undefined,
      oplVinculoEmpregaticio: flag01(r.SDK_OplVinculoEmpregaticio),
    }))
    .filter((r) => Number.isFinite(r.code))
    .sort((a, b) => a.code - b.code)
}

export function tiposRegimeTrabalhistaFromEphemeralCatalog(
  catalog: EphemeralCatalogResult,
): TipoRegimeTrabalhistaCatalogRow[] {
  return tableRows(catalog, 'TiposRegimesTrabalhistas')
    .map((r) => ({
      code: num(r.SDL_CdiTipoRegimeTrabalhista) ?? 0,
      label:
        str(r.SDL_D1sTipoRegimeTrabalhista) ||
        `Regime ${num(r.SDL_CdiTipoRegimeTrabalhista) ?? ''}`,
      cos: str(r.SDL_CosTipoRegimeTrabalhista) || undefined,
    }))
    .filter((r) => Number.isFinite(r.code))
    .sort((a, b) => a.code - b.code)
}
