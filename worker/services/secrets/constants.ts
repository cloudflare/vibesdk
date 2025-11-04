/**
 * User Secrets Store - Constants
 * Configuration and limits for the secrets system
 */

/**
 * Cryptographic constants
 */
export const CRYPTO_CONSTANTS = {
    // Key derivation
    UMK_ITERATIONS: 100000,      // User Master Key derivation (PBKDF2)
    DEK_ITERATIONS: 10000,       // Data Encryption Key derivation (PBKDF2)
    SALT_SIZE: 16,               // bytes
    NONCE_SIZE: 24,              // bytes (XChaCha20)
    KEY_SIZE: 32,                // bytes (256 bits)
    
    // Key derivation context
    UMK_CONTEXT_PREFIX: 'vibesdk:user:',
} as const;

/**
 * Storage limits
 */
export const STORAGE_LIMITS = {
    MAX_SECRET_VALUE_SIZE: 1024 * 50,    // 50 KB per secret
    MAX_SECRET_NAME_LENGTH: 200,
    MAX_METADATA_SIZE: 1024 * 10,        // 10 KB metadata per secret
} as const;

/**
 * Cleanup intervals
 */
export const CLEANUP_INTERVALS = {
    EXPIRED_SECRETS_CHECK: 60 * 60 * 1000,      // 1 hour
} as const;
