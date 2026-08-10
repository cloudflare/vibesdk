/**
 * Enhanced Auth Context
 * Provides OAuth + Email/Password authentication with backward compatibility
 */

import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useMemo,
} from 'react';
import { useNavigate } from 'react-router';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useSentryUser } from '@/hooks/useSentryUser';
import { queryKeys } from '@/lib/query-keys';
import type {
	AuthProvidersResponseData,
	AuthSession,
	AuthUser,
	LoginResponseData,
	ProfileResponseData,
	SessionResponse,
} from '../api-types';

/**
 * Cached session shape. Deliberately plain-serializable (no `Date`): TanStack's
 * structural sharing (`replaceEqualDeep`) bails out on non-plain values, so a
 * `Date` here would produce a new object identity on every poll/focus refetch
 * and re-render every `useAuth` consumer.
 */
interface CachedAuthSession {
	user: AuthUser;
	sessionId: string;
	/** ISO string; null when the endpoint does not report an expiry. */
	expiresAt: string | null;
}

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
		cloudflare: boolean;
		email: boolean;
	} | null;
	hasOAuth: boolean;
	requiresEmailAuth: boolean;

	// OAuth login method with redirect support
	login: (
		provider: 'google' | 'github' | 'cloudflare',
		redirectUrl?: string,
	) => void;

	// Email/password login method
	loginWithEmail: (credentials: {
		email: string;
		password: string;
	}) => Promise<void>;
	register: (data: {
		email: string;
		password: string;
		name?: string;
	}) => Promise<void>;

	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	clearError: () => void;

	// Redirect URL management
	setIntendedUrl: (url: string) => void;
	getIntendedUrl: () => string | null;
	clearIntendedUrl: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Session validation interval - tokens last 24h, so check infrequently.
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

// Assumed session lifetime when the profile endpoint reports no explicit expiry.
const ASSUMED_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_AUTH_PROVIDERS: AuthProvidersResponseData = {
	providers: {
		google: false,
		github: false,
		cloudflare: false,
		email: true,
	},
	hasOAuth: false,
	requiresEmailAuth: true,
};

const INTENDED_URL_KEY = 'auth_intended_url';

function buildSessionFromProfile(
	data: ProfileResponseData,
): CachedAuthSession {
	return {
		user: { ...data.user, isAnonymous: false },
		sessionId: data.sessionId || data.user.id,
		// Profile endpoint does not report expiry.
		expiresAt: null,
	};
}

function buildSessionFromLogin(data: SessionResponse): CachedAuthSession {
	return {
		user: { ...data.user, isAnonymous: false },
		sessionId: data.sessionId,
		// Typed as `Date` but arrives as an ISO string over the wire; normalize both.
		expiresAt: data.expiresAt
			? new Date(data.expiresAt).toISOString()
			: null,
	};
}

async function fetchAuthSession(): Promise<CachedAuthSession | null> {
	try {
		const response = await apiClient.getProfile(true);

		if (response.success && response.data?.user) {
			return buildSessionFromProfile(response.data);
		}

		return null;
	} catch (error) {
		// Unauthenticated is a valid state, not a hard failure.
		if (
			error instanceof ApiError &&
			(error.status === 401 || error.status === 403)
		) {
			return null;
		}

		console.error('Auth check failed:', error);
		throw error;
	}
}

async function fetchAuthProviders(): Promise<AuthProvidersResponseData> {
	// Must throw on failure: swallowing the error would cache the email-only
	// fallback as a successful result and strand OAuth-only deployments.
	const response = await apiClient.getAuthProviders();
	if (!response.success || !response.data) {
		throw new Error(
			response.error?.message || 'Failed to fetch auth providers',
		);
	}
	return response.data;
}

