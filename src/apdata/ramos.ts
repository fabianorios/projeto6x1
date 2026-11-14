/**
 * Ramos de atividade (Apdata) → Turnocheck sector calibration.
 *
 * Join:
 *   Empresas.EMP_CdiRamoAtividadeEmpresa
 *     → RamosAtividadesEmpresas.RAE_CdiRamoAtividadeEmpresa
 *   Label: RAE_D1sRamoAtividadeEmpresa (pt-BR primary description)
 *
 * LGPD: labels come from DB at runtime for the admin user — OK in the app.
 * Tests/docs/commits must use generic placeholders only.
 */

import type { SectorId } from '../engine/types'

export type RamoAtividade = {
  id: number
  /** RAE_D1sRamoAtividadeEmpresa (or CosReferencia fallback). */
  label: string
  /** Closest Turnocheck SectorId for friction / template defaults. */
  sectorId: SectorId
  desativado: boolean
}

export type RamoRow = {
  id: number
  label: string
  referencia?: string | null
  desativado?: number | null
}

/** Keyword → SectorId (first match wins; order = specificity). */
const SECTOR_KEYWORDS: { sector: SectorId; patterns: RegExp[] }[] = [
  {
    sector: 'hospital',
    patterns: [
      /\bhospital/i,
      /\bcl[ií]nica/i,
      /\bsa[uú]de/i,
      /\bm[eé]dic/i,
      /\benferm/i,
      /\bpronto[\s-]?socorro/i,
      /\bupa\b/i,
    ],
  },
  {
    sector: 'construcao',
    patterns: [
      /\bconstru/i,
      /\bobra\b/i,
      /\bcanteiro/i,
      /\bengenharia\s+civil/i,
      /\bedifica/i,
    ],
  },
  {
    sector: 'locacao',
    patterns: [
      /\blocac/i,
      /\baluguel/i,
      /\bfrota\b/i,
      /\bequipamento/i,
      /\brental/i,
    ],
  },
  {
    sector: 'varejo',
    patterns: [
      /\bvarejo/i,
      /\bcom[eé]rcio/i,
      /\bloja/i,
      /\bsupermercado/i,
      /\bvarejojista|varejista/i,
      /\bretail/i,
      /\bshopping/i,
    ],
  },
]

/**
 * Map Apdata ramo description → SectorId.
 * Unknown / empty → varejo (baseline friction 1.0).
 */
export function mapRamoToSectorId(
  label: string | null | undefined,
): SectorId {
  const text = (label ?? '').trim()
  if (!text) return 'varejo'
  for (const { sector, patterns } of SECTOR_KEYWORDS) {
    if (patterns.some((re) => re.test(text))) return sector
  }
  return 'varejo'
}

export function buildRamos(rows: RamoRow[]): RamoAtividade[] {
  const out: RamoAtividade[] = []
  for (const r of rows) {
    if (!Number.isFinite(r.id)) continue
    const label =
      (r.label ?? '').trim() ||
      (r.referencia ?? '').trim() ||
      `ramo#${r.id}`
    const desativado = r.desativado != null && Number(r.desativado) !== 0
    out.push({
      id: r.id,
      label,
      sectorId: mapRamoToSectorId(label),
      desativado,
    })
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  return out
}

/** Active (non-desativado) ramos only. */
export function activeRamos(ramos: RamoAtividade[]): RamoAtividade[] {
  return ramos.filter((r) => !r.desativado)
}

/**
 * Pick SectorId for simulation from selected ramo ids.
 * Uses the first selected active ramo's mapping; fallback varejo.
 */
export function sectorFromSelectedRamos(
  ramos: RamoAtividade[],
  selectedIds: number[],
): SectorId {
  if (selectedIds.length === 0) return 'varejo'
  const byId = new Map(ramos.map((r) => [r.id, r]))
  for (const id of selectedIds) {
    const r = byId.get(id)
    if (r && !r.desativado) return r.sectorId
  }
  return 'varejo'
}
