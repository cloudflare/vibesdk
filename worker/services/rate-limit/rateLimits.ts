import { RateLimitType, RateLimitStore, RateLimitSettings, DORateLimitConfig, KVRateLimitConfig, DEFAULT_RATE_INCREMENTS_FOR_MODELS } from './config';
import { createObjectLogger } from '../../logger';
import { AuthUser } from '../../types/auth-types';
import { extractTokenWithMetadata, extractRequestMetadata } from '../../utils/authUtils';
import { captureSecurityEvent } from '../../observability/sentry';
import { KVRateLimitStore } from './KVRateLimitStore';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { isDev } from 'worker/utils/envs';
import { AIModels } from 'worker/agents/inferutils/config.types';

export class RateLimitService {
    static logger = createObjectLogger(this, 'RateLimitService');

    static buildRateLimitKey(
		rateLimitType: RateLimitType,
		identifier: string
	): string {
		return `platform:${rateLimitType}:${identifier}`;
	}

	static async getUserIdentifier(user: AuthUser): Promise<string> {
		return `user:${user.id}`;
	}

    static async getRequestIdentifier(request: Request): Promise<string> {
        const tokenResult = extractTokenWithMetadata(request);
        if (tokenResult.token) {
            const encoder = new TextEncoder();
            const data = encoder.encode(tokenResult.token);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return `token:${hashHex.slice(0, 16)}`;
        }
    
        const metadata = extractRequestMetadata(request);
        return `ip:${metadata.ipAddress}`;
    }

    static async getUniversalIdentifier(user: AuthUser | null, request: Request): Promise<string> {
        if (user) {
            return this.getUserIdentifier(user);
        }
        return this.getRequestIdentifier(request);
    }

    /**
     * Durable Object-based rate limiting using bucketed sliding window algorithm
     * Provides better consistency and performance compared to KV
     */
    private static async enforceDORateLimit(
        env: Env,
        key: string,
        config: DORateLimitConfig,
        incrementBy: number = 1
    ): Promise<boolean> {
        try {
            const stub = env.DORateLimitStore.getByName(key);

            const result = await stub.increment(key, {
                limit: config.limit,
                period: config.period,
                burst: config.burst,
                burstWindow: config.burstWindow,
                bucketSize: config.bucketSize,
                dailyLimit: config.dailyLimit
            }, incrementBy);

            return result.success;
        } catch (error) {
            this.logger.error('Failed to enforce DO rate limit', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return true; // Fail open
        }
    }
    
    static async enforce(
        env: Env,
        key: string,
        config: RateLimitSettings,
        limitType: RateLimitType,
        incrementBy: number = 1
    ) : Promise<boolean> {
        // If dev, don't enforce
        if (isDev(env)) {
            return true;
        }
        const rateLimitConfig = config[limitType];
        let success = false;
        
        switch (rateLimitConfig.store) {
            case RateLimitStore.RATE_LIMITER: {
                const result = await (env[rateLimitConfig.bindingName as keyof Env] as RateLimit).limit({ key });
                success = result.success;
                break;
            }
            case RateLimitStore.KV: {
                const result = await KVRateLimitStore.increment(env.VibecoderStore, key, rateLimitConfig as KVRateLimitConfig, incrementBy);
                success = result.success;
                break;
            }
            case RateLimitStore.DURABLE_OBJECT:
                success = await this.enforceDORateLimit(env, key, rateLimitConfig as DORateLimitConfig, incrementBy);
                break;
            default:
                return false;
        }
        return success;
    }

    static async enforceGlobalApiRateLimit(
        env: Env,
        config: RateLimitSettings,
        user: AuthUser | null,
        request: Request
    ): Promise<void> {
        if (!config[RateLimitType.API_RATE_LIMIT].enabled) {
            return;
        }
        const identifier = await this.getUniversalIdentifier(user, request);

        const key = this.buildRateLimitKey(RateLimitType.API_RATE_LIMIT, identifier);
        
        try {
            const success = await this.enforce(env, key, config, RateLimitType.API_RATE_LIMIT);
            if (!success) {
                this.logger.warn('Global API rate limit exceeded', {
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent'),
                    ip: request.headers.get('CF-Connecting-IP')
                });
                captureSecurityEvent('rate_limit_exceeded', {
                    limitType: RateLimitType.API_RATE_LIMIT,
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent') || undefined,
                    ip: request.headers.get('CF-Connecting-IP') || undefined,
                });
                throw new RateLimitExceededError(`Global API rate limit exceeded`, RateLimitType.API_RATE_LIMIT);
            }
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            this.logger.error('Failed to enforce global API rate limit', error);
        }
    }

    static async enforceAuthRateLimit(
        env: Env,
        config: RateLimitSettings,
        user: AuthUser | null,
        request: Request
    ) {
        
        if (!config[RateLimitType.AUTH_RATE_LIMIT].enabled) {
            return;
        }
        const identifier = await this.getUniversalIdentifier(user, request);

        const key = this.buildRateLimitKey(RateLimitType.AUTH_RATE_LIMIT, identifier);
        
        try {
            const success = await this.enforce(env, key, config, RateLimitType.AUTH_RATE_LIMIT);
            if (!success) {
                this.logger.warn('Auth rate limit exceeded', {
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent'),
                    ip: request.headers.get('CF-Connecting-IP')
                });
                captureSecurityEvent('rate_limit_exceeded', {
                    limitType: RateLimitType.AUTH_RATE_LIMIT,
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent') || undefined,
                    ip: request.headers.get('CF-Connecting-IP') || undefined,
                });
                throw new RateLimitExceededError(`Auth rate limit exceeded`, RateLimitType.AUTH_RATE_LIMIT);
            }
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            this.logger.error('Failed to enforce auth rate limit', error);
        }
    }

	static async enforceAppCreationRateLimit(
		env: Env,
		config: RateLimitSettings,
		user: AuthUser,
		request: Request
	): Promise<void> {
		if (!config[RateLimitType.APP_CREATION].enabled) {
			return;
		}
		const identifier = await this.getUserIdentifier(user);

		const key = this.buildRateLimitKey(RateLimitType.APP_CREATION, identifier);
		
		try {
            const success = await this.enforce(env, key, config, RateLimitType.APP_CREATION);
			if (!success) {
				this.logger.warn('App creation rate limit exceeded', {
					identifier,
					key,
					userAgent: request.headers.get('User-Agent'),
					ip: request.headers.get('CF-Connecting-IP')
				});
				captureSecurityEvent('rate_limit_exceeded', {
					limitType: RateLimitType.APP_CREATION,
					identifier,
					key,
					userAgent: request.headers.get('User-Agent') || undefined,
					ip: request.headers.get('CF-Connecting-IP') || undefined,
				});
				throw new RateLimitExceededError(
					`App creation rate limit exceeded. Maximum ${config.appCreation.limit} apps per ${config.appCreation.period / 3600} hour${config.appCreation.period >= 7200 ? 's' : ''}`,
					RateLimitType.APP_CREATION,
					config.appCreation.limit,
					config.appCreation.period,
                    ['Please try again in an hour when the limit resets for you.']
				);
			}
		} catch (error) {
			if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
				throw error;
			}
			this.logger.error('Failed to enforce app creation rate limit', error);
		}
	}

