/**
 * Secure Authentication Controller
 */

import { AuthService } from '../../../database/services/AuthService';
import { SessionService } from '../../../database/services/SessionService';
import { UserService } from '../../../database/services/UserService';
import { ApiKeyService } from '../../../database/services/ApiKeyService';
import { generateApiKey, sha256Hash } from '../../../utils/cryptoUtils';
import { 
    loginSchema, 
    registerSchema, 
    oauthProviderSchema
} from './authSchemas';
import { SecurityError } from 'shared/types/errors';
import {
    formatAuthResponse,
    mapUserResponse,
    setSecureAuthCookies,
	clearAuthCookies,
	extractSessionId
} from '../../../utils/authUtils';
import { JWTUtils } from '../../../utils/jwtUtils';
import { RouteContext } from '../../types/route-context';
import { authMiddleware } from '../../../middleware/auth/auth';
import { CsrfService } from '../../../services/csrf/CsrfService';
import { BaseController } from '../baseController';
import { createLogger } from '../../../logger';
/**
 * Authentication Controller
 */
export class AuthController extends BaseController {
    static logger = createLogger('AuthController');
    /**
     * Check if OAuth providers are configured
     */
    static hasOAuthProviders(env: Env): boolean {
        return (!!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET) || 
               (!!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET);
    }
    
    /**
     * Register a new user
     * POST /api/auth/register
     */
    static async register(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Check if OAuth providers are configured - if yes, block email/password registration
            if (AuthController.hasOAuthProviders(env)) {
                return AuthController.createErrorResponse(
                    'Email/password registration is not available when OAuth providers are configured. Please use OAuth login instead.',
                    403
                );
            }

            const bodyResult = await AuthController.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const validatedData = registerSchema.parse(bodyResult.data);

            if (env.ALLOWED_EMAIL && validatedData.email !== env.ALLOWED_EMAIL) {
                return AuthController.createErrorResponse(
                    'Email Whitelisting is enabled. Please use the allowed email to register.',
                    403
                );
            }
            
            const authService = new AuthService(env);
            const result = await authService.register(validatedData, request);
            
            const response = AuthController.createSuccessResponse(
                formatAuthResponse(result.user, result.sessionId, result.expiresAt)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: SessionService.config.sessionTTL
            });
            
