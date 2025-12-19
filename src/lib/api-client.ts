/**
 * Unified API Client - Premium quality abstraction for all worker API calls
 * Provides type-safe methods for all endpoints with proper error handling
 * Features 401 response interception to trigger authentication modals
 */

import type{
	ApiResponse,
	AppsListData,
	PublicAppsData,
	FavoriteToggleData,
	CreateAppData,
	UpdateAppVisibilityData,
	AppDeleteData,
	AppDetailsData,
	AppStarToggleData,
	GitCloneTokenData,
	UserAppsData,
	ProfileUpdateData,
	UserStatsData,
	UserActivityData,
	UserAnalyticsResponseData,
	AgentAnalyticsResponseData,
	ModelConfigsData,
	ModelConfigData,
	ModelConfigUpdateData,
	ModelConfigTestData,
	ModelConfigResetData,
	ModelConfigDefaultsData,
	ModelConfigDeleteData,
	ByokProvidersData,
	ModelConfigUpdate,
	ModelProvidersListData,
	ModelProviderCreateData,
	ModelProviderUpdateData,
	ModelProviderDeleteData,
	ModelProviderTestData,
	CreateProviderRequest,
	UpdateProviderRequest,
	TestProviderRequest,
	SecretTemplatesData,
	AgentConnectionData,
	AgentStreamingResponse,
	App,
	ActiveSessionsData,
	ApiKeysData,
	LoginResponseData,
	RegisterResponseData,
	ProfileResponseData,
	AuthProvidersResponseData,
	CsrfTokenResponseData,
	OAuthProvider,
	CodeGenArgs,
	AgentPreviewResponse,
	PlatformStatusData,
	RateLimitError,
	CapabilitiesData,
	VaultConfigResponse,
	VaultStatusResponse,
} from '@/api-types';
import {
	RateLimitExceededError,
	SecurityError,
	SecurityErrorType,
} from '@/api-types';
import { toast } from 'sonner';

/**
 * Global auth modal trigger for 401 interception
 */
let globalAuthModalTrigger: ((context?: string) => void) | null = null;

export function setGlobalAuthModalTrigger(trigger: (context?: string) => void) {
	globalAuthModalTrigger = trigger;
}

/**
 * API Client Error class with proper error context
 */
export class ApiError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		message: string,
		public endpoint: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/**
 * Base API client configuration
 */
interface ApiClientConfig {
	baseUrl?: string;
	defaultHeaders?: Record<string, string>;
}

/**
 * Request options for API calls
 */
interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	headers?: Record<string, string>;
	body?: unknown;
	credentials?: RequestCredentials;
	skipJsonParsing?: boolean; // Skip JSON parsing for streaming responses
}

/**
 * Pagination parameters for paginated endpoints
 */
interface PaginationParams {
	page?: number;
	limit?: number;
	sort?: string;
	order?: 'asc' | 'desc';
}

/**
 * User apps parameters with filtering and sorting
 */
interface UserAppsParams extends PaginationParams {
	period?: 'today' | 'week' | 'month' | 'all';
	framework?: string;
	search?: string;
	visibility?: 'private' | 'public' | 'team' | 'board';
	status?: 'generating' | 'completed';
	teamId?: string;
}

/**
 * Public apps parameters with filtering and sorting
 */
interface PublicAppsParams extends PaginationParams {
	period?: 'today' | 'week' | 'month' | 'all';
	framework?: string;
	search?: string;
	boardId?: string;
}

/**
 * Unified API Client class
 */
interface CSRFTokenInfo {
	token: string;
	expiresAt: number;
}

class ApiClient {
	private baseUrl: string;
	private defaultHeaders: Record<string, string>;
	private csrfTokenInfo: CSRFTokenInfo | null = null;

	constructor(config: ApiClientConfig = {}) {
		this.baseUrl = config.baseUrl || '';
		this.defaultHeaders = {
			'Content-Type': 'application/json',
			...config.defaultHeaders,
		};
	}

