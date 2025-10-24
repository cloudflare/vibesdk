import { AIModels } from "worker/agents/inferutils/config.types";

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
		limit: 800,
		period: 60 * 60, // 1 hour
        dailyLimit: 2000,
		excludeBYOKUsers: true,
	},
};

// Simple, pro models -> 4, Flash -> 1, Flash Lite -> 0
export const DEFAULT_RATE_INCREMENTS_FOR_MODELS: Record<AIModels | string, number> = {
	[AIModels.GEMINI_1_5_FLASH_8B] : 0,
	[AIModels.GEMINI_2_0_FLASH] : 0,
	[AIModels.GEMINI_2_5_FLASH_LITE] : 0,
	[AIModels.GEMINI_2_5_FLASH_LITE_LATEST] : 0,

	[AIModels.GEMINI_2_5_FLASH] : 1,
	[AIModels.GEMINI_2_5_FLASH_LATEST] : 1,
	[AIModels.GEMINI_2_5_FLASH_PREVIEW_04_17] : 1,
	[AIModels.GEMINI_2_5_FLASH_PREVIEW_05_20] : 1,

	[AIModels.GEMINI_2_5_PRO_LATEST] : 4,
	[AIModels.GEMINI_2_5_PRO] : 4,
	[AIModels.GEMINI_2_5_PRO_PREVIEW_05_06] : 4,
	[AIModels.GEMINI_2_5_PRO_PREVIEW_06_05] : 4,
};
