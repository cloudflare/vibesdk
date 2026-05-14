/**
 * Unit tests for ws-buffer.ts — server-turn persistence broadcast buffer.
 *
 * All helpers are pure functions (no I/O, no CF bindings) — run in any env.
 * ADR-008 S14 — DEC-043-D.
 */

import { describe, it, expect } from 'vitest';
import {
    enqueueBroadcast,
    filterFreshBroadcasts,
    hasFreshBroadcasts,
    MAX_BROADCAST_BUFFER_SIZE,
    BROADCAST_BUFFER_TTL_MS,
    type PendingBroadcast,
} from './ws-buffer';

// ── Helpers ────────────────────────────────────────────────────────────────

const NOW = 1_000_000;

function makeEntry(type = 'phase_complete', offsetMs = 0): PendingBroadcast {
    return {
        type: type as PendingBroadcast['type'],
        data: { message: `msg-${type}` } as PendingBroadcast['data'],
        enqueuedAt: NOW + offsetMs,
    };
}

// ── enqueueBroadcast ───────────────────────────────────────────────────────

describe('enqueueBroadcast', () => {
    it('appends to empty buffer', () => {
        const buf = enqueueBroadcast([], 'phase_complete', {} as PendingBroadcast['data'], NOW);
        expect(buf).toHaveLength(1);
        expect(buf[0].type).toBe('phase_complete');
        expect(buf[0].enqueuedAt).toBe(NOW);
    });

    it('appends without mutating original buffer', () => {
        const original: PendingBroadcast[] = [makeEntry()];
        const next = enqueueBroadcast(original, 'error', {} as PendingBroadcast['data'], NOW + 1);
        expect(original).toHaveLength(1);
        expect(next).toHaveLength(2);
    });

    it('does not evict when below limit', () => {
        let buf: PendingBroadcast[] = [];
        for (let i = 0; i < MAX_BROADCAST_BUFFER_SIZE; i++) {
            buf = enqueueBroadcast(buf, 'state_delta', {} as PendingBroadcast['data'], NOW + i);
        }
        expect(buf).toHaveLength(MAX_BROADCAST_BUFFER_SIZE);
    });

    it('evicts oldest entries when exceeding MAX_BROADCAST_BUFFER_SIZE', () => {
        let buf: PendingBroadcast[] = [];
        // Fill to limit
        for (let i = 0; i < MAX_BROADCAST_BUFFER_SIZE; i++) {
            buf = enqueueBroadcast(buf, 'state_delta', { seq: i } as unknown as PendingBroadcast['data'], NOW + i);
        }
        // One more — should evict oldest
        buf = enqueueBroadcast(buf, 'phase_complete', {} as PendingBroadcast['data'], NOW + MAX_BROADCAST_BUFFER_SIZE);
        expect(buf).toHaveLength(MAX_BROADCAST_BUFFER_SIZE);
        // The first entry (seq: 0) should be gone; last entry should be phase_complete
        expect(buf[buf.length - 1].type).toBe('phase_complete');
        const firstData = buf[0].data as { seq?: number };
        expect(firstData.seq).toBe(1);
    });

    it('records the provided timestamp', () => {
        const ts = 999_888;
        const buf = enqueueBroadcast([], 'error', {} as PendingBroadcast['data'], ts);
        expect(buf[0].enqueuedAt).toBe(ts);
    });
});

// ── filterFreshBroadcasts ──────────────────────────────────────────────────

