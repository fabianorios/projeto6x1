/**
 * Etapa 4 — OH scope badge labels for Results (global vs segmentada).
 * Reads `ohScopeMatch` stamped by the motor; does not re-resolve cascade.
 */

import type { OHScopeMatchMeta, OHScopeType } from '../engine'

export const OH_SCOPE_TYPE_LABELS: Record<OHScopeType, string> = {
  global: 'Global',
  publico: 'Público',
  centro_custo: 'Centro de custo',
  cargo: 'Cargo',
}

/** Segmented scopes (anything other than global / missing). */
export function isSegmentedOhScope(
  match: OHScopeMatchMeta | null | undefined,
): boolean {
  return Boolean(match && match.scopeType !== 'global')
}

/**
 * Compact badge: "OH global" | "OH segmentada · Cargo: Operador".
 */
export function formatOhScopeBadge(
  match: OHScopeMatchMeta | null | undefined,
): string {
  if (!match || match.scopeType === 'global') return 'OH global'
  const scope = OH_SCOPE_TYPE_LABELS[match.scopeType] ?? match.scopeType
  const target = (match.targetValue ?? '').trim()
  return target
    ? `OH segmentada · ${scope}: ${target}`
    : `OH segmentada · ${scope}`
}

/** Short chip for tight table cells. */
export function formatOhScopeBadgeShort(
  match: OHScopeMatchMeta | null | undefined,
): string {
  if (!match || match.scopeType === 'global') return 'global'
  return 'segmentada'
}
