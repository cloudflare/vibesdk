import { RateLimitType, RateLimitStore, RateLimitSettings, DORateLimitConfig, KVRateLimitConfig } from './config';
import { createObjectLogger } from '../../logger';
import { AuthUser } from '../../types/auth-types';
import { extractRequestMetadata } from '../../utils/authUtils';
import { captureSecurityEvent } from '../../observability/sentry';
import { KVRateLimitStore } from './KVRateLimitStore';
import { RateLimitResult } from './DORateLimitStore';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { isDev } from 'worker/utils/envs';
import { AI_MODEL_CONFIG, AIModels } from 'worker/agents/inferutils/config.types';

interface LLMCallRateLimitOptions {
	creditCost?: number;
	throwOnExceeded?: boolean;
}

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
        // Anonymous requests key on network identity ONLY. Any bearer token here
        // is unverified (no signature/expiry/session check); trusting its hash lets
        // a client opt out of the IP bucket by rotating a random string per request.
        // Verified identity is keyed as user:${id} via getUniversalIdentifier.
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
                dailyLimit: config.dailyLimit,
                calendarDaily: config.calendarDaily,
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
    ): Promise<RateLimitResult> {
        const rateLimitConfig = config[limitType];
        
        // In dev mode, only skip binding-based rate limiters (they don't work locally)
        // DO-based rate limiting works locally
        if (isDev(env) && rateLimitConfig.store === RateLimitStore.RATE_LIMITER) {
            return { success: true };
        }
        
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

    /**
     * Per-client limit for the unauthenticated public app discovery endpoints
     * (listing + detail). Layered on top of the global API limiter to make
     * bulk-harvest / scan attacks more expensive. Throws RateLimitExceededError
     * when the limit is exceeded.
     */
    static async enforcePublicAppsRateLimit(
        env: Env,
        config: RateLimitSettings,
        user: AuthUser | null,
        request: Request
    ): Promise<void> {
        if (!config[RateLimitType.PUBLIC_APPS].enabled) {
            return;
        }
        const identifier = await this.getUniversalIdentifier(user, request);

        const key = this.buildRateLimitKey(RateLimitType.PUBLIC_APPS, identifier);

        try {
            const result = await this.enforce(env, key, config, RateLimitType.PUBLIC_APPS);
            if (!result.success) {
                this.logger.warn('Public apps rate limit exceeded', {
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent'),
                    ip: request.headers.get('CF-Connecting-IP')
                });
                captureSecurityEvent('rate_limit_exceeded', {
                    limitType: RateLimitType.PUBLIC_APPS,
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent') || undefined,
                    ip: request.headers.get('CF-Connecting-IP') || undefined,
                });
                throw new RateLimitExceededError(`Public apps rate limit exceeded`, RateLimitType.PUBLIC_APPS);
            }
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            this.logger.error('Failed to enforce public apps rate limit', error);
        }
    }

    /**
     * Per-preview-token rate limit for SpaceDO previews. These are dispatched
     * outside the Hono chain (via handleSpacePreview -> SpaceDO stub.fetch), so
     * the global API limiter never runs. `tokenId` should be an opaque,
     * non-reversible identifier for the preview token (e.g. a hash), never the
     * raw token. Throws RateLimitExceededError when the limit is exceeded.
     */
    static async enforceSpacePreviewRateLimit(
        env: Env,
        config: RateLimitSettings,
        tokenId: string,
        request: Request
    ): Promise<void> {
        if (!config[RateLimitType.SPACE_PREVIEW].enabled) {
            return;
        }
        const identifier = `preview:${tokenId}`;
        const key = this.buildRateLimitKey(RateLimitType.SPACE_PREVIEW, identifier);

        try {
            const result = await this.enforce(env, key, config, RateLimitType.SPACE_PREVIEW);
            if (!result.success) {
                this.logger.warn('Space preview rate limit exceeded', {
                    key,
                    userAgent: request.headers.get('User-Agent'),
                    ip: request.headers.get('CF-Connecting-IP'),
                });
                captureSecurityEvent('rate_limit_exceeded', {
                    limitType: RateLimitType.SPACE_PREVIEW,
                    identifier,
                    key,
                    userAgent: request.headers.get('User-Agent') || undefined,
                    ip: request.headers.get('CF-Connecting-IP') || undefined,
                });
                throw new RateLimitExceededError(`Space preview rate limit exceeded`, RateLimitType.SPACE_PREVIEW);
            }
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            this.logger.error('Failed to enforce space preview rate limit', error);
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

	/**
	 * Get remaining credits for LLM calls without incrementing (for pre-flight checks)
	 * Works in both dev and prod - uses local DO in dev mode
	 */
	static async getRemainingCredits(
		env: Env,
		config: RateLimitSettings,
		userId: string
	): Promise<{ remaining: number; limit: number; dailyRemaining?: number; dailyLimit?: number }> {
		const identifier = `user:${userId}`;
		const key = this.buildRateLimitKey(RateLimitType.LLM_CALLS, identifier);
		const llmConfig = config[RateLimitType.LLM_CALLS] as DORateLimitConfig;

		try {
			const stub = env.DORateLimitStore.getByName(key);
			const remaining = await stub.getRemainingLimit(key, {
				limit: llmConfig.limit,
				period: llmConfig.period,
				dailyLimit: llmConfig.dailyLimit,
				bucketSize: llmConfig.bucketSize,
				calendarDaily: llmConfig.calendarDaily,
			});

			return {
				remaining,
				limit: llmConfig.limit,
				dailyLimit: llmConfig.dailyLimit,
			};
		} catch (error) {
			this.logger.error('Failed to get remaining credits', {
				key,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			// Fail open - return full limit
			return {
				remaining: llmConfig.limit,
				limit: llmConfig.limit,
				dailyLimit: llmConfig.dailyLimit,
			};
		}
	}

	/**
	 * Check if user is within free tier limits (without incrementing)
	 */
	static async isWithinLimits(
		env: Env,
		config: RateLimitSettings,
		userId: string
	): Promise<boolean> {
		const { remaining } = await this.getRemainingCredits(env, config, userId);
		return remaining > 0;
	}

	static async enforceLLMCallsRateLimit(
        env: Env,
		config: RateLimitSettings,
		userId: string,
        model: AIModels | string,
        suffix: string = "",
		isUsingBYOK: boolean = false,
		hasCloudflareConfigured: boolean = false,
		options: LLMCallRateLimitOptions = {},
	): Promise<void> {

		const llmConfig = config[RateLimitType.LLM_CALLS];
		if (!llmConfig.enabled) {
			return;
		}

		// Skip rate limiting for BYOK users if configured
		if (isUsingBYOK && llmConfig.excludeBYOKUsers) {
			this.logger.debug('Skipping rate limit for BYOK user', { userId });
			return;
		}

		// Skip rate limiting for Cloudflare-connected users if configured
		if (hasCloudflareConfigured && llmConfig.excludeCloudflareConnected) {
			this.logger.debug('Skipping rate limit for Cloudflare-connected user', { userId });
			return;
		}

		const identifier = `user:${userId}`;
		
		const key = this.buildRateLimitKey(RateLimitType.LLM_CALLS, `${identifier}${suffix}`);
		
		try {
			const incrementBy = options.creditCost ?? AI_MODEL_CONFIG[model as AIModels]?.creditCost;
			if (!incrementBy || incrementBy <= 0) {
				return;
			}

			const result = await this.enforce(env, key, config, RateLimitType.LLM_CALLS, incrementBy);
			if (!result.success && options.throwOnExceeded !== false) {
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