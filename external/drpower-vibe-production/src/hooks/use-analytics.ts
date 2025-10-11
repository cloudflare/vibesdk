import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';
import type { UserAnalyticsResponseData, AgentAnalyticsResponseData } from '@/api-types';

export function useUserAnalytics(userId?: string, days?: number, autoRefresh = false, refreshInterval = 30000) {
  const { isAuthenticated, user } = useAuth();
  const [analytics, setAnalytics] = useState<UserAnalyticsResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveUserId = userId || user?.id;

  const fetchAnalytics = useCallback(async () => {
    if (!isAuthenticated || !effectiveUserId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await apiClient.getUserAnalytics(effectiveUserId, days);
      setAnalytics(response.data || null);
    } catch (err) {
      console.error('Error fetching user analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, effectiveUserId, days]);

  useEffect(() => {
    fetchAnalytics();

    // Set up auto-refresh if enabled
    if (autoRefresh && isAuthenticated && effectiveUserId) {
      intervalRef.current = setInterval(fetchAnalytics, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAnalytics, autoRefresh, refreshInterval, isAuthenticated, effectiveUserId]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refresh };
}

export function useAgentAnalytics(agentId: string, days?: number, autoRefresh = false, refreshInterval = 30000) {
  const { isAuthenticated } = useAuth();
  const [analytics, setAnalytics] = useState<AgentAnalyticsResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!isAuthenticated || !agentId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await apiClient.getAgentAnalytics(agentId, days);
      setAnalytics(response.data || null);
    } catch (err) {
      console.error('Error fetching agent analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, agentId, days]);

  useEffect(() => {
    fetchAnalytics();

    // Set up auto-refresh if enabled
    if (autoRefresh && isAuthenticated && agentId) {
      intervalRef.current = setInterval(fetchAnalytics, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAnalytics, autoRefresh, refreshInterval, isAuthenticated, agentId]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refresh };
}