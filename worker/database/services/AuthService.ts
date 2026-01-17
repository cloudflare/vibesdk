/**
 * Main Authentication Service
 * Orchestrates all auth operations including login, registration, and OAuth
 */

import * as schema from '../schema';
import { eq, and, sql, or, lt, isNull } from 'drizzle-orm';
import { JWTUtils } from '../../utils/jwtUtils';
import { generateSecureToken } from '../../utils/cryptoUtils';
import { SessionService } from './SessionService';
import { PasswordService } from '../../utils/passwordService';
import { GoogleOAuthProvider } from '../../services/oauth/google';
import { GitHubOAuthProvider } from '../../services/oauth/github';
import { BaseOAuthProvider } from '../../services/oauth/base';
import { 
    SecurityError, 
    SecurityErrorType 
} from 'shared/types/errors';
import { AuthResult, AuthUserSession, OAuthUserInfo } from '../../types/auth-types';
import { generateId } from '../../utils/idGenerator';
import {
    AuthUser, 
    OAuthProvider
} from '../../types/auth-types';
import { mapUserResponse, validateRedirectUrl } from '../../utils/authUtils';
import { createLogger } from '../../logger';
import { validateEmail, validatePassword } from '../../utils/validationUtils';
import { extractRequestMetadata } from '../../utils/authUtils';
import { BaseService } from './BaseService';

const logger = createLogger('AuthService');

/**
 * Login credentials
 */
export interface LoginCredentials {
    email: string;
    password: string;
}

/**
 * Registration data
 */
export interface RegistrationData {
    email: string;
    password: string;
    name?: string;
}


/**
 * Main Authentication Service
 */
export class AuthService extends BaseService {
    private readonly sessionService: SessionService;
    private readonly passwordService: PasswordService;
    
    constructor(
        env: Env,
    ) {
        super(env);
        this.sessionService = new SessionService(env);
        this.passwordService = new PasswordService();
    }
    
    /**
     * Register a new user
     */
    async register(data: RegistrationData, request: Request): Promise<AuthResult> {
        try {
            // Validate email format using centralized utility
            const emailValidation = validateEmail(data.email);
            if (!emailValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    emailValidation.error || 'Invalid email format',
                    400
                );
            }
            
            // Validate password using centralized utility
            const passwordValidation = validatePassword(data.password, undefined, {
                email: data.email,
                name: data.name
            });
            if (!passwordValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    passwordValidation.errors!.join(', '),
                    400
                );
            }
            
