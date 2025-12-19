import { describe, expect, it } from 'bun:test';
import { HttpClient } from '../src/http';
import type { VibeClientOptions } from '../src/types';

import { createFetchMock } from './fakes';

describe('HttpClient', () => {
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
