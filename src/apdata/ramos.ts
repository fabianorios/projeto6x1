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
 *
 * Display: keep the real RAE_D1s text as sectorLabel; map only to nearest
 * catalog preset for buffer/regime defaults (never force old 4-name list).
 */

import {
  CUSTOM_SECTOR_ID,
  resolveSectorPreset,
  type SectorPresetId,
} from '../engine/sectors'
import type { SectorId } from '../engine/types'

export type RamoAtividade = {
  id: number
  /** RAE_D1sRamoAtividadeEmpresa (or CosReferencia fallback) — real DB text. */
  label: string
  /** Closest catalog preset for friction / buffer / regime defaults. */
  sectorId: SectorId
  desativado: boolean
}

export type RamoRow = {
  id: number
  label: string
  referencia?: string | null
  desativado?: number | null
}

/** Keyword → preset (first match wins; order = specificity). */
const SECTOR_KEYWORDS: { sector: SectorPresetId; patterns: RegExp[] }[] = [
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
    sector: 'locacao_facilities',
    patterns: [
      /\blocac/i,
      /\baluguel/i,
      /\bfrota\b/i,
      /\bequipamento/i,
      /\brental/i,
      /\bfacilit/i,
      /\bcondom[ií]nio/i,
      /\blimpeza\s+predial/i,
    ],
  },
  {
    sector: 'contact_center',
    patterns: [
      /\bcontact\s*center/i,
      /\bcall\s*center/i,
      /\bteleatend/i,
      /\bsac\b/i,
      /\bcentral\s+de\s+atend/i,
    ],
  },
  {
    sector: 'alimentacao_hotelaria',
    patterns: [
      /\bhotel/i,
      /\brestaura/i,
      /\balimenta/i,
      /\bfood\s*service/i,
      /\bbar\b/i,
      /\bcozinha/i,
      /\bhoteleir/i,
    ],
  },
  {
    sector: 'logistica',
    patterns: [
      /\blog[ií]st/i,
      /\btransporte/i,
      /\barmaz[eé]m/i,
      /\bcentro\s+de\s+distrib/i,
      /\bcd\b/i,
      /\bfrete/i,
    ],
  },
  {
    sector: 'industria',
    patterns: [
      /\bind[uú]stri/i,
      /\bf[aá]brica/i,
      /\bmanufatur/i,
      /\bprodu[cç][aã]o\s+industrial/i,
    ],
  },
  {
    sector: 'agronegocio',
    patterns: [
      /\bagro/i,
      /\bagr[ií]cola/i,
      /\bpecu[aá]r/i,
      /\blavour/i,
      /\bfazenda/i,
    ],
  },
  {
    sector: 'tecnologia_admin',
    patterns: [
      /\btecnolog/i,
      /\bsoftware/i,
      /\bti\b/i,
      /\binform[aá]tica/i,
      /\badministrativ/i,
      /\bescrit[oó]rio/i,
      /\bconsultoria/i,
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
 * Map Apdata ramo description → nearest catalog preset.
 * Unknown / empty → custom (consultant fills free-text name + buffer).
 */
export function mapRamoToSectorId(
  label: string | null | undefined,
): SectorId {
  const text = (label ?? '').trim()
  if (!text) return CUSTOM_SECTOR_ID
  for (const { sector, patterns } of SECTOR_KEYWORDS) {
    if (patterns.some((re) => re.test(text))) return sector
  }
  return CUSTOM_SECTOR_ID
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
 * Uses the first selected active ramo's mapping; fallback custom.
 */
export function sectorFromSelectedRamos(
  ramos: RamoAtividade[],
  selectedIds: number[],
): SectorId {
  if (selectedIds.length === 0) return CUSTOM_SECTOR_ID
  const byId = new Map(ramos.map((r) => [r.id, r]))
  for (const id of selectedIds) {
    const r = byId.get(id)
    if (r && !r.desativado) return r.sectorId
  }
  return CUSTOM_SECTOR_ID
}

/** Real DB segment name for the first selected active ramo. */
export function segmentLabelFromSelectedRamos(
  ramos: RamoAtividade[],
  selectedIds: number[],
): string {
  if (selectedIds.length === 0) return ''
  const byId = new Map(ramos.map((r) => [r.id, r]))
  for (const id of selectedIds) {
    const r = byId.get(id)
    if (r && !r.desativado) return r.label
  }
  return ''
}

/** Suggested buffer % from nearest preset for selected ramos. */
export function suggestedBufferPctFromSelectedRamos(
  ramos: RamoAtividade[],
  selectedIds: number[],
): number {
  const sector = sectorFromSelectedRamos(ramos, selectedIds)
  return resolveSectorPreset(sector).defaultBufferPct
}
