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
}

export type LLMCallsRateLimitConfig = (KVRateLimitConfig | DORateLimitConfig) & {
    excludeBYOKUsers: boolean;
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
}

export interface RateLimitSettings {
	[RateLimitType.API_RATE_LIMIT]: RLRateLimitConfig | DORateLimitConfig;
	[RateLimitType.AUTH_RATE_LIMIT]: RLRateLimitConfig | DORateLimitConfig;
	[RateLimitType.APP_CREATION]: KVRateLimitConfig | DORateLimitConfig;
	[RateLimitType.LLM_CALLS]: LLMCallsRateLimitConfig | DORateLimitConfig;
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
		limit: 10,
		period: 3600, // 1 hour
	},
	llmCalls: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 100,
		period: 30 * 60, // 30 minutes
		excludeBYOKUsers: true,
	},
};
