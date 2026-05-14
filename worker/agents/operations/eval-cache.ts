/**
 * eval-cache — in-process ResponseCache analog for EvalGate verdicts.
 *
 * Mirrors the Mastra v1.33 ResponseCache processor pattern but implemented
 * as a plain module-scoped Map.  Scope: single Durable Object process
 * lifetime — survives concurrent requests within the same DO instance,
 * resets on DO restart.
 *
 * Key: "${sessionId}:${phaseName}"
 * TTL: 10 minutes (matches Mastra's default ResponseCache window)
 * Max size: 100 entries (bounded, oldest evicted when full)
 *
 * When does this fire?
 *   - Retry storms: if the Mastra PhaseWorkflow eval step is retried for
 *     the same phase within one process lifetime, the second call is free.
 *   - Parallel eval: if two concurrent eval requests arrive for the same
 *     phase (rare but possible in multi-agent mode), only one judge call runs.
 *   - Integration tests: avoids double-billing when the same phase is
 *     scored multiple times across test cases.
 *
 * When does this NOT fire?
 *   - Different sessions (sessionId differs)
 *   - Different phases within the same session (phaseName differs)
 *   - After DO restart (module-level Map is cleared)
 *   - After TTL expiry (10-minute window)
 */

import type { EvalVerdict } from './EvalGate';

export const EVAL_CACHE_TTL_MS = 600_000; // 10 minutes
export const EVAL_CACHE_MAX_SIZE = 100;

interface CacheEntry {
    readonly verdict: EvalVerdict;
    readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function makeKey(sessionId: string, phaseName: string): string {
    return `${sessionId}:${phaseName}`;
}

/**
 * Return a cached verdict if it exists and hasn't expired.
 * Evicts the entry on TTL miss (lazy eviction).
 */
export function getCachedEvalVerdict(sessionId: string, phaseName: string): EvalVerdict | null {
    const key = makeKey(sessionId, phaseName);
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }

    return entry.verdict;
}

/**
 * Store a verdict in the cache.
 * When at capacity, the oldest entry (Map insertion order) is evicted first.
 */
export function cacheEvalVerdict(sessionId: string, phaseName: string, verdict: EvalVerdict): void {
    if (cache.size >= EVAL_CACHE_MAX_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
            cache.delete(oldestKey);
        }
    }
    cache.set(makeKey(sessionId, phaseName), {
        verdict,
        expiresAt: Date.now() + EVAL_CACHE_TTL_MS,
    });
}

/** Current number of live (not-yet-evicted) cache entries. */
export function getEvalCacheSize(): number {
    return cache.size;
}

/** Flush all entries. Primarily for test isolation. */
export function clearEvalCache(): void {
    cache.clear();
}
