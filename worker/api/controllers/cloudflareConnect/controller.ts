import { z } from 'zod';
import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { CloudflareConnectOAuthProvider } from '../../../services/oauth/cloudflare-connect';
import { BaseOAuthProvider } from '../../../services/oauth/base';
import { CloudflareProvisioningService } from '../../../services/cloudflare/CloudflareProvisioningService';
import { createLogger } from '../../../logger';
import { encryptTokens, type EncryptedTokenData } from '../../../utils/tokenEncryption';
import { signState, verifyState } from '../../../utils/stateSigning';
import { authMiddleware } from '../../../middleware/auth/auth';
import { CsrfService } from '../../../services/csrf/CsrfService';
import {
	TokenExtractionMethod,
	extractTokenWithMetadata,
	validateRedirectUrl,
} from '../../../utils/authUtils';
import { generateSecureToken, sha256Hash } from '../../../utils/cryptoUtils';
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import {
	buildTokenCookie,
	buildVerifierCookie,
	buildClearVerifierCookie,
	readVerifierCookie,
} from '../../../utils/oauthCookie';

const CONNECT_PURPOSE = 'cloudflare-connect-v1' as const;
const MAX_FUTURE_STATE_SKEW_MS = 60 * 1000;

const connectRequestSchema = z.object({
	returnUrl: z.string().max(2048).optional(),
}).strict();

const connectStateSchema = z.object({
	purpose: z.literal(CONNECT_PURPOSE),
	binding: z.string().regex(/^[a-f0-9]{64}$/),
	flowId: z.string().regex(/^[a-f0-9]{32}$/),
	timestamp: z.number().finite(),
	returnPath: z.string().min(1).max(2048),
});

type CloudflareConnectState = z.infer<typeof connectStateSchema>;

function normalizeReturnPath(candidate: string | undefined | null, request: Request): string {
	if (!candidate || !validateRedirectUrl(candidate, request)) return '/settings';

	const url = new URL(candidate, new URL(request.url).origin);
	const forbiddenPaths = ['/api/', '/oauth/', '/auth/', '/logout'];
	const nestedRedirectParams = ['return_url', 'returnUrl', 'redirect_url', 'continue'];
	if (
		forbiddenPaths.some((path) => url.pathname.startsWith(path)) ||
		nestedRedirectParams.some((param) => url.searchParams.has(param))
	) {
		return '/settings';
	}

	return url.pathname;
}

function flowBinding(userId: string, sessionId: string, flowId: string): Promise<string> {
	return sha256Hash(`${flowId}:${userId}:${sessionId}`);
}

function callbackRedirect(
	location: string,
	env: Env,
	flowId?: string,
): Response {
	const headers = new Headers({
		Location: location,
		'Referrer-Policy': 'no-referrer',
	});
	if (flowId) {
		headers.append('Set-Cookie', buildClearVerifierCookie(env, flowId));
	}
	return new Response(null, { status: 302, headers });
}

