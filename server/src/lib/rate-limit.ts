/**
 * Tiny in-memory sliding-window rate limiter (single process).
 * Enough for basic abuse control on /api/simulate — not a distributed limiter.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export function createRateLimiter(opts: {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}) {
  const hits = new Map<string, number[]>();

  function prune(key: string, now: number): number[] {
    const cutoff = now - opts.windowMs;
    const next = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (next.length === 0) hits.delete(key);
    else hits.set(key, next);
    return next;
  }

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const recent = prune(key, now);
      if (recent.length >= opts.limit) {
        const oldest = recent[0] ?? now;
        const retryAfterSec = Math.max(
          1,
          Math.ceil((oldest + opts.windowMs - now) / 1000),
        );
        return { ok: false, retryAfterSec };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true, remaining: opts.limit - recent.length };
    },
    /** Test helper — clear buckets. */
    reset() {
      hits.clear();
    },
  };
}