	static async enforceLLMCallsRateLimit(
        env: Env,
		config: RateLimitSettings,
		userId: string,
        model: AIModels | string,
        suffix: string = ""
	): Promise<void> {
		
		if (!config[RateLimitType.LLM_CALLS].enabled) {
			return;
		}

		const identifier = `user:${userId}`;
		
		const key = this.buildRateLimitKey(RateLimitType.LLM_CALLS, `${identifier}${suffix}`);
		
		try {
            let incrementBy = 1;
            if (DEFAULT_RATE_INCREMENTS_FOR_MODELS[model]) {
                incrementBy = DEFAULT_RATE_INCREMENTS_FOR_MODELS[model];
            }
			const success = await this.enforce(env, key, config, RateLimitType.LLM_CALLS, incrementBy);
			if (!success) {
				this.logger.warn('LLM calls rate limit exceeded', {
					identifier,
					key,
                    config,
                    model,
                    incrementBy
				});
				captureSecurityEvent('rate_limit_exceeded', {
					limitType: RateLimitType.LLM_CALLS,
					identifier,
					key,
                    model,
                    incrementBy
				});
				throw new RateLimitExceededError(
					`AI inference rate limit exceeded. Consider using lighter models. Maximum ${config.llmCalls.limit} credits per ${config.llmCalls.period / 3600} hour${config.llmCalls.period >= 7200 ? 's' : ''} or ${config.llmCalls.dailyLimit} credits per day. Gemini pro models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_PRO]} credits per call, flash models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_FLASH]} credits per call, and flash lite models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_FLASH_LITE]} credit per call.`,
					RateLimitType.LLM_CALLS,
					config.llmCalls.limit,
					config.llmCalls.period,
                    [`Please try again in due time when the limit resets for you. Consider using lighter models. Gemini pro models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_PRO]} credits per call, flash models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_FLASH]} credits per call, and flash lite models cost ${DEFAULT_RATE_INCREMENTS_FOR_MODELS[AIModels.GEMINI_2_5_FLASH_LITE]} credit per call.`]
				);
			}
		} catch (error) {
			if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
				throw error;
			}
			this.logger.error('Failed to enforce LLM calls rate limit', error);
		}
	}
}