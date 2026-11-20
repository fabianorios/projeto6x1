/**
 * Lightweight CNAE fiscal catalog for Passo 1 Personalizado search.
 * Prefer CNAE over RamosAtividadesEmpresas in product copy.
 * Not exhaustive — curated for consultative search / naming.
 */

import { CUSTOM_SECTOR_ID, type SectorPresetId } from './sectors'

export type CnaeEntry = {
  /** Formatted CNAE fiscal code (subclass). */
  code: string
  description: string
  /** Nearest catalog preset for buffer/regime hints (sector stays custom). */
  nearestSectorId: SectorPresetId
}

export const CNAE_CATALOG: CnaeEntry[] = [
  {
    code: '8610-1/01',
    description: 'Atividades de atendimento hospitalar',
    nearestSectorId: 'hospital',
  },
  {
    code: '8610-1/02',
    description: 'Atividades de atendimento em pronto-socorro e clínicas',
    nearestSectorId: 'hospital',
  },
  {
    code: '8630-5/03',
    description: 'Atividade médica ambulatorial restrita a consultas',
    nearestSectorId: 'hospital',
  },
  {
    code: '4120-4/00',
    description: 'Construção de edifícios',
    nearestSectorId: 'construcao',
  },
  {
    code: '4211-1/01',
    description: 'Construção de rodovias e ferrovias',
    nearestSectorId: 'construcao',
  },
  {
    code: '4299-5/01',
    description: 'Construção de instalações esportivas e recreativas',
    nearestSectorId: 'construcao',
  },
  {
    code: '1011-2/01',
    description: 'Frigorífico — abate de bovinos',
    nearestSectorId: 'industria',
  },
  {
    code: '2013-4/01',
    description: 'Fabricação de cloro e álcalis',
    nearestSectorId: 'industria',
  },
  {
    code: '2941-7/00',
    description: 'Fabricação de peças e acessórios para veículos',
    nearestSectorId: 'industria',
  },
  {
    code: '4711-3/01',
    description: 'Comércio varejista de mercadorias em geral — hipermercados',
    nearestSectorId: 'varejo',
  },
  {
    code: '4711-3/02',
    description: 'Comércio varejista de mercadorias em geral — supermercados',
    nearestSectorId: 'varejo',
  },
  {
    code: '4781-4/00',
    description: 'Comércio varejista de artigos do vestuário e acessórios',
    nearestSectorId: 'varejo',
  },
  {
    code: '5611-2/01',
    description: 'Restaurantes e similares',
    nearestSectorId: 'alimentacao_hotelaria',
  },
  {
    code: '5510-8/01',
    description: 'Hotéis',
    nearestSectorId: 'alimentacao_hotelaria',
  },
  {
    code: '5212-5/00',
    description: 'Carga e descarga',
    nearestSectorId: 'logistica',
  },
  {
    code: '5211-7/01',
    description: 'Armazéns gerais — emissão de warrant',
    nearestSectorId: 'logistica',
  },
  {
    code: '4930-2/01',
    description: 'Transporte rodoviário de carga, exceto produtos perigosos',
    nearestSectorId: 'logistica',
  },
  {
    code: '8220-2/00',
    description: 'Atividades de teleatendimento',
    nearestSectorId: 'contact_center',
  },
  {
    code: '6201-5/01',
    description: 'Desenvolvimento de programas de computador sob encomenda',
    nearestSectorId: 'tecnologia_admin',
  },
  {
    code: '7020-4/00',
    description: 'Atividades de consultoria em gestão empresarial',
    nearestSectorId: 'tecnologia_admin',
  },
  {
    code: '8112-5/00',
    description: 'Condomínios prediais',
    nearestSectorId: 'locacao_facilities',
  },
  {
    code: '7732-2/01',
    description: 'Aluguel de máquinas e equipamentos para construção',
    nearestSectorId: 'locacao_facilities',
  },
  {
    code: '0111-3/01',
    description: 'Cultivo de arroz',
    nearestSectorId: 'agronegocio',
  },
  {
    code: '0151-2/01',
    description: 'Criação de bovinos para corte',
    nearestSectorId: 'agronegocio',
  },
]

function normalizeQuery(q: string): string {
  return q
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Search by CNAE code digits or description keywords. */
export function searchCnaeCatalog(
  query: string,
  limit = 8,
): CnaeEntry[] {
  const q = query.trim()
  if (!q) return CNAE_CATALOG.slice(0, limit)
  const norm = normalizeQuery(q)
  const digits = q.replace(/\D/g, '')
  const scored: { entry: CnaeEntry; score: number }[] = []
  for (const entry of CNAE_CATALOG) {
    const codeDigits = entry.code.replace(/\D/g, '')
    const descNorm = normalizeQuery(entry.description)
    let score = 0
    if (digits && codeDigits.startsWith(digits)) score += 100 - digits.length
    if (digits && codeDigits.includes(digits)) score += 40
    if (descNorm.includes(norm)) score += 30
    if (norm.length >= 3 && descNorm.split(/\s+/).some((w) => w.startsWith(norm))) {
      score += 15
    }
    if (score > 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.entry)
}

export function formatCnaeLabel(entry: CnaeEntry): string {
  return `${entry.code} · ${entry.description}`
}

/** sectorId for Personalizado remains custom; nearest is only a hint. */
export function cnaeNearestOrCustom(
  entry: CnaeEntry | null | undefined,
): SectorPresetId {
  return entry?.nearestSectorId ?? CUSTOM_SECTOR_ID
}
