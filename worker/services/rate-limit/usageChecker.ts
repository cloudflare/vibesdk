/**
 * Usage Checker - Combines rate limit checking with BYOK/balance logic
 * Replaces worker/services/limits/LimitsChecker.ts
 */
import { RateLimitService } from './rateLimits';
import { getUserConfigurableSettings } from '../../config';
import { canProceedWithRequest, type CanProceedResult } from 'shared/constants/limits';
import { decryptTokens, encryptTokens, type EncryptedTokenData } from '../../utils/tokenEncryption';
import { CloudflareAccountService } from '../cloudflare/CloudflareAccountService';
import { readTokenCookie, buildTokenCookie, buildClearTokenCookie } from '../../utils/oauthCookie';
import { CloudflareConnectOAuthProvider } from '../oauth/cloudflare-connect';
import { createLogger } from '../../logger';

const logger = createLogger('UsageChecker');

/** Refresh the access token this many ms before it expires. */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/** How many minutes to consider cached gateway credits fresh before re-fetching. */
const CREDITS_CACHE_TTL_MINUTES = 5;

export type LimitWindowKind = 'daily' | 'rolling';

export interface UsageCheckResult extends CanProceedResult {
	withinLimits: boolean;
	remaining: number;
	limit: number;
	dailyLimit?: number;
	periodSeconds?: number;
	windowKind?: LimitWindowKind;
	/** ISO timestamp when the current usage window resets (UTC midnight for daily). */
	resetAt?: string;
	balance: number | null;
	hasUserToken: boolean;
	/**
	 * When set, the caller MUST echo this as a `Set-Cookie` header on the
	 * outgoing response (or stash it on the agent state for WS callers). It is
	 * produced when the access token was near expiry and was transparently
	 * refreshed, or when the cookie was unusable and should be cleared.
	 */
	refreshedCookie?: string;
	/** Fresh encrypted blob produced alongside `refreshedCookie` (for WS state caching). */
	refreshedBlob?: string;
}

function getNextUtcMidnightIso(): string {
	const now = new Date();
	const next = new Date(Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate() + 1,
		0, 0, 0, 0
	));
	return next.toISOString();
}

/**
 * Extract the encrypted Cloudflare OAuth token blob from the HttpOnly cookie.
 * Legacy callers may still pass the request; we no longer look at the
 * `X-Cloudflare-Token` header (it was XSS-replayable).
 */
export function extractCloudflareToken(request: Request | undefined, env: Env): string | null {
	return readTokenCookie(request, env);
}

/**
 * Check if Cloudflare limits feature is enabled
 * When disabled (default), users have unlimited access (self-deployed instances)
 */
export function isCloudflareGatewayLimitsEnabled(env: Env): boolean {
	return env.ENABLE_CLOUDFLARE_LIMITS === 'true';
}

/**
 * Check if user can proceed based on rate limits and Cloudflare balance
 */
