/**
 * P4 — progressive Passo 5 payloads: shell KPIs + filial index first,
 * heavy byCostCenter / scheduleSuggestions loaded per filial on demand.
 * No PII in index entries (CNPJ digits + labels from Folha only).
 */

import type { ScheduleSuggestion } from '../engine/schedule-suggest'
import type { CostCenterResult, SimulationResult } from '../engine/types'
import {
  OPERACIONAL_SEM_CNPJ_KEY,
  groupOperacionalByCnpj,
  summarizeOperacionalTurmas,
  type OperacionalFilialGroup,
} from './resultsDossier'

/** Minimum distinct Filial/CNPJ groups before progressive shell kicks in. */
export const PROGRESSIVE_MIN_FILIAIS = 2

export interface FilialIndexEntry {
  /** Digits-only CNPJ, or {@link OPERACIONAL_SEM_CNPJ_KEY}. */
  key: string
  label: string
  centroCustoCount: number
  centerCount: number
  crewCount: number
  totalHeadcount: number
  regimes: string[]
}

export interface FilialSlice {
  filialKey: string
  centers: CostCenterResult[]
  scheduleSuggestions: ScheduleSuggestion[]
}

export interface ProgressiveShellBundle {
  shell: SimulationResult
  filialIndex: FilialIndexEntry[]
  /** True when shell omitted heavy filial payloads. */
  progressive: true
}

function indexFromGroups(
  groups: OperacionalFilialGroup[],
): FilialIndexEntry[] {
  return groups.map((g) => {
    const turmas = summarizeOperacionalTurmas(g.centers)
    return {
      key: g.key,
      label: g.label,
      centroCustoCount: g.centroCustos.length,
      centerCount: g.centers.length,
      crewCount: turmas.crewCount,
      totalHeadcount: turmas.totalHeadcount,
      regimes: turmas.regimes,
    }
  })
}

/** Build accordion index from a full SimulationResult. */
export function buildFilialIndex(result: SimulationResult): FilialIndexEntry[] {
  const groups = groupOperacionalByCnpj({
    centers: result.byCostCenter,
    payrollRows: result.input.payrollRows,
  })
  return indexFromGroups(groups)
}

export function shouldUseProgressivePayload(
  result: SimulationResult,
): boolean {
  if (result.byCostCenter.length === 0) return false
  const index = buildFilialIndex(result)
  const real = index.filter((e) => e.key !== OPERACIONAL_SEM_CNPJ_KEY)
  return real.length >= PROGRESSIVE_MIN_FILIAIS
}

/**
 * Strip heavy arrays so Passo 5 can render KPIs + filial list without
 * holding every CostCenterResult / suggestion in SPA memory.
 */
export function buildProgressiveShell(
  result: SimulationResult,
): ProgressiveShellBundle {
  const filialIndex = buildFilialIndex(result)
  const shell: SimulationResult = {
    ...result,
    byCostCenter: [],
    scheduleSuggestions: [],
    input: {
      ...result.input,
      // Folha rows stay on the server cache (or local full ref); shell keeps
      // headcount-driving fields only — no per-row payload in SPA memory.
      payrollRows: undefined,
    },
  }
  return { shell, filialIndex, progressive: true }
}

/** Slice centers + suggestions for one Filial/CNPJ key. */
export function sliceFilialPayload(
  result: SimulationResult,
  filialKey: string,
): FilialSlice {
  const groups = groupOperacionalByCnpj({
    centers: result.byCostCenter,
    payrollRows: result.input.payrollRows,
  })
  const group =
    groups.find((g) => g.key === filialKey) ??
    (filialKey === OPERACIONAL_SEM_CNPJ_KEY
      ? groups.find((g) => g.key === OPERACIONAL_SEM_CNPJ_KEY)
      : undefined)

  if (!group) {
    return {
      filialKey,
      centers: [],
      scheduleSuggestions: [],
    }
  }

  const allow = new Set(group.centroCustos)
  const scheduleSuggestions = result.scheduleSuggestions.filter((s) =>
    allow.has(s.centroCusto),
  )

  return {
    filialKey: group.key,
    centers: group.centers,
    scheduleSuggestions,
  }
}

/** Build OperacionalFilialGroup stubs from index (centers empty until fetch). */
export function filialIndexToGroups(
  index: FilialIndexEntry[],
): OperacionalFilialGroup[] {
  return index.map((e) => ({
    key: e.key,
    label: e.label,
    centroCustos: [],
    centers: [],
  }))
}

/**
 * Merge open filial slices into a shell for ScheduleBuilder / suggestions UI.
 * Only includes centers for keys present in `openSlices`.
 */
export function mergeOpenFilialSlices(
  shell: SimulationResult,
  openSlices: Iterable<FilialSlice>,
): SimulationResult {
  const centers: CostCenterResult[] = []
  const suggestions: ScheduleSuggestion[] = []
  for (const slice of openSlices) {
    centers.push(...slice.centers)
    suggestions.push(...slice.scheduleSuggestions)
  }
  return {
    ...shell,
    byCostCenter: centers,
    scheduleSuggestions: suggestions,
  }
}
