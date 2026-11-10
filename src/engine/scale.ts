import { makeScale } from './rules'
import type { ScaleCycle } from './types'

const DEFAULT_SCALE = makeScale(6, 1)

/**
 * Parse labels like "6x1", "6×1", "5 x 2" into a ScaleCycle.
 * Falls back to 6×1 when the string is not recognizable.
 */
export function parseScale(raw: string): ScaleCycle {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '')
  const match = normalized.match(/^(\d+)\s*[x×]\s*(\d+)$/)
  if (!match) return DEFAULT_SCALE
  const workDays = Number(match[1])
  const restDays = Number(match[2])
  if (!Number.isFinite(workDays) || !Number.isFinite(restDays)) {
    return DEFAULT_SCALE
  }
  if (workDays + restDays <= 0) return DEFAULT_SCALE
  return makeScale(workDays, restDays)
}
