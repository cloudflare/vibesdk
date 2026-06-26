import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { CloudflareConnectOAuthProvider } from '../../../services/oauth/cloudflare-connect';
import { BaseOAuthProvider } from '../../../services/oauth/base';
import { CloudflareProvisioningService } from '../../../services/cloudflare/CloudflareProvisioningService';
import { SessionService } from '../../../database/services/SessionService';
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
 * Account linking is the highest-leverage authenticated action in the system, so
 * we refuse to start it from a session that was minted within this window (e.g. a
 * just-issued OAuth-callback session). This blocks the login-CSRF -> auto-link chain
 * even if the upstream session cookie is attacker-controlled.
 * The Cloudflare-login auto-connect path does NOT use this initiator; it links using
 * the identity proven in the same OAuth round-trip.
 */
const SESSION_FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

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

			// Freshness gate: refuse to start linking from a just-minted session. This breaks
			// the login-CSRF -> auto-link chain (the attacker's fixated session is brand new).
			const sessionCreatedAt = context.sessionId
				? await new SessionService(env).getSessionCreatedAt(context.sessionId)
				: null;
			if (sessionCreatedAt && Date.now() - sessionCreatedAt.getTime() < SESSION_FRESHNESS_THRESHOLD_MS) {
				this.logger.warn('Rejecting Cloudflare linking from a freshly-issued session', {
					userId: user.id,
					sessionAgeMs: Date.now() - sessionCreatedAt.getTime(),
				});
				const baseUrl = new URL(request.url).origin;
				return Response.redirect(
					`${baseUrl}/settings?cloudflare=error&reason=reauth_required`,
					302,
				);
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

			// Fetch accounts and gateways to save metadata (not tokens) via the shared
			// provisioning service (also used by the Cloudflare-login auto-connect path).
			const provisioning = new CloudflareProvisioningService(env);
			const { accountCount, hasActiveGateway } = await provisioning.provisionFromToken(
				tokens.accessToken,
				parsedState.userId,
			);

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
			successUrl.searchParams.set('accounts', accountCount.toString());
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
}
