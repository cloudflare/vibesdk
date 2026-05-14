/**
 * Unit tests for D1ProvisionService.
 *
 * All CF REST API calls are mocked via vi.stubGlobal('fetch', ...).
 * Tests cover: createSessionDatabase (success + error paths),
 * deleteSessionDatabase (success + error), and generateSetupDoc content.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { D1ProvisionService } from './D1ProvisionService';

const mockEnv = {
    CLOUDFLARE_API_TOKEN: 'test_cf_token',
    CLOUDFLARE_ACCOUNT_ID: 'acc_test_123',
};

describe('D1ProvisionService', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const service = new D1ProvisionService(mockEnv);

    // ── createSessionDatabase ─────────────────────────────────────────────────

    describe('createSessionDatabase', () => {
        it('calls the correct CF API endpoint with POST', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    result: {
                        uuid: 'db-uuid-001',
                        name: 'vibesdk-session123-1716000000',
                        created_at: '2026-05-15T12:00:00Z',
                    },
                }),
            });

            await service.createSessionDatabase('session123');

            const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/accounts/acc_test_123/d1/database');
            expect(init.method).toBe('POST');
        });

        it('includes Bearer token in Authorization header', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, result: { uuid: 'x', name: 'y', created_at: 'z' } }),
            });

            await service.createSessionDatabase('sess');

            const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer test_cf_token');
        });

        it('returns database details on success', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    result: {
                        uuid: 'db-uuid-001',
                        name: 'vibesdk-sess-001-9999',
                        created_at: '2026-05-15T12:00:00Z',
                    },
                }),
            });

            const result = await service.createSessionDatabase('sess-001');
            expect(result.success).toBe(true);
            expect(result.database?.uuid).toBe('db-uuid-001');
            expect(result.database?.name).toBe('vibesdk-sess-001-9999');
        });

        it('database name is sanitized to alphanumeric + hyphens', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    result: { uuid: 'x', name: 'y', created_at: 'z' },
                }),
            });

            await service.createSessionDatabase('sess:with/special!chars');

            const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            const body = JSON.parse(init.body as string) as { name: string };
            expect(body.name).toMatch(/^[a-zA-Z0-9-]+$/);
        });

        it('database name is capped at 64 characters', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    result: { uuid: 'x', name: 'y', created_at: 'z' },
                }),
            });

            const longId = 'a'.repeat(100);
            await service.createSessionDatabase(longId);

            const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            const body = JSON.parse(init.body as string) as { name: string };
            expect(body.name.length).toBeLessThanOrEqual(64);
        });

        it('returns success:false with error on non-2xx response', async () => {
            fetchSpy.mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({
                    success: false,
                    errors: [{ code: 10000, message: 'Authentication error' }],
                }),
            });

            const result = await service.createSessionDatabase('sess');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Authentication error');
        });

        it('returns success:false on network failure', async () => {
            fetchSpy.mockRejectedValue(new Error('Network timeout'));

            const result = await service.createSessionDatabase('sess');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network timeout');
        });
    });

    // ── deleteSessionDatabase ─────────────────────────────────────────────────

    describe('deleteSessionDatabase', () => {
        it('calls DELETE on the correct endpoint', async () => {
            fetchSpy.mockResolvedValue({ ok: true, text: async () => '{"success":true}' });

            await service.deleteSessionDatabase('db-uuid-to-delete');

            const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/d1/database/db-uuid-to-delete');
            expect(init.method).toBe('DELETE');
        });

        it('returns success:true on 200', async () => {
            fetchSpy.mockResolvedValue({ ok: true, text: async () => '' });

            const result = await service.deleteSessionDatabase('uuid-123');
            expect(result.success).toBe(true);
        });

        it('returns success:false with error on non-2xx', async () => {
            fetchSpy.mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => 'not found',
            });

            const result = await service.deleteSessionDatabase('bad-uuid');
            expect(result.success).toBe(false);
            expect(result.error).toContain('404');
        });
    });

    // ── generateSetupDoc ──────────────────────────────────────────────────────

    describe('generateSetupDoc', () => {
        it('includes the database name in wrangler commands', () => {
            const doc = service.generateSetupDoc('my-cool-app');
            expect(doc).toContain('my-cool-app');
            expect(doc).toContain('wrangler d1 create');
        });

        it('uses the provided binding name', () => {
            const doc = service.generateSetupDoc('app', 'MY_DB');
            expect(doc).toContain('MY_DB');
        });

        it('defaults binding name to "DB"', () => {
            const doc = service.generateSetupDoc('app');
            expect(doc).toContain('"DB"');
        });

        it('includes migration SQL section when provided', () => {
            const sql = 'CREATE TABLE users (id TEXT PRIMARY KEY);';
            const doc = service.generateSetupDoc('app', 'DB', sql);
            expect(doc).toContain(sql);
            expect(doc).toContain('migrations/0001_initial.sql');
        });

        it('sanitizes database name in wrangler commands', () => {
            const doc = service.generateSetupDoc('My Cool App!');
            expect(doc).toMatch(/wrangler d1 create [a-z0-9-]+/);
        });

        it('contains wrangler deploy instruction', () => {
            const doc = service.generateSetupDoc('app');
            expect(doc).toContain('wrangler deploy');
        });

        it('is a non-empty markdown string with a heading', () => {
            const doc = service.generateSetupDoc('test-app');
            expect(doc.trim()).toMatch(/^# D1 Database Setup Guide/);
        });
    });
});
