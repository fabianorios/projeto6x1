/**
 * Auto-classify Apdata TiposBeneficios by description keywords.
 * Used after extractor brings all active benefits (no hard-coded tipo 53).
 */

export type BenefitClass = 'VARIAVEL_DIA' | 'FIXO_MENSAL' | 'IGNORAR'

export type ExtractedBenefit = {
  codigo: string
  descricao: string
  valorMedio: number
  /** Auto or user override. */
  classificacao: BenefitClass
}

/** Keywords → variável por dia (× worked days of new schedule). */
const VARIAVEL_DIA_KEYWORDS = [
  'refeicao',
  'refeição',
  'vale-refeicao',
  'vale-refeição',
  'vale refeicao',
  'vale refeição',
  'vale refeicao',
  ' vr ',
  'vr ',
  ' vr',
  'alimentacao diaria',
  'alimentação diária',
  'alimentacao diária',
  'alimentação diaria',
  // Vale-combustível follows VR pipeline (not VT/transport).
  'combustivel',
  'combustível',
  'vale-combustivel',
  'vale-combustível',
  'vale combustivel',
  'vale combustível',
  'auxilio combustivel',
  'auxílio combustível',
  'auxilio-combustivel',
  'auxílio-combustível',
] as const

/** Keywords → fixo mensal (per life × new HC). */
const FIXO_MENSAL_KEYWORDS = [
  'medica',
  'médica',
  'saude',
  'saúde',
  'unimed',
  'amil',
  'bradesco',
  'odonto',
  'cesta',
  'alimentacao',
  'alimentação',
  ' vale alimentacao',
  ' vale alimentação',
  'vale-alimentacao',
  'vale-alimentação',
  ' va ',
  'va ',
  'seguro',
] as const

