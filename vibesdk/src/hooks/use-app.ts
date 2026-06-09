import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { AppDetailsData } from '@/api-types';

export function useApp(appId: string | undefined) {
  // Always declare hooks in the same order to satisfy React Rules of Hooks
  const [app, setApp] = useState<AppDetailsData | null>(null);
  const [loading, setLoading] = useState<boolean>(!!appId && appId !== 'new');
  const [error, setError] = useState<string | null>(null);

  const fetchApp = useCallback(async () => {
    // Guard: if no valid appId or it's a new app, reset state and skip fetching
    if (!appId || appId === 'new') {
      setApp(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getAppDetails(appId);
      setApp(response.data || null);
      setError(null);
    } catch (err) {
      console.error('Error fetching app:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch app');
      setApp(null);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void fetchApp();
  }, [fetchApp]);

  return { app, loading, error, refetch: fetchApp };
}
