/**
 * LGPD helpers for collaborator identification (name).
 * Default: mask on. Managerial UI may unmask for display only;
 * handoff / JSON export never emits unmasked names while mask is on.
 */

/** Product default — identification masked unless managerial toggle is off. */
export const DEFAULT_MASK_COLLABORATOR_NAMES = true

export type LgpdNameMaskOptions = {
  /** When true (default), return masked display form. */
  mask?: boolean
}

/**
 * Mask a person name for LGPD-safe display.
 * Keeps first letter of each token; replaces the rest with '*'.
 * Empty / whitespace → ''.
 */
export function maskCollaboratorName(
  raw: string | null | undefined,
): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  return t
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return '*'
      const rest = Math.min(part.length - 1, 12)
      return part[0]! + '*'.repeat(rest)
    })
    .join(' ')
}

/**
 * Resolve what to show for a collaborator name.
 * Default mask = on (LGPD). Pass `{ mask: false }` for managerial view.
 */
export function resolveCollaboratorDisplayName(
  raw: string | null | undefined,
  opts: LgpdNameMaskOptions = {},
): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const mask = opts.mask ?? DEFAULT_MASK_COLLABORATOR_NAMES
  return mask ? maskCollaboratorName(t) : t
}

/**
 * Apply mask policy to a PayrollRow-like `nome` field.
 * Returns null when input is empty.
 */
export function applyCollaboratorNameMask(
  nome: string | null | undefined,
  maskOn: boolean = DEFAULT_MASK_COLLABORATOR_NAMES,
): string | null {
  return resolveCollaboratorDisplayName(nome, { mask: maskOn })
}

/**
 * Handoff / JSON export scrubber.
 * When mask is on: never emit the raw name (masked form or null).
 * When mask is off: still omit raw PII from handoff — return null
 * (aggregated handoff stays without person identification).
 */
export function scrubNomeForHandoffExport(
  nome: string | null | undefined,
  maskOn: boolean = DEFAULT_MASK_COLLABORATOR_NAMES,
): string | null {
  if (!(nome ?? '').trim()) return null
  // Handoff contract: no unmasked PII. Masked optional only if callers
  // explicitly want a redacted token; default omit entirely.
  if (maskOn) return null
  return null
}

/** Map rows → display nomes under current mask policy (pure). */
export function mapPayrollNomesForDisplay<
  T extends { nome: string | null },
>(rows: T[], maskOn: boolean = DEFAULT_MASK_COLLABORATOR_NAMES): T[] {
  return rows.map((r) => ({
    ...r,
    nome: applyCollaboratorNameMask(r.nome, maskOn),
  }))
}
