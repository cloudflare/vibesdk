/**
 * Hook for fetching and managing usage limits
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/auth-context';

export interface LimitConfig {
	type: 'prompts' | 'tokens' | 'cost' | 'credits';
	window: 'daily' | 'weekly' | 'monthly' | 'lifetime' | 'rolling';
	maxValue: number;
	enabled: boolean;
	/** For rolling windows: duration of the window in seconds. */
	periodSeconds?: number;
	/** ISO timestamp when this limit window resets. Preferred over client-side computation. */
	resetAt?: string;
}

export interface UsageByType {
	daily?: number;
	weekly?: number;
	monthly?: number;
	lifetime?: number;
	rolling?: number;
}

export interface Usage {
	prompts?: UsageByType;
	tokens?: UsageByType;
	cost?: UsageByType;
	credits?: UsageByType;
}

export interface LimitCheckResult {
	withinLimits: boolean;
	exceededLimits: Array<{
		type: string;
		window: string;
		current: number;
		max: number;
		percentUsed: number;
	}>;
	shouldUseUserKey: boolean;
	message: string;
}

export interface UsageSummary {
	cloudflareConnectEnabled: boolean;
	config: {
		/**
		 * Only present when the user has a finite quota. Omitted when
		 * `unlimited` is true (an infinite `maxValue` cannot be represented
		 * safely in JSON — it would serialise to `null`).
		 */
		limit?: LimitConfig;
		unlimited: boolean;
	};
	usage: Usage;
	limitCheck: LimitCheckResult;
	hasUserToken: boolean;
	hasCloudflareConfigured: boolean;
	/** Whether a Cloudflare AI Gateway is connected, regardless of the toggle. */
	aiGatewayConnected: boolean;
	/** Resolved AI Gateway usage toggle (effective value). */
	aiGatewayEnabled: boolean;
	/** Whether the toggle was explicitly set by the user vs. derived default. */
	aiGatewayPreferenceExplicit: boolean;
	cloudflareCredits?: {
		credits: number;
		currency: string;
		gatewayName?: string;
		accountName?: string;
		accountId?: string;
	} | null;
}

export async function fetchLimitsUsage(): Promise<UsageSummary> {
	const result = await apiClient.getLimitsUsage();
	if (result.success && result.data) {
		return result.data as UsageSummary;
	}
	throw new Error(result.error?.message || 'Failed to load usage data');
}

export function useLimits() {
	const { user } = useAuth();
	const enabled = !!user;

	const query = useQuery({
		queryKey: queryKeys.account.limits.usage(user?.id),
		queryFn: fetchLimitsUsage,
		enabled,
	});

	return {
		data: query.data ?? null,
		loading: enabled && query.isLoading,
		error: query.error
			? query.error instanceof Error
				? query.error.message
				: 'Unknown error'
			: null,
		refetch: async () => {
			await query.refetch();
		},
	};
}
