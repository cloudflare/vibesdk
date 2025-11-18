/**
 * Centralized Authentication Utilities
 */

import type {  AuthUser } from '../types/auth-types';
import type { User } from '../database/schema';

/**
 * Extract sessionId from cookie
*/
export function extractSessionId(request: Request): string | null {
    const cookieHeader = request.headers.get('Cookie');
       if (!cookieHeader) {
               return null;
       }

       const cookies = parseCookies(cookieHeader);
       return cookies['sessionId'];
}


/**
 * Token extraction priorities and methods
 */
export enum TokenExtractionMethod {
	AUTHORIZATION_HEADER = 'authorization_header',
	COOKIE = 'cookie',
	QUERY_PARAMETER = 'query_parameter',
}

/**
 * Result of token extraction with metadata
 */
export interface TokenExtractionResult {
	token: string | null;
	method?: TokenExtractionMethod;
	cookieName?: string;
}

/**
 * Extract JWT token from request with multiple fallback methods
 * Prioritizes Authorization header, then cookies, then query parameters
 */
export function extractToken(request: Request): string | null {
	const result = extractTokenWithMetadata(request);
	return result.token;
}

/**
 * Extract JWT token from request with extraction method metadata
 * Useful for security logging and analysis
 */
export function extractTokenWithMetadata(
	request: Request,
): TokenExtractionResult {
	// Priority 1: Authorization header (most secure)
	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.substring(7);
		if (token && token.length > 0) {
			return {
				token,
				method: TokenExtractionMethod.AUTHORIZATION_HEADER,
			};
		}
	}

	// Priority 2: Cookies (secure for browser requests)
	const cookieHeader = request.headers.get('Cookie');
	if (cookieHeader) {
		const cookies = parseCookies(cookieHeader);

		// Check common cookie names in order of preference
		const cookieNames = ['accessToken', 'auth_token', 'jwt'];
		for (const cookieName of cookieNames) {
			if (cookies[cookieName]) {
				return {
					token: cookies[cookieName],
					method: TokenExtractionMethod.COOKIE,
					cookieName,
				};
			}
		}
	}

	// Priority 3: Query parameter (for WebSocket connections and special cases)
	const url = new URL(request.url);
	const queryToken =
		url.searchParams.get('token') || url.searchParams.get('access_token');
	if (queryToken && queryToken.length > 0) {
		return {
			token: queryToken,
			method: TokenExtractionMethod.QUERY_PARAMETER,
		};
	}

	return { token: null };
}

/**
 * Parse cookie header into key-value pairs
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {};
	const pairs = cookieHeader.split(';');

	for (const pair of pairs) {
		const [key, value] = pair.trim().split('=');
		if (key && value) {
			cookies[key] = decodeURIComponent(value);
		}
	}

	return cookies;
}

/**
 * Clear authentication cookie using secure cookie options
 */
export function clearAuthCookie(name: string): string {
	return createSecureCookie({
		name,
		value: '',
		maxAge: 0,
	});
}

/**
 * Clear all auth cookies from response using consolidated approach
 */
export function clearAuthCookies(response: Response): void {
	response.headers.append('Set-Cookie', clearAuthCookie('accessToken'));
	response.headers.append('Set-Cookie', clearAuthCookie('auth_token'));
}

/**
 * Enhanced cookie creation with security options
 */
export interface CookieOptions {
	name: string;
	value: string;
	maxAge?: number; // seconds
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	path?: string;
	domain?: string;
}

/**
 * Create secure cookie string with all options
 */
export function createSecureCookie(options: CookieOptions): string {
	const {
		name,
		value,
		maxAge = 7 * 24 * 60 * 60, // 7 days default
		httpOnly = true,
		secure = true,
		sameSite = 'Lax',
		path = '/',
		domain,
	} = options;

	const parts = [`${name}=${encodeURIComponent(value)}`];

	if (maxAge > 0) parts.push(`Max-Age=${maxAge}`);
	if (path) parts.push(`Path=${path}`);
	if (domain) parts.push(`Domain=${domain}`);
	if (httpOnly) parts.push('HttpOnly');
	if (secure) parts.push('Secure');
	if (sameSite) parts.push(`SameSite=${sameSite}`);

	return parts.join('; ');
}

/**
 * Set auth cookies with proper security settings
 */
export function setSecureAuthCookies(
	response: Response,
	tokens: {
		accessToken: string;
		accessTokenExpiry?: number; // seconds
	},
): void {
	const {
		accessToken,
		accessTokenExpiry = 3 * 24 * 60 * 60, // 3 days
	} = tokens;

	// Set access token cookie
	response.headers.append(
		'Set-Cookie',
		createSecureCookie({
			name: 'accessToken',
			value: accessToken,
			maxAge: accessTokenExpiry,
			httpOnly: true,
			sameSite: 'Lax',
		}),
	);
}

/**
 * Extract request metadata for security analysis
 */
export interface RequestMetadata {
	ipAddress: string;
	userAgent: string;
	referer?: string;
	origin?: string;
	acceptLanguage?: string;

	// Cloudflare-specific headers
	cfConnectingIp?: string;
	cfRay?: string;
	cfCountry?: string;
	cfTimezone?: string;
}

/**
 * Extract comprehensive request metadata
 */
export function extractRequestMetadata(request: Request): RequestMetadata {
	const headers = request.headers;

	return {
		ipAddress:
			headers.get('CF-Connecting-IP') ||
			headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
			headers.get('X-Real-IP') ||
			'unknown',
		userAgent: headers.get('User-Agent') || 'unknown',
		referer: headers.get('Referer') || undefined,
		origin: headers.get('Origin') || undefined,
		acceptLanguage: headers.get('Accept-Language') || undefined,

		// Cloudflare-specific
		cfConnectingIp: headers.get('CF-Connecting-IP') || undefined,
		cfRay: headers.get('CF-Ray') || undefined,
		cfCountry: headers.get('CF-IPCountry') || undefined,
		cfTimezone: headers.get('CF-Timezone') || undefined,
	};
}

/**
 * Create session response
 */
export interface SessionResponse {
	user: AuthUser;
    sessionId: string;
    expiresAt: Date | null;
}

export function mapUserResponse(
	user: (Partial<User> & { id: string; email: string }) | AuthUser,
): AuthUser {
	// Handle AuthUser type - already in correct format
	if ('isAnonymous' in user) {
		return user as AuthUser;
	}

	// Map from User schema type
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName || undefined,
		username: user.username || undefined,
		avatarUrl: user.avatarUrl || undefined,
		bio: user.bio || undefined,
		timezone: user.timezone || undefined,
		provider: user.provider || undefined,
		emailVerified: user.emailVerified || undefined,
		createdAt: user.createdAt || undefined,
	};
}

export function formatAuthResponse(
	user: AuthUser,
	sessionId: string,
	expiresAt: Date | null,
): SessionResponse {
	const response: SessionResponse = { user, sessionId, expiresAt };
    
	return response;
}

