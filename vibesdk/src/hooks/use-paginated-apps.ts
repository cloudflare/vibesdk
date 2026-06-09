import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { EnhancedAppData, AppWithUserAndStats, PaginationInfo, TimePeriod, AppSortOption } from '@/api-types';
import { appEvents } from '@/lib/app-events';

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

interface PaginationState {
  currentPage: number;
  totalCount: number;
  hasMore: boolean;
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

export function usePaginatedApps(options: UsePaginatedAppsOptions): UsePaginatedAppsResult {
  const hasInitialized = useRef(false);
  const currentPageRef = useRef(1);
  const isLoadingMoreRef = useRef(false);
  
  const [filterState, setFilterState] = useState<FilterState>({
    searchQuery: '',
    filterFramework: options.defaultFramework || 'all',
    filterVisibility: options.defaultVisibility || 'all',
    sortBy: options.defaultSort || 'recent',
    period: options.defaultPeriod || 'all'
  });

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [apps, setApps] = useState<AppListData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [paginationState, setPaginationState] = useState<PaginationState>({
    currentPage: 1,
    totalCount: 0,
    hasMore: false
  });

  const limit = options.limit || 20;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(filterState.searchQuery);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [filterState.searchQuery]);

  const fetchAppsInternal = useCallback(async (
    append: boolean,
    targetPage: number | undefined,
    filters: {
      sortBy: AppSortOption;
      period: TimePeriod;
      filterFramework: string;
      filterVisibility: string;
      searchQuery: string;
    }
  ) => {
    try {
      if (!append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const page = targetPage ?? (append ? currentPageRef.current + 1 : 1);

      const params = {
        page,
        limit,
        sort: filters.sortBy,
        period: filters.period,
        framework: filters.filterFramework === 'all' ? undefined : filters.filterFramework,
        search: filters.searchQuery || undefined,
        visibility: (options.includeVisibility && filters.filterVisibility !== 'all') ? filters.filterVisibility : undefined,
      };

      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined)
      );

      const response = options.type === 'user' 
        ? await apiClient.getUserAppsWithPagination(cleanParams)
        : await apiClient.getPublicApps(cleanParams);

      if (response.success && response.data) {
        const responseData = response.data as { apps: AppListData[]; pagination: PaginationInfo };
        const newApps = responseData.apps;
        const newPagination = responseData.pagination;

        if (append) {
          setApps(prev => [...prev, ...newApps]);
        } else {
          setApps(newApps);
        }

        currentPageRef.current = page;
        setPaginationState({
          currentPage: page,
          totalCount: newPagination.total,
          hasMore: newPagination.hasMore
        });
      } else {
        throw new Error(response.error?.message || 'Failed to fetch apps');
      }
    } catch (err) {
      console.error('Error fetching apps:', err);
      const errorMessage = err instanceof ApiError 
        ? `${err.message} (${err.status})`
        : err instanceof Error 
          ? err.message 
          : 'Failed to fetch apps';
      setError(errorMessage);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [options.type, options.includeVisibility, limit]);

  // Wrapper that uses current state
  const fetchApps = useCallback(async (append = false, targetPage?: number) => {
    return fetchAppsInternal(append, targetPage, {
      ...filterState,
      searchQuery: debouncedSearchQuery
    });
  }, [fetchAppsInternal, filterState, debouncedSearchQuery]);

  const loadMore = useCallback(async () => {
    // Use the current state directly to avoid stale closure
    if (paginationState.hasMore && !loadingMore && !loading) {
      isLoadingMoreRef.current = true;
      await fetchApps(true);
      isLoadingMoreRef.current = false;
    }
  }, [paginationState.hasMore, loadingMore, loading, fetchApps]);

  const refetch = useCallback(async () => {
    await fetchApps(false, 1);
  }, [fetchApps]);

  const removeApp = useCallback((appId: string) => {
    setApps(prev => prev.filter(app => app.id !== appId));
    setPaginationState(prev => ({ 
      ...prev, 
      totalCount: Math.max(0, prev.totalCount - 1) 
    }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setFilterState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // Force immediate search by setting debounced value and triggering fetch
    setDebouncedSearchQuery(filterState.searchQuery);
  }, [filterState.searchQuery]);

  const handleSortChange = useCallback((newSort: string) => {
    const sort = newSort as AppSortOption;
    setFilterState(prev => ({ ...prev, sortBy: sort }));
  }, []);

  const handlePeriodChange = useCallback((newPeriod: TimePeriod) => {
    setFilterState(prev => ({ ...prev, period: newPeriod }));
  }, []);

  const handleFrameworkChange = useCallback((framework: string) => {
    setFilterState(prev => ({ ...prev, filterFramework: framework }));
  }, []);

  const handleVisibilityChange = useCallback((visibility: string) => {
    setFilterState(prev => ({ ...prev, filterVisibility: visibility }));
  }, []);

  // Single consolidated effect for fetching apps
  useEffect(() => {
    // Skip if autoFetch is disabled and not initialized
    if (options.autoFetch === false && !hasInitialized.current) {
      return;
    }

    // Skip if we're currently loading more (pagination)
    if (isLoadingMoreRef.current) {
      return;
    }

    // Reset pagination when filters change
    currentPageRef.current = 1;

    // Fetch apps with current filters
    const performFetch = async () => {
      await fetchAppsInternal(false, 1, {
        sortBy: filterState.sortBy,
        period: filterState.period,
        filterFramework: filterState.filterFramework,
        filterVisibility: filterState.filterVisibility,
        searchQuery: debouncedSearchQuery
      });
    };

    performFetch();
    hasInitialized.current = true;
  }, [
    // Only re-fetch when actual filter values change
    filterState.sortBy,
    filterState.period,
    filterState.filterFramework,
    filterState.filterVisibility,
    debouncedSearchQuery,
    fetchAppsInternal,
    options.autoFetch
  ]);

  useEffect(() => {
    const unsubscribe = appEvents.on('app-deleted', (event) => {
      removeApp(event.appId);
    });
    return unsubscribe;
  }, [removeApp]);

  const pagination: PaginationInfo = {
    limit,
    offset: (paginationState.currentPage - 1) * limit,
    total: paginationState.totalCount,
    hasMore: paginationState.hasMore
  };

  return {
    searchQuery: filterState.searchQuery,
    filterFramework: filterState.filterFramework,
    filterVisibility: options.includeVisibility ? filterState.filterVisibility : 'all',
    sortBy: filterState.sortBy,
    period: filterState.period,
    
    apps,
    loading,
    loadingMore,
    error,
    pagination,
    hasMore: paginationState.hasMore,
    totalCount: paginationState.totalCount,
    
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