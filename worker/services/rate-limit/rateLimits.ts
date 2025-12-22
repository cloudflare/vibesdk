import { RateLimitType, RateLimitStore, RateLimitSettings, DORateLimitConfig, KVRateLimitConfig } from './config';
import { createObjectLogger } from '../../logger';
import { AuthUser } from '../../types/auth-types';
import { extractTokenWithMetadata, extractRequestMetadata } from '../../utils/authUtils';
import { captureSecurityEvent } from '../../observability/sentry';
import { KVRateLimitStore } from './KVRateLimitStore';
import { RateLimitResult } from './DORateLimitStore';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { isDev } from 'worker/utils/envs';
import { AI_MODEL_CONFIG, AIModels } from 'worker/agents/inferutils/config.types';

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
    ): Promise<RateLimitResult> {
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

            return result;
        } catch (error) {
            this.logger.error('Failed to enforce DO rate limit', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return { success: true }; // Fail open
        }
    }
    
    static async enforce(
        env: Env,
        key: string,
        config: RateLimitSettings,
        limitType: RateLimitType,
        incrementBy: number = 1
    ) : Promise<RateLimitResult> {
        // If dev, don't enforce
        if (isDev(env)) {
            return { success: true };
        }
        const rateLimitConfig = config[limitType];

        switch (rateLimitConfig.store) {
            case RateLimitStore.RATE_LIMITER: {
                const result = await (env[rateLimitConfig.bindingName as keyof Env] as RateLimit).limit({ key });
                return { success: result.success };
            }
            case RateLimitStore.KV: {
                return await KVRateLimitStore.increment(env.VibecoderStore, key, rateLimitConfig as KVRateLimitConfig, incrementBy);
            }
            case RateLimitStore.DURABLE_OBJECT:
                return await this.enforceDORateLimit(env, key, rateLimitConfig as DORateLimitConfig, incrementBy);
            default:
                return { success: false };
        }
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
            const result = await this.enforce(env, key, config, RateLimitType.API_RATE_LIMIT);
            if (!result.success) {
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
            const result = await this.enforce(env, key, config, RateLimitType.AUTH_RATE_LIMIT);
            if (!result.success) {
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
            const result = await this.enforce(env, key, config, RateLimitType.APP_CREATION);
			if (!result.success) {
				this.logger.warn('App creation rate limit exceeded', {
					identifier,
					key,
					exceededLimit: result.exceededLimit,
					limitValue: result.limitValue,
					userAgent: request.headers.get('User-Agent'),
					ip: request.headers.get('CF-Connecting-IP')
				});
				captureSecurityEvent('rate_limit_exceeded', {
					limitType: RateLimitType.APP_CREATION,
					identifier,
					key,
					exceededLimit: result.exceededLimit,
					userAgent: request.headers.get('User-Agent') || undefined,
					ip: request.headers.get('CF-Connecting-IP') || undefined,
				});

				// Build error message based on which limit was exceeded
				const limitValue = result.limitValue ?? config.appCreation.limit;
				const periodSeconds = result.periodSeconds ?? config.appCreation.period;
				const periodHours = periodSeconds / 3600;
				const periodLabel = result.exceededLimit === 'daily'
					? 'day'
					: `${periodHours} hour${periodHours >= 2 ? 's' : ''}`;

				throw new RateLimitExceededError(
					`App creation rate limit exceeded. Maximum ${limitValue} apps per ${periodLabel}`,
					RateLimitType.APP_CREATION,
					limitValue,
					periodSeconds,
                    ['Please try again later when the limit resets for you.']
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
            // Increment by model's credit cost
            const modelConfig = AI_MODEL_CONFIG[model as AIModels];
            const incrementBy = modelConfig.creditCost;

			const result = await this.enforce(env, key, config, RateLimitType.LLM_CALLS, incrementBy);
			if (!result.success) {
				this.logger.warn('LLM calls rate limit exceeded', {
					identifier,
					key,
					exceededLimit: result.exceededLimit,
					limitValue: result.limitValue,
                    model,
                    incrementBy
				});
				captureSecurityEvent('rate_limit_exceeded', {
					limitType: RateLimitType.LLM_CALLS,
					identifier,
					key,
					exceededLimit: result.exceededLimit,
                    model,
                    incrementBy
				});

				// Build error message based on which limit was exceeded
				const limitValue = result.limitValue ?? config.llmCalls.limit;
				const periodSeconds = result.periodSeconds ?? config.llmCalls.period;
				const periodHours = periodSeconds / 3600;
				const periodLabel = result.exceededLimit === 'daily'
					? 'day'
					: `${periodHours} hour${periodHours >= 2 ? 's' : ''}`;

				throw new RateLimitExceededError(
					`AI inference rate limit exceeded. Consider using lighter models. Maximum ${limitValue} credits per ${periodLabel}.`,
					RateLimitType.LLM_CALLS,
					limitValue,
					periodSeconds,
                    [`Please try again later when the limit resets for you. The current model costs ${incrementBy} credits per call. Please go to settings to change your default model.`]
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