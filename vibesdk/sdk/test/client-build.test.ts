import { describe, expect, it } from 'bun:test';
import { VibeClient } from '../src/client';
import type { Credentials } from '../src/types';

import { createFetchMock, streamFromString } from './fakes';

describe('VibeClient.build', () => {
	it('uses apiKey exchange then streams NDJSON start+chunks', async () => {
		const credentials: Credentials = {
			providers: { openai: { apiKey: 'sk-test' } },
		};

		const { fetchFn, calls } = createFetchMock(async ({ url, init }) => {
			if (url.endsWith('/api/auth/exchange-api-key')) {
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

			if (url.endsWith('/api/agent')) {
				const headers = init?.headers;
				const auth =
					headers instanceof Headers
						? headers.get('Authorization')
						: (headers as Record<string, string> | undefined)?.Authorization;
				expect(auth).toBe('Bearer ACCESS_TOKEN');

				const parsedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
				expect(parsedBody.query).toBe('Hello');
				expect(parsedBody.credentials).toEqual(credentials);

				const ndjson =
					JSON.stringify({ agentId: 'a1', websocketUrl: 'ws://x/ws', behaviorType: 'phasic', projectType: 'app' }) +
					'\n' +
					JSON.stringify({ chunk: 'blueprint chunk' }) +
					'\n';

				return new Response(streamFromString(ndjson), {
					status: 200,
					headers: { 'Content-Type': 'text/event-stream' },
				});
			}

			return new Response('not found', { status: 404 });
		});

		const client = new VibeClient({ baseUrl: 'http://localhost:5173', apiKey: 'API_KEY', fetchFn });

		let blueprint = '';
		const session = await client.build('Hello', {
			autoConnect: false,
			autoGenerate: false,
			credentials,
			onBlueprintChunk: (c) => {
				blueprint += c;
			},
		});

		expect(session.agentId).toBe('a1');
		expect(session.websocketUrl).toBe('ws://x/ws');
		expect(blueprint).toBe('blueprint chunk');

		// sanity: exchange then agent
		expect(calls[0]?.url.endsWith('/api/auth/exchange-api-key')).toBe(true);
		expect(calls[1]?.url.endsWith('/api/agent')).toBe(true);
	});
});