async function parseConnectState(state: string | null, env: Env): Promise<CloudflareConnectState | null> {
	if (!state) return null;
	const verified = await verifyState<CloudflareConnectState>(state, env);
	const parsed = connectStateSchema.safeParse(verified);
	if (!parsed.success || parsed.data.timestamp > Date.now() + MAX_FUTURE_STATE_SKEW_MS) {
		return null;
	}
	return parsed.data;
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
			if (!user || !context.sessionId) {
				return CloudflareConnectController.createErrorResponse('Authentication required', 401);
			}

			if (request.headers.has('Authorization') || request.headers.has('X-API-Key')) {
				return CloudflareConnectController.createErrorResponse('Browser session authentication required', 403);
			}
			const token = extractTokenWithMetadata(request);
			if (token.method !== TokenExtractionMethod.COOKIE) {
				return CloudflareConnectController.createErrorResponse('Browser session authentication required', 403);
			}

			const requestOrigin = new URL(request.url).origin;
			if (request.headers.get('Origin') !== requestOrigin) {
				return CloudflareConnectController.createErrorResponse(
					new SecurityError(SecurityErrorType.CSRF_VIOLATION, 'Invalid request origin', 403),
					403,
				);
			}
			const fetchSite = request.headers.get('Sec-Fetch-Site');
			if (fetchSite && fetchSite !== 'same-origin') {
				return CloudflareConnectController.createErrorResponse(
					new SecurityError(SecurityErrorType.CSRF_VIOLATION, 'Cross-site request blocked', 403),
					403,
				);
			}
			if (!CsrfService.validateDoubleSubmitToken(request)) {
				return CloudflareConnectController.createErrorResponse(
					new SecurityError(SecurityErrorType.CSRF_VIOLATION, 'CSRF validation failed', 403),
					403,
				);
			}

			const bodyResult = await CloudflareConnectController.parseJsonBody<unknown>(request);
			if (!bodyResult.success) return bodyResult.response!;
			const body = connectRequestSchema.safeParse(bodyResult.data);
			if (!body.success) {
				return CloudflareConnectController.createErrorResponse('Invalid connect request', 400);
			}

			const returnPath = normalizeReturnPath(
				body.data.returnUrl || request.headers.get('Referer'),
				request,
			);
			const codeVerifier = BaseOAuthProvider.generateCodeVerifier();
			const flowId = generateSecureToken(16);
			const state: CloudflareConnectState = {
				purpose: CONNECT_PURPOSE,
				binding: await flowBinding(user.id, context.sessionId, flowId),
				flowId,
				timestamp: Date.now(),
				returnPath,
			};

			const provider = CloudflareConnectOAuthProvider.create(env, requestOrigin);
			const signedState = await signState(state, env);
			const authUrl = await provider.getAuthorizationUrl(signedState, codeVerifier);
			const response = CloudflareConnectController.createSuccessResponse({ authUrl });
			response.headers.append('Set-Cookie', buildVerifierCookie(env, flowId, codeVerifier));
			return response;
		} catch (error) {
			this.logger.error('Failed to initiate Cloudflare connect', error);
			return CloudflareConnectController.handleError(error, 'initiate Cloudflare connect');
		}
	}

	static async legacyInitiateConnect(request: Request): Promise<Response> {
		const baseUrl = new URL(request.url).origin;
		return Response.redirect(
			`${baseUrl}/settings?cloudflare=error&reason=connect_endpoint_changed`,
			302,
		);
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
		const providerError = url.searchParams.get('error');
		if (!stateParam) {
			return callbackRedirect(`${baseUrl}/settings?cloudflare=error&reason=invalid_state`, env);
		}
		const parsedState = await parseConnectState(stateParam, env);
		if (!parsedState) {
			this.logger.warn('Rejecting Cloudflare OAuth callback with invalid state signature');
			return callbackRedirect(`${baseUrl}/settings?cloudflare=error&reason=invalid_state`, env);
		}

		const session = await authMiddleware(request, env);
		const binding = session
			? await flowBinding(session.user.id, session.sessionId, parsedState.flowId)
			: null;
		if (!session || binding !== parsedState.binding) {
			this.logger.warn('Rejecting Cloudflare OAuth callback with session mismatch', {
				sessionUserId: session?.user.id,
			});
			return callbackRedirect(
				`${baseUrl}/settings?cloudflare=error&reason=session_mismatch`,
				env,
				parsedState.flowId,
			);
		}

		const absoluteReturnUrl = new URL(parsedState.returnPath, baseUrl);
		if (providerError) {
			this.logger.error('Cloudflare OAuth returned error', { error: providerError });
			absoluteReturnUrl.searchParams.set('cloudflare', 'error');
			absoluteReturnUrl.searchParams.set('reason', providerError);
			return callbackRedirect(absoluteReturnUrl.toString(), env, parsedState.flowId);
		}
		if (!code) {
			absoluteReturnUrl.searchParams.set('cloudflare', 'error');
			absoluteReturnUrl.searchParams.set('reason', 'missing_params');
			return callbackRedirect(absoluteReturnUrl.toString(), env, parsedState.flowId);
		}

		const codeVerifier = readVerifierCookie(request, env, parsedState.flowId);
		if (!codeVerifier) {
			this.logger.warn('Missing PKCE verifier cookie on callback', { userId: session.user.id });
			absoluteReturnUrl.searchParams.set('cloudflare', 'error');
			absoluteReturnUrl.searchParams.set('reason', 'missing_verifier');
			return callbackRedirect(absoluteReturnUrl.toString(), env, parsedState.flowId);
		}
		try {
			const provider = CloudflareConnectOAuthProvider.create(env, baseUrl);
			const tokens = await provider.exchangeCodeForTokens(code, codeVerifier);

			if (!tokens.accessToken) {
				absoluteReturnUrl.searchParams.set('cloudflare', 'error');
				absoluteReturnUrl.searchParams.set('reason', 'token_exchange_failed');
				return callbackRedirect(absoluteReturnUrl.toString(), env, parsedState.flowId);
			}

			const provisioning = new CloudflareProvisioningService(env);
			const { accountCount, hasActiveGateway } = await provisioning.provisionFromToken(
				tokens.accessToken,
				session.user.id,
			);

			const expiresAt = Date.now() + (tokens.expiresIn || 3600) * 1000;
			const tokenData: EncryptedTokenData = {
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				expiresAt,
				tokenType: tokens.tokenType,
				userId: session.user.id,
			};
			const encryptedBlob = await encryptTokens(tokenData, env);

			const successUrl = hasActiveGateway
				? absoluteReturnUrl
				: new URL('/settings', baseUrl);
			successUrl.searchParams.set('cloudflare', 'connected');
			successUrl.searchParams.set('accounts', accountCount.toString());
			if (!hasActiveGateway) successUrl.searchParams.set('config_needed', 'true');

			const response = callbackRedirect(successUrl.toString(), env, parsedState.flowId);
			response.headers.append('Set-Cookie', buildTokenCookie(env, encryptedBlob));
			return response;
		} catch (callbackError) {
			this.logger.error('Failed to handle Cloudflare OAuth callback', callbackError);
			absoluteReturnUrl.searchParams.set('cloudflare', 'error');
			absoluteReturnUrl.searchParams.set('reason', 'callback_failed');
			return callbackRedirect(absoluteReturnUrl.toString(), env, parsedState.flowId);
		}
	}
}
