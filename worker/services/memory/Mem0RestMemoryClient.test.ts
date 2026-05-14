/**
 * Mem0RestMemoryClient — unit tests (pure fetch mocking, no CF bindings).
 *
 * Tests cover:
 *  - Constructor: rejects empty API key
 *  - recall: happy path maps search results, tag filter, non-2xx → [], network error → []
 *  - remember: happy path returns MemoryBlock, non-2xx → null, network error → null
 *  - forget: happy path returns true, non-2xx → false, network error → false
 *  - Correct Authorization header format ("Token <key>")
 *  - dateToUnixSecs parsing (via createdAt forwarding)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Mem0RestMemoryClient } from './Mem0RestMemoryClient';

// Minimal mock for fetch — overridden per test.
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test-mem0-api-key';

function makeOkResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeErrorResponse(status: number): Response {
    return new Response('error', { status });
}

describe('Mem0RestMemoryClient', () => {
    let client: Mem0RestMemoryClient;

    beforeEach(() => {
        mockFetch.mockReset();
        client = new Mem0RestMemoryClient(API_KEY);
    });

    // ── constructor ─────────────────────────────────────────────────────────

    it('throws on empty API key', () => {
        expect(() => new Mem0RestMemoryClient('')).toThrow('non-empty API key');
    });

    // ── recall ───────────────────────────────────────────────────────────────

    it('recall: maps Mem0 search results to MemoryBlocks', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse([
            { id: 'id-1', memory: 'content A', user_id: 'u1', metadata: { tag: 'phase:plan' }, created_at: '2026-05-14T10:00:00Z' },
            { id: 'id-2', memory: 'content B', user_id: 'u1', metadata: { tag: 'phase:impl' } },
        ]));

        const results = await client.recall({ userId: 'u1', query: 'plan files', k: 5 });

        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({ id: 'id-1', tag: 'phase:plan', content: 'content A', userId: 'u1' });
        expect(results[0].createdAt).toBe(Math.floor(Date.parse('2026-05-14T10:00:00Z') / 1000));
        expect(results[1]).toMatchObject({ id: 'id-2', tag: 'phase:impl', content: 'content B' });
        expect(results[1].createdAt).toBeUndefined();
    });

    it('recall: filters by tag client-side', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse([
            { id: 'id-1', memory: 'A', user_id: 'u1', metadata: { tag: 'phase:plan' } },
            { id: 'id-2', memory: 'B', user_id: 'u1', metadata: { tag: 'phase:eval' } },
        ]));

        const results = await client.recall({ userId: 'u1', query: 'x', tag: 'phase:plan' });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('id-1');
    });

    it('recall: returns [] on non-2xx', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
        const results = await client.recall({ userId: 'u1', query: 'x' });
        expect(results).toEqual([]);
    });

    it('recall: returns [] on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('network failure'));
        const results = await client.recall({ userId: 'u1', query: 'x' });
        expect(results).toEqual([]);
    });

    it('recall: sends correct Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse([]));
        await client.recall({ userId: 'u1', query: 'x' });

        const [, init] = mockFetch.mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Token ${API_KEY}`);
    });

    // ── remember ─────────────────────────────────────────────────────────────

    it('remember: returns MemoryBlock on success (results array shape)', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse({
            results: [{ id: 'new-id', memory: 'content', user_id: 'u1', created_at: '2026-05-14T12:00:00Z' }],
        }));

        const result = await client.remember({
            userId: 'u1',
            tag: 'phase:plan',
            content: 'implement login form',
        });

        expect(result).not.toBeNull();
        expect(result?.id).toBe('new-id');
        expect(result?.tag).toBe('phase:plan');
        expect(result?.content).toBe('implement login form');
        expect(result?.createdAt).toBe(Math.floor(Date.parse('2026-05-14T12:00:00Z') / 1000));
    });

    it('remember: returns MemoryBlock on success (direct object shape)', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse({ id: 'direct-id', memory: 'x', user_id: 'u1' }));
        const result = await client.remember({ userId: 'u1', tag: 'phase:eval', content: 'score 0.87' });
        expect(result?.id).toBe('direct-id');
    });

    it('remember: returns null on non-2xx', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));
        const result = await client.remember({ userId: 'u1', tag: 't', content: 'c' });
        expect(result).toBeNull();
    });

    it('remember: returns null on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('timeout'));
        const result = await client.remember({ userId: 'u1', tag: 't', content: 'c' });
        expect(result).toBeNull();
    });

    it('remember: encodes tag into metadata', async () => {
        mockFetch.mockResolvedValueOnce(makeOkResponse({ id: 'x', memory: 'y', user_id: 'u1' }));
        await client.remember({ userId: 'u1', tag: 'phase:plan', content: 'c' });

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.metadata.tag).toBe('phase:plan');
    });

    // ── forget ────────────────────────────────────────────────────────────────

    it('forget: returns true on 200', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
        expect(await client.forget('u1', 'block-id')).toBe(true);
    });

    it('forget: returns false on non-2xx', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(404));
        expect(await client.forget('u1', 'block-id')).toBe(false);
    });

    it('forget: returns false on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('DNS failure'));
        expect(await client.forget('u1', 'block-id')).toBe(false);
    });

    it('forget: calls DELETE /v1/memories/{blockId}/', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
        await client.forget('u1', 'target-block');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/memories/target-block/');
        expect(init?.method).toBe('DELETE');
    });
});
