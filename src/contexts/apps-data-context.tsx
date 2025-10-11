import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AppWithFavoriteStatus } from '@/api-types';
import { appEvents } from '@/lib/app-events';
import type { AppEvent, AppDeletedEvent, AppUpdatedEvent } from '@/lib/app-events';
import { useAuth } from '@/contexts/auth-context';

interface AppsDataState {
  allApps: AppWithFavoriteStatus[];
  favoriteApps: AppWithFavoriteStatus[];
  recentApps: AppWithFavoriteStatus[];
  loading: {
    allApps: boolean;
    favoriteApps: boolean;
  };
  error: {
    allApps: string | null;
    favoriteApps: string | null;
  };
  moreRecentAvailable: boolean;
}

interface AppsDataContextValue extends AppsDataState {
  refetchAllApps: () => void;
  refetchFavoriteApps: () => void;
  refetchAll: () => void;
}

const AppsDataContext = createContext<AppsDataContextValue | null>(null);

const RECENT_APPS_LIMIT = 10;

interface AppsDataProviderProps {
  children: React.ReactNode;
}

export function AppsDataProvider({ children }: AppsDataProviderProps) {
  const { user } = useAuth();
  
  const [state, setState] = useState<AppsDataState>({
    allApps: [],
    favoriteApps: [],
    recentApps: [],
    loading: {
      allApps: true,
      favoriteApps: true,
    },
    error: {
      allApps: null,
      favoriteApps: null,
    },
    moreRecentAvailable: false,
  });

  // Compute recent apps from all apps to avoid duplicate API calls
  const computeRecentApps = useCallback((apps: AppWithFavoriteStatus[]) => {
    const sortedApps = [...apps].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    
    return {
      recentApps: sortedApps.slice(0, RECENT_APPS_LIMIT),
      moreRecentAvailable: sortedApps.length > RECENT_APPS_LIMIT,
    };
  }, []);

  // Fetch all apps
  const fetchAllApps = useCallback(async () => {
    if (!user) {
      setState(prev => ({
        ...prev,
        allApps: [],
        ...computeRecentApps([]),
        loading: { ...prev.loading, allApps: false },
        error: { ...prev.error, allApps: null },
      }));
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, allApps: true },
        error: { ...prev.error, allApps: null },
      }));

      const response = await apiClient.getUserApps();
      
      if (response.success) {
        const apps = response.data?.apps || [];
        const { recentApps, moreRecentAvailable } = computeRecentApps(apps);
        
        setState(prev => ({
          ...prev,
          allApps: apps,
          recentApps,
          moreRecentAvailable,
          loading: { ...prev.loading, allApps: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, allApps: false },
          error: { ...prev.error, allApps: response.error?.message || 'Failed to fetch apps' },
        }));
      }
    } catch (err) {
      console.error('Error fetching all apps:', err);
      const errorMessage = err instanceof ApiError 
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch apps';
      
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, allApps: false },
        error: { ...prev.error, allApps: errorMessage },
      }));
    }
  }, [user, computeRecentApps]);

  // Fetch favorite apps
  const fetchFavoriteApps = useCallback(async () => {
    if (!user) {
      setState(prev => ({
        ...prev,
        favoriteApps: [],
        loading: { ...prev.loading, favoriteApps: false },
        error: { ...prev.error, favoriteApps: null },
      }));
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, favoriteApps: true },
        error: { ...prev.error, favoriteApps: null },
      }));

      const response = await apiClient.getFavoriteApps();
      
      if (response.success) {
        setState(prev => ({
          ...prev,
          favoriteApps: response.data?.apps || [],
          loading: { ...prev.loading, favoriteApps: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, favoriteApps: false },
          error: { ...prev.error, favoriteApps: response.error?.message || 'Failed to fetch favorite apps' },
        }));
      }
    } catch (err) {
      console.error('Error fetching favorite apps:', err);
      const errorMessage = err instanceof ApiError
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch favorite apps';
      
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, favoriteApps: false },
        error: { ...prev.error, favoriteApps: errorMessage },
      }));
    }
  }, [user]);

  // Parallel fetch both data sets
  const fetchAll = useCallback(async () => {
    if (!user) return;
    
    // Execute both API calls in parallel
    await Promise.all([
      fetchAllApps(),
      fetchFavoriteApps(),
    ]);
  }, [user, fetchAllApps, fetchFavoriteApps]);

  // Initial data load with parallel fetching
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Event handlers for real-time updates
  useEffect(() => {
    const onDeleted = (event: AppEvent) => {
      if (event.type === 'app-deleted') {
        const deletedEvent = event as AppDeletedEvent;
        setState(prev => {
          const filteredAllApps = prev.allApps.filter(app => app.id !== deletedEvent.appId);
          const filteredFavoriteApps = prev.favoriteApps.filter(app => app.id !== deletedEvent.appId);
          const { recentApps, moreRecentAvailable } = computeRecentApps(filteredAllApps);
          
          return {
            ...prev,
            allApps: filteredAllApps,
            favoriteApps: filteredFavoriteApps,
            recentApps,
            moreRecentAvailable,
          };
        });
      }
    };
    
    const onCreated = () => {
      // Refetch all data when new app is created
      fetchAll();
    };
    
    const onUpdated = (event: AppEvent) => {
      if (event.type === 'app-updated') {
        const updatedEvent = event as AppUpdatedEvent;
        if (updatedEvent.data) {
          setState(prev => {
            // Update all apps
            const updatedAllApps = prev.allApps.map(app => 
              app.id === updatedEvent.appId 
                ? { ...app, ...updatedEvent.data, updatedAt: new Date() }
                : app
            );
            
            // Update favorite apps if present
            const updatedFavoriteApps = prev.favoriteApps.map(app =>
              app.id === updatedEvent.appId
                ? { ...app, ...updatedEvent.data, updatedAt: new Date() }
                : app
            );
            
            // Recompute recent apps with updated data
            const { recentApps, moreRecentAvailable } = computeRecentApps(updatedAllApps);
            
            return {
              ...prev,
              allApps: updatedAllApps,
              favoriteApps: updatedFavoriteApps,
              recentApps,
              moreRecentAvailable,
            };
          });
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
  }, [fetchAll, computeRecentApps]);

  const contextValue = useMemo<AppsDataContextValue>(() => ({
    ...state,
    refetchAllApps: fetchAllApps,
    refetchFavoriteApps: fetchFavoriteApps,
    refetchAll: fetchAll,
  }), [state, fetchAllApps, fetchFavoriteApps, fetchAll]);

  return (
    <AppsDataContext.Provider value={contextValue}>
      {children}
    </AppsDataContext.Provider>
  );
}

export function useAppsData() {
  const context = useContext(AppsDataContext);
  if (!context) {
    throw new Error('useAppsData must be used within an AppsDataProvider');
  }
  return context;
}
