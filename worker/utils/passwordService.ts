/**
 * Password Service using Web Crypto API
 * Provides secure password hashing and validation
 */

import { PasswordValidationResult } from '../types/auth-types';
import { validatePassword } from './validationUtils';
import { createLogger } from '../logger';
import { pbkdf2, timingSafeEqualBytes } from './cryptoUtils';

const logger = createLogger('PasswordService');

/**
 * Password Service for secure password operations
 * Uses PBKDF2 with Web Crypto API (since Argon2 is not available in Workers)
 */
export class PasswordService {
    private readonly saltLength = 16;
    private readonly iterations = 100000; // OWASP recommended minimum
    private readonly keyLength = 32; // 256 bits
    
    /**
     * Hash a password
     */
    async hash(password: string): Promise<string> {
        try {
            // Generate salt
            const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
            
            // Hash password
            const hash = await pbkdf2(password, salt, this.iterations, this.keyLength);
            
            // Combine salt and hash for storage
            const combined = new Uint8Array(salt.length + hash.length);
            combined.set(salt);
            combined.set(hash, salt.length);
            
            // Encode as base64
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            logger.error('Error hashing password', error);
            throw new Error('Failed to hash password');
        }
    }
    
    /**
     * Verify a password against a hash
     */
    async verify(password: string, hashedPassword: string): Promise<boolean> {
        try {
            // Decode from base64
            const combined = Uint8Array.from(atob(hashedPassword), c => c.charCodeAt(0));
            
            // Extract salt and hash
            const salt = combined.slice(0, this.saltLength);
            const originalHash = combined.slice(this.saltLength);
            
            // Hash the provided password with the same salt
            const newHash = await pbkdf2(password, salt, this.iterations, this.keyLength);
            
            // Compare hashes
            return timingSafeEqualBytes(originalHash, newHash);
        } catch (error) {
            logger.error('Error verifying password', error);
            return false;
        }
    }
    
    /**
     * Validate password strength using centralized validation
     */
    validatePassword(password: string, userInfo?: { email?: string; name?: string }): PasswordValidationResult {
        return validatePassword(password, undefined, userInfo);
    }
}