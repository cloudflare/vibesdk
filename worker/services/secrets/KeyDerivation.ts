/**
 * Key Derivation Service
 * Implements hierarchical key derivation for user secrets
 * 
 * Architecture:
 * Master Key (from Secrets Store) 
 *   → User Master Key (PBKDF2 with userId)
 *   → Data Encryption Key (PBKDF2 with random salt)
 */

import { CRYPTO_CONSTANTS } from './constants';

export class KeyDerivation {
    private masterKey: string;

    constructor(masterKey: string) {
        if (!masterKey || masterKey.trim().length === 0) {
            throw new Error('Master encryption key is required');
        }
        
        // Validate hex format and length (64 chars = 32 bytes = 256 bits)
        if (!/^[0-9a-fA-F]+$/.test(masterKey)) {
            throw new Error('Master key must be a valid hexadecimal string');
        }
        
        if (masterKey.length !== 64) {
            throw new Error('Master key must be 64 hexadecimal characters (256 bits)');
        }
        
        this.masterKey = masterKey;
    }

    /**
     * Derive User Master Key from Master Encryption Key
     * UMK = PBKDF2(MEK, salt=userId, 100k iterations)
     * 
     * This creates a unique key per user while only storing one master key
     */
    async deriveUserMasterKey(userId: string): Promise<Uint8Array> {
        if (!userId || userId.trim().length === 0) {
            throw new Error('User ID is required for key derivation');
        }
        
        const encoder = new TextEncoder();
        
        // Use userId as salt with context prefix
        const salt = encoder.encode(`${CRYPTO_CONSTANTS.UMK_CONTEXT_PREFIX}${userId}`);
        
        // Import master key as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.masterKey),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        
        // Derive 256-bit key using PBKDF2
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations: CRYPTO_CONSTANTS.UMK_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            CRYPTO_CONSTANTS.KEY_SIZE * 8 // 256 bits
        );
        
        return new Uint8Array(derivedBits);
    }

    /**
     * Derive Data Encryption Key from User Master Key
     * DEK = PBKDF2(UMK, salt=random, 10k iterations)
     * 
     * Each secret gets a unique DEK derived from random salt
     * Lower iteration count is acceptable since UMK is already strong
     */
    async deriveDataEncryptionKey(
        userMasterKey: Uint8Array, 
        salt: Uint8Array
    ): Promise<Uint8Array> {
        // Import UMK as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            userMasterKey,
            'PBKDF2',
            false,
            ['deriveBits']
        );
        
        // Derive 256-bit key using PBKDF2
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations: CRYPTO_CONSTANTS.DEK_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            CRYPTO_CONSTANTS.KEY_SIZE * 8 // 256 bits
        );
        
        return new Uint8Array(derivedBits);
    }

    /**
     * Generate cryptographic fingerprint of the master key
     * Used for key rotation detection
     */
    async getMasterKeyFingerprint(): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(this.masterKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
