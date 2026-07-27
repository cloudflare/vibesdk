import { useEffect } from 'react';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AppDetailsData } from '@/api-types';
import { queryKeys } from '@/lib/query-keys';
import { invalidateAppsQueries } from '@/hooks/use-apps';
import { appEvents } from '@/lib/app-events';
import { getPreviewUrl } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';

function getErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ApiError) {
		if (err.status === 404) {
			return 'App not found';
		}
		return `Failed to load app: ${err.message}`;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return fallback;
}

export async function fetchAppDetails(
	appId: string,
): Promise<AppDetailsData> {
	const response = await apiClient.getAppDetails(appId);
	if (!response.success || !response.data) {
		throw new Error(
			response.error?.message || 'Failed to fetch app details',
		);
	}
	return response.data;
}

export function useApp(appId: string | undefined) {
	const { user } = useAuth();
	const enabled = !!appId && appId !== 'new';

	const query = useQuery({
		queryKey: queryKeys.account.apps.detail(appId ?? '', user?.id),
		queryFn: () => fetchAppDetails(appId!),
		enabled,
		staleTime: 0,
		refetchOnMount: true,
	});

	return {
		app: query.data ?? null,
		loading: enabled && query.isLoading,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch app')
			: null,
		refetch: () => {
			void query.refetch();
		},
	};
}

export function useAppPreviewToken(
	appId: string | undefined,
	enabled: boolean,
) {
	const { user } = useAuth();
	const query = useQuery({
		queryKey: queryKeys.account.apps.previewToken(appId ?? '', user?.id),
		queryFn: async () => {
			const response = await apiClient.generatePreviewToken(appId!);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message ||
						'Failed to generate preview token',
				);
			}
			return response.data.previewUrl;
		},
		enabled: !!appId && enabled,
		staleTime: 5 * 60_000,
		retry: false,
	});

	return {
		previewUrl: enabled ? (query.data ?? null) : null,
		loading: query.isLoading,
		error: query.error,
	};
}

export function useToggleAppFavorite(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const mutation = useMutation({
		mutationFn: async (targetAppId: string) => {
			const response = await apiClient.toggleFavorite(targetAppId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to toggle favorite',
				);
			}
			return { appId: targetAppId, isFavorite: response.data.isFavorite };
		},
		onSuccess: ({ appId: targetAppId, isFavorite }) => {
			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(targetAppId, user?.id),
				(prev) =>
					prev ? { ...prev, userFavorited: isFavorite } : prev,
			);
			void invalidateAppsQueries(queryClient);
		},
	});
	const { reset, mutateAsync } = mutation;

	// Route reuses this component across /app/:id — clear stale pending/error.
	useEffect(() => {
		reset();
	}, [appId, reset]);

	return {
		...mutation,
		mutateAsync: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const result = await mutateAsync(appId);
			return result.isFavorite;
		},
	};
}

export function useToggleAppStar(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const mutation = useMutation({
		mutationFn: async (targetAppId: string) => {
			const response = await apiClient.toggleAppStar(targetAppId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to star app',
				);
			}
			return { appId: targetAppId, ...response.data };
		},
		onSuccess: ({ appId: targetAppId, isStarred, starCount }) => {
			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(targetAppId, user?.id),
				(prev) =>
					prev
						? {
								...prev,
								userStarred: isStarred,
								starCount,
							}
						: prev,
			);
		},
	});
	const { reset, mutateAsync } = mutation;

	// Route reuses this component across /app/:id — clear stale pending/error.
	useEffect(() => {
		reset();
	}, [appId, reset]);

	return {
		...mutation,
		mutateAsync: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const { appId: _id, ...data } = await mutateAsync(appId);
			return data;
		},
	};
}

export function useUpdateAppVisibility(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const mutation = useMutation({
		mutationFn: async ({
			appId: targetAppId,
			visibility,
		}: {
			appId: string;
			visibility: AppDetailsData['visibility'];
		}) => {
			const response = await apiClient.updateAppVisibility(
				targetAppId,
				visibility,
			);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to update visibility',
				);
			}
			return {
				appId: targetAppId,
				visibility,
				message: response.data.message,
			};
		},
		onSuccess: ({ appId: targetAppId, visibility }) => {
			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(targetAppId, user?.id),
				(prev) => (prev ? { ...prev, visibility } : prev),
			);
			void invalidateAppsQueries(queryClient);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.apps.previewTokenAll(targetAppId),
			});
		},
	});
	const { reset, mutateAsync } = mutation;

	// Route reuses this component across /app/:id — clear stale pending/error.
	useEffect(() => {
		reset();
	}, [appId, reset]);

	return {
		...mutation,
		mutateAsync: async (visibility: AppDetailsData['visibility']) => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const result = await mutateAsync({ appId, visibility });
			return { visibility: result.visibility, message: result.message };
		},
	};
}

export function useDeleteApp() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (appId: string) => {
			const response = await apiClient.deleteApp(appId);
			if (!response.success) {
				throw new Error(
					response.error?.message || 'Failed to delete app',
				);
			}
			return appId;
		},
		onSuccess: (appId) => {
			queryClient.removeQueries({
				queryKey: queryKeys.account.apps.detailAll(appId),
			});
			queryClient.removeQueries({
				queryKey: queryKeys.account.apps.previewTokenAll(appId),
			});
			void invalidateAppsQueries(queryClient);
			appEvents.emitAppDeleted(appId);
		},
	});
}

export function useDeployPreview(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const mutation = useMutation({
		mutationFn: async (targetAppId: string) => {
			const response = await apiClient.deployPreview(targetAppId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to start deployment',
				);
			}
			return response.data;
		},
		onSuccess: (data, targetAppId) => {
			if (!data.previewURL && !data.tunnelURL) return;

			const previewURL = getPreviewUrl(data.previewURL, data.tunnelURL);

			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(targetAppId, user?.id),
				(prev) =>
					prev
						? {
								...prev,
								cloudflareUrl: previewURL,
								previewUrl: previewURL,
							}
						: prev,
			);
		},
	});
	const { reset, mutateAsync } = mutation;

	// Route reuses this component across /app/:id — clear stale pending/error.
	useEffect(() => {
		reset();
	}, [appId, reset]);

	return {
		...mutation,
		mutateAsync: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			return mutateAsync(appId);
		},
	};
}