export async function checkUsageAndBalance(
	env: Env,
	userId: string,
	request?: Request,
	encryptedToken?: string | null,
	originUrl?: string,
): Promise<UsageCheckResult> {
	// If Cloudflare limits feature is disabled, always allow (self-deployed instances)
	if (!isCloudflareGatewayLimitsEnabled(env)) {
		return {
			allowed: true,
			shouldUseByok: false,
			withinLimits: true,
			remaining: Infinity,
			limit: Infinity,
			balance: null,
			hasUserToken: false,
		};
	}

	const config = await getUserConfigurableSettings(env, userId);
	// Prefer the caller-supplied blob (WS callers read once at upgrade time),
	// otherwise parse the HttpOnly cookie off the current request.
	const initialBlob = encryptedToken ?? extractCloudflareToken(request, env);
	const llmConfig = config.security.rateLimit.llmCalls;
	const periodSeconds = llmConfig.period;
	const windowKind: LimitWindowKind = llmConfig.calendarDaily ? 'daily' : 'rolling';
	const resetAt = windowKind === 'daily'
		? getNextUtcMidnightIso()
		: new Date(Date.now() + periodSeconds * 1000).toISOString();

	// Decrypt, validate user binding, and transparently refresh if near expiry.
	// Any successful refresh produces a Set-Cookie the caller must attach.
	let refreshedCookie: string | undefined;
	let refreshedBlob: string | undefined;
	let activeAccessToken: string | null = null;
	let hasUserToken = false;

	if (initialBlob) {
		const resolved = await resolveAccessToken(env, userId, initialBlob, request, originUrl);
		if (resolved.accessToken) {
			activeAccessToken = resolved.accessToken;
			hasUserToken = true;
			if (resolved.refreshedBlob) {
				refreshedBlob = resolved.refreshedBlob;
				refreshedCookie = buildTokenCookie(env, resolved.refreshedBlob);
			}
		} else if (resolved.clearCookie) {
			// Decryption failed, wrong user, or refresh failed -> wipe the cookie so
			// the UI reverts to "Connect" instead of looping on a bad blob.
			refreshedCookie = buildClearTokenCookie(env);
		}
	}

	// Get Cloudflare balance if user has a usable access token
	let cloudflareBalance: number | null = null;
	if (activeAccessToken) {
		cloudflareBalance = await getCloudflareBalance(env, userId, activeAccessToken);
	}

	// If the user has connected Cloudflare AND the LLM config excludes connected users, bypass limits entirely.
	const hasCfConnected = await hasCloudflareConfigured(env, userId);
	if (hasCfConnected && llmConfig.excludeCloudflareConnected) {
		return {
			allowed: true,
			shouldUseByok: hasUserToken,
			withinLimits: true,
			remaining: Infinity,
			limit: Infinity,
			periodSeconds,
			windowKind,
			resetAt,
			balance: cloudflareBalance,
			hasUserToken,
			refreshedCookie,
			refreshedBlob,
		};
	}

	// Check rate limits
	const { remaining, limit, dailyLimit } = await RateLimitService.getRemainingCredits(
		env, config.security.rateLimit, userId
	);
	const withinLimits = remaining > 0;

	// Determine if user can proceed
	const canProceed = canProceedWithRequest({
		withinLimits,
		hasUserToken,
		balance: cloudflareBalance,
	});

	return {
		...canProceed,
		withinLimits,
		remaining,
		limit,
		dailyLimit,
		periodSeconds,
		windowKind,
		resetAt,
		balance: cloudflareBalance,
		hasUserToken,
		refreshedCookie,
		refreshedBlob,
	};
}

/**
 * Decrypt the stored blob, validate user binding, and refresh the access token
 * if it is past the refresh threshold. Returns the usable access token plus an
 * optional new encrypted blob when refresh happened. `clearCookie: true` signals
 * that the cookie is unusable and should be evicted.
 */
async function resolveAccessToken(
	env: Env,
	expectedUserId: string,
	encryptedBlob: string,
	request?: Request,
	originUrl?: string,
): Promise<{ accessToken: string | null; refreshedBlob?: string; clearCookie?: boolean }> {
	const tokens = await decryptTokens(encryptedBlob, env);
	if (!tokens) {
		logger.warn('Failed to decrypt token cookie - clearing', { userId: expectedUserId });
		return { accessToken: null, clearCookie: true };
	}
	if (tokens.userId !== expectedUserId) {
		logger.warn('Token userId mismatch - clearing cookie', {
			tokenUserId: tokens.userId,
			expectedUserId,
		});
		return { accessToken: null, clearCookie: true };
	}

	const now = Date.now();
	const accessStillFresh = tokens.expiresAt && tokens.expiresAt - now > REFRESH_THRESHOLD_MS;
	if (accessStillFresh) {
		return { accessToken: tokens.accessToken };
	}

	// Access token is near/past expiry. Try to refresh if we have a refresh token.
	if (!tokens.refreshToken) {
		logger.info('Access token expired and no refresh token available', { userId: expectedUserId });
		return { accessToken: null, clearCookie: true };
	}

	try {
		const baseUrl = request ? new URL(request.url).origin : (originUrl || '');
		const provider = CloudflareConnectOAuthProvider.create(env, baseUrl);
		const newTokens = await provider.refreshAccessToken(tokens.refreshToken);
		if (!newTokens.accessToken) {
			logger.warn('Refresh returned no access token', { userId: expectedUserId });
			return { accessToken: null, clearCookie: true };
		}
		const expiresAt = now + (newTokens.expiresIn || 3600) * 1000;
		const newTokenData: EncryptedTokenData = {
			accessToken: newTokens.accessToken,
			refreshToken: newTokens.refreshToken || tokens.refreshToken,
			expiresAt,
			tokenType: newTokens.tokenType,
			userId: expectedUserId,
		};
		const refreshedBlob = await encryptTokens(newTokenData, env);
		logger.info('Transparently refreshed Cloudflare OAuth access token', { userId: expectedUserId });
		return { accessToken: newTokens.accessToken, refreshedBlob };
	} catch (error) {
		logger.error('Failed to refresh Cloudflare OAuth access token', error);
		return { accessToken: null, clearCookie: true };
	}
}