function getAuthActionError(error: unknown): string {
	// Covers ApiError, SecurityError and RateLimitExceededError alike.
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return 'Connection error. Please try again.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [error, setError] = useState<string | null>(null);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const setIntendedUrl = useCallback((url: string) => {
		try {
			sessionStorage.setItem(INTENDED_URL_KEY, url);
		} catch (storageError) {
			console.warn('Failed to store intended URL:', storageError);
		}
	}, []);

	const getIntendedUrl = useCallback((): string | null => {
		try {
			return sessionStorage.getItem(INTENDED_URL_KEY);
		} catch (storageError) {
			console.warn('Failed to retrieve intended URL:', storageError);
			return null;
		}
	}, []);

	const clearIntendedUrl = useCallback(() => {
		try {
			sessionStorage.removeItem(INTENDED_URL_KEY);
		} catch (storageError) {
			console.warn('Failed to clear intended URL:', storageError);
		}
	}, []);

	const sessionQuery = useQuery({
		queryKey: queryKeys.auth.session(),
		queryFn: fetchAuthSession,
		staleTime: 5 * 60_000,
		// Periodic cookie/session validation (replaces manual setInterval).
		// Only poll while a session exists — matches prior setupTokenRefresh behavior.
		refetchInterval: (query) =>
			query.state.data ? TOKEN_REFRESH_INTERVAL : false,
		// 401/403 are already normalized to `null`, so anything thrown here is
		// transient (offline/5xx) and worth retrying rather than reporting the
		// user as signed out.
		retry: (failureCount, error) => {
			if (error instanceof ApiError && error.status < 500) {
				return false;
			}
			return failureCount < 2;
		},
	});

	const providersQuery = useQuery({
		queryKey: queryKeys.auth.providers(),
		queryFn: fetchAuthProviders,
		staleTime: 60 * 60_000,
	});

	const cachedSession = sessionQuery.data ?? null;
	const user = cachedSession?.user ?? null;

	// Derived here (not cached) so the fabricated expiry cannot churn identities.
	const session = useMemo<AuthSession | null>(() => {
		if (!cachedSession) {
			return null;
		}
		return {
			userId: cachedSession.user.id,
			email: cachedSession.user.email,
			sessionId: cachedSession.sessionId,
			expiresAt: cachedSession.expiresAt
				? new Date(cachedSession.expiresAt)
				: new Date(Date.now() + ASSUMED_SESSION_TTL),
		};
	}, [cachedSession]);

	// Sync user context with Sentry for error tracking
	useSentryUser(user);

	const applyAuthenticatedSession = useCallback(
		async (data: LoginResponseData) => {
			// Cancel any in-flight validation so a late response cannot clobber
			// the session we just established.
			await queryClient.cancelQueries({
				queryKey: queryKeys.auth.session(),
			});
			queryClient.setQueryData(
				queryKeys.auth.session(),
				buildSessionFromLogin(data),
			);
		},
		[queryClient],
	);

	const clearAuthenticatedSession = useCallback(async () => {
		// Cancel first: an in-flight profile refetch landing after this write
		// would otherwise resurrect the session we are tearing down.
		await queryClient.cancelQueries({
			queryKey: queryKeys.auth.session(),
		});
		queryClient.setQueryData(queryKeys.auth.session(), null);
		// Drop user-scoped caches so the next account cannot see prior data.
		queryClient.removeQueries({ queryKey: queryKeys.account.all });
	}, [queryClient]);

	const navigateAfterAuth = useCallback(() => {
		const intendedUrl = getIntendedUrl();
		clearIntendedUrl();
		navigate(intendedUrl || '/');
	}, [clearIntendedUrl, getIntendedUrl, navigate]);

	// OAuth login method with redirect support
	const login = useCallback(
		(
			provider: 'google' | 'github' | 'cloudflare',
			redirectUrl?: string,
		) => {
			const intendedUrl =
				redirectUrl ||
				window.location.pathname + window.location.search;
			setIntendedUrl(intendedUrl);

			const oauthUrl = new URL(
				`/api/auth/oauth/${provider}`,
				window.location.origin,
			);
			oauthUrl.searchParams.set('redirect_url', intendedUrl);
			window.location.href = oauthUrl.toString();
		},
		[setIntendedUrl],
	);

	const loginMutation = useMutation({
		mutationFn: async (credentials: {
			email: string;
			password: string;
		}) => {
			const response = await apiClient.loginWithEmail(credentials);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Login failed',
				);
			}
			return response.data;
		},
		onMutate: () => {
			setError(null);
		},
		onSuccess: async (data) => {
			await applyAuthenticatedSession(data);
			navigateAfterAuth();
		},
		onError: (err) => {
			console.error('Login error:', err);
			setError(getAuthActionError(err));
		},
	});

	const registerMutation = useMutation({
		mutationFn: async (data: {
			email: string;
			password: string;
			name?: string;
		}) => {
			const response = await apiClient.register(data);
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Registration failed',
				);
			}
			return response.data;
		},
		onMutate: () => {
			setError(null);
		},
		onSuccess: async (data) => {
			await applyAuthenticatedSession(data);
			navigateAfterAuth();
		},
		onError: (err) => {
			console.error('Registration error:', err);
			setError(getAuthActionError(err));
		},
	});

	const logoutMutation = useMutation({
		mutationFn: async () => {
			try {
				await apiClient.logout();
			} catch (err) {
				console.error('Logout error:', err);
			}
		},
		onSettled: async () => {
			// Navigate before dropping app caches: removing a still-observed
			// query makes its observer refetch, and that request 401s and pops
			// the sign-in modal mid-logout.
			navigate('/');
			await clearAuthenticatedSession();
		},
	});

	const { mutateAsync: loginMutateAsync } = loginMutation;
	const { mutateAsync: registerMutateAsync } = registerMutation;
	const { mutateAsync: logoutMutateAsync } = logoutMutation;

	const loginWithEmail = useCallback(
		async (credentials: { email: string; password: string }) => {
			// Errors are stored on context; rethrow so modal callers can react.
			await loginMutateAsync(credentials);
		},
		[loginMutateAsync],
	);

	const register = useCallback(
		async (data: {
			email: string;
			password: string;
			name?: string;
		}) => {
			await registerMutateAsync(data);
		},
		[registerMutateAsync],
	);

	const logout = useCallback(async () => {
		await logoutMutateAsync();
	}, [logoutMutateAsync]);

	const refreshUser = useCallback(async () => {
		await queryClient.refetchQueries({
			queryKey: queryKeys.auth.session(),
		});
	}, [queryClient]);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	// Degrade to the email-only fallback only once the request has actually
	// failed, so a transient 500 is retried instead of cached as truth.
	const providers =
		providersQuery.data ??
		(providersQuery.isError ? DEFAULT_AUTH_PROVIDERS : null);

	// Bootstrap only. Deliberately excludes login/register/logout: consumers
	// like AuthButton early-return a skeleton on `isLoading`, which would
	// unmount the in-flight LoginModal and destroy typed credentials.
	// `isPending` is first-resolution only, so background polls never flash UI.
	const isLoading = sessionQuery.isPending || providersQuery.isPending;

	const value = useMemo<AuthContextType>(
		() => ({
			user,
			// Cookie-based auth; no bearer token is ever exposed to the client.
			token: null,
			session,
			isAuthenticated: !!user,
			isLoading,
			error,
			authProviders: providers?.providers ?? null,
			hasOAuth: providers?.hasOAuth ?? false,
			requiresEmailAuth: providers?.requiresEmailAuth ?? true,
			login,
			loginWithEmail,
			register,
			logout,
			refreshUser,
			clearError,
			setIntendedUrl,
			getIntendedUrl,
			clearIntendedUrl,
		}),
		[
			user,
			session,
			isLoading,
			error,
			providers,
			login,
			loginWithEmail,
			register,
			logout,
			refreshUser,
			clearError,
			setIntendedUrl,
			getIntendedUrl,
			clearIntendedUrl,
		],
	);

	return (
		<AuthContext.Provider value={value}>{children}</AuthContext.Provider>
	);
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
