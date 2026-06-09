import { describe, expect, it } from 'bun:test';
import { HttpClient } from '../src/http';
import type { VibeClientOptions } from '../src/types';

import { createFetchMock } from './fakes';

describe('HttpClient', () => {
	it('retries on 5xx errors and succeeds', async () => {
		let attempts = 0;
		const { fetchFn } = createFetchMock(async () => {
			attempts += 1;
			if (attempts < 3) {
				return new Response('Internal Server Error', { status: 500 });
			}
			return new Response(JSON.stringify({ result: 'ok' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			fetchFn,
			retry: { initialDelayMs: 1, maxDelayMs: 10 },
		};
		const http = new HttpClient(opts);
		const result = await http.fetchJson<{ result: string }>('/test');

		expect(result).toEqual({ result: 'ok' });
		expect(attempts).toBe(3);
	});

	it('throws after max retries on persistent 5xx errors', async () => {
		let attempts = 0;
		const { fetchFn } = createFetchMock(async () => {
			attempts += 1;
			return new Response('Service Unavailable', { status: 503 });
		});

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			fetchFn,
			retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10 },
		};
		const http = new HttpClient(opts);

		await expect(http.fetchJson('/test')).rejects.toThrow(/HTTP 503/);
		expect(attempts).toBe(3);
	});

	it('does not retry on 4xx errors', async () => {
		let attempts = 0;
		const { fetchFn } = createFetchMock(async () => {
			attempts += 1;
			return new Response('Not Found', { status: 404 });
		});

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			fetchFn,
			retry: { maxRetries: 3, initialDelayMs: 1 },
		};
		const http = new HttpClient(opts);

		await expect(http.fetchJson('/test')).rejects.toThrow(/HTTP 404/);
		expect(attempts).toBe(1);
	});

	it('respects retry.enabled = false', async () => {
		let attempts = 0;
		const { fetchFn } = createFetchMock(async () => {
			attempts += 1;
			return new Response('Internal Server Error', { status: 500 });
		});

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			fetchFn,
			retry: { enabled: false },
		};
		const http = new HttpClient(opts);

		await expect(http.fetchJson('/test')).rejects.toThrow(/HTTP 500/);
		expect(attempts).toBe(1);
	});

	it('exchanges apiKey for access token and caches it', async () => {
		let exchangeCalls = 0;
		const { fetchFn, calls } = createFetchMock(async ({ url }) => {
			if (url.endsWith('/api/auth/exchange-api-key')) {
				exchangeCalls += 1;
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							accessToken: 'ACCESS_TOKEN',
							expiresIn: 900,
							expiresAt: new Date(Date.now() + 900_000).toISOString(),
							apiKeyId: 'k_123',
							user: { id: 'u_1' },
						},
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('not found', { status: 404 });
		});

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			apiKey: 'API_KEY',
			fetchFn,
		};
		const http = new HttpClient(opts);

		const h1 = await http.headers();
		expect(h1.get('Authorization')).toBe('Bearer ACCESS_TOKEN');

		const h2 = await http.headers({ 'X-Test': '1' });
		expect(h2.get('Authorization')).toBe('Bearer ACCESS_TOKEN');
		expect(h2.get('X-Test')).toBe('1');

		expect(exchangeCalls).toBe(1);
		expect(calls.some((c) => c.url.endsWith('/api/auth/exchange-api-key'))).toBe(true);
	});
});