            // Check if user already exists
            const existingUser = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, data.email.toLowerCase()))
                .get();
            
            if (existingUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email already registered',
                    400
                );
            }
            
            // Hash password
            const passwordHash = await this.passwordService.hash(data.password);
            
            // Create user
            const userId = generateId();
            const now = new Date();
            
            // Store user as verified immediately (no OTP verification required)
            await this.database.insert(schema.users).values({
                id: userId,
                email: data.email.toLowerCase(),
                passwordHash,
                displayName: data.name || data.email.split('@')[0],
                emailVerified: true, // Set as verified immediately
                provider: 'email',
                providerId: userId,
                createdAt: now,
                updatedAt: now
            });
            
            // Get the created user
            const newUser = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();
            
            if (!newUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Failed to retrieve created user',
                    500
                );
            }
            
            // Log successful registration
            await this.logAuthAttempt(data.email, 'register', true, request);
            logger.info('User registered and logged in directly', { userId, email: data.email });
            
            // Create session and tokens immediately (log user in after registration)
            const { accessToken, session } = await this.sessionService.createSession(
                userId,
                request
            );
            
            return {
                user: mapUserResponse(newUser),
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
                accessToken,
            };
        } catch (error) {
            await this.logAuthAttempt(data.email, 'register', false, request);
            
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Registration error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Registration failed',
                500
            );
        }
    }
    
    /**
     * Login with email and password
     */
    async login(credentials: LoginCredentials, request: Request): Promise<AuthResult> {
        try {
            // Find user
            const user = await this.database
                .select()
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.email, credentials.email.toLowerCase()),
                        sql`${schema.users.deletedAt} IS NULL`
                    )
                )
                .get();
            
            if (!user || !user.passwordHash) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }
            
            // Verify password
            const passwordValid = await this.passwordService.verify(
                credentials.password,
                user.passwordHash
            );
            
            if (!passwordValid) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }
            
            // Create session
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );
            
            // Log successful attempt
            await this.logAuthAttempt(credentials.email, 'login', true, request);
            
            logger.info('User logged in', { userId: user.id, email: user.email });
            
            return {
                user: mapUserResponse(user),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Login error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Login failed',
                500
            );
        }
    }
    
    /**
     * Logout
     */
    async logout(sessionId: string): Promise<void> {
        try {
            await this.sessionService.revokeSessionId(sessionId);
            logger.info('User logged out', { sessionId });
        } catch (error) {
            logger.error('Logout error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Logout failed',
                500
            );
        }
    }

    async getOauthProvider(provider: OAuthProvider, request: Request): Promise<BaseOAuthProvider> {
        const url = new URL(request.url).origin;
        
        switch (provider) {
            case 'google':
                return GoogleOAuthProvider.create(this.env, url);
            case 'github':
                return GitHubOAuthProvider.create(this.env, url);
            default:
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    `OAuth provider ${provider} not configured`,
                    400
                );
        }
    }
    
    /**
     * Get OAuth authorization URL
     */
    async getOAuthAuthorizationUrl(
        provider: OAuthProvider,
        request: Request,
        intendedRedirectUrl?: string
    ): Promise<string> {
        const oauthProvider = await this.getOauthProvider(provider, request);
        if (!oauthProvider) {
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                `OAuth provider ${provider} not configured`,
                400
            );
        }
        
        // Clean up expired OAuth states first
        await this.cleanupExpiredOAuthStates();
        
        // Validate and sanitize intended redirect URL
        let validatedRedirectUrl: string | null = null;
        if (intendedRedirectUrl) {
            validatedRedirectUrl = validateRedirectUrl(intendedRedirectUrl, request);
        }
        
        // Generate state for CSRF protection
        const state = generateSecureToken();
        
        // Generate PKCE code verifier
        const codeVerifier = BaseOAuthProvider.generateCodeVerifier();
        
        // Store OAuth state with intended redirect URL
        await this.database.insert(schema.oauthStates).values({
            id: generateId(),
            state,
            provider,
            codeVerifier,
            redirectUri: validatedRedirectUrl || oauthProvider['redirectUri'],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 600000), // 10 minutes
            isUsed: false,
            scopes: [],
            userId: null,
            nonce: null
        });
        
        // Get authorization URL
        const authUrl = await oauthProvider.getAuthorizationUrl(state, codeVerifier);
        
        logger.info('OAuth authorization initiated', { provider });
        
        return authUrl;
    }
    
    /**
     * Clean up expired OAuth states
     */
    private async cleanupExpiredOAuthStates(): Promise<void> {
        try {
            const now = new Date();
            await this.database
                .delete(schema.oauthStates)
                .where(
                    or(
                        lt(schema.oauthStates.expiresAt, now),
                        eq(schema.oauthStates.isUsed, true)
                    )
                );
            
            logger.debug('Cleaned up expired OAuth states');
        } catch (error) {
            logger.error('Error cleaning up OAuth states', error);
        }
    }
    
    /**
     * Handle OAuth callback
     */
    async handleOAuthCallback(
        provider: OAuthProvider,
        code: string,
        state: string,
        request: Request
    ): Promise<AuthResult> {
        try {
            const oauthProvider = await this.getOauthProvider(provider, request);
            if (!oauthProvider) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    `OAuth provider ${provider} not configured`,
                    400
                );
            }
            
            // Verify state
            const now = new Date();
            const oauthState = await this.database
                .select()
                .from(schema.oauthStates)
                .where(
                    and(
                        eq(schema.oauthStates.state, state),
                        eq(schema.oauthStates.provider, provider),
                        eq(schema.oauthStates.isUsed, false)
                    )
                )
                .get();
            
            if (!oauthState || new Date(oauthState.expiresAt) < now) {
                throw new SecurityError(
                    SecurityErrorType.CSRF_VIOLATION,
                    'Invalid or expired OAuth state',
                    400
                );
            }
            
            // Mark state as used
            await this.database
                .update(schema.oauthStates)
                .set({ isUsed: true })
                .where(eq(schema.oauthStates.id, oauthState.id));
            
            // Exchange code for tokens
            const tokens = await oauthProvider.exchangeCodeForTokens(
                code,
                oauthState.codeVerifier || undefined
            );
            
            // Get user info
            const oauthUserInfo = await oauthProvider.getUserInfo(tokens.accessToken);
            
            // Find or create user
            const user = await this.findOrCreateOAuthUser(provider, oauthUserInfo);
            
            // Create session
            const { accessToken: sessionAccessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );
            
            // Log auth attempt
            await this.logAuthAttempt(user.email, `oauth_${provider}`, true, request);
            
            logger.info('OAuth login successful', { userId: user.id, provider });
            
            return {
                user: mapUserResponse(user),
                accessToken: sessionAccessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
                redirectUrl: oauthState.redirectUri || undefined
            };
        } catch (error) {
            await this.logAuthAttempt('', `oauth_${provider}`, false, request);
            
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('OAuth callback error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'OAuth authentication failed',
                500
            );
        }
    }
    
    /**
     * Find or create OAuth user
     */
    private async findOrCreateOAuthUser(
        provider: OAuthProvider,
        oauthUserInfo: OAuthUserInfo
    ): Promise<schema.User> {
        // Check if user exists with this email
        let user = await this.database
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, oauthUserInfo.email.toLowerCase()))
            .get();
        
        if (!user) {
            // Create new user
            const userId = generateId();
            const now = new Date();
            
            await this.database.insert(schema.users).values({
                id: userId,
                email: oauthUserInfo.email.toLowerCase(),
                displayName: oauthUserInfo.name || oauthUserInfo.email.split('@')[0],
                avatarUrl: oauthUserInfo.picture,
                emailVerified: oauthUserInfo.emailVerified || false,
                provider: provider,
                providerId: oauthUserInfo.id,
                createdAt: now,
                updatedAt: now
            });
            
            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();
        } else {
            // Always update OAuth info and user data on login
            await this.database
                .update(schema.users)
                .set({
                    displayName: oauthUserInfo.name || user.displayName,
                    avatarUrl: oauthUserInfo.picture || user.avatarUrl,
                    provider: provider,
                    providerId: oauthUserInfo.id,
                    emailVerified: oauthUserInfo.emailVerified || user.emailVerified,
                    updatedAt: new Date()
                })
                .where(eq(schema.users.id, user.id));
            
            // Refresh user data after updates
            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id))
                .get();
        }
        
        return user!;
    }
    
    /**
     * Log authentication attempt
     */
    private async logAuthAttempt(
        identifier: string,
        attemptType: string,
        success: boolean,
        request: Request
    ): Promise<void> {
        try {
            const requestMetadata = extractRequestMetadata(request);
            
            await this.database.insert(schema.authAttempts).values({
                identifier: identifier.toLowerCase(),
                attemptType: attemptType as 'login' | 'register' | 'oauth_google' | 'oauth_github' | 'refresh' | 'reset_password',
                success: success,
                ipAddress: requestMetadata.ipAddress
            });
        } catch (error) {
            logger.error('Failed to log auth attempt', error);
        }
    }
    
    /**
     * Generate and store verification OTP for email
     */
    private async generateAndStoreVerificationOtp(email: string): Promise<void> {
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

        // Store OTP in database (you may need to create a verification_otps table)
        await this.database.insert(schema.verificationOtps).values({
            id: generateId(),
            email: email.toLowerCase(),
            otp: await this.passwordService.hash(otp), // Hash the OTP for security
            expiresAt,
            createdAt: new Date()
        });

        // TODO: Send email with OTP (integrate with email service)
        logger.info('Verification OTP generated', { email, otp: otp.slice(0, 2) + '****' });
    }

    /**
     * Verify email with OTP
     */
    async verifyEmailWithOtp(email: string, otp: string, request: Request): Promise<AuthResult> {
        try {
            // Find valid OTP
            const storedOtp = await this.database
                .select()
                .from(schema.verificationOtps)
                .where(
                    and(
                        eq(schema.verificationOtps.email, email.toLowerCase()),
                        eq(schema.verificationOtps.used, false),
                        sql`${schema.verificationOtps.expiresAt} > ${new Date()}`
                    )
                )
                .orderBy(sql`${schema.verificationOtps.createdAt} DESC`)
                .get();

            if (!storedOtp) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Invalid or expired verification code',
                    400
                );
            }

            // Verify OTP
            const otpValid = await this.passwordService.verify(otp, storedOtp.otp);
            if (!otpValid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Invalid verification code',
                    400
                );
            }

            // Mark OTP as used
            await this.database
                .update(schema.verificationOtps)
                .set({ used: true, usedAt: new Date() })
                .where(eq(schema.verificationOtps.id, storedOtp.id));

            // Find and verify the user
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'User not found',
                    404
                );
            }

            // Update user as verified
            await this.database
                .update(schema.users)
                .set({ emailVerified: true, updatedAt: new Date() })
                .where(eq(schema.users.id, user.id));

            // Create session for verified user
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            // Log successful verification
            await this.logAuthAttempt(email, 'email_verification', true, request);
            logger.info('Email verified successfully', { email, userId: user.id });

            return {
                user: mapUserResponse({ ...user, emailVerified: true }),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            await this.logAuthAttempt(email, 'email_verification', false, request);
            
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Email verification error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Email verification failed',
                500
            );
        }
    }

    /**
     * Get user for authentication (for middleware)
     */
    async getUserForAuth(userId: string): Promise<AuthUser | null> {
        try {
            const user = await this.database
                .select({
                    id: schema.users.id,
                    email: schema.users.email,
                    displayName: schema.users.displayName,
                    username: schema.users.username,
                    avatarUrl: schema.users.avatarUrl,
                    bio: schema.users.bio,
                    timezone: schema.users.timezone,
                    provider: schema.users.provider,
                    emailVerified: schema.users.emailVerified,
                    createdAt: schema.users.createdAt,
                })
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.id, userId),
                        isNull(schema.users.deletedAt)
                    )
                )
                .get()
                .catch((error: unknown) => {
                    logger.error('getUserForAuth query failed', {
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                        errorCause: (error as any)?.cause,
                        errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
                        userId
                    });
                    throw error;
                });
            
            if (!user) {
                logger.debug('User not found for auth', { userId });
                return null;
            }
            
            return mapUserResponse(user);
        } catch (error: unknown) {
            logger.error('Error getting user for auth', {
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorCause: (error as any)?.cause,
                userId
            });
            return null;
        }
    }
    
    /**
     * Validate token and return user (for middleware)
     */
    async validateTokenAndGetUser(token: string, env: Env): Promise<AuthUserSession | null> {
        try {
            const jwtUtils = JWTUtils.getInstance(env);
            const payload = await jwtUtils.verifyToken(token);
            
            if (!payload || payload.type !== 'access') {
                return null;
            }
            
            // Check if token is expired
            if (payload.exp * 1000 < Date.now()) {
                logger.debug('Token expired', { exp: payload.exp });
                return null;
            }
            
            // Get user from database
            const user = await this.getUserForAuth(payload.sub);
            if (!user) {
                return null;
            }
            
            return {
                user,
                sessionId: payload.sessionId,
            };
        } catch (error) {
            logger.error('Token validation error', error);
            return null;
        }
    }
    
    /**
     * Resend verification OTP
     */
    async resendVerificationOtp(email: string): Promise<void> {
        try {
            // Check if user exists and is unverified
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'No account found with this email',
                    404
                );
            }

            if (user.emailVerified) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email is already verified',
                    400
                );
            }

            // Invalidate existing OTPs
            await this.database
                .update(schema.verificationOtps)
                .set({ used: true, usedAt: new Date() })
                .where(
                    and(
                        eq(schema.verificationOtps.email, email.toLowerCase()),
                        eq(schema.verificationOtps.used, false)
                    )
                );

            // Generate new OTP
            await this.generateAndStoreVerificationOtp(email.toLowerCase());
            
            logger.info('Verification OTP resent', { email });
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Resend verification OTP error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Failed to resend verification code',
                500
            );
        }
    }
}