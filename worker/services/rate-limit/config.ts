export enum RateLimitStore {
	KV = 'kv',
	RATE_LIMITER = 'rate_limiter',
	DURABLE_OBJECT = 'durable_object',
}

export interface RateLimitConfigBase {
	enabled: boolean;
	store: RateLimitStore;
}

export interface KVRateLimitConfig extends RateLimitConfigBase {
	store: RateLimitStore.KV;
	limit: number;
	period: number; // in seconds
	burst?: number; // optional burst limit
	burstWindow?: number; // burst window in seconds (default: 60)
	bucketSize?: number; // time bucket size in seconds (default: 10)
}

export interface RLRateLimitConfig extends RateLimitConfigBase {
	store: RateLimitStore.RATE_LIMITER;
	bindingName: string;
	// Rate limits via bindings are configurable only via wrangler configs
}

export interface DORateLimitConfig extends RateLimitConfigBase {
	store: RateLimitStore.DURABLE_OBJECT;
	limit: number;
	period: number; // in seconds
	burst?: number; // optional burst limit
	burstWindow?: number; // burst window in seconds (default: 60)
	bucketSize?: number; // time bucket size in seconds (default: 10)
	dailyLimit?: number; // optional rolling 24h limit
	/** If true, the main window is aligned to UTC calendar day (resets at midnight UTC) instead of rolling. */
	calendarDaily?: boolean;
}

export type LLMCallsRateLimitConfig = (DORateLimitConfig) & {
	excludeBYOKUsers: boolean;
	/** If true, users who have a Cloudflare account + gateway configured bypass LLM rate limits entirely. */
	excludeCloudflareConnected?: boolean;
};

export type RateLimitConfig =
	| RLRateLimitConfig
	| KVRateLimitConfig
	| DORateLimitConfig
	| LLMCallsRateLimitConfig;

export enum RateLimitType {
	API_RATE_LIMIT = 'apiRateLimit',
	AUTH_RATE_LIMIT = 'authRateLimit',
	APP_CREATION = 'appCreation',
	LLM_CALLS = 'llmCalls',
	PUBLIC_APPS = 'publicApps',
	SPACE_PREVIEW = 'spacePreview',
}

export interface RateLimitSettings {
	[RateLimitType.API_RATE_LIMIT]: RLRateLimitConfig;
	[RateLimitType.AUTH_RATE_LIMIT]: RLRateLimitConfig;
	[RateLimitType.APP_CREATION]: DORateLimitConfig | KVRateLimitConfig;
	[RateLimitType.LLM_CALLS]: LLMCallsRateLimitConfig;
	[RateLimitType.PUBLIC_APPS]: DORateLimitConfig | KVRateLimitConfig;
	[RateLimitType.SPACE_PREVIEW]: DORateLimitConfig | KVRateLimitConfig;
}

export const DEFAULT_RATE_LIMIT_SETTINGS: RateLimitSettings = {
	apiRateLimit: {
		enabled: true,
		store: RateLimitStore.RATE_LIMITER,
		bindingName: 'API_RATE_LIMITER',
	},
	authRateLimit: {
		enabled: true,
		store: RateLimitStore.RATE_LIMITER,
		bindingName: 'AUTH_RATE_LIMITER',
	},
	appCreation: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 3,
		dailyLimit: 3,
		period: 24 * 60 * 60, // 24 hours
	},
	llmCalls: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 200,
		period: 24 * 60 * 60, // 1 day (used as reporting period; window is calendar-aligned)
		calendarDaily: true,
		excludeBYOKUsers: true,
		// Connected users still consume the free daily allotment first; only BYOK (actively-billing) users skip limits.
		excludeCloudflareConnected: false,
	},
	// Per-client limit for the unauthenticated public app discovery endpoints
	// (listing + detail). DO-based so it works locally and needs no binding.
	publicApps: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 120,
		period: 60, // 120 requests / minute per client
		burst: 40,
		burstWindow: 10,
	},
	// Per-preview-token limit for SpaceDO previews (dispatched outside the Hono
	// chain, so the global API limiter does not apply). Generous enough for a
	// legitimate page's asset sub-requests while capping sustained floods.
	spacePreview: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 600,
		period: 60, // 600 requests / minute per preview token
		burst: 120,
		burstWindow: 10,
	},
};
