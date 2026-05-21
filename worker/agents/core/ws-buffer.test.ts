/**
 * Unit tests for ws-buffer.ts — server-turn persistence broadcast buffer.
 *
 * All helpers are pure functions (no I/O, no CF bindings) — run in any env.
 * ADR-008 S14 — DEC-043-D. ADR-011 Option B (SQLite layer).
 */

import { describe, it, expect } from 'vitest';
import {
    enqueueBroadcast,
    filterFreshBroadcasts,
    hasFreshBroadcasts,
    MAX_BROADCAST_BUFFER_SIZE,
    BROADCAST_BUFFER_TTL_MS,
    MAX_SQLITE_BROADCAST_BUFFER_SIZE,
    SQLITE_BROADCAST_TTL_MS,
    initWsBroadcastLog,
    persistBroadcast,
    replayPersistedBroadcasts,
    pruneExpiredBroadcasts,
    mergeBroadcasts,
    type PendingBroadcast,
} from './ws-buffer';
import type { SqlExecutor } from '../git/fs-adapter';

// ── Mock SQL executor ─────────────────────────────────────────────────────────

interface MockRow {
    id: number;
    msg_type: string;
    msg_data: string;
    enqueued_at: number;
}

/**
 * Minimal in-memory SQL executor mock for ws_broadcast_log tests.
 * Handles only the exact queries issued by ws-buffer.ts — no full SQL engine.
 */
function createMockSql(): { sql: SqlExecutor; rows: MockRow[] } {
    const rows: MockRow[] = [];
    let idCounter = 1;

    const sql = <T = unknown>(parts: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
        const firstPart = parts[0].trim();

        // CREATE TABLE / CREATE INDEX — no-op
        if (firstPart.startsWith('CREATE TABLE') || firstPart.startsWith('CREATE INDEX')) {
            return [] as T[];
        }

        // INSERT INTO ws_broadcast_log
        if (firstPart.startsWith('INSERT INTO ws_broadcast_log')) {
            const [type, data, enqueuedAt] = values as [string, string, number];
            rows.push({ id: idCounter++, msg_type: type, msg_data: data, enqueued_at: enqueuedAt });
            return [] as T[];
        }

        // FIFO eviction DELETE — has NOT IN clause
        if (firstPart.startsWith('DELETE FROM ws_broadcast_log') && parts.join('').includes('NOT IN')) {
            const limit = values[0] as number;
            const sorted = [...rows].sort((a, b) => b.enqueued_at - a.enqueued_at);
            const keepIds = new Set(sorted.slice(0, limit).map((r) => r.id));
            const toRemove = rows.filter((r) => !keepIds.has(r.id));
            for (const r of toRemove) {
                const idx = rows.indexOf(r);
                if (idx >= 0) rows.splice(idx, 1);
            }
            return [] as T[];
        }

        // SELECT (replay)
        if (firstPart.startsWith('SELECT')) {
            const cutoff = values[0] as number;
            return rows
                .filter((r) => r.enqueued_at >= cutoff)
                .sort((a, b) => a.enqueued_at - b.enqueued_at) as unknown as T[];
        }

        // DELETE ALL (prune)
        if (firstPart.startsWith('DELETE FROM ws_broadcast_log')) {
            rows.length = 0;
            return [] as T[];
        }

        return [] as T[];
    };

    return { sql: sql as unknown as SqlExecutor, rows };
}

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

// ── SQLite layer ───────────────────────────────────────────────────────────────

describe('initWsBroadcastLog', () => {
    it('does not throw on empty storage', () => {
        const { sql } = createMockSql();
        expect(() => initWsBroadcastLog(sql)).not.toThrow();
    });

    it('is idempotent (safe to call multiple times)', () => {
        const { sql } = createMockSql();
        expect(() => {
            initWsBroadcastLog(sql);
            initWsBroadcastLog(sql);
        }).not.toThrow();
    });
});

