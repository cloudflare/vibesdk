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

	return useMutation({
		mutationFn: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const response = await apiClient.toggleFavorite(appId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to toggle favorite',
				);
			}
			return response.data.isFavorite;
		},
		onSuccess: (isFavorite) => {
			if (!appId) return;

			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(appId, user?.id),
				(prev) =>
					prev ? { ...prev, userFavorited: isFavorite } : prev,
			);
			void invalidateAppsQueries(queryClient);
		},
	});
}

export function useToggleAppStar(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	return useMutation({
		mutationFn: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const response = await apiClient.toggleAppStar(appId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to star app',
				);
			}
			return response.data;
		},
		onSuccess: (data) => {
			if (!appId) return;

			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(appId, user?.id),
				(prev) =>
					prev
						? {
								...prev,
								userStarred: data.isStarred,
								starCount: data.starCount,
							}
						: prev,
			);
		},
	});
}

export function useUpdateAppVisibility(appId: string | undefined) {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	return useMutation({
		mutationFn: async (visibility: AppDetailsData['visibility']) => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const response = await apiClient.updateAppVisibility(
				appId,
				visibility,
			);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to update visibility',
				);
			}
			return { visibility, message: response.data.message };
		},
		onSuccess: ({ visibility }) => {
			if (!appId) return;

			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(appId, user?.id),
				(prev) => (prev ? { ...prev, visibility } : prev),
			);
			void invalidateAppsQueries(queryClient);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.apps.previewTokenAll(appId),
			});
		},
	});
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

	return useMutation({
		mutationFn: async () => {
			if (!appId) {
				throw new Error('App ID is required');
			}
			const response = await apiClient.deployPreview(appId);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to start deployment',
				);
			}
			return response.data;
		},
		onSuccess: (data) => {
			if (!appId) return;
			if (!data.previewURL && !data.tunnelURL) return;

			const previewURL = getPreviewUrl(data.previewURL, data.tunnelURL);

			queryClient.setQueryData<AppDetailsData>(
				queryKeys.account.apps.detail(appId, user?.id),
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
}
