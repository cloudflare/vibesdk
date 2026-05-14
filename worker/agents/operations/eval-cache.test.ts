/**
 * Unit tests for eval-cache.ts — in-process ResponseCache analog.
 *
 * All exports are pure (no I/O, no CF bindings) — run in any Vitest env.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getCachedEvalVerdict,
    cacheEvalVerdict,
    getEvalCacheSize,
    clearEvalCache,
    EVAL_CACHE_TTL_MS,
    EVAL_CACHE_MAX_SIZE,
} from './eval-cache';
import type { EvalVerdict } from './EvalGate';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeVerdict(passed: boolean, faithfulness = 0.9): EvalVerdict {
    return {
        scores: {
            faithfulness,
            answerRelevancy: 0.85,
            toolCorrectness: 0.9,
            hallucinationRisk: 0.05,
        },
        passed,
        blockedReason: passed ? null : 'faithfulness below floor',
        comments: 'test verdict',
        judgeTokens: { input: 100, output: 50 },
    };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    clearEvalCache();
    vi.restoreAllMocks();
});

// ── getCachedEvalVerdict — miss ────────────────────────────────────────────

describe('getCachedEvalVerdict', () => {
    it('returns null on cold cache', () => {
        expect(getCachedEvalVerdict('session-1', 'Phase 1')).toBeNull();
    });

    it('returns null for unknown sessionId after populating another', () => {
        cacheEvalVerdict('session-a', 'Phase 1', makeVerdict(true));
        expect(getCachedEvalVerdict('session-b', 'Phase 1')).toBeNull();
    });

    it('returns null for unknown phaseName in a known session', () => {
        cacheEvalVerdict('session-1', 'Phase 1', makeVerdict(true));
        expect(getCachedEvalVerdict('session-1', 'Phase 2')).toBeNull();
    });
});

// ── cacheEvalVerdict + getCachedEvalVerdict — hit ─────────────────────────

describe('cacheEvalVerdict → getCachedEvalVerdict round-trip', () => {
    it('returns stored verdict on cache hit', () => {
        const v = makeVerdict(true);
        cacheEvalVerdict('s1', 'setup', v);
        const hit = getCachedEvalVerdict('s1', 'setup');
        expect(hit).not.toBeNull();
        expect(hit?.passed).toBe(true);
        expect(hit?.scores.faithfulness).toBe(0.9);
    });

    it('stores verdict fields exactly (no mutation)', () => {
        const v = makeVerdict(false, 0.4);
        cacheEvalVerdict('s2', 'auth', v);
        const hit = getCachedEvalVerdict('s2', 'auth');
        expect(hit?.passed).toBe(false);
        expect(hit?.blockedReason).toBe('faithfulness below floor');
        expect(hit?.judgeTokens).toEqual({ input: 100, output: 50 });
    });

    it('cache size increments on each new entry', () => {
        expect(getEvalCacheSize()).toBe(0);
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));
        expect(getEvalCacheSize()).toBe(1);
        cacheEvalVerdict('s1', 'Phase 2', makeVerdict(true));
        expect(getEvalCacheSize()).toBe(2);
    });

    it('overwriting same key does not grow cache size', () => {
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(false));
        expect(getEvalCacheSize()).toBe(1);
        // Newest verdict is stored
        expect(getCachedEvalVerdict('s1', 'Phase 1')?.passed).toBe(false);
    });
});

// ── TTL eviction ──────────────────────────────────────────────────────────

describe('TTL eviction', () => {
    it('returns null after TTL expires', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1_000_000);

        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));
        expect(getCachedEvalVerdict('s1', 'Phase 1')).not.toBeNull();

        // Advance past TTL
        nowSpy.mockReturnValue(1_000_000 + EVAL_CACHE_TTL_MS + 1);
        expect(getCachedEvalVerdict('s1', 'Phase 1')).toBeNull();
    });

    it('evicts expired entry from cache on TTL miss', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1_000_000);
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));
        expect(getEvalCacheSize()).toBe(1);

        nowSpy.mockReturnValue(1_000_000 + EVAL_CACHE_TTL_MS + 1);
        getCachedEvalVerdict('s1', 'Phase 1'); // triggers lazy eviction
        expect(getEvalCacheSize()).toBe(0);
    });

    it('returns hit before TTL window closes', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1_000_000);
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));

        // 1 ms before expiry
        nowSpy.mockReturnValue(1_000_000 + EVAL_CACHE_TTL_MS - 1);
        expect(getCachedEvalVerdict('s1', 'Phase 1')).not.toBeNull();
    });
});

// ── Max-size eviction ─────────────────────────────────────────────────────

describe('max-size eviction', () => {
    it('evicts oldest entry when capacity is reached', () => {
        // Fill to capacity
        for (let i = 0; i < EVAL_CACHE_MAX_SIZE; i++) {
            cacheEvalVerdict(`session-${i}`, 'Phase 1', makeVerdict(true));
        }
        expect(getEvalCacheSize()).toBe(EVAL_CACHE_MAX_SIZE);

        // The oldest entry (session-0) should still be present before overflow
        expect(getCachedEvalVerdict('session-0', 'Phase 1')).not.toBeNull();

        // Adding one more evicts session-0 (insertion order)
        cacheEvalVerdict('session-overflow', 'Phase 1', makeVerdict(true));
        expect(getEvalCacheSize()).toBe(EVAL_CACHE_MAX_SIZE);
        expect(getCachedEvalVerdict('session-0', 'Phase 1')).toBeNull();
        expect(getCachedEvalVerdict('session-overflow', 'Phase 1')).not.toBeNull();
    });
});

// ── clearEvalCache ────────────────────────────────────────────────────────

describe('clearEvalCache', () => {
    it('removes all entries', () => {
        cacheEvalVerdict('s1', 'Phase 1', makeVerdict(true));
        cacheEvalVerdict('s2', 'Phase 2', makeVerdict(false));
        clearEvalCache();
        expect(getEvalCacheSize()).toBe(0);
        expect(getCachedEvalVerdict('s1', 'Phase 1')).toBeNull();
    });
});