describe('persistBroadcast', () => {
    it('inserts one row per call', () => {
        const { sql, rows } = createMockSql();
        initWsBroadcastLog(sql);
        persistBroadcast(sql, 'phase_complete', {} as PendingBroadcast['data'], NOW);
        expect(rows).toHaveLength(1);
        expect(rows[0].msg_type).toBe('phase_complete');
        expect(rows[0].enqueued_at).toBe(NOW);
    });

    it('stores data as JSON', () => {
        const { sql, rows } = createMockSql();
        initWsBroadcastLog(sql);
        const data = { seq: 42 } as unknown as PendingBroadcast['data'];
        persistBroadcast(sql, 'state_delta', data, NOW);
        expect(JSON.parse(rows[0].msg_data)).toEqual({ seq: 42 });
    });

    it('evicts oldest rows when exceeding MAX_SQLITE_BROADCAST_BUFFER_SIZE', () => {
        const { sql, rows } = createMockSql();
        initWsBroadcastLog(sql);
        for (let i = 0; i < MAX_SQLITE_BROADCAST_BUFFER_SIZE + 5; i++) {
            persistBroadcast(sql, 'state_delta', {} as PendingBroadcast['data'], NOW + i);
        }
        expect(rows).toHaveLength(MAX_SQLITE_BROADCAST_BUFFER_SIZE);
        // Oldest (NOW+0 through NOW+4) should be evicted; newest should survive
        const minEnqueuedAt = Math.min(...rows.map((r) => r.enqueued_at));
        expect(minEnqueuedAt).toBe(NOW + 5);
    });
});

describe('replayPersistedBroadcasts', () => {
    it('returns empty array when table is empty', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        expect(replayPersistedBroadcasts(sql, NOW)).toHaveLength(0);
    });

    it('returns rows within SQLite TTL window', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        persistBroadcast(sql, 'phase_complete', {} as PendingBroadcast['data'], NOW - 1_000);
        const result = replayPersistedBroadcasts(sql, NOW);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('phase_complete');
    });

    it('excludes rows older than SQLITE_BROADCAST_TTL_MS', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        persistBroadcast(sql, 'state_delta', {} as PendingBroadcast['data'], NOW - SQLITE_BROADCAST_TTL_MS - 1);
        expect(replayPersistedBroadcasts(sql, NOW)).toHaveLength(0);
    });

    it('returns rows in chronological order (oldest first)', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        persistBroadcast(sql, 'error', {} as PendingBroadcast['data'], NOW + 100);
        persistBroadcast(sql, 'phase_complete', {} as PendingBroadcast['data'], NOW);
        persistBroadcast(sql, 'state_delta', {} as PendingBroadcast['data'], NOW + 50);
        const result = replayPersistedBroadcasts(sql, NOW + 200);
        expect(result[0].type).toBe('phase_complete');
        expect(result[1].type).toBe('state_delta');
        expect(result[2].type).toBe('error');
    });

    it('deserialises msg_data back to original object', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        const data = { foo: 'bar' } as unknown as PendingBroadcast['data'];
        persistBroadcast(sql, 'state_delta', data, NOW);
        const result = replayPersistedBroadcasts(sql, NOW);
        expect(result[0].data).toEqual({ foo: 'bar' });
    });
});

describe('pruneExpiredBroadcasts', () => {
    it('removes all rows', () => {
        const { sql, rows } = createMockSql();
        initWsBroadcastLog(sql);
        persistBroadcast(sql, 'phase_complete', {} as PendingBroadcast['data'], NOW);
        persistBroadcast(sql, 'error', {} as PendingBroadcast['data'], NOW + 1);
        expect(rows).toHaveLength(2);
        pruneExpiredBroadcasts(sql);
        expect(rows).toHaveLength(0);
    });

    it('is safe on empty table', () => {
        const { sql } = createMockSql();
        initWsBroadcastLog(sql);
        expect(() => pruneExpiredBroadcasts(sql)).not.toThrow();
    });
});

// ── mergeBroadcasts ───────────────────────────────────────────────────────────

