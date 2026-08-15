import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareConnectController } from './controller';
import { signState, verifyState } from '../../../utils/stateSigning';
import { sha256Hash } from '../../../utils/cryptoUtils';
import type { RouteContext } from '../../types/route-context';

const {
	mockGetAuthorizationUrl,
	mockExchangeCodeForTokens,
	mockProvisionFromToken,
	mockAuthMiddleware,
} = vi.hoisted(() => ({
	mockGetAuthorizationUrl: vi.fn(),
	mockExchangeCodeForTokens: vi.fn(),
	mockProvisionFromToken: vi.fn(),
	mockAuthMiddleware: vi.fn(),
}));

vi.mock('../../../middleware/auth/auth', () => ({
	authMiddleware: mockAuthMiddleware,
}));

vi.mock('../../../services/oauth/cloudflare-connect', () => ({
	CloudflareConnectOAuthProvider: {
		create: vi.fn(() => ({
			getAuthorizationUrl: mockGetAuthorizationUrl,
			exchangeCodeForTokens: mockExchangeCodeForTokens,
		})),
	},
}));

vi.mock('../../../services/cloudflare/CloudflareProvisioningService', () => ({
	CloudflareProvisioningService: vi.fn().mockImplementation(() => ({
		provisionFromToken: mockProvisionFromToken,
	})),
}));

type TestEnv = Parameters<typeof CloudflareConnectController.initiateConnect>[1];
type TestExecutionContext = Parameters<typeof CloudflareConnectController.initiateConnect>[2];

const BASE_URL = 'https://app.local';
const FLOW_ID = 'a'.repeat(32);
const CSRF_TOKEN = 'test-csrf-token';

const testEnv = {
	ENVIRONMENT: 'dev',
	ENABLE_CLOUDFLARE_LIMITS: 'true',
	CF_OAUTH_ENCRYPTION_KEY: 'test-oauth-encryption-key-0123456789abcdef',
	CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client-id',
	CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-client-secret',
} as unknown as TestEnv;

function makeContext(overrides: Partial<RouteContext> = {}): RouteContext {
	return {
		user: { id: 'user-1', email: 'user@example.com' },
		sessionId: 'session-1',
		config: {},
		pathParams: {},
		queryParams: new URLSearchParams(),
		...overrides,
	} as unknown as RouteContext;
}

function initiateRequest(overrides: {
	origin?: string;
	authorization?: string;
	includeCsrfHeader?: boolean;
	includeSessionCookie?: boolean;
} = {}): Request {
	const csrfCookie = encodeURIComponent(JSON.stringify({ token: CSRF_TOKEN, timestamp: Date.now() }));
	const cookies = [`csrf-token=${csrfCookie}`];
	if (overrides.includeSessionCookie !== false) cookies.unshift('accessToken=session-jwt');
	const headers = new Headers({
		'Content-Type': 'application/json',
		Origin: overrides.origin ?? BASE_URL,
		'Sec-Fetch-Site': 'same-origin',
		Cookie: cookies.join('; '),
	});
	if (overrides.includeCsrfHeader !== false) headers.set('X-CSRF-Token', CSRF_TOKEN);
	if (overrides.authorization) headers.set('Authorization', overrides.authorization);
	return new Request(`${BASE_URL}/api/cloudflare/connect`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ returnUrl: '/settings?tab=cloudflare' }),
	});
}

async function connectState(overrides: Partial<{
	purpose: 'cloudflare-connect-v1';
	binding: string;
	flowId: string;
	timestamp: number;
	returnPath: string;
}> = {}) {
	return {
		purpose: 'cloudflare-connect-v1' as const,
		binding: await sha256Hash(`${FLOW_ID}:user-1:session-1`),
		flowId: FLOW_ID,
		timestamp: Date.now(),
		returnPath: '/settings',
		...overrides,
	};
}

