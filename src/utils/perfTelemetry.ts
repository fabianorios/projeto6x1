/**
 * Light client latency telemetry — counts / ms only, never PII.
 * Used to separate “SQL lento” vs “UI lenta” in support (PX-156 / P0).
 */

export type PerfExtra = Record<
  string,
  number | string | boolean | undefined | null
>

export function logPerf(
  phase: string,
  latencyMs: number,
  extra?: PerfExtra,
): void {
  if (typeof console === 'undefined' || typeof console.info !== 'function') {
    return
  }
  const payload: Record<string, unknown> = {
    phase,
    latencyMs: Math.round(latencyMs),
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== null) payload[key] = value
    }
  }
  console.info('[turnocheck:perf]', payload)
}

/** Sync measure — parse / simulate. */
export function measurePerf<T>(
  phase: string,
  fn: () => T,
  extra?: PerfExtra,
): T {
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  const result = fn()
  const t1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  logPerf(phase, t1 - t0, extra)
  return result
}
