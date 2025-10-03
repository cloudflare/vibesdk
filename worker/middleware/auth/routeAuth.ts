/**
 * Route Authentication Middleware
 */

import { createMiddleware } from 'hono/factory';
import { AuthUser } from '../../types/auth-types';
import { createLogger } from '../../logger';
import { AppService } from '../../database';
import { authMiddleware } from './auth';
import { RateLimitService } from '../../services/rate-limit/rateLimits';
import { errorResponse } from '../../api/responses';
import { Context } from 'hono';
import { AppEnv } from '../../types/appenv';
import { RateLimitExceededError } from 'shared/types/errors';
import * as Sentry from '@sentry/cloudflare';
import { getUserConfigurableSettings } from 'worker/config';

const logger = createLogger('RouteAuth');

/**
 * Authentication levels for route protection
 */
export type AuthLevel = 'public' | 'authenticated' | 'owner-only';

/**
 * Authentication requirement configuration
 */
export interface AuthRequirement {
    required: boolean;
    level: 'public' | 'authenticated' | 'owner-only';
    resourceOwnershipCheck?: (user: AuthUser, params: Record<string, string>, env: Env) => Promise<boolean>;
}

/**
 * Common auth requirement configurations
 */
export const AuthConfig = {
    // Public route - no authentication required
    public: { 
        required: false,
        level: 'public' as const
    },
    
    // Require full authentication (no anonymous users)
    authenticated: { 
        required: true, 
        level: 'authenticated' as const 
    },
    
    // Require resource ownership (for app editing)
    ownerOnly: { 
        required: true, 
        level: 'owner-only' as const,
        resourceOwnershipCheck: checkAppOwnership
    },
    
    // Public read access, but owner required for modifications
    publicReadOwnerWrite: { 
        required: false 
    }
} as const;

/**
 * Route authentication logic that enforces authentication requirements
 */
export async function routeAuthChecks(
    user: AuthUser | null,
    env: Env,
    requirement: AuthRequirement,
    params?: Record<string, string>
): Promise<{ success: boolean; response?: Response }> {
    try {
        // Public routes always pass
        console.log('requirement', requirement, 'for user', user);
        if (requirement.level === 'public') {
            return { success: true };
        }

        // For authenticated routes
        if (requirement.level === 'authenticated') {
            if (!user) {
                return {
                    success: false,
                    response: createAuthRequiredResponse()
                };
            }

            return { success: true };
        }

        // For owner-only routes
        if (requirement.level === 'owner-only') {
            if (!user) {
                return {
                    success: false,
                    response: createAuthRequiredResponse('Account required')
                };
            }

            // Check resource ownership if function provided
            if (requirement.resourceOwnershipCheck) {
                if (params) {
                    const isOwner = await requirement.resourceOwnershipCheck(user, params, env);
                    return {
                        success: isOwner,
                        response: isOwner ? undefined : createForbiddenResponse('You can only access your own resources')
                    }
                }
                return {
                    success: false,
                    response: createForbiddenResponse('Invalid resource ownership')
                };
            }

            return { success: true };
        }

        // Default fallback
        return { success: true };
    } catch (error) {
        logger.error('Error in route auth middleware', error);
        return {
            success: false,
            response: new Response(JSON.stringify({
                success: false,
                error: 'Authentication check failed'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            })
        };
    }
}

/*
 * Enforce authentication requirement
 */
export async function enforceAuthRequirement(c: Context<AppEnv>) : Promise<Response | undefined> {
    let user: AuthUser | null = c.get('user') || null;

    const requirement = c.get('authLevel');
    if (!requirement) {
        logger.error('No authentication level found');
        return errorResponse('No authentication level found', 500);
    }
    
    // Only perform auth if we need it or don't have user yet
    if (!user && (requirement.level === 'authenticated' || requirement.level === 'owner-only')) {
        const userSession = await authMiddleware(c.req.raw, c.env);
        if (!userSession) {
            return errorResponse('Authentication required', 401);
        }
        user = userSession.user;
        c.set('user', user);
		c.set('sessionId', userSession.sessionId);
		Sentry.setUser({ id: user.id, email: user.email });

        const config = await getUserConfigurableSettings(c.env, user.id);
        c.set('config', config);

        try {
            await RateLimitService.enforceAuthRateLimit(c.env, config.security.rateLimit, user, c.req.raw);
        } catch (error) {
            if (error instanceof RateLimitExceededError) {
                return errorResponse(error, 429);
            }
            logger.error('Error enforcing auth rate limit', error);
            return errorResponse('Internal server error', 500);
        }
    }
    
    const params = c.req.param();
    const env = c.env;
    const result = await routeAuthChecks(user, env, requirement, params);
    if (!result.success) {
        logger.warn('Authentication check failed', result.response, requirement, user);
        return result.response;
    }
}

export function setAuthLevel(requirement: AuthRequirement) {
    return createMiddleware(async (c, next) => {
        c.set('authLevel', requirement);
        return await next();
    })
}

/**
 * Create standardized authentication required response
 */
function createAuthRequiredResponse(message?: string): Response {
    return new Response(JSON.stringify({
        success: false,
        error: {
            type: 'AUTHENTICATION_REQUIRED',
            message: message || 'Authentication required',
            action: 'login'
        }
    }), {
        status: 401,
        headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="API"'
        }
    });
}

/**
 * Create standardized forbidden response
 */
function createForbiddenResponse(message: string): Response {
    return new Response(JSON.stringify({
        success: false,
        error: {
            type: 'FORBIDDEN',
            message,
            action: 'insufficient_permissions'
        }
    }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Check if user owns an app by agent/app ID
 */
export async function checkAppOwnership(user: AuthUser, params: Record<string, string>, env: Env): Promise<boolean> {
    try {
        const agentId = params.agentId || params.id;
        if (!agentId) {
            return false;
        }

        const appService = new AppService(env);
        const ownershipResult = await appService.checkAppOwnership(agentId, user.id);
        return ownershipResult.isOwner;
    } catch (error) {
        logger.error('Error checking app ownership', error);
        return false;
    }
}