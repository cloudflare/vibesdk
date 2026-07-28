import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { UserStats, UserActivity } from '@/api-types';

function getErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ApiError) {
		return err.message;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return fallback;
}

async function fetchUserStats(): Promise<UserStats | null> {
	const response = await apiClient.getUserStats();
	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to fetch stats');
	}
	return response.data ?? null;
}

async function fetchUserActivity(): Promise<UserActivity[]> {
	const response = await apiClient.getUserActivity();
	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to fetch activity');
	}
	return response.data?.activities ?? [];
}

export function useUserStats() {
	const { user, isAuthenticated } = useAuth();

	const query = useQuery({
		// User-scoped: stats must not leak across account switches.
		queryKey: queryKeys.account.user.stats(user?.id),
		queryFn: fetchUserStats,
		enabled: isAuthenticated,
	});

	return {
		stats: query.data ?? null,
		loading: isAuthenticated && query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch stats')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}

export function useUserActivity() {
	const { user, isAuthenticated } = useAuth();

	const query = useQuery({
		queryKey: queryKeys.account.user.activity(user?.id),
		queryFn: fetchUserActivity,
		enabled: isAuthenticated,
	});

	return {
		activities: query.data ?? [],
		loading: isAuthenticated && query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch activity')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}
