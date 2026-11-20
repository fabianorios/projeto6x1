/**
 * Prefer server/eager-seeded Apdata tree on SimulationResult; rebuild only
 * when options diverge from the seed (lunch split / horário selection).
 * Keeps Excel/JSON/PDF exports independent of accordion DOM state.
 */

import {
  buildApdataHierarchy,
  type ApdataHierarchyTree,
  type BuildApdataHierarchyOptions,
  type SimulationResult,
} from '../engine/display'

function sameIdSet(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  if (!a?.length && !b?.length) return true
  if (!a?.length || !b?.length) return false
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/**
 * Resolve hierarchy for export / Fiel da Balança.
 * Uses `result.apdataHierarchy` when present and options are compatible.
 */
export function resolveApdataHierarchy(
  result: SimulationResult,
  options: BuildApdataHierarchyOptions = {},
): ApdataHierarchyTree {
  const seeded = result.apdataHierarchy
  if (!seeded) {
    return buildApdataHierarchy(result, options)
  }

  if (
    options.includeLunchJornada !== undefined &&
    options.includeLunchJornada !== seeded.includeLunchJornada
  ) {
    return buildApdataHierarchy(result, options)
  }

  if (
    options.selectedHorarioIds !== undefined &&
    !sameIdSet(options.selectedHorarioIds, seeded.selectedHorarioIds)
  ) {
    return buildApdataHierarchy(result, options)
  }

  if (options.dataInicio && options.dataInicio !== seeded.dataInicio) {
    return {
      ...seeded,
      dataInicio: options.dataInicio,
      ciclos: seeded.ciclos.map((c) => ({
        ...c,
        dataInicio: options.dataInicio!,
      })),
    }
  }

  return seeded
}
