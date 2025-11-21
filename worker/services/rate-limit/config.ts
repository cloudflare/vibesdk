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
}

export type LLMCallsRateLimitConfig = (DORateLimitConfig) & {
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
	[RateLimitType.API_RATE_LIMIT]: RLRateLimitConfig;
	[RateLimitType.AUTH_RATE_LIMIT]: RLRateLimitConfig;
	[RateLimitType.APP_CREATION]: DORateLimitConfig | KVRateLimitConfig;
	[RateLimitType.LLM_CALLS]: LLMCallsRateLimitConfig;
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
        dailyLimit: 10,
		period: 4 * 60 * 60, // 4 hour
	},
	llmCalls: {
		enabled: true,
		store: RateLimitStore.DURABLE_OBJECT,
		limit: 500,
		period: 2 * 60 * 60, // 2 hour
        dailyLimit: 1700,
		excludeBYOKUsers: true,
	},
};
