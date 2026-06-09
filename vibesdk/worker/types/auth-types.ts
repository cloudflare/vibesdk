/**
 * Authentication Type Definitions
 */

import type { ApiKey, AuthAttempt as SchemaAuthAttempt, AuditLog, OAuthState } from '../database/schema';

/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'github';

/**
 * Authenticated user for middleware and session context
 */
export interface AuthUser {
	id: string;
	email: string;
	displayName?: string;
	username?: string;
	avatarUrl?: string;
    bio?: string;
    timezone?: string;
    provider?: string;
    emailVerified?: boolean;
    createdAt?: Date;
    isAnonymous?: boolean;
}

/**
 * Session information for active authentication
 */
export interface AuthSession {
	userId: string;
	email: string;
	sessionId: string;
	expiresAt: Date | null;
};

/**
 * Token payload structure for JWT tokens
 */
export interface TokenPayload {
	// Standard JWT claims
	sub: string; // User ID
	iat: number; // Issued at
	exp: number; // Expires at

	// Custom claims
	email: string;
	type: 'access' | 'refresh';
	jti?: string; // JWT ID (for refresh tokens)

	// Session context
	sessionId: string;

	// Security metadata
	ipHash?: string; // Hashed IP for security validation
}

export interface AuthUserSession {
    user: AuthUser;
    sessionId: string;
}

/**
 * Authentication result from login/register operations
 */
export interface AuthResult extends AuthUserSession {
    expiresAt: Date | null;
	accessToken: string;
	isNewUser?: boolean;
	requiresEmailVerification?: boolean;
	redirectUrl?: string;
};

/**
 * OAuth provider user information
 */
export interface OAuthUserInfo {
	id: string;
	email: string;
	name?: string;
	picture?: string;
	emailVerified?: boolean;
	locale?: string;

	// Provider-specific data
	providerData?: Record<string, unknown>;
}

/**
 * OAuth tokens from provider
 */
export interface OAuthTokens {
	accessToken: string;
	refreshToken?: string;
	idToken?: string;
	tokenType: string;
	expiresIn?: number;
	scope?: string;
}

/**
 * OAuth state for secure authentication flow
 * Uses OAuthState schema with typed provider
 */
export type OAuthStateData = Omit<OAuthState, 'provider'> & {
	provider: OAuthProvider;
};

/**
 * API Key info for client display
 * Subset of ApiKey schema without sensitive data
 */
export type ApiKeyInfo = Pick<ApiKey, 'id' | 'name' | 'keyPreview' | 'createdAt' | 'lastUsed' | 'isActive'>;

/**
 * Re-export AuthAttempt from schema
 */
export type { SchemaAuthAttempt as AuthAttempt };

/**
 * Password validation result with strength scoring
 */
export interface PasswordValidationResult {
	valid: boolean;
	errors?: string[];
	score: number; // 0-4 strength score

	// Detailed validation
	requirements?: {
		minLength: boolean;
		hasLowercase: boolean;
		hasUppercase: boolean;
		hasNumbers: boolean;
		hasSpecialChars: boolean;
		notCommon: boolean;
		noSequential: boolean;
	};

	// Suggestions for improvement
	suggestions?: string[];
}

/**
 * Security context for authentication operations
 */
export interface SecurityContext {
	// Request metadata
	ipAddress: string;
	userAgent: string;
	requestId: string;

	// Geographic and network info
	country?: string;
	region?: string;
	isp?: string;

	// Device fingerprinting
	deviceFingerprint?: string;

	// Risk assessment
	riskScore?: number; // 0-100
	riskFactors?: string[];
}

/**
 * Audit log entry with security context
 */
export type AuditLogEntry = AuditLog & {
	securityContext?: Partial<SecurityContext>;
};

/**
 * WebSocket ticket for secure, one-time-use authentication
 * Stored in Agent DO memory, consumed on WebSocket connection
 */
export interface PendingWsTicket {
	token: string;
	user: AuthUser;
	sessionId: string;
	createdAt: number;
	expiresAt: number;
}

/**
 * Result of ticket consumption from Agent DO
 */
export interface TicketConsumptionResult {
	user: AuthUser;
	sessionId: string;
}
