import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { CloudflareConnectOAuthProvider } from '../../../services/oauth/cloudflare-connect';
import { BaseOAuthProvider } from '../../../services/oauth/base';
import {
	CloudflareAccountService,
	type AIGateway,
	type CloudflareAccount,
} from '../../../services/cloudflare/CloudflareAccountService';
import { createLogger } from '../../../logger';
import { encryptTokens, type EncryptedTokenData } from '../../../utils/tokenEncryption';
import { signState, verifyState } from '../../../utils/stateSigning';
import {
	buildTokenCookie,
	buildVerifierCookie,
	buildClearVerifierCookie,
	readVerifierCookie,
} from '../../../utils/oauthCookie';

/**
 * Signed state payload. The PKCE code_verifier is intentionally NOT included here;
 * it lives in an HttpOnly cookie so that observing the URL (browser history, referer,
 * logs) does not compromise PKCE.
 */
interface CloudflareConnectState {
	userId: string;
	timestamp: number;
	returnUrl: string;
}

/** Reject returnUrl values that resolve to a different origin to prevent open redirects. */
function safeSameOriginUrl(candidate: string | undefined | null, baseUrl: string): string {
	const fallback = `${baseUrl}/settings`;
	if (!candidate) return fallback;
	try {
		const resolved = new URL(candidate, baseUrl);
		return resolved.origin === new URL(baseUrl).origin ? resolved.toString() : fallback;
	} catch {
		return fallback;
	}
}

export class CloudflareConnectController extends BaseController {
	static logger = createLogger('CloudflareConnectController');

