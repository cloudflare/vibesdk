import { BaseOAuthProvider, type OAuthClientAuthMethod } from './base';
import type { OAuthUserInfo } from '../../types/auth-types';
import { createLogger } from '../../logger';

const logger = createLogger('CloudflareConnectOAuth');

/**
 * Cloudflare AI Gateway OAuth scopes. These are fixed by the features the worker
 * uses (reading the user's identity, listing/creating gateways, running inference,
 * and keeping a refresh token), so they are hardcoded rather than configurable.
 *
 * Note: Cloudflare uses dotted scope identifiers (e.g. `aig.read`), NOT the OIDC
 * colon style. Requesting unsupported scopes such as `email`/`profile` results in
 * an `invalid_scope` error from the authorization endpoint.
 */
const CLOUDFLARE_GATEWAY_SCOPES = [
	'user-details.read',
	'ai.read',
	'ai.write',
	'aig.read',
	'aig.run',
	'aig.write',
	'offline_access',
] as const;

/**
 * "Login with Cloudflare" needs the gateway scopes (so it can auto-connect the AI
 * Gateway in the same round-trip) plus `openid` for the identity assertion. Email
 * and name come from the userinfo endpoint via `user-details.read`.
 */
const CLOUDFLARE_LOGIN_SCOPES = ['openid', ...CLOUDFLARE_GATEWAY_SCOPES];

/**
 * Cloudflare OAuth endpoints. These are fixed Cloudflare dashboard/API URLs, so they
 * are hardcoded rather than read from configuration.
 */
const CLOUDFLARE_OAUTH_AUTH_URL = 'https://dash.cloudflare.com/oauth2/authorize';
const CLOUDFLARE_OAUTH_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const CLOUDFLARE_OAUTH_USERINFO_URL = 'https://api.cloudflare.com/client/v4/user';

interface CloudflareUserFields {
	sub?: string;
	id?: string;
	email?: string;
	name?: string;
	first_name?: string;
	last_name?: string;
	picture?: string;
	email_verified?: boolean;
}

/**
 * The userinfo endpoint is the Cloudflare API v4 `/user` route, which wraps the
 * payload in a `{ success, result }` envelope. Some OIDC userinfo endpoints return
 * the fields flat instead, so we tolerate both shapes.
 */
interface CloudflareUserInfoResponse extends CloudflareUserFields, Record<string, unknown> {
	result?: CloudflareUserFields;
}

export class CloudflareConnectOAuthProvider extends BaseOAuthProvider {
	protected readonly provider = 'cloudflare' as const;
	protected readonly authorizationUrl: string;
	protected readonly tokenUrl: string;
	protected readonly userInfoUrl: string;
	protected readonly scopes: string[];
	/**
	 * Cloudflare requires `client_secret_basic` (Basic Auth header) for token
	 * requests rather than the RFC 6749 body-encoded credentials.
	 */
	protected readonly clientAuthMethod: OAuthClientAuthMethod = 'basic';

	/**
	 * When true (login flow), a missing/unusable email is a hard error rather than
	 * the `unknown@cloudflare.local` fallback used by the gateway-connect flow.
	 */
	private readonly requireEmail: boolean;

	constructor(
		clientId: string,
		clientSecret: string,
		redirectUri: string,
		authorizationUrl: string,
		tokenUrl: string,
		userInfoUrl?: string,
		scopes?: string[],
		requireEmail = false,
	) {
		super(clientId, clientSecret, redirectUri);
		this.authorizationUrl = authorizationUrl;
		this.tokenUrl = tokenUrl;
		this.userInfoUrl = userInfoUrl || '';
		this.scopes = scopes && scopes.length > 0 ? scopes : ['openid'];
		this.requireEmail = requireEmail;
	}

	async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		if (!this.userInfoUrl) {
			if (this.requireEmail) {
				throw new Error('Cloudflare userInfoUrl is not configured; cannot resolve identity for login');
			}
			logger.warn('Cloudflare userInfoUrl not configured, returning minimal user info');
			return {
				id: 'cloudflare',
				email: 'unknown@cloudflare.local',
			};
		}

