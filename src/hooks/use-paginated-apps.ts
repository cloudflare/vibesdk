import { useState, useEffect, useCallback, useMemo } from 'react';
import {
	useInfiniteQuery,
	useQueryClient,
	type InfiniteData,
} from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import type {
	EnhancedAppData,
	AppWithUserAndStats,
	PaginationInfo,
	TimePeriod,
	AppSortOption,
} from '@/api-types';
import { appEvents } from '@/lib/app-events';
import {
	queryKeys,
	type PaginatedAppsListFilters,
} from '@/lib/query-keys';

export type AppType = 'user' | 'public';
export type AppListData = EnhancedAppData | AppWithUserAndStats;

interface UsePaginatedAppsOptions {
	type: AppType;
	defaultSort?: AppSortOption;
	defaultPeriod?: TimePeriod;
	defaultFramework?: string;
	defaultVisibility?: string;
	includeVisibility?: boolean;
	limit?: number;
	autoFetch?: boolean;
}

interface FilterState {
	searchQuery: string;
	filterFramework: string;
	filterVisibility: string;
	sortBy: AppSortOption;
	period: TimePeriod;
}

interface UsePaginatedAppsResult extends FilterState {
	apps: AppListData[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	pagination: PaginationInfo;
	hasMore: boolean;
	totalCount: number;

	setSearchQuery: (query: string) => void;
	handleSearchSubmit: (e: React.FormEvent) => void;
	handleSortChange: (sort: string) => void;
	handlePeriodChange: (period: TimePeriod) => void;
	handleFrameworkChange: (framework: string) => void;
	handleVisibilityChange: (visibility: string) => void;

	refetch: () => Promise<void>;
	loadMore: () => Promise<void>;
	removeApp: (appId: string) => void;
}

interface PaginatedAppsPage {
	apps: AppListData[];
	pagination: PaginationInfo;
}

const LIST_GC_TIME = 2 * 60_000;
const LIST_STALE_TIME = 30_000;

function getErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ApiError) {
		return `${err.message} (${err.status})`;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return fallback;
}

async function fetchPaginatedAppsPage(
	type: AppType,
	includeVisibility: boolean | undefined,
	filters: {
		sortBy: AppSortOption;
		period: TimePeriod;
		filterFramework: string;
		filterVisibility: string;
		searchQuery: string;
		limit: number;
	},
	page: number,
): Promise<PaginatedAppsPage> {
	const params = {
		page,
		limit: filters.limit,
		sort: filters.sortBy,
		period: filters.period,
		framework:
			filters.filterFramework === 'all'
				? undefined
				: filters.filterFramework,
		search: filters.searchQuery || undefined,
		visibility:
			includeVisibility && filters.filterVisibility !== 'all'
				? filters.filterVisibility
				: undefined,
	};

	const cleanParams = Object.fromEntries(
		Object.entries(params).filter(([, value]) => value !== undefined),
	);

	const response =
		type === 'user'
			? await apiClient.getUserAppsWithPagination(cleanParams)
			: await apiClient.getPublicApps(cleanParams);

	if (!response.success || !response.data) {
		throw new Error(response.error?.message || 'Failed to fetch apps');
	}

	const responseData = response.data as {
		apps: AppListData[];
		pagination: PaginationInfo;
	};

	return {
		apps: responseData.apps,
		pagination: responseData.pagination,
	};
}

function removeAppFromInfiniteCache(
	data: InfiniteData<PaginatedAppsPage> | undefined,
	appId: string,
): InfiniteData<PaginatedAppsPage> | undefined {
	if (!data) return data;

	let removed = false;
	const pages = data.pages.map((page) => {
		const nextApps = page.apps.filter((app) => {
			if (app.id === appId) {
				removed = true;
				return false;
			}
			return true;
		});
		return nextApps.length === page.apps.length
			? page
			: { ...page, apps: nextApps };
	});

	if (!removed) return data;

	return {
		...data,
		pages: pages.map((page) => ({
			...page,
			pagination: {
				...page.pagination,
				total: Math.max(0, page.pagination.total - 1),
			},
		})),
	};
}