describe('CloudflareConnectController.initiateConnect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAuthorizationUrl.mockResolvedValue('https://dash.cloudflare.com/oauth2/authorize?fake=1');
	});

	it('returns an authorization URL and flow-scoped verifier cookie', async () => {
		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest(),
			testEnv,
			{} as TestExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			success: true,
			data: { authUrl: 'https://dash.cloudflare.com/oauth2/authorize?fake=1' },
		});
		expect(response.headers.get('Set-Cookie')).toMatch(/cf_oauth_verifier_[a-f0-9]{32}=/);
		const signedState = mockGetAuthorizationUrl.mock.calls[0][0] as string;
		const state = await verifyState<Record<string, unknown> & { timestamp: number }>(signedState, testEnv);
		expect(state).toMatchObject({ purpose: 'cloudflare-connect-v1', returnPath: '/settings' });
		expect(state).not.toHaveProperty('userId');
		expect(state).not.toHaveProperty('sessionId');
	});

	it('rejects explicit bearer authentication for the browser-only flow', async () => {
		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest({ authorization: 'Bearer session-jwt' }),
			testEnv,
			{} as TestExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(403);
		expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
	});

	it('rejects a mismatched origin', async () => {
		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest({ origin: 'https://attacker.example' }),
			testEnv,
			{} as TestExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(403);
		expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
	});

	it('rejects a missing CSRF header', async () => {
		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest({ includeCsrfHeader: false }),
			testEnv,
			{} as TestExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(403);
		expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
	});

	it('rejects a request without cookie authentication', async () => {
		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest({ includeSessionCookie: false }),
			testEnv,
			{} as TestExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(403);
		expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
	});
});

describe('CloudflareConnectController.handleCallback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAuthMiddleware.mockResolvedValue({
			user: { id: 'user-1', email: 'user@example.com' },
			sessionId: 'session-1',
		});
		mockExchangeCodeForTokens.mockResolvedValue({
			accessToken: 'cf-access-token',
			refreshToken: 'cf-refresh-token',
			expiresIn: 3600,
			tokenType: 'Bearer',
		});
		mockProvisionFromToken.mockResolvedValue({ accountCount: 2, hasActiveGateway: true });
	});

	it('returns to the normalized path on success', async () => {
		const state = await signState(await connectState(), testEnv);
		const request = new Request(
			`${BASE_URL}/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
			{ headers: { Cookie: `accessToken=session-jwt; cf_oauth_verifier_${FLOW_ID}=test-verifier` } },
		);

		const response = await CloudflareConnectController.handleCallback(
			request,
			testEnv,
			{} as TestExecutionContext,
			makeContext({ sessionId: null }),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('cloudflare')).toBe('connected');
		expect(location.searchParams.get('accounts')).toBe('2');
		expect(response.headers.get('Set-Cookie')).toContain(`cf_oauth_verifier_${FLOW_ID}=;`);
		expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('auth-code', 'test-verifier');
		expect(mockProvisionFromToken).toHaveBeenCalledWith('cf-access-token', 'user-1');
	});

	it('rejects a callback completed by a different session before token exchange', async () => {
		mockAuthMiddleware.mockResolvedValue({
			user: { id: 'user-1', email: 'user@example.com' },
			sessionId: 'session-2',
		});
		const state = await signState(await connectState(), testEnv);
		const request = new Request(
			`${BASE_URL}/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
			{ headers: { Cookie: `accessToken=session-jwt; cf_oauth_verifier_${FLOW_ID}=test-verifier` } },
		);

		const response = await CloudflareConnectController.handleCallback(
			request,
			testEnv,
			{} as TestExecutionContext,
			makeContext({ sessionId: null }),
		);

		expect(response.status).toBe(302);
		expect(new URL(response.headers.get('Location')!).searchParams.get('reason')).toBe('session_mismatch');
		expect(mockExchangeCodeForTokens).not.toHaveBeenCalled();
		expect(mockProvisionFromToken).not.toHaveBeenCalled();
	});
});
