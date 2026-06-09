/**
 * Limits and Usage Constants
 * Shared between frontend and backend
 */

/**
 * Minimum Cloudflare AI Gateway balance required to use the service
 * If balance falls below this, user must add credits or use BYOK
 */
export const MINIMUM_CLOUDFLARE_BALANCE = 2.0; // USD

/**
 * Cloudflare credits threshold below which the credits banner is shown.
 * When a connected user has more than this, the banner is hidden.
 */
export const CREDITS_BANNER_THRESHOLD = 10; // USD

/**
 * Error messages for limit violations
 */
export const LIMIT_ERROR_MESSAGES = {
	USAGE_LIMIT_EXCEEDED: 'Usage limits exceeded. Please upgrade or use your own API keys.',
	INSUFFICIENT_BALANCE: `Cloudflare AI Gateway balance is below $${MINIMUM_CLOUDFLARE_BALANCE}. Please add credits or use BYOK.`,
	NO_CLOUDFLARE_TOKEN: 'Cloudflare OAuth token required. Please connect your account.',
	CLOUDFLARE_NOT_CONFIGURED: 'Cloudflare account and gateway not configured.',
} as const;

/**
 * Check if balance is sufficient
 */
export function hasMinimumBalance(balance: number | null | undefined): boolean {
	if (balance === null || balance === undefined) {
		return false;
	}
	return balance >= MINIMUM_CLOUDFLARE_BALANCE;
}

/**
 * Check if user can proceed based on limits and balance
 */
export interface CanProceedResult {
	allowed: boolean;
	reason?: string;
	shouldUseByok: boolean;
}

export function canProceedWithRequest(data: {
	withinLimits: boolean;
	hasUserToken: boolean;
	balance?: number | null;
}): CanProceedResult {
	const { withinLimits, hasUserToken, balance } = data;

	// If within free tier limits, always allow
	if (withinLimits) {
		return { allowed: true, shouldUseByok: false };
	}

	// Free tier exceeded - need user's own keys or sufficient balance
	if (!hasUserToken) {
		return {
			allowed: false,
			reason: LIMIT_ERROR_MESSAGES.NO_CLOUDFLARE_TOKEN,
			shouldUseByok: true,
		};
	}

	// Has token - check balance
	if (!hasMinimumBalance(balance)) {
		return {
			allowed: false,
			reason: LIMIT_ERROR_MESSAGES.INSUFFICIENT_BALANCE,
			shouldUseByok: true,
		};
	}

	// Has token and sufficient balance - allow with user's keys
	return { allowed: true, shouldUseByok: true };
}
