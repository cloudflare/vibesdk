/**
 * Limits Context
 * Provides usage limits data across the application with a single API call
 */

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { UsageSummary } from '@/hooks/use-limits';
import { useAuth } from './auth-context';
import { apiClient } from '@/lib/api-client';
import { canProceedWithRequest, type CanProceedResult } from '../../shared/constants/limits';

interface LimitsContextValue {
	data: UsageSummary | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	canProceed: () => CanProceedResult;
}

const LimitsContext = createContext<LimitsContextValue | undefined>(undefined);

interface LimitsProviderProps {
	children: ReactNode;
}

export function LimitsProvider({ children }: LimitsProviderProps) {
	const { user } = useAuth();
	const [data, setData] = useState<UsageSummary | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchLimits = async () => {
		// Only fetch if user is authenticated
		if (!user) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			
			// Use API client - auth (including encrypted Cloudflare OAuth token)
			// is read server-side from the HttpOnly cookie.
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

	// Fetch limits when user changes
	useEffect(() => {
		fetchLimits();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.id]);

	// Listen for usage updates via WebSocket/events
	useEffect(() => {
		const handleUsageUpdate = () => {
			console.log('[Limits Context] Usage updated, refetching limits...');
			fetchLimits();
		};

		// Listen for custom event dispatched after AI requests complete
		window.addEventListener('usage-updated', handleUsageUpdate);

		return () => {
			window.removeEventListener('usage-updated', handleUsageUpdate);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Check if user can proceed with request
	const canProceed = (): CanProceedResult => {
		if (!data) {
			return {
				allowed: false,
				reason: 'Loading usage data...',
				shouldUseByok: false,
			};
		}

		return canProceedWithRequest({
			withinLimits: data.limitCheck.withinLimits,
			hasUserToken: data.hasUserToken,
			balance: data.cloudflareCredits?.credits,
		});
	};

	const value: LimitsContextValue = {
		data,
		loading,
		error,
		refetch: fetchLimits,
		canProceed,
	};

	return (
		<LimitsContext.Provider value={value}>
			{children}
		</LimitsContext.Provider>
	);
}

/**
 * Hook to access limits context
 * Must be used within a LimitsProvider
 */
export function useLimitsContext(): LimitsContextValue {
	const context = useContext(LimitsContext);
	
	if (context === undefined) {
		throw new Error('useLimitsContext must be used within a LimitsProvider');
	}
	
	return context;
}
