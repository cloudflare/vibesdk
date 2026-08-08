import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareConnectController } from './controller';
import { signState } from '../../../utils/stateSigning';
import type { RouteContext } from '../../types/route-context';

const { mockGetSessionCreatedAt, mockGetAuthorizationUrl, mockExchangeCodeForTokens, mockProvisionFromToken } =
	vi.hoisted(() => ({
		mockGetSessionCreatedAt: vi.fn(),
		mockGetAuthorizationUrl: vi.fn(),
		mockExchangeCodeForTokens: vi.fn(),
		mockProvisionFromToken: vi.fn(),
	}));

vi.mock('../../../database/services/SessionService', () => ({
	SessionService: vi.fn().mockImplementation(() => ({
		getSessionCreatedAt: mockGetSessionCreatedAt,
	})),
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

const BASE_URL = 'https://app.local';

const testEnv = {
	ENVIRONMENT: 'dev',
	ENABLE_CLOUDFLARE_LIMITS: 'true',
	CF_OAUTH_ENCRYPTION_KEY: 'test-oauth-encryption-key-0123456789abcdef',
	CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client-id',
	CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-client-secret',
} as unknown as Env;

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

function initiateRequest(): Request {
	return new Request(`${BASE_URL}/oauth/login`, {
		headers: { 'Sec-Fetch-Site': 'same-origin' },
	});
}

describe('CloudflareConnectController.initiateConnect freshness gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAuthorizationUrl.mockResolvedValue('https://dash.cloudflare.com/oauth2/authorize?fake=1');
	});

	it('rejects sessions minted less than 5 minutes ago with reauth_required', async () => {
		mockGetSessionCreatedAt.mockResolvedValue(new Date(Date.now() - 60 * 1000)); // 1 min old

		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest(),
			testEnv,
			{} as ExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.pathname).toBe('/settings');
		expect(location.searchParams.get('cloudflare')).toBe('error');
		expect(location.searchParams.get('reason')).toBe('reauth_required');
		expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
	});

	it('allows linking when the session row cannot be read', async () => {
		mockGetSessionCreatedAt.mockResolvedValue(null);

		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest(),
			testEnv,
			{} as ExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://dash.cloudflare.com/oauth2/authorize?fake=1');
		expect(mockGetAuthorizationUrl).toHaveBeenCalledOnce();
	});

	it('allows sessions older than the freshness window', async () => {
		mockGetSessionCreatedAt.mockResolvedValue(new Date(Date.now() - 10 * 60 * 1000)); // 10 min old

		const response = await CloudflareConnectController.initiateConnect(
			initiateRequest(),
			testEnv,
			{} as ExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://dash.cloudflare.com/oauth2/authorize?fake=1');
		expect(response.headers.get('Set-Cookie')).toContain('__cf_oauth_verifier=');
	});
});

describe('CloudflareConnectController.handleCallback success redirect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExchangeCodeForTokens.mockResolvedValue({
			accessToken: 'cf-access-token',
			refreshToken: 'cf-refresh-token',
			expiresIn: 3600,
			tokenType: 'Bearer',
		});
		mockProvisionFromToken.mockResolvedValue({ accountCount: 2, hasActiveGateway: true });
	});

	it('preserves return URL query parameters on success', async () => {
		const returnUrl = `${BASE_URL}/settings?cloudflare=error&reason=session_too_new&retry_after=42`;
		const state = await signState(
			{ userId: 'user-1', timestamp: Date.now(), returnUrl },
			testEnv,
		);
		const request = new Request(
			`${BASE_URL}/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
			{ headers: { Cookie: '__cf_oauth_verifier=test-verifier' } },
		);

		const response = await CloudflareConnectController.handleCallback(
			request,
			testEnv,
			{} as ExecutionContext,
			makeContext({ sessionId: null }),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('cloudflare')).toBe('connected');
		expect(location.searchParams.get('accounts')).toBe('2');
		expect(location.searchParams.get('reason')).toBe('session_too_new');
		expect(location.searchParams.get('retry_after')).toBe('42');
	});
});
