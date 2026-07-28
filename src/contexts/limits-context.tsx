/**
 * Limits Context
 * Provides usage limits data across the application with a single API call
 */

import {
	createContext,
	useContext,
	ReactNode,
	useEffect,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	fetchLimitsUsage,
	type UsageSummary,
} from '@/hooks/use-limits';
import { useAuth } from './auth-context';
import { queryKeys } from '@/lib/query-keys';
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
	const enabled = !!user;

	const query = useQuery({
		queryKey: queryKeys.account.limits.usage(user?.id),
		queryFn: fetchLimitsUsage,
		enabled,
	});

	// Listen for usage updates via WebSocket/events
	useEffect(() => {
		const handleUsageUpdate = () => {
			console.log('[Limits Context] Usage updated, refetching limits...');
			void query.refetch();
		};

		// Listen for custom event dispatched after AI requests complete
		window.addEventListener('usage-updated', handleUsageUpdate);

		return () => {
			window.removeEventListener('usage-updated', handleUsageUpdate);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [query.refetch]);

	// Check if user can proceed with request
	const canProceed = (): CanProceedResult => {
		if (!query.data) {
			return {
				allowed: false,
				reason: 'Loading usage data...',
				shouldUseByok: false,
			};
		}

		return canProceedWithRequest({
			withinLimits: query.data.limitCheck.withinLimits,
			hasUserToken: query.data.hasUserToken,
			balance: query.data.cloudflareCredits?.credits,
		});
	};

	const value: LimitsContextValue = {
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