function normalizeDesc(raw: string): string {
  return ` ${raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

function hasKeyword(hay: string, keywords: readonly string[]): boolean {
  for (const kw of keywords) {
    const needle = kw
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    if (!needle) continue
    // Single-token short codes (vr / va) need word boundaries via padded hay.
    if (needle === 'vr' || needle === 'va') {
      if (hay.includes(` ${needle} `)) return true
      continue
    }
    if (hay.includes(needle)) return true
  }
  return false
}

/**
 * Classify by TBE_D1sTipoBeneficio keywords.
 * VARIAVEL_DIA checked first (refeição / VR / combustível) so "alimentação
 * diária" wins over generic "alimentação" → FIXO_MENSAL. Combustível is
 * VR-like (not VT); consultants may override to FIXO_MENSAL in Studio / Passo 4.
 */
export function classifyBenefitByDescription(descricao: string): BenefitClass {
  const hay = normalizeDesc(descricao || '')
  if (!hay.trim()) return 'IGNORAR'
  if (hasKeyword(hay, VARIAVEL_DIA_KEYWORDS)) return 'VARIAVEL_DIA'
  if (hasKeyword(hay, FIXO_MENSAL_KEYWORDS)) return 'FIXO_MENSAL'
  return 'IGNORAR'
}

/** Session-local override (Studio + Passo 4) — not persisted to SqlProfile. */
export type BenefitSessionOverride = {
  classificacao?: BenefitClass
  valorMedio?: number
}

export type BenefitSessionOverrides = Record<string, BenefitSessionOverride>

export function benefitKey(b: Pick<ExtractedBenefit, 'codigo' | 'descricao'>): string {
  return `${b.codigo}::${b.descricao}`
}

/** Lookup session override by exact key, then by codigo prefix (Studio vs agg text drift). */
export function lookupBenefitSessionOverride(
  overrides: BenefitSessionOverrides | Record<string, BenefitClass>,
  b: Pick<ExtractedBenefit, 'codigo' | 'descricao'>,
): BenefitSessionOverride | BenefitClass | undefined {
  const key = benefitKey(b)
  const exact = overrides[key]
  if (exact != null) return exact
  const prefix = `${b.codigo}::`
  for (const [k, v] of Object.entries(overrides)) {
    if (k === b.codigo || k.startsWith(prefix)) return v
  }
  return undefined
}

/** Merge a partial override into the session map. */
export function mergeBenefitSessionOverride(
  prev: BenefitSessionOverrides,
  key: string,
  patch: BenefitSessionOverride,
): BenefitSessionOverrides {
  const cur = prev[key] ?? {}
  const next: BenefitSessionOverride = { ...cur }
  if (patch.classificacao !== undefined) next.classificacao = patch.classificacao
  if (patch.valorMedio !== undefined) {
    next.valorMedio = Number.isFinite(patch.valorMedio)
      ? patch.valorMedio
      : undefined
  }
  if (next.classificacao === undefined && next.valorMedio === undefined) {
    const { [key]: _drop, ...rest } = prev
    void _drop
    return rest
  }
  return { ...prev, [key]: next }
}

/** Sanitize text for Aptools TAB/; export (no `;`, TAB, `|`, newlines). */
export function sanitizeBenefitText(raw: string): string {
  return String(raw ?? '')
    .replace(/[;\t|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse `codigo|descricao|valor;codigo|descricao|valor` from extractor.
 * Auto-classifies each row; invalid tokens skipped.
 */
export function parseBeneficiosAgg(raw: string | null | undefined): ExtractedBenefit[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const out: ExtractedBenefit[] = []
  for (const part of text.split(';')) {
    const token = part.trim()
    if (!token) continue
    const bits = token.split('|')
    if (bits.length < 3) continue
    const codigo = sanitizeBenefitText(bits[0] ?? '')
    const descricao = sanitizeBenefitText(bits.slice(1, -1).join('|'))
    const valorRaw = (bits[bits.length - 1] ?? '').trim().replace(',', '.')
    const valorMedio = Number(valorRaw)
    if (!codigo || !Number.isFinite(valorMedio)) continue
    out.push({
      codigo,
      descricao,
      valorMedio,
      classificacao: classifyBenefitByDescription(descricao),
    })
  }
  return out
}

/**
 * Collapse extracted benefits into engine scalar fields.
 * VARIAVEL_DIA → vr (sum of averages); FIXO_MENSAL split by keyword
 * (odonto / alimentação-VA / else médica); IGNORAR skipped.
 */
export function benefitsToPayrollScalars(benefits: ExtractedBenefit[]): {
  vrValorDia: number | null
  vaValorMes: number | null
  assistMedicaMes: number | null
  assistOdontoMes: number | null
} {
  let vr = 0
  let va = 0
  let med = 0
  let odonto = 0
  for (const b of benefits) {
    if (b.classificacao === 'IGNORAR') continue
    if (b.classificacao === 'VARIAVEL_DIA') {
      vr += b.valorMedio
      continue
    }
    // FIXO_MENSAL
    const hay = normalizeDesc(b.descricao)
    if (hasKeyword(hay, ['odonto'])) {
      odonto += b.valorMedio
    } else if (
      hasKeyword(hay, [
        'alimentacao',
        'alimentação',
        'cesta',
        'va',
        'vale-alimentacao',
        'vale-alimentação',
      ]) &&
      !hasKeyword(hay, ['diaria', 'diária', 'refeicao', 'refeição'])
    ) {
      va += b.valorMedio
    } else {
      med += b.valorMedio
    }
  }
  return {
    vrValorDia: vr > 0 ? vr : null,
    vaValorMes: va > 0 ? va : null,
    assistMedicaMes: med > 0 ? med : null,
    assistOdontoMes: odonto > 0 ? odonto : null,
  }
}

/** Unique benefits across payroll rows (for Step 4 mapping table). */
export function collectUniqueBenefits(
  rows: { benefits?: ExtractedBenefit[] | null }[],
): ExtractedBenefit[] {
  const map = new Map<string, ExtractedBenefit>()
  for (const row of rows) {
    for (const b of row.benefits ?? []) {
      const key = `${b.codigo}::${b.descricao}`
      const prev = map.get(key)
      if (!prev) {
        map.set(key, { ...b })
      } else {
        // Keep max average as display; classification from first / override later.
        map.set(key, {
          ...prev,
          valorMedio: Math.max(prev.valorMedio, b.valorMedio),
        })
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
  )
}

/**
 * Apply session overrides keyed by `codigo::descricao`.
 * Accepts legacy `Record<string, BenefitClass>` or rich session patches
 * (classification and/or valorMedio).
 */
export function applyBenefitOverrides(
  benefits: ExtractedBenefit[],
  overrides: BenefitSessionOverrides | Record<string, BenefitClass>,
): ExtractedBenefit[] {
  return benefits.map((b) => {
    const raw = lookupBenefitSessionOverride(overrides, b)
    if (raw == null) return b
    if (typeof raw === 'string') {
      return { ...b, classificacao: raw }
    }
    return {
      ...b,
      classificacao: raw.classificacao ?? b.classificacao,
      valorMedio:
        raw.valorMedio != null && Number.isFinite(raw.valorMedio)
          ? raw.valorMedio
          : b.valorMedio,
    }
  })
}

function rowCell(
  row: Record<string, unknown>,
  ...names: string[]
): string {
  for (const n of names) {
    const v = row[n] ?? row[n.toUpperCase()] ?? row[n.toLowerCase()]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/**
 * Map Studio TIPOS_BENEFICIOS test-slot rows → ExtractedBenefit for the
 * inline edit grid (cod_tipo / desc_tipo / valor_medio).
 */
export function benefitsFromTiposRows(
  rows: Record<string, unknown>[],
): ExtractedBenefit[] {
  const out: ExtractedBenefit[] = []
  for (const row of rows) {
    const codigo = rowCell(row, 'cod_tipo', 'codigo')
    if (!codigo) continue
    const descricao = rowCell(row, 'desc_tipo', 'descricao') || codigo
    const valorRaw = rowCell(row, 'valor_medio', 'valorMedio').replace(',', '.')
    const parsed = valorRaw === '' ? 0 : Number(valorRaw)
    const valorMedio = Number.isFinite(parsed) ? parsed : 0
    out.push({
      codigo,
      descricao,
      valorMedio,
      classificacao: classifyBenefitByDescription(descricao),
    })
  }
  return out
}