		try {
			const response = await fetch(this.userInfoUrl, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json',
				},
			});

			if (!response.ok) {
				const errorText = await response.text();
				logger.error('Failed to get user info from Cloudflare', {
					status: response.status,
					error: errorText.substring(0, 200),
				});
				if (this.requireEmail) {
					throw new Error(`Cloudflare userinfo request failed with status ${response.status}`);
				}
				return {
					id: 'cloudflare',
					email: 'unknown@cloudflare.local',
					providerData: { status: response.status },
				};
			}

			const data = (await response.json()) as CloudflareUserInfoResponse;
			// `/client/v4/user` nests fields under `result`; OIDC userinfo returns them
			// flat. Prefer the envelope when present, else fall back to the top level.
			const user = data.result ?? data;
			const composedName =
				user.name ||
				[user.first_name, user.last_name].filter(Boolean).join(' ') ||
				undefined;

			if (this.requireEmail && !user.email) {
				throw new Error('Cloudflare userinfo did not return an email; cannot create a login identity');
			}

			return {
				id: String(user.sub || user.id || 'cloudflare'),
				email: user.email || 'unknown@cloudflare.local',
				name: composedName,
				picture: user.picture,
				emailVerified: user.email_verified,
				providerData: data,
			};
		} catch (error) {
			if (this.requireEmail) {
				// Surface the failure so login does not silently create a bogus identity.
				throw error;
			}
			logger.error('Error getting Cloudflare user info', error);
			return {
				id: 'cloudflare',
				email: 'unknown@cloudflare.local',
			};
		}
	}

	static create(env: Env, baseUrl: string): CloudflareConnectOAuthProvider {
		// Check if Cloudflare limits/OAuth feature is enabled. A missing encryption key
		// disables the feature entirely (same as ENABLE_CLOUDFLARE_LIMITS not being true),
		// since tokens cannot be encrypted/signed without it.
		if (env.ENABLE_CLOUDFLARE_LIMITS !== 'true' || !env.CF_OAUTH_ENCRYPTION_KEY) {
			throw new Error('Cloudflare OAuth is not enabled on this deployment');
		}

		if (!env.CLOUDFLARE_OAUTH_CLIENT_ID || !env.CLOUDFLARE_OAUTH_CLIENT_SECRET) {
			throw new Error('Cloudflare OAuth credentials not configured');
		}

		const redirectUri = `${baseUrl}/auth/callback`;
		const scopes = [...CLOUDFLARE_GATEWAY_SCOPES];

		return new CloudflareConnectOAuthProvider(
			env.CLOUDFLARE_OAUTH_CLIENT_ID,
			env.CLOUDFLARE_OAUTH_CLIENT_SECRET,
			redirectUri,
			CLOUDFLARE_OAUTH_AUTH_URL,
			CLOUDFLARE_OAUTH_TOKEN_URL,
			CLOUDFLARE_OAUTH_USERINFO_URL,
			scopes,
		);
	}

	/**
	 * Build a provider configured for the "Login with Cloudflare" identity flow.
	 *
	 * Differences from `create()`:
	 * - redirect URI points at the standard auth callback (`/api/auth/callback/cloudflare`),
	 * - requests broad identity + gateway scopes so the login callback can also
	 *   auto-connect the AI Gateway in the same round-trip,
	 * - does NOT require `ENABLE_CLOUDFLARE_LIMITS` (login is independent of limits),
	 * - requires a real email from userinfo (no `unknown@cloudflare.local` fallback).
	 */
	static createForLogin(env: Env, baseUrl: string): CloudflareConnectOAuthProvider {
		// Identity login only needs the OAuth client credentials. CF_OAUTH_ENCRYPTION_KEY
		// is NOT required here: it is only used by the best-effort AI Gateway auto-connect
		// (encrypting the token cookie), which is skipped when the key/feature is absent.
		if (!env.CLOUDFLARE_OAUTH_CLIENT_ID || !env.CLOUDFLARE_OAUTH_CLIENT_SECRET) {
			throw new Error('Cloudflare OAuth credentials not configured');
		}

		const redirectUri = `${baseUrl}/api/auth/callback/cloudflare`;

		const scopes = [...CLOUDFLARE_LOGIN_SCOPES];

		return new CloudflareConnectOAuthProvider(
			env.CLOUDFLARE_OAUTH_CLIENT_ID,
			env.CLOUDFLARE_OAUTH_CLIENT_SECRET,
			redirectUri,
			CLOUDFLARE_OAUTH_AUTH_URL,
			CLOUDFLARE_OAUTH_TOKEN_URL,
			CLOUDFLARE_OAUTH_USERINFO_URL,
			scopes,
			true,
		);
	}

	/**
	 * True when the deployment has the Cloudflare OAuth client configured for login.
	 * Only the client credentials are needed for identity login; the AI Gateway
	 * auto-connect (which needs CF_OAUTH_ENCRYPTION_KEY) is optional and best-effort.
	 */
	static isLoginConfigured(env: Env): boolean {
		return !!env.CLOUDFLARE_OAUTH_CLIENT_ID && !!env.CLOUDFLARE_OAUTH_CLIENT_SECRET;
	}
}