export function usePaginatedApps(
	options: UsePaginatedAppsOptions,
): UsePaginatedAppsResult {
	const queryClient = useQueryClient();
	const limit = options.limit || 20;
	const autoFetch = options.autoFetch !== false;

	const [filterState, setFilterState] = useState<FilterState>({
		searchQuery: '',
		filterFramework: options.defaultFramework || 'all',
		filterVisibility: options.defaultVisibility || 'all',
		sortBy: options.defaultSort || 'recent',
		period: options.defaultPeriod || 'all',
	});

	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setDebouncedSearchQuery(filterState.searchQuery);
		}, 500);
		return () => clearTimeout(timeoutId);
	}, [filterState.searchQuery]);

	const listFilters: PaginatedAppsListFilters = useMemo(
		() => ({
			sort: filterState.sortBy,
			period: filterState.period,
			framework: filterState.filterFramework,
			visibility: options.includeVisibility
				? filterState.filterVisibility
				: 'all',
			search: debouncedSearchQuery,
			limit,
		}),
		[
			filterState.sortBy,
			filterState.period,
			filterState.filterFramework,
			filterState.filterVisibility,
			options.includeVisibility,
			debouncedSearchQuery,
			limit,
		],
	);

	const queryKey =
		options.type === 'user'
			? queryKeys.apps.user(listFilters)
			: queryKeys.apps.public(listFilters);

	const query = useInfiniteQuery({
		queryKey,
		queryFn: ({ pageParam }) =>
			fetchPaginatedAppsPage(
				options.type,
				options.includeVisibility,
				{
					sortBy: filterState.sortBy,
					period: filterState.period,
					filterFramework: filterState.filterFramework,
					filterVisibility: filterState.filterVisibility,
					searchQuery: debouncedSearchQuery,
					limit,
				},
				pageParam,
			),
		initialPageParam: 1,
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.pagination.hasMore ? lastPageParam + 1 : undefined,
		enabled: autoFetch,
		staleTime: LIST_STALE_TIME,
		gcTime: LIST_GC_TIME,
	});

	const apps = useMemo(
		() => query.data?.pages.flatMap((page) => page.apps) ?? [],
		[query.data],
	);

	const lastPage = query.data?.pages[query.data.pages.length - 1];
	const totalCount = lastPage?.pagination.total ?? 0;
	const hasMore = query.hasNextPage ?? false;
	const currentPage = query.data?.pages.length ?? 0;

	const pagination: PaginationInfo = {
		limit,
		offset: Math.max(0, (currentPage - 1) * limit),
		total: totalCount,
		hasMore,
	};

	const removeApp = useCallback(
		(appId: string) => {
			const rootKey =
				options.type === 'user'
					? queryKeys.apps.userAll()
					: queryKeys.apps.publicAll();

			queryClient.setQueriesData<InfiniteData<PaginatedAppsPage>>(
				{ queryKey: rootKey },
				(prev) => removeAppFromInfiniteCache(prev, appId),
			);
		},
		[options.type, queryClient],
	);

	useEffect(() => {
		const unsubscribe = appEvents.on('app-deleted', (event) => {
			removeApp(event.appId);
		});
		return unsubscribe;
	}, [removeApp]);

	const setSearchQuery = useCallback((queryValue: string) => {
		setFilterState((prev) => ({ ...prev, searchQuery: queryValue }));
	}, []);

	const handleSearchSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			setDebouncedSearchQuery(filterState.searchQuery);
		},
		[filterState.searchQuery],
	);

	const handleSortChange = useCallback((newSort: string) => {
		setFilterState((prev) => ({
			...prev,
			sortBy: newSort as AppSortOption,
		}));
	}, []);

	const handlePeriodChange = useCallback((newPeriod: TimePeriod) => {
		setFilterState((prev) => ({ ...prev, period: newPeriod }));
	}, []);

	const handleFrameworkChange = useCallback((framework: string) => {
		setFilterState((prev) => ({ ...prev, filterFramework: framework }));
	}, []);

	const handleVisibilityChange = useCallback((visibility: string) => {
		setFilterState((prev) => ({ ...prev, filterVisibility: visibility }));
	}, []);

	const {
		refetch: queryRefetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
	} = query;

	const refetch = useCallback(async () => {
		await queryRefetch();
	}, [queryRefetch]);

	const loadMore = useCallback(async () => {
		if (hasNextPage && !isFetchingNextPage && !isLoading) {
			await fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

	return {
		searchQuery: filterState.searchQuery,
		filterFramework: filterState.filterFramework,
		filterVisibility: options.includeVisibility
			? filterState.filterVisibility
			: 'all',
		sortBy: filterState.sortBy,
		period: filterState.period,

		apps,
		loading: query.isLoading,
		loadingMore: query.isFetchingNextPage,
		error: query.error
			? getErrorMessage(query.error, 'Failed to fetch apps')
			: null,
		pagination,
		hasMore,
		totalCount,

		setSearchQuery,
		handleSearchSubmit,
		handleSortChange,
		handlePeriodChange,
		handleFrameworkChange,
		handleVisibilityChange,

		refetch,
		loadMore,
		removeApp,
	};
}
