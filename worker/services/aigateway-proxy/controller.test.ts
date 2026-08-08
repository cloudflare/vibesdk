import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { proxyToAiGateway, generateAppProxyToken } from './controller';

// Mutable holder for the app row returned by the mocked DB query.
const { state } = vi.hoisted(() => ({
	state: { appRow: undefined as undefined | Record<string, unknown> },
}));

vi.mock('drizzle-orm/d1', () => ({
	drizzle: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					get: async () => state.appRow,
				}),
			}),
		}),
	}),
}));

vi.mock('../../agents/inferutils/core', () => ({
	getConfigurationForModel: vi.fn(async () => ({
		baseURL: 'https://gateway.example.com/v1',
		apiKey: 'upstream-key',
		defaultHeaders: {},
	})),
}));

vi.mock('../rate-limit/rateLimits', () => ({
	RateLimitService: { enforceLLMCallsRateLimit: vi.fn(async () => undefined) },
}));

vi.mock('worker/config', () => ({
	getUserConfigurableSettings: vi.fn(async () => ({ security: { rateLimit: {} } })),
}));

const SECRET = 'test-ai-proxy-secret-0123456789abcdef';
const AUDIENCE = 'vibesdk-ai-proxy';
const ISSUER = 'vibesdk';

const testEnv = {
	AI_PROXY_JWT_SECRET: SECRET,
	DB: {},
} as unknown as Env;

const ctx = {} as ExecutionContext;
const URL_BASE = 'https://app.local/api/proxy/openai';

function makeRequest(path: string, opts: { token?: string; body?: unknown; method?: string; rawBody?: string } = {}): Request {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
	const body = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
	return new Request(`${URL_BASE}${path}`, {
		method: opts.method ?? 'POST',
		headers,
		body,
	});
}

async function signToken(payload: Record<string, unknown>, opts: { audience?: string; issuer?: string } = {}): Promise<string> {
	let jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h');
	if (opts.audience) jwt = jwt.setAudience(opts.audience);
	if (opts.issuer) jwt = jwt.setIssuer(opts.issuer);
	return jwt.sign(new TextEncoder().encode(SECRET));
}

const VALID_APP = { id: 'app-1', userId: 'user-1', title: 'My App', status: 'active' };

describe('proxyToAiGateway', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.appRow = { ...VALID_APP };
	});

	it('rejects non-POST methods with 405', async () => {
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { method: 'GET' }), testEnv, ctx);
		expect(res.status).toBe(405);
	});

	it('rejects requests without an Authorization header with 401', async () => {
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { body: { model: 'm' } }), testEnv, ctx);
		expect(res.status).toBe(401);
	});

	it('rejects a token missing the required audience with 401', async () => {
		const token = await signToken({ appId: 'app-1', userId: 'user-1', type: 'app-proxy' }, { issuer: ISSUER });
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, body: { model: 'm' } }), testEnv, ctx);
		expect(res.status).toBe(401);
	});

	it('rejects a token with the wrong type with 401', async () => {
		const token = await signToken({ appId: 'app-1', userId: 'user-1', type: 'other' }, { audience: AUDIENCE, issuer: ISSUER });
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, body: { model: 'm' } }), testEnv, ctx);
		expect(res.status).toBe(401);
	});

	it('rejects a disallowed proxy path with 404', async () => {
		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const res = await proxyToAiGateway(makeRequest('/admin/keys', { token, body: { model: 'm' } }), testEnv, ctx);
		expect(res.status).toBe(404);
	});

	it('rejects an oversized body with 413', async () => {
		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const rawBody = `{"model":"m","pad":"${'x'.repeat(5 * 1024 * 1024 + 100)}"}`;
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, rawBody }), testEnv, ctx);
		expect(res.status).toBe(413);
	});

	it('rejects too many messages with 400', async () => {
		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const messages = Array.from({ length: 201 }, () => ({ role: 'user', content: 'hi' }));
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, body: { model: 'm', messages } }), testEnv, ctx);
		expect(res.status).toBe(400);
	});

	it('rejects a request with no model with 400', async () => {
		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, body: { messages: [] } }), testEnv, ctx);
		expect(res.status).toBe(400);
	});

	it('clamps max_tokens and proxies the request', async () => {
		const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const res = await proxyToAiGateway(
			makeRequest('/chat/completions', { token, body: { model: 'm', max_tokens: 1_000_000, messages: [] } }),
			testEnv,
			ctx,
		);

		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const forwarded = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(forwarded.max_tokens).toBe(16384);

		vi.unstubAllGlobals();
	});

	it('returns 404 when the app is not found', async () => {
		state.appRow = undefined;
		const token = await generateAppProxyToken('app-1', 'user-1', testEnv);
		const res = await proxyToAiGateway(makeRequest('/chat/completions', { token, body: { model: 'm' } }), testEnv, ctx);
		expect(res.status).toBe(404);
	});
});