	static async initiateConnect(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		try {
			const user = context.user;
			if (!user) {
				return CloudflareConnectController.createErrorResponse(
					'Authentication required',
					401,
				);
			}

			// CSRF: reject cross-site initiators. `Sec-Fetch-Site` is sent by all modern browsers;
			// absent values (e.g. curl) are treated as trusted so server-to-server tests still work.
			const fetchSite = request.headers.get('Sec-Fetch-Site');
			if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
				this.logger.warn('Rejecting cross-site /oauth/login', { fetchSite, userId: user.id });
				return CloudflareConnectController.createErrorResponse('Cross-site request blocked', 403);
			}

			const url = new URL(request.url);
			const baseUrl = url.origin;
			const returnUrl = safeSameOriginUrl(
				context.queryParams.get('return_url') || request.headers.get('referer'),
				baseUrl,
			);

			const codeVerifier = BaseOAuthProvider.generateCodeVerifier();
			const state: CloudflareConnectState = {
				userId: user.id,
				timestamp: Date.now(),
				returnUrl,
			};

			const provider = CloudflareConnectOAuthProvider.create(env, baseUrl);
			const signedState = await signState(state, env);
			const authUrl = await provider.getAuthorizationUrl(signedState, codeVerifier);

			return new Response(null, {
				status: 302,
				headers: {
					Location: authUrl,
					'Set-Cookie': buildVerifierCookie(env, codeVerifier),
				},
			});
		} catch (error) {
			this.logger.error('Failed to initiate Cloudflare connect', error);
			const baseUrl = new URL(request.url).origin;
			return Response.redirect(
				`${baseUrl}/settings?cloudflare=error&reason=init_failed`,
				302,
			);
		}
	}

	static async handleCallback(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const url = new URL(request.url);
		const baseUrl = url.origin;
		const code = url.searchParams.get('code');
		const stateParam = url.searchParams.get('state');
		const error = url.searchParams.get('error');

		if (error) {
			this.logger.error('Cloudflare OAuth returned error', { error });
			return Response.redirect(
				`${baseUrl}/settings?cloudflare=error&reason=${encodeURIComponent(
					error,
				)}`,
				302,
			);
		}

		if (!code || !stateParam) {
			return Response.redirect(
				`${baseUrl}/settings?cloudflare=error&reason=missing_params`,
				302,
			);
		}

		// Verify HMAC signature and freshness. Unsigned/expired state is untrusted input.
		const parsedState = await verifyState<CloudflareConnectState>(stateParam, env);
		if (!parsedState || !parsedState.userId) {
			this.logger.warn('Rejecting Cloudflare OAuth callback with invalid state signature');
			return Response.redirect(
				`${baseUrl}/settings?cloudflare=error&reason=invalid_state`,
				302,
			);
		}

		// Defense-in-depth: re-validate returnUrl at callback time.
		const absoluteReturnUrl = safeSameOriginUrl(parsedState.returnUrl, baseUrl);

		// Read PKCE verifier from the HttpOnly cookie set during /oauth/login.
		const codeVerifier = readVerifierCookie(request);
		if (!codeVerifier) {
			this.logger.warn('Missing PKCE verifier cookie on callback', { userId: parsedState.userId });
			return Response.redirect(
				`${baseUrl}/settings?cloudflare=error&reason=missing_verifier`,
				302,
			);
		}
		// Always clear the verifier cookie on callback (success or failure).
		const clearVerifierCookie = buildClearVerifierCookie(env);

		try {
			const provider = CloudflareConnectOAuthProvider.create(env, baseUrl);
			const tokens = await provider.exchangeCodeForTokens(code, codeVerifier);

			if (!tokens.accessToken) {
				const errorUrl = new URL(absoluteReturnUrl);
				errorUrl.searchParams.set('cloudflare', 'error');
				errorUrl.searchParams.set('reason', 'token_exchange_failed');
				return new Response(null, {
					status: 302,
					headers: { Location: errorUrl.toString(), 'Set-Cookie': clearVerifierCookie },
				});
			}

			// Fetch accounts and gateways to save metadata (not tokens)
			const accountService = new CloudflareAccountService(env);

			const accounts = await accountService.fetchCloudflareAccounts(tokens.accessToken);
			this.logger.info('Fetched Cloudflare accounts', { 
				userId: parsedState.userId, 
				accountCount: accounts.length 
			});

			await this.processAllAccounts(
				accounts,
				accountService,
				tokens.accessToken,
				parsedState.userId
			);

			// Check if user has an active gateway configured after processing
			const hasActiveGateway = await accountService.getSelectedGatewayWithAccount(parsedState.userId) !== null;

			// Encrypt tokens on the backend before sending to browser
			// Include userId to bind token to this specific user (prevents token theft/replay)
			const expiresAt = Date.now() + (tokens.expiresIn || 3600) * 1000;
			const tokenData: EncryptedTokenData = {
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				expiresAt,
				tokenType: tokens.tokenType,
				userId: parsedState.userId,
			};
			const encryptedBlob = await encryptTokens(tokenData, env);

			// If no active gateway was configured, redirect to settings page for configuration
			let finalRedirectUrl = absoluteReturnUrl;
			if (!hasActiveGateway) {
				finalRedirectUrl = `${baseUrl}/settings`;
			}

			const successUrl = new URL(finalRedirectUrl);
			successUrl.searchParams.set('cloudflare', 'connected');
			successUrl.searchParams.set('accounts', accounts.length.toString());
			if (!hasActiveGateway) {
				successUrl.searchParams.set('config_needed', 'true');
			}

			// Token lives only in a HttpOnly cookie from here on; the browser never sees it.
			// Cookie lifetime matches the refresh-token horizon (default 30 days) so transparent
			// refresh can run for the whole session.
			const headers = new Headers();
			headers.set('Location', successUrl.toString());
			headers.append('Set-Cookie', clearVerifierCookie);
			headers.append('Set-Cookie', buildTokenCookie(env, encryptedBlob));
			headers.set('Referrer-Policy', 'no-referrer');
			return new Response(null, { status: 302, headers });
		} catch (callbackError) {
			this.logger.error(
				'Failed to handle Cloudflare OAuth callback',
				callbackError,
			);

			const errorUrl = new URL(absoluteReturnUrl);
			errorUrl.searchParams.set('cloudflare', 'error');
			errorUrl.searchParams.set('reason', 'callback_failed');

			return new Response(null, {
				status: 302,
				headers: { Location: errorUrl.toString(), 'Set-Cookie': clearVerifierCookie },
			});
		}
	}

	/**
	 * Process all accounts and their gateways
	 */
	private static async processAllAccounts(
		accounts: CloudflareAccount[],
		accountService: CloudflareAccountService,
		accessToken: string,
		userId: string
	): Promise<void> {
		// Check once: should we activate the first gateway?
		const hasExistingGateways = await accountService.hasExistingGateways(userId);
		const shouldActivateFirstGateway = !hasExistingGateways;

		let totalGatewaysSoFar = 0;

		for (let i = 0; i < accounts.length; i++) {
			const account = accounts[i];
			const accountDbId = await accountService.saveAccount(
				userId,
				account.id,
				account.name,
				account.email
			);

			const { gatewayCount } = await this.processAccountGateways(
				accountService,
				accessToken,
				userId,
				account,
				accountDbId,
				shouldActivateFirstGateway && totalGatewaysSoFar === 0
			);

			// Count gateways to know when to stop activating
			totalGatewaysSoFar += gatewayCount;
		}
	}

	/**
	 * Process gateways for a single account
	 */
	private static async processAccountGateways(
		accountService: CloudflareAccountService,
		accessToken: string,
		userId: string,
		account: CloudflareAccount,
		accountDbId: string,
		shouldActivateFirst: boolean
	): Promise<{ savedGateways: string[]; gatewayCount: number }> {
		// Fetch or create gateways
		const { gateways, autoCreatedGatewayId } = await this.ensureAccountHasGateways(
			accountService,
			accessToken,
			userId,
			account
		);

		// Only auto-activate if there's exactly 1 gateway AND user has no existing gateways
		// If there are multiple gateways, user should manually select
		const shouldActivate = shouldActivateFirst && gateways.length === 1;

		// Save all gateways
		const savedGateways = await this.saveGateways(
			accountService,
			accessToken,
			userId,
			accountDbId,
			account.id,
			gateways,
			autoCreatedGatewayId,
			shouldActivate
		);

		return { savedGateways, gatewayCount: gateways.length };
	}

	/**
	 * Ensure account has at least one gateway (auto-create if needed)
	 */
	private static async ensureAccountHasGateways(
		accountService: CloudflareAccountService,
		accessToken: string,
		userId: string,
		account: CloudflareAccount
	): Promise<{ gateways: AIGateway[]; autoCreatedGatewayId: string | null }> {
		let gateways = await accountService.fetchAIGateways(accessToken, account.id);
		let autoCreatedGatewayId: string | null = null;

		if (gateways.length === 0) {
			this.logger.info('No gateways found, auto-creating one', {
				userId,
				accountId: account.id
			});

			const newGateway = await accountService.createAIGateway(
				accessToken,
				account.id,
				`${account.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-gateway`
			);

			if (newGateway) {
				gateways = [newGateway];
				autoCreatedGatewayId = newGateway.id;
				this.logger.info('Successfully auto-created gateway', {
					gatewayId: newGateway.id
				});
			}
		}

		return { gateways, autoCreatedGatewayId };
	}

	/**
	 * Save all gateways for an account
	 */
	private static async saveGateways(
		accountService: CloudflareAccountService,
		accessToken: string,
		userId: string,
		accountDbId: string,
		accountId: string,
		gateways: AIGateway[],
		autoCreatedGatewayId: string | null,
		shouldActivateFirst: boolean
	): Promise<string[]> {
		const savedGatewayIds: string[] = [];

		for (let i = 0; i < gateways.length; i++) {
			const gateway = gateways[i];
			const autoCreated = gateway.id === autoCreatedGatewayId;

			const credits = await accountService.fetchGatewayCredits(
				accessToken,
				accountId,
				gateway.id
			);

			const savedGatewayId = await accountService.saveGateway(
				userId,
				accountDbId,
				gateway.id,
				gateway.id,
				gateway.slug,
				autoCreated,
				credits,
				shouldActivateFirst && i === 0
			);

			savedGatewayIds.push(savedGatewayId);
		}

		return savedGatewayIds;
	}
}