describe('mergeBroadcasts', () => {
    it('returns empty array when both sources empty', () => {
        expect(mergeBroadcasts([], [], NOW)).toHaveLength(0);
    });

    it('deduplicates identical entries that appear in both sources (same DO lifetime)', () => {
        const entry: PendingBroadcast = {
            type: 'phase_complete',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: NOW,
        };
        // Same type + payload + timestamp → composite key matches → deduplicated
        const merged = mergeBroadcasts([entry], [entry], NOW);
        expect(merged).toHaveLength(1);
    });

    it('P1: preserves distinct broadcasts at the same millisecond (different type)', () => {
        // GENERATION_STARTED and RUN_STARTED can be emitted back-to-back within the
        // same synchronous call site, landing on the same ms timestamp.
        // Timestamp-only dedup would drop one — composite key must keep both.
        const ts = NOW;
        const gen: PendingBroadcast = {
            type: 'generation_started' as PendingBroadcast['type'],
            data: {} as PendingBroadcast['data'],
            enqueuedAt: ts,
        };
        const run: PendingBroadcast = {
            type: 'run_started' as PendingBroadcast['type'],
            data: {} as PendingBroadcast['data'],
            enqueuedAt: ts,
        };
        // gen in SQLite, run in memory — same ms, different types
        const merged = mergeBroadcasts([run], [gen], NOW + 1_000);
        expect(merged).toHaveLength(2);
    });

    it('P1: preserves distinct broadcasts at the same millisecond (same type, different payload)', () => {
        const ts = NOW;
        const a: PendingBroadcast = {
            type: 'state_delta',
            data: { seq: 1 } as unknown as PendingBroadcast['data'],
            enqueuedAt: ts,
        };
        const b: PendingBroadcast = {
            type: 'state_delta',
            data: { seq: 2 } as unknown as PendingBroadcast['data'],
            enqueuedAt: ts,
        };
        const merged = mergeBroadcasts([a], [b], NOW + 1_000);
        expect(merged).toHaveLength(2);
    });

    it('P2: applies in-memory TTL (5 min) separate from SQLite TTL (30 min)', () => {
        // An entry 6 minutes old: stale for in-memory (>5 min), fresh for SQLite (<30 min)
        const sixMinAgo = NOW - 6 * 60_000;
        const inMemStale: PendingBroadcast = {
            type: 'state_delta',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: sixMinAgo,
        };
        const sqlFresh: PendingBroadcast = {
            type: 'phase_complete',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: sixMinAgo,
        };
        // inMemStale dropped by 5-min in-memory TTL; sqlFresh kept by 30-min SQLite TTL
        const merged = mergeBroadcasts([inMemStale], [sqlFresh], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].type).toBe('phase_complete');
    });

    it('preserves entries unique to each source', () => {
        const fromMemory: PendingBroadcast = {
            type: 'state_delta',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: NOW + 10,
        };
        const fromSqlite: PendingBroadcast = {
            type: 'phase_complete',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: NOW,
        };
        const merged = mergeBroadcasts([fromMemory], [fromSqlite], NOW + 20);
        expect(merged).toHaveLength(2);
    });

    it('sorts merged result by enqueuedAt ascending', () => {
        const mem: PendingBroadcast = { type: 'error', data: {} as PendingBroadcast['data'], enqueuedAt: NOW + 50 };
        const sql: PendingBroadcast = { type: 'phase_complete', data: {} as PendingBroadcast['data'], enqueuedAt: NOW };
        const merged = mergeBroadcasts([mem], [sql], NOW + 100);
        expect(merged[0].type).toBe('phase_complete');
        expect(merged[1].type).toBe('error');
    });

    it('drops entries older than SQLITE_BROADCAST_TTL_MS', () => {
        const stale: PendingBroadcast = {
            type: 'state_delta',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: NOW - SQLITE_BROADCAST_TTL_MS - 1,
        };
        const fresh: PendingBroadcast = {
            type: 'phase_complete',
            data: {} as PendingBroadcast['data'],
            enqueuedAt: NOW,
        };
        const merged = mergeBroadcasts([fresh], [stale], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].type).toBe('phase_complete');
    });

    it('cross-restart scenario: memory empty, SQLite has messages', () => {
        const sqlEntry: PendingBroadcast = {
            type: 'phase_complete',
            data: { files: ['index.ts'] } as unknown as PendingBroadcast['data'],
            enqueuedAt: NOW - 30_000,
        };
        const merged = mergeBroadcasts([], [sqlEntry], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].type).toBe('phase_complete');
    });
});
