/**
 * Enhanced Auth Context
 * Provides OAuth + Email/Password authentication with backward compatibility
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { apiClient, ApiError } from '@/lib/api-client';
import { useSentryUser } from '@/hooks/useSentryUser';
import type { AuthSession, AuthUser } from '../api-types';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Auth provider configuration
  authProviders: {
    google: boolean;
    github: boolean;
    email: boolean;
  } | null;
  hasOAuth: boolean;
  requiresEmailAuth: boolean;
  
  // OAuth login method with redirect support
  login: (provider: 'google' | 'github', redirectUrl?: string) => void;
  
  // Email/password login method
  loginWithEmail: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; name?: string }) => Promise<void>;
  
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  
  // Redirect URL management
  setIntendedUrl: (url: string) => void;
  getIntendedUrl: () => string | null;
  clearIntendedUrl: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token refresh interval - refresh every 10 minutes
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour (check less frequently since tokens last 24h)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authProviders, setAuthProviders] = useState<{ google: boolean; github: boolean; email: boolean; } | null>(null);
  const [hasOAuth, setHasOAuth] = useState<boolean>(false);
  const [requiresEmailAuth, setRequiresEmailAuth] = useState<boolean>(true);
  const navigate = useNavigate();
  
  // Sync user context with Sentry for error tracking
  useSentryUser(user);
  
  // Ref to store the refresh timer
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect URL management
  const INTENDED_URL_KEY = 'auth_intended_url';

  const setIntendedUrl = useCallback((url: string) => {
    try {
      sessionStorage.setItem(INTENDED_URL_KEY, url);
    } catch (error) {
      console.warn('Failed to store intended URL:', error);
    }
  }, []);

  const getIntendedUrl = useCallback((): string | null => {
    try {
      return sessionStorage.getItem(INTENDED_URL_KEY);
    } catch (error) {
      console.warn('Failed to retrieve intended URL:', error);
      return null;
    }
  }, []);

  const clearIntendedUrl = useCallback(() => {
    try {
      sessionStorage.removeItem(INTENDED_URL_KEY);
    } catch (error) {
      console.warn('Failed to clear intended URL:', error);
    }
  }, []);


  // Fetch auth providers configuration
  const fetchAuthProviders = useCallback(async () => {
    try {
      const response = await apiClient.getAuthProviders();
      if (response.success && response.data) {
        setAuthProviders(response.data.providers);
        setHasOAuth(response.data.hasOAuth);
        setRequiresEmailAuth(response.data.requiresEmailAuth);
      }
    } catch (error) {
      console.warn('Failed to fetch auth providers:', error);
      // Fallback to defaults
      setAuthProviders({ google: false, github: false, email: true });
      setHasOAuth(false);
      setRequiresEmailAuth(true);
    }
  }, []);

  // Setup automatic session validation (cookie-based)
  const setupTokenRefresh = useCallback(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    // Set up session validation timer - less frequent since cookies handle refresh
    refreshTimerRef.current = setInterval(async () => {
      try {
        const response = await apiClient.getProfile(true);

        if (!response.success) {
          // Session invalid, user needs to login again
          setUser(null);
          setToken(null);
          setSession(null);
          clearInterval(refreshTimerRef.current!);
        }
      } catch (error) {
        console.error('Session validation failed:', error);
      }
    }, TOKEN_REFRESH_INTERVAL);
  }, []);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      const response = await apiClient.getProfile(true);
      
      if (response.success && response.data?.user) {
        setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
        setToken(null); // Profile endpoint doesn't return token, cookies are used
        setSession({
          userId: response.data.user.id,
          email: response.data.user.email,
          sessionId: response.data.sessionId || response.data.user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
        });
        
        // Setup token refresh
        setupTokenRefresh();
      } else {
        setUser(null);
        setToken(null);
        setSession(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setToken(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [setupTokenRefresh]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      await fetchAuthProviders();
      await checkAuth();
    };
    initAuth();
  }, [fetchAuthProviders, checkAuth]);

  // OAuth login method with redirect support
  const login = useCallback((provider: 'google' | 'github', redirectUrl?: string) => {
    // Store intended redirect URL if provided, otherwise use current location
    const intendedUrl = redirectUrl || window.location.pathname + window.location.search;
    setIntendedUrl(intendedUrl);
    
    // Build OAuth URL with redirect parameter
    const oauthUrl = new URL(`/api/auth/oauth/${provider}`, window.location.origin);
    oauthUrl.searchParams.set('redirect_url', intendedUrl);
    
    // Redirect to OAuth provider
    window.location.href = oauthUrl.toString();
  }, [setIntendedUrl]);

  // Email/password login
  const loginWithEmail = useCallback(async (credentials: { email: string; password: string }) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiClient.loginWithEmail(credentials);

      if (response.success && response.data) {
        setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
        setToken(null); // Using cookies for authentication
        setSession({
          userId: response.data.user.id,
          email: response.data.user.email,
          sessionId: response.data.sessionId,
          expiresAt: response.data.expiresAt,
        });
        setupTokenRefresh();
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Connection error. Please try again.');
      }
      // Don't navigate on error - let modal stay open
      throw error; // Re-throw to inform caller
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setupTokenRefresh, getIntendedUrl, clearIntendedUrl]);

  // Register new user
  const register = useCallback(async (data: { email: string; password: string; name?: string }) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiClient.register(data);

      if (response.success && response.data) {
        setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
        setToken(null); // Using cookies for authentication
        setSession({
          userId: response.data.user.id,
          email: response.data.user.email,
          sessionId: response.data.sessionId,
          expiresAt: response.data.expiresAt,
        });
        setupTokenRefresh();
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
      }
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Connection error. Please try again.');
      }
      throw error; // Re-throw to inform caller
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setupTokenRefresh, getIntendedUrl, clearIntendedUrl]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear state regardless of API response
      setUser(null);
      setToken(null);
      setSession(null);
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      navigate('/');
    }
  }, [navigate]);

  // Refresh user profile
  const refreshUser = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);


  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    token,
    session,
    isAuthenticated: !!user,
    isLoading,
    error,
    authProviders,
    hasOAuth,
    requiresEmailAuth,
    login, // OAuth method with redirect support
    loginWithEmail, // Email/password method
    register,
    logout,
    refreshUser,
    clearError,
    setIntendedUrl,
    getIntendedUrl,
    clearIntendedUrl,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook for protected routes
export function useRequireAuth(redirectTo = '/') {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  return { isAuthenticated, isLoading };
}