	/**
	 * Get authentication headers for API requests
	 */
	private getAuthHeaders(): Record<string, string> {
		const headers: Record<string, string> = {};

		// Add session token for anonymous users if not authenticated
		// This will be handled automatically by cookies/credentials for authenticated users
		const sessionToken = localStorage.getItem('anonymous_session_token');
		if (sessionToken && !document.cookie.includes('session=')) {
			headers['X-Session-Token'] = sessionToken;
		}

		// Add CSRF token for state-changing requests
		if (this.csrfTokenInfo && !this.isCSRFTokenExpired()) {
			headers['X-CSRF-Token'] = this.csrfTokenInfo.token;
		}

		return headers;
	}

	/**
	 * Fetch CSRF token from server with expiration handling
	 */
	private async fetchCsrfToken(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/auth/csrf-token`, {
				method: 'GET',
				credentials: 'include',
			});
			
			if (response.ok) {
				const data: ApiResponse<CsrfTokenResponseData> = await response.json();
				if (data.data?.token) {
					const expiresIn = data.data.expiresIn || 7200; // Default 2 hours
					this.csrfTokenInfo = {
						token: data.data.token,
						expiresAt: Date.now() + (expiresIn * 1000)
					};
					return true;
				}
			}
			return false;
		} catch (error) {
			console.warn('Failed to fetch CSRF token:', error);
			return false;
		}
	}

	/**
	 * Public method to refresh CSRF token
	 * Should be called after authentication operations that rotate the token
	 */
	async refreshCsrfToken(): Promise<void> {
		await this.fetchCsrfToken();
	}


	/**
	 * Check if CSRF token is expired
	 */
	private isCSRFTokenExpired(): boolean {
		if (!this.csrfTokenInfo) return true;
		return Date.now() >= this.csrfTokenInfo.expiresAt;
	}

	/**
	 * Ensure CSRF token exists and is valid for state-changing requests
	 */
	private async ensureCsrfToken(method: string): Promise<boolean> {
		if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
			return true;
		}
		
		// Fetch new token if none exists or current one is expired
		if (!this.csrfTokenInfo || this.isCSRFTokenExpired()) {
			return await this.fetchCsrfToken();
		}
		
		return true;
	}

	/**
	 * Ensure session token exists for anonymous users
	 */
	private ensureSessionToken(): void {
		if (
			!localStorage.getItem('anonymous_session_token') &&
			!document.cookie.includes('session=')
		) {
			localStorage.setItem(
				'anonymous_session_token',
				crypto.randomUUID(),
			);
		}
	}

	/**
	 * Get authentication context message based on endpoint
	 */
	private getAuthContextForEndpoint(endpoint: string): string {
		if (endpoint.includes('/api/agent')) return 'to create applications';
		if (endpoint.includes('/favorite')) return 'to favorite this app';
		if (endpoint.includes('/star')) return 'to star this app';
		// if (endpoint.includes('/fork')) return 'to fork this app';
		// if (endpoint.includes('/apps')) return 'to access your apps';
		if (endpoint.includes('/profile')) return 'to access your profile';
		if (endpoint.includes('/settings')) return 'to access settings';
		return 'to continue';
	}

	/**
	 * Check if endpoint should trigger auth modal on 401
	 * Auth checking endpoints should not auto-trigger modals
	 */
	private shouldTriggerAuthModal(endpoint: string): boolean {
		// Don't trigger modal for auth state checking endpoints
		if (endpoint === '/api/auth/profile') return false;
		if (endpoint === '/api/auth/providers') return false;
		if (endpoint === '/api/auth/sessions') return false;

		return true;
	}

	private async request<T>(
		endpoint: string,
		options: RequestOptions = {},
        noToast: boolean = false,
	): Promise<ApiResponse<T>> {
		const { data } = await this.requestRaw<T>(endpoint, options, false, noToast);
		if (!data) {
			throw new ApiError(
				500,
				'Internal Error',
				'Unexpected null response data',
				endpoint,
			);
		}
		return data;
	}

	private async requestRaw<T>(
		endpoint: string,
		options: RequestOptions = {},
		isRetry: boolean = false,
        noToast: boolean = false,
	): Promise<{ response: Response; data: ApiResponse<T> | null }> {
		this.ensureSessionToken();
		
		if (!await this.ensureCsrfToken(options.method || 'GET')) {
			throw new ApiError(
				500,
				'Internal Error',
				'Failed to obtain CSRF token',
				endpoint,
			);
		}

		const url = `${this.baseUrl}${endpoint}`;
		const config: RequestInit = {
			method: options.method || 'GET',
			headers: {
				...this.defaultHeaders,
				...this.getAuthHeaders(),
				...options.headers,
			},
			credentials: options.credentials || 'include',
		};

		if (options.body) {
			config.body =
				typeof options.body === 'string'
					? options.body
					: JSON.stringify(options.body);
		}

		try {
			const response = await fetch(url, config);
			
			// For streaming responses, skip JSON parsing if response is ok
			if (options.skipJsonParsing && response.ok) {
				return { response, data: null };
			}
			
			const data = await response.json() as ApiResponse<T>;

			if (!response.ok) {
                if (
                    response.status === 401 &&
                    globalAuthModalTrigger &&
                    this.shouldTriggerAuthModal(endpoint)
                ) {
                    const authContext = this.getAuthContextForEndpoint(endpoint);
                    globalAuthModalTrigger(authContext);
                }

                const errorData = data.error;
                if (errorData && errorData.type) {
                       // Send a toast notification for typed errors
                    if (!noToast) {
                        toast.error(errorData.message);
                    }
                    switch (errorData.type) {
                        case SecurityErrorType.CSRF_VIOLATION:
                            // Handle CSRF failures with retry
                            if (response.status === 403 && !isRetry) {
                                // Clear expired token and retry with fresh one
                                this.csrfTokenInfo = null;
                                return this.requestRaw(endpoint, options, true);
                            }
                            break;
                        case SecurityErrorType.RATE_LIMITED:
                            // Handle rate limiting
                            console.log('Rate limited', errorData);
                            throw RateLimitExceededError.fromRateLimitError(errorData as unknown as RateLimitError);
                        default:
                            // Security error
                            throw new SecurityError(errorData.type, errorData.message);
                        }
                    }
                    console.log("Came here");

                    throw new ApiError(
                        response.status,
                        response.statusText,
                        data.error?.message || data.message || 'Request failed',
                        endpoint,
                    );
			}

		    return { response, data };
		} catch (error) {
            console.error(error);
			if (error instanceof ApiError || error instanceof RateLimitExceededError || error instanceof SecurityError) {
				throw error;
			}
			throw new ApiError(
				0,
				'Network Error',
				error instanceof Error ? error.message : 'Unknown error',
				endpoint,
			);
		}
	}

	// ===============================
	// Platform Status API Methods
	// ===============================

	async getPlatformStatus(noToast: boolean = true): Promise<ApiResponse<PlatformStatusData>> {
		return this.request<PlatformStatusData>('/api/status', undefined, noToast);
	}

	// ===============================
	// Platform Capabilities API Methods
	// ===============================

	/**
	 * Get platform capabilities including available features
	 */
	async getCapabilities(noToast: boolean = true): Promise<ApiResponse<CapabilitiesData>> {
		return this.request<CapabilitiesData>('/api/capabilities', undefined, noToast);
	}

	// ===============================
	// Apps API Methods
	// ===============================

	/**
	 * Get all apps for the current user
	 */
	async getUserApps(): Promise<ApiResponse<AppsListData>> {
		return this.request<AppsListData>('/api/apps');
	}

	/**
	 * Get recent apps (last 10)
	 */
	async getRecentApps(): Promise<ApiResponse<AppsListData>> {
		return this.request<AppsListData>('/api/apps/recent');
	}

	/**
	 * Get favorite apps
	 */
	async getFavoriteApps(): Promise<ApiResponse<AppsListData>> {
		return this.request<AppsListData>('/api/apps/favorites');
	}

	/**
	 * Get public apps feed with pagination
	 */
	async getPublicApps(
		params?: PublicAppsParams,
	): Promise<ApiResponse<PublicAppsData>> {
		const queryParams = new URLSearchParams();
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		if (params?.sort) queryParams.set('sort', params.sort);
		if (params?.order) queryParams.set('order', params.order);
		if (params?.period) queryParams.set('period', params.period);
		if (params?.framework) queryParams.set('framework', params.framework);
		if (params?.search) queryParams.set('search', params.search);
		if (params?.boardId) queryParams.set('boardId', params.boardId);

		const endpoint = `/api/apps/public${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
		return this.request<PublicAppsData>(endpoint);
	}

	/**
	 * Create a new app
	 */
	async createApp(data: {
		title: string;
		description?: string;
	}): Promise<ApiResponse<CreateAppData>> {
		return this.request<CreateAppData>('/api/apps', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Toggle favorite status of an app
	 */
	async toggleFavorite(
		appId: string,
	): Promise<ApiResponse<FavoriteToggleData>> {
		return this.request<FavoriteToggleData>(`/api/apps/${appId}/favorite`, {
			method: 'POST',
		});
	}

	/**
	 * Update app visibility
	 */
	async updateAppVisibility(
		appId: string,
		visibility: App['visibility'],
	): Promise<ApiResponse<UpdateAppVisibilityData>> {
		return this.request<UpdateAppVisibilityData>(
			`/api/apps/${appId}/visibility`,
			{
				method: 'PUT',
				body: { visibility },
			},
		);
	}

	/**
	 * Delete an app
	 */
	async deleteApp(appId: string): Promise<ApiResponse<AppDeleteData>> {
		return this.request<AppDeleteData>(`/api/apps/${appId}`, {
			method: 'DELETE',
		});
	}

	// ===============================
	// App View API Methods
	// ===============================

	/**
	 * Get detailed app information for viewing
	 */
	async getAppDetails(appId: string): Promise<ApiResponse<AppDetailsData>> {
		return this.request<AppDetailsData>(`/api/apps/${appId}`);
	}

	/**
	 * Toggle star status of an app (different from favorite)
	 */
	async toggleAppStar(
		appId: string,
	): Promise<ApiResponse<AppStarToggleData>> {
		return this.request<AppStarToggleData>(`/api/apps/${appId}/star`, {
			method: 'POST',
		});
	}

	/**
	 * Generate a short-lived token for git clone (private repos only)
	 */
	async generateGitCloneToken(
		appId: string,
	): Promise<ApiResponse<GitCloneTokenData>> {
		return this.request<GitCloneTokenData>(`/api/apps/${appId}/git/token`, {
			method: 'POST',
		});
	}

	// /**
	//  * Fork an app
	//  */
    // DISABLED: Has been disabled for initial alpha release, for security reasons
	// async forkApp(appId: string): Promise<ApiResponse<ForkAppData>> {
	// 	return this.request<ForkAppData>(`/api/apps/${appId}/fork`, {
	// 		method: 'POST',
	// 	});
	// }

	// ===============================
	// User API Methods
	// ===============================

	/**
	 * Get user apps with pagination
	 */
	async getUserAppsWithPagination(
		params?: UserAppsParams,
	): Promise<ApiResponse<UserAppsData>> {
		const queryParams = new URLSearchParams();
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		if (params?.sort) queryParams.set('sort', params.sort);
		if (params?.order) queryParams.set('order', params.order);
		if (params?.period) queryParams.set('period', params.period);
		if (params?.framework) queryParams.set('framework', params.framework);
		if (params?.search) queryParams.set('search', params.search);
		if (params?.visibility)
			queryParams.set('visibility', params.visibility);
		if (params?.status) queryParams.set('status', params.status);
		if (params?.teamId) queryParams.set('teamId', params.teamId);

		const endpoint = `/api/user/apps${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
		return this.request<UserAppsData>(endpoint);
	}

	async createAgentSession(args: CodeGenArgs): Promise<AgentStreamingResponse> {
		try {
			const { response, data } = await this.requestRaw(
				'/api/agent',
				{
					method: 'POST',
					body: args,
					skipJsonParsing: true, // Don't parse JSON for streaming response
				},
				false,
				true,
			);
			
			// Check if response is ok
			if (!response.ok) {
				// Parse error response if available
				const errorMessage = data?.error?.message || `Agent creation failed with status: ${response.status}`;
				throw new Error(errorMessage);
			}
			
			return {
				success: true,
				stream: response
			};
		} catch (error) {
			// Handle any network or parsing errors
			const errorMessage = error instanceof Error ? error.message : 'Failed to create agent session';
			toast.error(errorMessage);
			
            throw new Error(errorMessage);
		}
	}

	/**
	 * Update user profile
	 */
	async updateProfile(data: {
		displayName?: string;
		username?: string;
		bio?: string;
		timezone?: string;
		theme?: 'light' | 'dark' | 'system';
	}): Promise<ApiResponse<ProfileUpdateData>> {
		return this.request<ProfileUpdateData>('/api/user/profile', {
			method: 'PUT',
			body: data,
		});
	}

	// ===============================
	// Stats API Methods
	// ===============================

	/**
	 * Get user statistics
	 */
	async getUserStats(): Promise<ApiResponse<UserStatsData>> {
		return this.request<UserStatsData>('/api/stats/user');
	}

	/**
	 * Get user activity timeline
	 */
	async getUserActivity(): Promise<ApiResponse<UserActivityData>> {
		return this.request<UserActivityData>('/api/stats/activity');
	}

	// ===============================
	// Analytics API Methods
	// ===============================

	/**
	 * Get user analytics (AI Gateway costs and usage)
	 */
	async getUserAnalytics(
		userId: string,
		days?: number,
	): Promise<ApiResponse<UserAnalyticsResponseData>> {
		const queryParams = days ? `?days=${days}` : '';
		return this.request<UserAnalyticsResponseData>(
			`/api/user/${userId}/analytics${queryParams}`,
		);
	}

	/**
	 * Get agent analytics (AI Gateway costs and usage for specific app/chat)
	 */
	async getAgentAnalytics(
		agentId: string,
		days?: number,
	): Promise<ApiResponse<AgentAnalyticsResponseData>> {
		const queryParams = days ? `?days=${days}` : '';
		return this.request<AgentAnalyticsResponseData>(
			`/api/agent/${agentId}/analytics${queryParams}`,
		);
	}

	// ===============================
	// Model Config API Methods
	// ===============================

	/**
	 * Get all model configurations
	 */
	async getModelConfigs(): Promise<ApiResponse<ModelConfigsData>> {
		return this.request<ModelConfigsData>('/api/model-configs');
	}

	/**
	 * Get BYOK providers and available models
	 * @param agentAction - Optional agent action to filter models by constraints
	 */
	async getByokProviders(agentAction?: string): Promise<ApiResponse<ByokProvidersData>> {
		const endpoint = agentAction
			? `/api/model-configs/byok-providers?agentAction=${encodeURIComponent(agentAction)}`
			: '/api/model-configs/byok-providers';

		return this.request<ByokProvidersData>(endpoint);
	}

	/**
	 * Get BYOK templates for dynamic provider configuration
	 */
	async getBYOKTemplates(): Promise<ApiResponse<SecretTemplatesData>> {
		return this.request<SecretTemplatesData>(
			'/api/secrets/templates?category=byok',
		);
	}

	/**
	 * Reset model configuration to default
	 */
	async resetModelConfig(
		agentAction: string,
	): Promise<ApiResponse<ModelConfigResetData>> {
		return this.request<ModelConfigResetData>(
			`/api/model-configs/${agentAction}`,
			{
				method: 'DELETE',
			},
		);
	}

	/**
	 * Reset all model configurations to defaults
	 */
	async resetAllModelConfigs(): Promise<ApiResponse<ModelConfigResetData>> {
		return this.request<ModelConfigResetData>(
			'/api/model-configs/reset-all',
			{
				method: 'POST',
			},
		);
	}

	/**
	 * Get specific model configuration
	 */
	async getModelConfig(
		actionKey: string,
	): Promise<ApiResponse<ModelConfigData>> {
		return this.request<ModelConfigData>(`/api/model-configs/${actionKey}`);
	}

	/**
	 * Update model configuration
	 */
	async updateModelConfig(
		actionKey: string,
		config: ModelConfigUpdate,
	): Promise<ApiResponse<ModelConfigUpdateData>> {
		return this.request<ModelConfigUpdateData>(
			`/api/model-configs/${actionKey}`,
			{
				method: 'PUT',
				body: config,
			},
		);
	}

	/**
	 * Test model configuration
	 */
	async testModelConfig(
		actionKey: string,
		tempConfig?: ModelConfigUpdate,
	): Promise<ApiResponse<ModelConfigTestData>> {
		return this.request<ModelConfigTestData>('/api/model-configs/test', {
			method: 'POST',
			body: {
				agentActionName: actionKey,
				useUserKeys: true,
				...(tempConfig && { tempConfig }),
			},
		});
	}

	/**
	 * Reset all model configurations
	 */
	async resetAllConfigs(): Promise<ApiResponse<ModelConfigResetData>> {
		return this.request<ModelConfigResetData>(
			'/api/model-configs/reset-all',
			{
				method: 'POST',
			},
		);
	}

	/**
	 * Get default model configurations
	 */
	async getModelDefaults(): Promise<ApiResponse<ModelConfigDefaultsData>> {
		return this.request<ModelConfigDefaultsData>(
			'/api/model-configs/defaults',
		);
	}

	/**
	 * Delete model configuration
	 */
	async deleteModelConfig(
		actionKey: string,
	): Promise<ApiResponse<ModelConfigDeleteData>> {
		return this.request<ModelConfigDeleteData>(
			`/api/model-configs/${actionKey}`,
			{
				method: 'DELETE',
			},
		);
	}

	// ===============================
	// Model Providers API Methods
	// ===============================

	/**
	 * Get all custom model providers
	 */
	async getModelProviders(): Promise<ApiResponse<ModelProvidersListData>> {
		return this.request<ModelProvidersListData>('/api/user/providers');
	}

	/**
	 * Create a new custom model provider
	 */
	async createModelProvider(
		data: CreateProviderRequest,
	): Promise<ApiResponse<ModelProviderCreateData>> {
		return this.request<ModelProviderCreateData>('/api/user/providers', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Update an existing model provider
	 */
	async updateModelProvider(
		providerId: string,
		data: UpdateProviderRequest,
	): Promise<ApiResponse<ModelProviderUpdateData>> {
		return this.request<ModelProviderUpdateData>(
			`/api/user/providers/${providerId}`,
			{
				method: 'PUT',
				body: data,
			},
		);
	}

	/**
	 * Delete a model provider
	 */
	async deleteModelProvider(
		providerId: string,
	): Promise<ApiResponse<ModelProviderDeleteData>> {
		return this.request<ModelProviderDeleteData>(
			`/api/user/providers/${providerId}`,
			{
				method: 'DELETE',
			},
		);
	}

	/**
	 * Test a model provider connection
	 */
	async testModelProvider(
		data: TestProviderRequest,
	): Promise<ApiResponse<ModelProviderTestData>> {
		return this.request<ModelProviderTestData>('/api/user/providers/test', {
			method: 'POST',
			body: data,
		});
	}

	// ===============================
	// Secrets API Methods
	// ===============================

	/**
	 * Get secret templates for BYOK providers
	 */
	async getSecretTemplates(): Promise<ApiResponse<SecretTemplatesData>> {
		return this.request<SecretTemplatesData>('/api/secrets/templates');
	}

	// ===============================
	// Vault API Methods
	// ===============================

	async getVaultStatus(): Promise<ApiResponse<VaultStatusResponse>> {
		return this.request<VaultStatusResponse>('/api/vault/status');
	}

	async getVaultConfig(): Promise<ApiResponse<{ config: VaultConfigResponse }>> {
		return this.request<{ config: VaultConfigResponse }>('/api/vault/config');
	}

	async setupVault(data: {
		kdfAlgorithm: 'argon2id' | 'webauthn-prf';
		kdfSalt: string;
		kdfParams?: { time: number; mem: number; parallelism: number };
		prfCredentialId?: string;
		prfSalt?: string;
		encryptedRecoveryCodes?: string;
		recoveryCodesNonce?: string;
		verificationBlob: string;
		verificationNonce: string;
	}): Promise<ApiResponse<{ success: boolean }>> {
		return this.request<{ success: boolean }>('/api/vault/setup', {
			method: 'POST',
			body: data,
		});
	}

	async resetVault(): Promise<ApiResponse<{ success: boolean }>> {
		return this.request<{ success: boolean }>('/api/vault/reset', {
			method: 'POST',
		});
	}

	/**
	 * Initiate GitHub OAuth authorization for user repository access
	 * This redirects to GitHub OAuth
	 */
	initiateGitHubOAuth(): void {
		const oauthUrl = new URL('/api/github-app/authorize', window.location.origin);
		window.location.href = oauthUrl.toString();
	}

	/**
	 * Initiate GitHub export with OAuth flow
	 * Returns authorization URL for redirect
	 */
	async initiateGitHubExport(data: {
		repositoryName: string;
		description?: string;
		isPrivate?: boolean;
		agentId: string;
	}): Promise<ApiResponse<{ 
		authUrl?: string;
		success?: boolean;
		repositoryUrl?: string;
		skippedOAuth?: boolean;
		alreadyExists?: boolean;
		existingRepositoryUrl?: string;
	}>> {
		return this.request('/api/github-app/export', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Check remote repository status
	 */
	async checkRemoteStatus(data: {
		repositoryUrl: string;
		agentId: string;
	}): Promise<ApiResponse<{
		compatible: boolean;
		behindBy: number;
		aheadBy: number;
		divergedCommits: Array<{
			sha: string;
			message: string;
			author: string;
			date: string;
		}>;
	}>> {
		return this.request('/api/github-app/check-remote', {
			method: 'POST',
			body: data,
		});
	}

	// ===============================
	// Agent/CodeGen API Methods
	// ===============================
	/**
	 * Connect to existing agent
	 */
	async connectToAgent(
		agentId: string,
	): Promise<ApiResponse<AgentConnectionData>> {
		return this.request<AgentConnectionData>(
			`/api/agent/${agentId}/connect`,
		);
	}

	/**
	 * Deploy preview
	 */
	async deployPreview(
		agentId: string,
	): Promise<ApiResponse<AgentPreviewResponse>> {
		return this.request<AgentPreviewResponse>(
			`/api/agent/${agentId}/preview`,
		);
	}

	// ===============================
	// Session Management API Methods
	// ===============================

	/**
	 * Get active user sessions
	 */
	async getActiveSessions(): Promise<ApiResponse<ActiveSessionsData>> {
		return this.request<ActiveSessionsData>('/api/auth/sessions');
	}

	/**
	 * Revoke a specific session
	 */
	async revokeSession(
		sessionId: string,
	): Promise<ApiResponse<{ message: string }>> {
		return this.request<{ message: string }>(
			`/api/auth/sessions/${sessionId}`,
			{
				method: 'DELETE',
			},
		);
	}

	// ===============================
	// API Keys Management Methods
	// ===============================

	/**
	 * Get user API keys
	 */
	async getApiKeys(): Promise<ApiResponse<ApiKeysData>> {
		return this.request<ApiKeysData>('/api/auth/api-keys');
	}

	/**
	 * Create a new API key
	 */
	async createApiKey(data: {
		name: string;
	}): Promise<
		ApiResponse<{
			key: string;
			keyPreview: string;
			name: string;
			message: string;
		}>
	> {
		return this.request<{
			key: string;
			keyPreview: string;
			name: string;
			message: string;
		}>('/api/auth/api-keys', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Revoke an API key
	 */
	async revokeApiKey(
		keyId: string,
	): Promise<ApiResponse<{ message: string }>> {
		return this.request<{ message: string }>(
			`/api/auth/api-keys/${keyId}`,
			{
				method: 'DELETE',
			},
		);
	}

	// ===============================
	// Authentication API Methods
	// ===============================

	/**
	 * Login with email and password
	 */
	async loginWithEmail(credentials: {
		email: string;
		password: string;
	}): Promise<ApiResponse<LoginResponseData>> {
		return this.request<LoginResponseData>('/api/auth/login', {
			method: 'POST',
			body: credentials,
		});
	}

	/**
	 * Register a new user
	 */
	async register(data: {
		email: string;
		password: string;
		name?: string;
	}): Promise<ApiResponse<RegisterResponseData>> {
		return this.request<RegisterResponseData>('/api/auth/register', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Verify email with OTP
	 */
	async verifyEmail(data: {
		email: string;
		otp: string;
	}): Promise<ApiResponse<LoginResponseData>> {
		return this.request<LoginResponseData>('/api/auth/verify-email', {
			method: 'POST',
			body: data,
		});
	}

	/**
	 * Resend verification OTP
	 */
	async resendVerificationOtp(
		email: string,
	): Promise<ApiResponse<{ message: string }>> {
		return this.request<{ message: string }>(
			'/api/auth/resend-verification',
			{
				method: 'POST',
				body: { email },
			},
		);
	}

	/**
	 * Get CSRF token
	 */
	async getCsrfToken(): Promise<ApiResponse<CsrfTokenResponseData>> {
		return this.request<CsrfTokenResponseData>('/api/auth/csrf-token');
	}

	/**
	 * Get current user profile
	 */
	async getProfile(noToast: boolean = false): Promise<ApiResponse<ProfileResponseData>> {
		return this.request<ProfileResponseData>('/api/auth/profile', undefined, noToast);
	}

	/**
	 * Logout current user
	 */
	async logout(): Promise<ApiResponse<{ message: string }>> {
		return this.request<{ message: string }>('/api/auth/logout', {
			method: 'POST',
		});
	}

	/**
	 * Get available authentication providers
	 */
	async getAuthProviders(): Promise<ApiResponse<AuthProvidersResponseData>> {
		return this.request<AuthProvidersResponseData>('/api/auth/providers');
	}

	/**
	 * Initiate OAuth flow (redirects to provider)
	 */
	initiateOAuth(provider: OAuthProvider, redirectUrl?: string): void {
		const oauthUrl = new URL(
			`/api/auth/oauth/${provider}`,
			window.location.origin,
		);
		if (redirectUrl) {
			oauthUrl.searchParams.set('redirect_url', redirectUrl);
		}

		// Redirect to OAuth provider
		window.location.href = oauthUrl.toString();
	}
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing/custom instances
export { ApiClient };
