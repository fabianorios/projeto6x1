/**
 * Ephemeral in-memory cache for progressive simulate (P4).
 * TTL short; keys are random UUIDs — never log Folha contents / PII.
 */

import { randomUUID } from "node:crypto";
import type { SimulationResult } from "./shared-engine.js";

export type CachedSimulation = {
  id: string
  result: SimulationResult
  createdAt: number
  expiresAt: number
  /** Counts only — safe for logs. */
  centerCount: number
  filialCount: number
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 32;

export class SimulateResultCache {
  private readonly map = new Map<string, CachedSimulation>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(opts?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  put(
    result: SimulationResult,
    meta: { centerCount: number; filialCount: number },
  ): CachedSimulation {
    this.evictExpired();
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    const id = randomUUID();
    const now = Date.now();
    const entry: CachedSimulation = {
      id,
      result,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      centerCount: meta.centerCount,
      filialCount: meta.filialCount,
    };
    this.map.set(id, entry);
    return entry;
  }

  get(id: string): CachedSimulation | null {
    const entry = this.map.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(id);
      return null;
    }
    return entry;
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    this.evictExpired();
    return this.map.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.map) {
      if (now > entry.expiresAt) this.map.delete(id);
    }
  }
}

/** Process-wide cache shared by /api/simulate progressive routes. */
export const simulateResultCache = new SimulateResultCache();

/** Test helper. */
export function resetSimulateResultCache(): void {
  simulateResultCache.clear();
}
