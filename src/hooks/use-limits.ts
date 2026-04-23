/**
 * Hook for fetching and managing usage limits
 */

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

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
	config: {
		userId: string;
		limit: LimitConfig;
		unlimited: boolean;
		notes?: string;
		createdAt: string;
		updatedAt: string;
	};
	usage: Usage;
	limitCheck: LimitCheckResult;
	hasUserToken: boolean;
	hasCloudflareConfigured: boolean;
	cloudflareCredits?: {
		credits: number;
		currency: string;
		gatewayName?: string;
		accountName?: string;
		accountId?: string;
	} | null;
}

export function useLimits() {
	const [data, setData] = useState<UsageSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchLimits = async () => {
		try {
			setLoading(true);
			setError(null);
			
			// Use API client - this will automatically include X-Cloudflare-Token header
			const result = await apiClient.getLimitsUsage();
			
			// apiClient returns { success, data, message?, error? }
			if (result.success && result.data) {
				setData(result.data as UsageSummary);
			} else {
				setError(result.error?.message || 'Failed to load usage data');
			}
		} catch (err) {
			console.error('Error fetching limits:', err);
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchLimits();
	}, []);

	return {
		data,
		loading,
		error,
		refetch: fetchLimits,
	};
}