            // Rotate CSRF token on successful registration if configured
            if (CsrfService.defaults.rotateOnAuth) {
                CsrfService.rotateToken(response);
            }
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return AuthController.createErrorResponse(error.message, error.statusCode);
            }
            
            return AuthController.handleError(error, 'register user');
        }
    }
    
    /**
     * Login with email and password
     * POST /api/auth/login
     */
    static async login(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Check if OAuth providers are configured - if yes, block email/password login
            if (AuthController.hasOAuthProviders(env)) {
                return AuthController.createErrorResponse(
                    'Email/password login is not available when OAuth providers are configured. Please use OAuth login instead.',
                    403
                );
            }

            const bodyResult = await AuthController.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const validatedData = loginSchema.parse(bodyResult.data);

            if (env.ALLOWED_EMAIL && validatedData.email !== env.ALLOWED_EMAIL) {
                return AuthController.createErrorResponse(
                    'Email Whitelisting is enabled. Please use the allowed email to login.',
                    403
                );
            }
            
            const authService = new AuthService(env);
            const result = await authService.login(validatedData, request);
            
            const response = AuthController.createSuccessResponse(
                formatAuthResponse(result.user, result.sessionId, result.expiresAt)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: SessionService.config.sessionTTL
            });
            
            // Rotate CSRF token on successful login if configured
            if (CsrfService.defaults.rotateOnAuth) {
                CsrfService.rotateToken(response);
            }
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return AuthController.createErrorResponse(error.message, error.statusCode);
            }
            
            return AuthController.handleError(error, 'login user');
        }
    }
    
    /**
     * Logout current user
     * POST /api/auth/logout
     */
    static async logout(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const sessionId = extractSessionId(request);
			if (sessionId) {
				try {
					const sessionService = new SessionService(env);
					await sessionService.revokeSessionId(sessionId);
				} catch (error) {
					this.logger.debug(
						'Failed to properly logout session',
						error,
					);
				}
			}
                        
            const response = AuthController.createSuccessResponse({ 
                success: true, 
                message: 'Logged out successfully' 
            });
            
            clearAuthCookies(response);
            
            // Clear CSRF token on logout
            CsrfService.clearTokenCookie(response);
            
            return response;
        } catch (error) {
            this.logger.error('Logout failed', error);
            
            const response = AuthController.createSuccessResponse({ 
                success: true, 
                message: 'Logged out' 
            });
            
            clearAuthCookies(response);
            
            // Clear CSRF token on logout
            CsrfService.clearTokenCookie(response);
            
            return response;
        }
    }
    
    /**
     * Get current user profile
     * GET /api/auth/profile
     */
    static async getProfile(_request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            if (!routeContext.user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }
            return AuthController.createSuccessResponse({
                user: mapUserResponse(routeContext.user),
                sessionId: routeContext.sessionId
            });
        } catch (error) {
            return AuthController.handleError(error, 'get profile');
        }
    }
    
    /**
     * Update user profile
     * PUT /api/auth/profile
     */
    static async updateProfile(request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }
            
            const bodyResult = await AuthController.parseJsonBody<{
                displayName?: string;
                username?: string;
                bio?: string;
                theme?: 'light' | 'dark' | 'system';
                timezone?: string;
            }>(request);
            
            if (!bodyResult.success) {
                return bodyResult.response!;
            }
            
            const updateData = bodyResult.data!;
            const userService = new UserService(env);
            
            if (updateData.username) {
                const isAvailable = await userService.isUsernameAvailable(updateData.username, user.id);
                if (!isAvailable) {
                    return AuthController.createErrorResponse('Username already taken', 400);
                }
            }
            
            await userService.updateUserProfile(user.id, {
                displayName: updateData.displayName,
                username: updateData.username,
                bio: updateData.bio,
                avatarUrl: undefined,
                timezone: updateData.timezone
            });
            
            const updatedUser = await userService.findUser({ id: user.id });
            
            if (!updatedUser) {
                return AuthController.createErrorResponse('User not found', 404);
            }
            
            return AuthController.createSuccessResponse({
                user: mapUserResponse(updatedUser),
                message: 'Profile updated successfully'
            });
        } catch (error) {
            return AuthController.handleError(error, 'update profile');
        }
    }
    
    /**
     * Initiate OAuth flow
     * GET /api/auth/oauth/:provider
     */
    static async initiateOAuth(request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const validatedProvider = oauthProviderSchema.parse(routeContext.pathParams.provider);
            
            // Get intended redirect URL from query parameter
            const intendedRedirectUrl = routeContext.queryParams.get('redirect_url') || undefined;
            
            const authService = new AuthService(env);
            const authUrl = await authService.getOAuthAuthorizationUrl(
                validatedProvider,
                request,
                intendedRedirectUrl
            );
            
            return Response.redirect(authUrl, 302);
        } catch (error) {
            this.logger.error('OAuth initiation failed', error);
            
            if (error instanceof SecurityError) {
                return AuthController.createErrorResponse(error.message, error.statusCode);
            }
            
            return AuthController.handleError(error, 'initiate OAuth');
        }
    }
    
    /**
     * Handle OAuth callback
     * GET /api/auth/callback/:provider
     */
    static async handleOAuthCallback(request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const validatedProvider = oauthProviderSchema.parse(routeContext.pathParams.provider);
            
            const code = routeContext.queryParams.get('code');
            const state = routeContext.queryParams.get('state');
            const error = routeContext.queryParams.get('error');
            
            if (error) {
                this.logger.error('OAuth provider returned error', { provider: validatedProvider, error });
                const baseUrl = new URL(request.url).origin;
                return Response.redirect(`${baseUrl}/?error=oauth_failed`, 302);
            }
            
            if (!code || !state) {
                const baseUrl = new URL(request.url).origin;
                return Response.redirect(`${baseUrl}/?error=missing_params`, 302);
            }
            
            const authService = new AuthService(env);
            const result = await authService.handleOAuthCallback(
                validatedProvider,
                code,
                state,
                request
            );
            
            const baseUrl = new URL(request.url).origin;
            
            // Use stored redirect URL or default to home page
            const redirectLocation = result.redirectUrl || `${baseUrl}/`;
            
            // Create redirect response with secure auth cookies
            const response = new Response(null, {
                status: 302,
                headers: {
                    'Location': redirectLocation
                }
            });
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
            });
            
            return response;
        } catch (error) {
            this.logger.error('OAuth callback failed', error);
            const baseUrl = new URL(request.url).origin;
            return Response.redirect(`${baseUrl}/?error=auth_failed`, 302);
        }
    }

    /**
     * Check authentication status
     * GET /api/auth/check
     */
    static async checkAuth(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Use the same middleware authentication logic but don't require auth
            const userSession = await authMiddleware(request, env);
            
            if (!userSession) {
                return AuthController.createSuccessResponse({
                    authenticated: false,
                    user: null
                });
            }
            
            return AuthController.createSuccessResponse({
                authenticated: true,
                user: {
                    id: userSession.user.id,
                    email: userSession.user.email,
                    displayName: userSession.user.displayName
                },
                sessionId: userSession.sessionId
            });
        } catch (error) {
            return AuthController.createSuccessResponse({
                authenticated: false,
                user: null
            });
        }
    }

    /**
     * Get active sessions for current user
     * GET /api/auth/sessions
     */
    static async getActiveSessions(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }

            const sessionService = new SessionService(env);
            const sessions = await sessionService.getUserSessions(user.id);

            return AuthController.createSuccessResponse({
                sessions: sessions
            });
        } catch (error) {
            return AuthController.handleError(error, 'get active sessions');
        }
    }

    /**
     * Revoke a specific session
     * DELETE /api/auth/sessions/:sessionId
     */
    static async revokeSession(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }

            // Extract session ID from URL
            const sessionIdToRevoke = routeContext.pathParams.sessionId;

            const sessionService = new SessionService(env);
            
            await sessionService.revokeUserSession(sessionIdToRevoke, user.id);

            return AuthController.createSuccessResponse({
                message: 'Session revoked successfully'
            });
        } catch (error) {
            return AuthController.handleError(error, 'revoke session');
        }
    }

    /**
     * Get API keys for current user
     * GET /api/auth/api-keys
     */
    static async getApiKeys(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }

            const apiKeyService = new ApiKeyService(env);
            const keys = await apiKeyService.getUserApiKeys(user.id);

            return AuthController.createSuccessResponse({
                keys: keys.map(key => ({
                    id: key.id,
                    name: key.name,
                    keyPreview: key.keyPreview,
                    createdAt: key.createdAt,
                    lastUsed: key.lastUsed,
                    isActive: !!key.isActive
                }))
            });
        } catch (error) {
            return AuthController.handleError(error, 'get API keys');
        }
    }

    // Maximum number of API keys a user can create
    private static readonly MAX_API_KEYS_PER_USER = 25;

    /**
     * Create a new API key
     * POST /api/auth/api-keys
     */
    static async createApiKey(request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }

            const bodyResult = await AuthController.parseJsonBody<{ name?: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { name } = bodyResult.data!;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return AuthController.createErrorResponse('API key name is required', 400);
            }

            const sanitizedName = name.trim().substring(0, 100);

            // Check if user has reached the maximum number of API keys
            const apiKeyService = new ApiKeyService(env);
            const activeKeyCount = await apiKeyService.getActiveApiKeyCount(user.id);
            if (activeKeyCount >= AuthController.MAX_API_KEYS_PER_USER) {
                return AuthController.createErrorResponse(
                    `Maximum of ${AuthController.MAX_API_KEYS_PER_USER} API keys allowed. Please revoke an existing key before creating a new one.`,
                    400
                );
            }

            const { key, keyHash, keyPreview } = await generateApiKey();
            await apiKeyService.createApiKey({
                userId: user.id,
                name: sanitizedName,
                keyHash,
                keyPreview
            });

            this.logger.info('API key created', { userId: user.id, name: sanitizedName });

            return AuthController.createSuccessResponse({
                key, // Return the actual key only once
                keyPreview,
                name: sanitizedName,
                message: 'API key created successfully'
            });
        } catch (error) {
            return AuthController.handleError(error, 'create API key');
        }
    }

    /**
     * Revoke an API key
     * DELETE /api/auth/api-keys/:keyId
     */
    static async revokeApiKey(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return AuthController.createErrorResponse('Unauthorized', 401);
            }

            const keyId = routeContext.pathParams.keyId;            
            
            const apiKeyService = new ApiKeyService(env);
            await apiKeyService.revokeApiKey(keyId, user.id);

            this.logger.info('API key revoked', { userId: user.id, keyId });

            return AuthController.createSuccessResponse({
                message: 'API key revoked successfully'
            });
        } catch (error) {
            return AuthController.handleError(error, 'revoke API key');
        }
    }

    /**
     * Exchange API key for a short-lived access token.
     * POST /api/auth/exchange-api-key
     *
     * Security notes:
     * - Does not create a D1 session row.
     * - Accepts API key only via Authorization Bearer or X-API-Key.
     * - Performs basic format/size checks to reduce abuse.
     */
    static async exchangeApiKey(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const authHeader = request.headers.get('Authorization')?.trim();
            const xApiKey = request.headers.get('X-API-Key')?.trim();

            let apiKeyRaw: string | null = null;
            if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
                apiKeyRaw = authHeader.slice('bearer '.length).trim();
            } else if (xApiKey) {
                apiKeyRaw = xApiKey;
            }

            if (!apiKeyRaw) {
                return AuthController.createErrorResponse('Missing API key', 401);
            }

            // Basic hardening: avoid hashing arbitrarily large inputs
            if (apiKeyRaw.length > 256) {
                return AuthController.createErrorResponse('Invalid API key', 401);
            }

            // Only accept base64url-ish keys (matches generateApiKey())
            if (!/^[A-Za-z0-9_-]+$/.test(apiKeyRaw)) {
                return AuthController.createErrorResponse('Invalid API key', 401);
            }

            const keyHash = await sha256Hash(apiKeyRaw);
            const apiKeyService = new ApiKeyService(env);
            const apiKey = await apiKeyService.findApiKeyByHash(keyHash);
            if (!apiKey) {
                return AuthController.createErrorResponse('Invalid API key', 401);
            }

            const userService = new UserService(env);
            const user = await userService.findUser({ id: apiKey.userId });
            if (!user) {
                return AuthController.createErrorResponse('Invalid API key', 401);
            }

            // Check user account status
            if (user.deletedAt || !user.isActive || user.isSuspended) {
                return AuthController.createErrorResponse('Invalid API key', 401);
            }
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                return AuthController.createErrorResponse('Account temporarily locked', 401);
            }

            const jwtUtils = JWTUtils.getInstance(env);
            const expiresIn = 15 * 60; // 15 minutes
            const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

            const sessionId = `api_key:${apiKey.id}`;
            const accessToken = await jwtUtils.createToken(
                {
                    sub: user.id,
                    email: user.email,
                    type: 'access',
                    sessionId,
                },
                expiresIn,
            );

            await apiKeyService.updateApiKeyLastUsed(apiKey.id);

            return AuthController.createSuccessResponse({
                accessToken,
                expiresIn,
                expiresAt,
                apiKeyId: apiKey.id,
                user: mapUserResponse(user),
            });
        } catch (error) {
            return AuthController.handleError(error, 'exchange API key');
        }
    }

    /**
     * Verify email with OTP
     * POST /api/auth/verify-email
     */
    static async verifyEmail(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const bodyResult = await AuthController.parseJsonBody<{ email: string; otp: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { email, otp } = bodyResult.data!;

            if (!email || !otp) {
                return AuthController.createErrorResponse('Email and OTP are required', 400);
            }

            const authService = new AuthService(env);
            const result = await authService.verifyEmailWithOtp(email, otp, request);
            
            const response = AuthController.createSuccessResponse(
                formatAuthResponse(result.user, result.sessionId, result.expiresAt)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: SessionService.config.sessionTTL
            });
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return AuthController.createErrorResponse(error.message, error.statusCode);
            }
            
            return AuthController.handleError(error, 'verify email');
        }
    }

    /**
     * Resend verification OTP
     * POST /api/auth/resend-verification
     */
    static async resendVerificationOtp(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const bodyResult = await AuthController.parseJsonBody<{ email: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { email } = bodyResult.data!;

            if (!email) {
                return AuthController.createErrorResponse('Email is required', 400);
            }

            const authService = new AuthService(env);
            await authService.resendVerificationOtp(email);
            
            return AuthController.createSuccessResponse({
                message: 'Verification code sent successfully'
            });
        } catch (error) {
            if (error instanceof SecurityError) {
                return AuthController.createErrorResponse(error.message, error.statusCode);
            }
            
            return AuthController.handleError(error, 'resend verification OTP');
        }
    }

    /**
     * Get CSRF token with proper expiration and rotation
     * GET /api/auth/csrf-token
     */
    static async getCsrfToken(request: Request, _env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const token = CsrfService.getOrGenerateToken(request, false);
            
            const response = AuthController.createSuccessResponse({ 
                token,
                headerName: CsrfService.defaults.headerName,
                expiresIn: Math.floor(CsrfService.defaults.tokenTTL / 1000)
            });
            
            // Set the token in cookie with proper expiration
            const maxAge = Math.floor(CsrfService.defaults.tokenTTL / 1000);
            CsrfService.setTokenCookie(response, token, maxAge);
            
            return response;
        } catch (error) {
            return AuthController.handleError(error, 'get CSRF token');
        }
    }
    
    /**
     * Get available authentication providers
     * GET /api/auth/providers
     */
    static async getAuthProviders(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext
    ): Promise<Response> {
        try {
            const providers = {
                google: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
                github: !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET,
                email: true
            };
            
            // Include CSRF token with provider info
            const csrfToken = CsrfService.getOrGenerateToken(request, false);
            
            const response = AuthController.createSuccessResponse({
                providers,
                hasOAuth: providers.google || providers.github,
                requiresEmailAuth: !providers.google && !providers.github,
                csrfToken,
                csrfExpiresIn: Math.floor(CsrfService.defaults.tokenTTL / 1000)
            });
            
            // Set CSRF token cookie with proper expiration
            const maxAge = Math.floor(CsrfService.defaults.tokenTTL / 1000);
            CsrfService.setTokenCookie(response, csrfToken, maxAge);
            
            return response;
        } catch (error) {
            this.logger.error('Get auth providers error', error);
            return AuthController.createErrorResponse('Failed to get authentication providers', 500);
        }
    }
}
