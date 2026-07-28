import { useEffect } from 'react';
import {
	useQuery,
	useQueryClient,
	type QueryClient,
} from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AppDetailsData, AppWithFavoriteStatus } from '@/api-types';
import { appEvents } from '@/lib/app-events';
import type {
	AppDeletedEvent,
	AppEvent,
	AppUpdatedEvent,
} from '@/lib/app-events';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/auth-context';
import { useAuthGuard } from './useAuthGuard';

const RECENT_APPS_LIMIT = 10;

interface AppHookState<T> {
	apps: T[];
	loading: boolean;
	error: string | null;
	refetch: () => void;
}

function getErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ApiError) {
		return `${err.message} (${err.status})`;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return fallback;
}

async function fetchUserApps(): Promise<AppWithFavoriteStatus[]> {
	const response = await apiClient.getUserApps();
	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to fetch apps');
	}
	return response.data?.apps || [];
}

async function fetchFavoriteApps(): Promise<AppWithFavoriteStatus[]> {
	const response = await apiClient.getFavoriteApps();
	if (!response.success) {
		throw new Error(
			response.error?.message || 'Failed to fetch favorite apps',
		);
	}
	return response.data?.apps || [];
}

function computeRecentApps(apps: AppWithFavoriteStatus[]) {
	const sortedApps = [...apps].sort((a, b) => {
		const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
		const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
		return bTime - aTime;
	});

	return {
		recentApps: sortedApps.slice(0, RECENT_APPS_LIMIT),
		moreRecentAvailable: sortedApps.length > RECENT_APPS_LIMIT,
	};
}

function removeAppFromCache(queryClient: QueryClient, appId: string) {
	queryClient.removeQueries({
		queryKey: queryKeys.account.apps.detailAll(appId),
	});
	queryClient.removeQueries({
		queryKey: queryKeys.account.apps.previewTokenAll(appId),
	});
	queryClient.setQueriesData<AppWithFavoriteStatus[]>(
		{ queryKey: queryKeys.account.apps.userAll() },
		(prev) => prev?.filter((app) => app.id !== appId) ?? prev,
	);
	queryClient.setQueriesData<AppWithFavoriteStatus[]>(
		{ queryKey: queryKeys.account.apps.favoritesAll() },
		(prev) => prev?.filter((app) => app.id !== appId) ?? prev,
	);
}

function updateAppInCache(
	queryClient: QueryClient,
	appId: string,
	data: Partial<AppWithFavoriteStatus>,
) {
	const patchListApp = (
		app: AppWithFavoriteStatus,
	): AppWithFavoriteStatus =>
		app.id === appId
			? { ...app, ...data, updatedAt: new Date() }
			: app;
	const patchAppDetails = (app: AppDetailsData): AppDetailsData =>
		app.id === appId
			? { ...app, ...data, updatedAt: new Date() }
			: app;

	queryClient.setQueriesData<AppWithFavoriteStatus[]>(
		{ queryKey: queryKeys.account.apps.userAll() },
		(prev) => prev?.map(patchListApp) ?? prev,
	);
	queryClient.setQueriesData<AppWithFavoriteStatus[]>(
		{ queryKey: queryKeys.account.apps.favoritesAll() },
		(prev) => prev?.map(patchListApp) ?? prev,
	);
	queryClient.setQueriesData<AppDetailsData>(
		{ queryKey: queryKeys.account.apps.detailAll(appId) },
		(prev) => (prev ? patchAppDetails(prev) : prev),
	);
}

export function invalidateAppsQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({
		queryKey: queryKeys.account.apps.all(),
	});
}

/**
 * Keeps the apps query cache in sync with app lifecycle events.
 * Mount once near the app root (inside QueryClientProvider).
 */
export function useAppsQuerySync() {
	const queryClient = useQueryClient();

	useEffect(() => {
		const onDeleted = (event: AppEvent) => {
			if (event.type === 'app-deleted') {
				removeAppFromCache(
					queryClient,
					(event as AppDeletedEvent).appId,
				);
			}
		};

		const onCreated = () => {
			void invalidateAppsQueries(queryClient);
		};

		const onUpdated = (event: AppEvent) => {
			if (event.type === 'app-updated') {
				const updatedEvent = event as AppUpdatedEvent;
				if (updatedEvent.data) {
					updateAppInCache(
						queryClient,
						updatedEvent.appId,
						updatedEvent.data,
					);
				}
			}
		};

		const unsubscribeDeleted = appEvents.on('app-deleted', onDeleted);
		const unsubscribeCreated = appEvents.on('app-created', onCreated);
		const unsubscribeUpdated = appEvents.on('app-updated', onUpdated);

		return () => {
			unsubscribeDeleted();
			unsubscribeCreated();
			unsubscribeUpdated();
		};
	}, [queryClient]);
}

export function useApps(): AppHookState<AppWithFavoriteStatus> {
	const { user } = useAuth();
	const query = useQuery({
		queryKey: queryKeys.account.apps.user(user?.id),
		queryFn: fetchUserApps,
		enabled: !!user,
	});

	return {
		apps: query.data ?? [],
		loading: query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch apps')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}

export function useRecentApps() {
	const { user } = useAuth();
	const query = useQuery({
		queryKey: queryKeys.account.apps.user(user?.id),
		queryFn: fetchUserApps,
		enabled: !!user,
		select: (apps) => computeRecentApps(apps),
	});

	return {
		apps: query.data?.recentApps ?? [],
		moreAvailable: query.data?.moreRecentAvailable ?? false,
		loading: query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch apps')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}

export function useFavoriteApps(): AppHookState<AppWithFavoriteStatus> {
	const { user } = useAuth();
	const query = useQuery({
		queryKey: queryKeys.account.apps.favorites(user?.id),
		queryFn: fetchFavoriteApps,
		enabled: !!user,
	});

	return {
		apps: query.data ?? [],
		loading: query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch favorite apps')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}

export function useRefetchApps() {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	return {
		refetchAll: () => {
			void invalidateAppsQueries(queryClient);
		},
		refetchAllApps: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.apps.user(user?.id),
			});
		},
		refetchFavoriteApps: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.apps.favorites(user?.id),
			});
		},
	};
}

export async function toggleFavorite(appId: string): Promise<boolean> {
	try {
		const response = await apiClient.toggleFavorite(appId);
		if (response.success && response.data) {
			return response.data.isFavorite;
		}
		throw new Error(response.error?.message || 'Failed to toggle favorite');
	} catch (err) {
		if (err instanceof ApiError) {
			throw new Error(`Failed to toggle favorite: ${err.message}`);
		}
		throw err;
	}
}

/**
 * Hook for protected toggle favorite functionality
 */
export function useToggleFavorite() {
	const { requireAuth } = useAuthGuard();

	const protectedToggleFavorite = async (
		appId: string,
		actionContext = 'to favorite this app',
	): Promise<boolean | null> => {
		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext,
			})
		) {
			return null;
		}

		return await toggleFavorite(appId);
	};

	return { toggleFavorite: protectedToggleFavorite };
}