describe('filterFreshBroadcasts', () => {
    it('returns empty array for empty buffer', () => {
        expect(filterFreshBroadcasts([], NOW)).toHaveLength(0);
    });

    it('keeps entries within TTL window', () => {
        const fresh = makeEntry('state_delta', 0);
        const result = filterFreshBroadcasts([fresh], NOW);
        expect(result).toHaveLength(1);
    });

    it('drops entries older than TTL', () => {
        const stale = makeEntry('state_delta', -BROADCAST_BUFFER_TTL_MS - 1);
        const result = filterFreshBroadcasts([stale], NOW);
        expect(result).toHaveLength(0);
    });

    it('keeps entry exactly at TTL boundary', () => {
        const boundary = makeEntry('state_delta', -BROADCAST_BUFFER_TTL_MS);
        const result = filterFreshBroadcasts([boundary], NOW);
        expect(result).toHaveLength(1);
    });

    it('filters mixed stale and fresh entries', () => {
        const stale = makeEntry('error', -BROADCAST_BUFFER_TTL_MS - 1);
        const fresh1 = makeEntry('phase_complete', -60_000);
        const fresh2 = makeEntry('state_delta', 0);
        const result = filterFreshBroadcasts([stale, fresh1, fresh2], NOW);
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('phase_complete');
        expect(result[1].type).toBe('state_delta');
    });

    it('does not mutate the input buffer', () => {
        const stale = makeEntry('error', -BROADCAST_BUFFER_TTL_MS - 1);
        const input = [stale];
        filterFreshBroadcasts(input, NOW);
        expect(input).toHaveLength(1);
    });
});

// ── hasFreshBroadcasts ────────────────────────────────────────────────────

describe('hasFreshBroadcasts', () => {
    it('returns false for empty buffer', () => {
        expect(hasFreshBroadcasts([], NOW)).toBe(false);
    });

    it('returns false when all entries are stale', () => {
        const stale = makeEntry('error', -BROADCAST_BUFFER_TTL_MS - 1);
        expect(hasFreshBroadcasts([stale], NOW)).toBe(false);
    });

    it('returns true when at least one entry is fresh', () => {
        const stale = makeEntry('error', -BROADCAST_BUFFER_TTL_MS - 1);
        const fresh = makeEntry('phase_complete', 0);
        expect(hasFreshBroadcasts([stale, fresh], NOW)).toBe(true);
    });

    it('returns true for single fresh entry', () => {
        const fresh = makeEntry('state_delta', -1_000);
        expect(hasFreshBroadcasts([fresh], NOW)).toBe(true);
    });
});

// ── Integration: enqueue → filter → flush simulation ──────────────────────

describe('full buffer lifecycle', () => {
    it('round-trip: enqueue multiple, filter fresh, flush order preserved', () => {
        let buf: PendingBroadcast[] = [];

        // Enqueue 3 messages at different times
        buf = enqueueBroadcast(buf, 'state_delta', { a: 1 } as unknown as PendingBroadcast['data'], NOW - 60_000);
        buf = enqueueBroadcast(buf, 'phase_complete', { b: 2 } as unknown as PendingBroadcast['data'], NOW - 30_000);
        buf = enqueueBroadcast(buf, 'error', { c: 3 } as unknown as PendingBroadcast['data'], NOW);

        // All within TTL
        const fresh = filterFreshBroadcasts(buf, NOW);
        expect(fresh).toHaveLength(3);
        // Order preserved (oldest first)
        expect(fresh[0].type).toBe('state_delta');
        expect(fresh[1].type).toBe('phase_complete');
        expect(fresh[2].type).toBe('error');
    });

    it('round-trip: stale entry at head is dropped, rest delivered in order', () => {
        let buf: PendingBroadcast[] = [];
        buf = enqueueBroadcast(buf, 'state_delta', {} as PendingBroadcast['data'], NOW - BROADCAST_BUFFER_TTL_MS - 1);
        buf = enqueueBroadcast(buf, 'phase_complete', {} as PendingBroadcast['data'], NOW - 10_000);
        buf = enqueueBroadcast(buf, 'error', {} as PendingBroadcast['data'], NOW);

        const fresh = filterFreshBroadcasts(buf, NOW);
        expect(fresh).toHaveLength(2);
        expect(fresh[0].type).toBe('phase_complete');
    });
});