/**
 * Get Cloudflare AI Gateway balance for a user
 */
async function getCloudflareBalance(env: Env, userId: string, token: string): Promise<number | null> {
	try {
		const accountService = new CloudflareAccountService(env);
		const selected = await accountService.getSelectedGatewayWithAccount(userId);

		if (!selected) return null;

		// Check if cached credits are recent (less than 5 minutes old)
		const now = new Date();
		const lastUpdated = selected.gateway.creditsLastUpdated
			? new Date(selected.gateway.creditsLastUpdated)
			: null;
		const cacheAgeMinutes = lastUpdated
			? (now.getTime() - lastUpdated.getTime()) / (1000 * 60)
			: Infinity;

		if (cacheAgeMinutes < CREDITS_CACHE_TTL_MINUTES && selected.gateway.creditsRemaining !== null) {
			return selected.gateway.creditsRemaining;
		}

		// Fetch fresh credits from Cloudflare. `null` means the credits API
		// call failed (e.g. upstream outage, non-OK response, parse error).
		const credits = await accountService.fetchGatewayCredits(
			token,
			selected.account.accountId,
			selected.gateway.gatewayId
		);

		if (credits === null) {
			// Don't overwrite the cached value with an unknown reading; fall
			// back to the last-known balance so an outage doesn't masquerade
			// as a $0 balance.
			return selected.gateway.creditsRemaining ?? null;
		}

		// Update cached credits (fire and forget)
		accountService.saveGateway(
			userId,
			selected.account.id,
			selected.gateway.gatewayId,
			selected.gateway.gatewayName,
			selected.gateway.gatewaySlug,
			selected.gateway.autoCreated || false,
			credits
		).catch(err => logger.error('Failed to update cached credits', err));

		return credits;
	} catch (error) {
		logger.error('Error fetching Cloudflare balance', error);
		return null;
	}
}

/**
 * Get user's selected AI Gateway for BYOK mode
 */
export async function getUserGateway(
	env: Env,
	userId: string
): Promise<{ accountId: string; gatewaySlug: string } | null> {
	try {
		const accountService = new CloudflareAccountService(env);
		const selected = await accountService.getSelectedGatewayWithAccount(userId);

		if (!selected) return null;

		return {
			accountId: selected.account.accountId,
			gatewaySlug: selected.gateway.gatewaySlug,
		};
	} catch (error) {
		logger.error('Error fetching user gateway', error);
		return null;
	}
}

/**
 * Check if user has configured Cloudflare account and gateway
 */
export async function hasCloudflareConfigured(env: Env, userId: string): Promise<boolean> {
	try {
		const accountService = new CloudflareAccountService(env);
		const selection = await accountService.getUserSelection(userId);
		return !!(selection.accountId && selection.gatewayId);
	} catch {
		return false;
	}
}
