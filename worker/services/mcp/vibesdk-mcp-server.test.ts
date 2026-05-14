/**
 * Unit tests for vibesdk MCP server — handleMcpRequest dispatch layer.
 *
 * Tests cover the JSON-RPC protocol handling (pure dispatch, no DB I/O).
 * Tool-level DB calls are mocked so tests run without Cloudflare bindings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMcpRequest } from './vibesdk-mcp-server';
import type { AuthUser } from '../../types/auth-types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../database/services/SessionMonitorService', () => ({
    SessionMonitorService: vi.fn().mockImplementation(() => ({
        getOwnerUserId: vi.fn().mockResolvedValue('user-1'),
        getPlanProgress: vi.fn().mockResolvedValue({
            pending: 0, running: 0, done: 3, failed: 0, skipped: 0, total: 3,
        }),
        getAgentBudget: vi.fn().mockResolvedValue({ promptTokens: 5000, completionTokens: 1500 }),
        getCurrentActivity: vi.fn().mockResolvedValue(null),
        getStartedAt: vi.fn().mockResolvedValue(Date.now() - 30000),
        getLastEventAt: vi.fn().mockResolvedValue(Date.now() - 5000),
    })),
}));

vi.mock('../../database/services/EvalResultsService', () => ({
    EvalResultsService: vi.fn().mockImplementation(() => ({
        getSessionOwnerUserId: vi.fn().mockResolvedValue('user-1'),
        getEvalResults: vi.fn().mockResolvedValue([
            {
                phaseName: 'auth',
                attempt: 1,
                passed: 1,
                faithfulness: 0.9,
                answerRelevancy: 0.85,
                toolCorrectness: 0.88,
                hallucinationRisk: 0.05,
                blockedReason: null,
                judgeInputTokens: 2000,
                judgeOutputTokens: 300,
            },
        ]),
    })),
}));

vi.mock('../../database', () => ({
    AppService: vi.fn().mockImplementation(() => ({
        getAppDetails: vi.fn().mockResolvedValue({
            id: 'session-abc',
            userId: 'user-1',
            title: 'My Test App',
            description: 'A test application',
            originalPrompt: 'Build me a todo app',
            framework: 'react',
            status: 'completed',
            visibility: 'private',
            createdAt: new Date('2026-05-14'),
        }),
    })),
}));

vi.mock('../../agents/operations/EvalGate', () => ({
    computeCompositeEvalScore: vi.fn().mockReturnValue(0.89),
}));

vi.mock('../../logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_ENV = {} as Env;

const FAKE_USER: AuthUser = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
};

function rpc(method: string, params?: unknown, id: number = 1) {
    return { jsonrpc: '2.0' as const, id, method, params };
}

// ── initialize ────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns server info with capabilities', async () => {
        const res = await handleMcpRequest(rpc('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0' },
        }), FAKE_ENV, FAKE_USER);

        expect(res).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'vibesdk', version: '1.0.0' },
            },
        });
    });
});

// ── tools/list ────────────────────────────────────────────────────────────────

describe('tools/list', () => {
    it('returns the 3 registered tools', async () => {
        const res = await handleMcpRequest(rpc('tools/list'), FAKE_ENV, FAKE_USER) as {
            result: { tools: Array<{ name: string }> };
        };

        expect('result' in res).toBe(true);
        const names = res.result.tools.map((t) => t.name);
        expect(names).toContain('vibesdk_get_status');
        expect(names).toContain('vibesdk_get_quality');
        expect(names).toContain('vibesdk_describe_app');
        expect(names).toHaveLength(3);
    });

    it('each tool has inputSchema with required sessionId', async () => {
        const res = await handleMcpRequest(rpc('tools/list'), FAKE_ENV, FAKE_USER) as {
            result: { tools: Array<{ name: string; inputSchema: { required: string[] } }> };
        };
        for (const tool of res.result.tools) {
            expect(tool.inputSchema.required).toContain('sessionId');
        }
    });
});

// ── tools/call — vibesdk_get_status ──────────────────────────────────────────

describe('tools/call vibesdk_get_status', () => {
    it('returns status JSON with progress and cost', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'vibesdk_get_status', arguments: { sessionId: 'session-abc' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { result: { content: Array<{ type: string; text: string }> } };

        expect('result' in res).toBe(true);
        const text = res.result.content[0].text;
        const data = JSON.parse(text);
        expect(data.sessionId).toBe('session-abc');
        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('progress');
        expect(data.progress).toHaveProperty('completed');
        expect(data.progress).toHaveProperty('total');
        expect(data).toHaveProperty('cost');
        expect(data.cost).toHaveProperty('tokensSpent');
    });

    it('reports done status when all phases complete', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'vibesdk_get_status', arguments: { sessionId: 'session-abc' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { result: { content: Array<{ type: string; text: string }> } };

        const data = JSON.parse(res.result.content[0].text);
        expect(data.status).toBe('done');
    });
});

// ── tools/call — vibesdk_get_quality ─────────────────────────────────────────

describe('tools/call vibesdk_get_quality', () => {
    it('returns quality report with phases and composite scores', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'vibesdk_get_quality', arguments: { sessionId: 'session-abc' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { result: { content: Array<{ type: string; text: string }> } };

        expect('result' in res).toBe(true);
        const data = JSON.parse(res.result.content[0].text);
        expect(data.hasResults).toBe(true);
        expect(data.phases).toHaveLength(1);
        expect(data.phases[0].phaseName).toBe('auth');
        expect(data.phases[0].passed).toBe(true);
        expect(typeof data.overallCompositeScore).toBe('number');
    });
});

// ── tools/call — vibesdk_describe_app ────────────────────────────────────────

describe('tools/call vibesdk_describe_app', () => {
    it('returns app metadata', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'vibesdk_describe_app', arguments: { sessionId: 'session-abc' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { result: { content: Array<{ type: string; text: string }> } };

        expect('result' in res).toBe(true);
        const data = JSON.parse(res.result.content[0].text);
        expect(data.id).toBe('session-abc');
        expect(data.title).toBe('My Test App');
        expect(data.framework).toBe('react');
        expect(data.status).toBe('completed');
    });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('error handling', () => {
    it('returns METHOD_NOT_FOUND for unknown method', async () => {
        const res = await handleMcpRequest(
            rpc('nonexistent/method'),
            FAKE_ENV,
            FAKE_USER,
        ) as { error: { code: number; message: string } };

        expect('error' in res).toBe(true);
        expect(res.error.code).toBe(-32601);
        expect(res.error.message).toContain('Method not found');
    });

    it('returns INVALID_REQUEST for malformed JSON-RPC envelope', async () => {
        const res = await handleMcpRequest(
            { notJsonRpc: true },
            FAKE_ENV,
            FAKE_USER,
        ) as { error: { code: number } };

        expect('error' in res).toBe(true);
        expect(res.error.code).toBe(-32600);
    });

    it('returns INVALID_PARAMS when tools/call missing name', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { arguments: { sessionId: 'x' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { error: { code: number } };

        expect('error' in res).toBe(true);
        expect(res.error.code).toBe(-32602);
    });

    it('returns INVALID_PARAMS when tool arguments fail Zod parse', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'vibesdk_get_status', arguments: { sessionId: '' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { error: { code: number } };

        expect('error' in res).toBe(true);
        expect(res.error.code).toBe(-32602);
    });

    it('returns INTERNAL_ERROR for unknown tool name', async () => {
        const res = await handleMcpRequest(
            rpc('tools/call', { name: 'nonexistent_tool', arguments: { sessionId: 'x' } }),
            FAKE_ENV,
            FAKE_USER,
        ) as { error: { code: number; message: string } };

        expect('error' in res).toBe(true);
        expect(res.error.code).toBe(-32603);
    });
});

// ── notifications/initialized (no-op) ────────────────────────────────────────

describe('notifications/initialized', () => {
    it('returns null id success response (no-op)', async () => {
        const res = await handleMcpRequest(
            { jsonrpc: '2.0' as const, id: null, method: 'notifications/initialized', params: {} },
            FAKE_ENV,
            FAKE_USER,
        );

        expect('result' in res).toBe(true);
        expect(res.id).toBeNull();
    });
});
