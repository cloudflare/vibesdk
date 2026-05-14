/**
 * Unit tests for NullMemoryClient.
 *
 * NullMemoryClient must satisfy the MemoryClient contract with zero-value
 * returns on every call and must never throw.  These properties are the
 * foundation of the "memory outage cannot crash generation" guarantee.
 *
 * Note: requires @cloudflare/vitest-pool-workers workerd binary (CI only on Windows).
 */

import { describe, it, expect } from 'vitest';
import { NullMemoryClient } from './NullMemoryClient';
import type { MemoryBlockInput, MemoryRecallQuery } from './types';

function makeQuery(overrides: Partial<MemoryRecallQuery> = {}): MemoryRecallQuery {
    return { userId: 'u1', query: 'test query', k: 5, ...overrides };
}

function makeBlock(overrides: Partial<MemoryBlockInput> = {}): MemoryBlockInput {
    return {
        userId: 'u1',
        tag: 'phase:TestPhase',
        content: 'eval score=0.85, passed=true',
        ...overrides,
    };
}

describe('NullMemoryClient', () => {
    it('recall() always returns an empty array', async () => {
        const client = new NullMemoryClient();
        const result = await client.recall(makeQuery());
        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
    });

    it('recall() returns empty array regardless of query params', async () => {
        const client = new NullMemoryClient();
        const withTag = await client.recall(makeQuery({ tag: 'phase:Init' }));
        const withHighK = await client.recall(makeQuery({ k: 100 }));
        expect(withTag).toEqual([]);
        expect(withHighK).toEqual([]);
    });

    it('remember() always returns null', async () => {
        const client = new NullMemoryClient();
        const result = await client.remember(makeBlock());
        expect(result).toBeNull();
    });

    it('remember() returns null even with full metadata', async () => {
        const client = new NullMemoryClient();
        const result = await client.remember(
            makeBlock({ metadata: { evalScore: 0.9, evalPassed: true, sessionId: 'sess-1' } }),
        );
        expect(result).toBeNull();
    });

    it('forget() always returns false', async () => {
        const client = new NullMemoryClient();
        const result = await client.forget('u1', 'block-id-123');
        expect(result).toBe(false);
    });

    it('does not throw on any method call', async () => {
        // .resolves.not.toThrow() is invalid (toThrow is synchronous-only).
        // Correct pattern: await each promise and assert the resolved value —
        // if the promise rejected, the await would throw and the test would fail.
        const client = new NullMemoryClient();
        const recalled = await client.recall(makeQuery());
        const remembered = await client.remember(makeBlock());
        const forgotten = await client.forget('u1', 'any-id');
        expect(Array.isArray(recalled)).toBe(true);
        expect(remembered).toBeNull();
        expect(forgotten).toBe(false);
    });

    it('implements MemoryClient interface (structural check)', () => {
        const client = new NullMemoryClient();
        expect(typeof client.recall).toBe('function');
        expect(typeof client.remember).toBe('function');
        expect(typeof client.forget).toBe('function');
    });
});
