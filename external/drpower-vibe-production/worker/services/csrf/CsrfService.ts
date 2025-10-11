/**
 * CSRF Protection Service
 * Implements double-submit cookie pattern for CSRF protection
 */

import { createLogger } from '../../logger';
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import { generateSecureToken } from '../../utils/cryptoUtils';
import { parseCookies, createSecureCookie } from '../../utils/authUtils';
import { getCSRFConfig } from '../../config/security';
import { captureSecurityEvent } from '../../observability/sentry';
import { env } from 'cloudflare:workers'

const logger = createLogger('CsrfService');

interface CSRFTokenData {
    token: string;
    timestamp: number;
}

export class CsrfService {
    static readonly COOKIE_NAME = 'csrf-token';
    static readonly HEADER_NAME = 'X-CSRF-Token';
    static readonly defaults = getCSRFConfig(env)
    
    /**
     * Generate a cryptographically secure CSRF token
     */
    static generateToken(): string {
        return generateSecureToken(32);
    }
    
    /**
     * Set CSRF token cookie with timestamp
     */
    static setTokenCookie(response: Response, token: string, maxAge: number = 7200): void {
        const tokenData: CSRFTokenData = {
            token,
            timestamp: Date.now()
        };
        
        const cookie = createSecureCookie({
            name: this.COOKIE_NAME,
            value: JSON.stringify(tokenData),
            sameSite: 'Strict',
            maxAge
        });
        response.headers.append('Set-Cookie', cookie);
    }
    
    /**
     * Extract CSRF token from cookies with validation
     */
    static getTokenFromCookie(request: Request): string | null {
        const cookieHeader = request.headers.get('Cookie');
        if (!cookieHeader) return null;
        
        const cookies = parseCookies(cookieHeader);
        const cookieValue = cookies[this.COOKIE_NAME];
        
        if (!cookieValue) return null;
        
        try {
            const tokenData: CSRFTokenData = JSON.parse(cookieValue);
            
            const now = Date.now();
            const tokenAge = now - tokenData.timestamp;
            
            if (tokenAge > this.defaults.tokenTTL) {
                logger.debug('CSRF token expired', {
                    tokenAge,
                    maxAge: this.defaults.tokenTTL
                });
                return null;
            }
            return tokenData.token;
        } catch (error) {
            // Handle legacy tokens (plain string) for backward compatibility
            if (typeof cookieValue === 'string' && cookieValue.length > 0) {
                logger.debug('Using legacy CSRF token format');
                return cookieValue;
            }
            
            logger.warn('Invalid CSRF token format', error);
            return null;
        }
    }
    
    /**
     * Extract CSRF token from request header
     */
    static getTokenFromHeader(request: Request): string | null {
        return request.headers.get(this.HEADER_NAME);
    }
    
    /**
     * Validate CSRF token (double-submit cookie pattern)
     */
    static validateToken(request: Request): boolean {
        const method = request.method.toUpperCase();
        
        // Skip validation for safe methods
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return true;
        }
        
        // Skip for WebSocket upgrades
        const upgradeHeader = request.headers.get('upgrade');
        if (upgradeHeader?.toLowerCase() === 'websocket') {
            return true;
        }
        
        const cookieToken = this.getTokenFromCookie(request);
        const headerToken = this.getTokenFromHeader(request);
        
        // Both tokens must exist and match
        if (!cookieToken || !headerToken) {
            logger.warn('CSRF validation failed: missing token', {
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
                method,
                path: new URL(request.url).pathname,
                userAgent: request.headers.get('User-Agent')?.substring(0, 100),
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer')
            });
            captureSecurityEvent('csrf_violation', {
                reason: 'missing_token',
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
                method,
                path: new URL(request.url).pathname,
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
            });
            return false;
        }
        
        if (cookieToken !== headerToken) {
            logger.warn('CSRF validation failed: token mismatch', {
                method,
                path: new URL(request.url).pathname,
                userAgent: request.headers.get('User-Agent')?.substring(0, 100),
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
                cookieTokenPrefix: cookieToken.substring(0, 8),
                headerTokenPrefix: headerToken.substring(0, 8)
            });
            captureSecurityEvent('csrf_violation', {
                reason: 'token_mismatch',
                method,
                path: new URL(request.url).pathname,
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
                cookieTokenPrefix: cookieToken.substring(0, 8),
                headerTokenPrefix: headerToken.substring(0, 8)
            });
            return false;
        }
        
        logger.debug('CSRF validation successful', {
            method,
            path: new URL(request.url).pathname
        });
        
        return true;
    }
    
    /**
     * Middleware to enforce CSRF protection with configuration
     */
    static async enforce(
        request: Request, 
        response?: Response
    ): Promise<void> {
        // Generate and set token for GET requests (to establish cookie)
        if (request.method === 'GET' && response) {
            const existingToken = this.getTokenFromCookie(request);
            if (!existingToken) {
                const newToken = this.generateToken();
                const maxAge = Math.floor(this.defaults.tokenTTL / 1000);
                this.setTokenCookie(response, newToken, maxAge);
                logger.debug('New CSRF token generated for GET request');
            }
            return;
        }
        
        // Validate token for state-changing requests
        if (!this.validateToken(request)) {
            throw new SecurityError(
                SecurityErrorType.CSRF_VIOLATION,
                'CSRF token validation failed',
                403
            );
        }
    }
    
    /**
     * Get or generate CSRF token for a request with proper rotation
     */
    static getOrGenerateToken(
        request: Request, 
        forceNew: boolean = false
    ): string {
        if (forceNew) {
            const newToken = this.generateToken();
            logger.debug('Forced generation of new CSRF token');
            return newToken;
        }
        
        const existingToken = this.getTokenFromCookie(request);
        if (existingToken) {
            logger.debug('Using existing valid CSRF token');
            return existingToken;
        }
        
        const newToken = this.generateToken();
        logger.debug('Generated new CSRF token due to missing/expired token');
        return newToken;
    }
    
    /**
     * Rotate CSRF token (generate new token and invalidate old one)
     */
    static rotateToken(response: Response): string {
        const newToken = this.generateToken();
        const maxAge = Math.floor(this.defaults.tokenTTL / 1000);
        
        this.setTokenCookie(response, newToken, maxAge);
        logger.info('CSRF token rotated');
        
        return newToken;
    }
    
    /**
     * Clear CSRF token cookie
     */
    static clearTokenCookie(response: Response): void {
        const cookie = createSecureCookie({
            name: this.COOKIE_NAME,
            value: '',
            sameSite: 'Strict',
            maxAge: 0
        });
        response.headers.append('Set-Cookie', cookie);
    }
}
