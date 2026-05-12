import { BaseOAuthProvider, type OAuthClientAuthMethod } from './base';
import type { OAuthUserInfo } from '../../types/auth-types';
import { createLogger } from '../../logger';

const logger = createLogger('CloudflareConnectOAuth');

interface CloudflareUserInfoResponse extends Record<string, unknown> {
	sub?: string;
	id?: string;
	email?: string;
	name?: string;
	picture?: string;
	email_verified?: boolean;
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

	constructor(
		clientId: string,
		clientSecret: string,
		redirectUri: string,
		authorizationUrl: string,
		tokenUrl: string,
		userInfoUrl?: string,
		scopes?: string[],
	) {
		super(clientId, clientSecret, redirectUri);
		this.authorizationUrl = authorizationUrl;
		this.tokenUrl = tokenUrl;
		this.userInfoUrl = userInfoUrl || '';
		this.scopes = scopes && scopes.length > 0 ? scopes : ['openid'];
	}

	async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		if (!this.userInfoUrl) {
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
				return {
					id: 'cloudflare',
					email: 'unknown@cloudflare.local',
					providerData: { status: response.status },
				};
			}

			const data = (await response.json()) as CloudflareUserInfoResponse;

			return {
				id: String(data.sub || data.id || 'cloudflare'),
				email: data.email || 'unknown@cloudflare.local',
				name: data.name,
				picture: data.picture,
				emailVerified: data.email_verified,
				providerData: data,
			};
		} catch (error) {
			logger.error('Error getting Cloudflare user info', error);
			return {
				id: 'cloudflare',
				email: 'unknown@cloudflare.local',
			};
		}
	}

	static create(env: Env, baseUrl: string): CloudflareConnectOAuthProvider {
		// Check if Cloudflare limits/OAuth feature is enabled
		if (env.ENABLE_CLOUDFLARE_LIMITS !== 'true') {
			throw new Error('Cloudflare OAuth is not enabled on this deployment');
		}

		if (
			!env.CLOUDFLARE_OAUTH_CLIENT_ID ||
			!env.CLOUDFLARE_OAUTH_CLIENT_SECRET ||
			!env.CLOUDFLARE_OAUTH_AUTH_URL ||
			!env.CLOUDFLARE_OAUTH_TOKEN_URL
		) {
			throw new Error('Cloudflare OAuth credentials not configured');
		}

		const redirectUri = `${baseUrl}/auth/callback`;
		const scopesEnv = env.CLOUDFLARE_OAUTH_SCOPES;
		const scopes = scopesEnv ? scopesEnv.split(' ') : ['openid'];

		return new CloudflareConnectOAuthProvider(
			env.CLOUDFLARE_OAUTH_CLIENT_ID,
			env.CLOUDFLARE_OAUTH_CLIENT_SECRET,
			redirectUri,
			env.CLOUDFLARE_OAUTH_AUTH_URL,
			env.CLOUDFLARE_OAUTH_TOKEN_URL,
			env.CLOUDFLARE_OAUTH_USERINFO_URL,
			scopes,
		);
	}
}
